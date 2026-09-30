// ARO local gateway. Zero dependencies, Node 20+.
//
// Sits between the tunnel and the local model servers:
//   /v1/*     -> llama-server (Bonsai), allowlisted paths only
//   /comfy/*  -> ComfyUI, allowlisted paths only
//   /hermes/* -> Hermes Agent's API server (in WSL), allowlisted paths only
// Every request needs "Authorization: Bearer <ARO_GATEWAY_TOKEN>". Upstreams get their own
// keys from this process, so the tunnel token never reaches them and theirs never leave.
// It also arbitrates the single 12 GB GPU: while an image job runs, chat requests get 503,
// and an image job only starts once llama-server reports it is asleep (VRAM released).

import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SkillInstallError, planSkillInstall, writeSkillInstall } from './skill-install.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(file) {
  const out = {};
  let raw = '';
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return out;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

export function loadConfig(env = {}) {
  const e = { ...loadEnvFile(path.join(HERE, '.env.gateway')), ...process.env, ...env };
  return {
    host: e.GATEWAY_HOST || '127.0.0.1',
    port: Number(e.GATEWAY_PORT || 8787),
    token: e.ARO_GATEWAY_TOKEN || '',
    llama: (e.LLAMA_URL || 'http://127.0.0.1:8090').replace(/\/$/, ''),
    llamaKey: e.LLAMA_API_KEY || '',
    comfy: (e.COMFY_URL || 'http://127.0.0.1:8188').replace(/\/$/, ''),
    hermes: (e.HERMES_URL || 'http://127.0.0.1:8642').replace(/\/$/, ''),
    // Hermes's API_SERVER_KEY. Empty means Hermes is not set up here, and /hermes/* answers 503.
    hermesKey: e.HERMES_API_KEY || '',
    // Where Hermes reads skills from. For Hermes in WSL that is a \\wsl.localhost\ path, not the
    // Windows home folder. Empty means "Install to Hermes" is off and answers 503.
    hermesSkillsDir: e.HERMES_SKILLS_DIR || '',
    // 'sleep': wait for llama-server to sleep before an image job. 'off': no GPU arbitration.
    gpuMode: e.GPU_ARBITRATION || 'sleep',
    maxBodyBytes: Number(e.MAX_BODY_BYTES || 20 * 1024 * 1024),
    ratePerMinute: Number(e.RATE_PER_MINUTE || 240),
    sleepWaitMs: Number(e.SLEEP_WAIT_MS || 60_000),
    jobTimeoutMs: Number(e.JOB_TIMEOUT_MS || 5 * 60_000),
    pollMs: Number(e.POLL_MS || 1000),
  };
}

// method + pathname (after prefix strip) -> allowed
const LLAMA_ALLOW = [
  ['POST', /^\/v1\/chat\/completions$/],
  ['POST', /^\/v1\/completions$/],
  ['GET', /^\/v1\/models$/],
];
const COMFY_ALLOW = [
  ['POST', /^\/upload\/image$/],
  ['POST', /^\/prompt$/],
  ['GET', /^\/history\/[A-Za-z0-9-]{1,64}$/],
  ['GET', /^\/view$/],
  ['POST', /^\/free$/],
  ['POST', /^\/interrupt$/],
  ['GET', /^\/system_stats$/],
  ['GET', /^\/queue$/],
];
// Hermes can run terminal commands on this PC, so only what ARO needs is reachable: chat,
// discovery, and run control (stop, answer an approval). Session history, browser control,
// artifacts, and admin routes stay local.
const RUN_ID = '[A-Za-z0-9_-]{1,100}';
const HERMES_ALLOW = [
  ['GET', /^\/v1\/models$/],
  ['GET', /^\/v1\/capabilities$/],
  ['POST', /^\/v1\/chat\/completions$/],
  ['POST', /^\/v1\/runs$/],
  ['GET', new RegExp(`^/v1/runs/${RUN_ID}$`)],
  ['GET', new RegExp(`^/v1/runs/${RUN_ID}/events$`)],
  ['POST', new RegExp(`^/v1/runs/${RUN_ID}/(stop|approval)$`)],
];
// Chat-shaped llama routes that need the GPU (everything except listing models).
const LLAMA_GPU = /^\/v1\/(chat\/)?completions$/;

const HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te',
  'trailer', 'transfer-encoding', 'upgrade', 'host', 'authorization', 'content-length',
]);

const sha = (s) => createHash('sha256').update(s).digest();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function json(res, status, body, headers = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(data),
    ...headers,
  });
  res.end(data);
}

function allowed(list, method, pathname) {
  return list.some(([m, re]) => m === method && re.test(pathname));
}

async function getJson(url, timeoutMs = 2000, headers = {}) {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function readBodyJson(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let received = 0;
    const chunks = [];
    req.on('data', (c) => {
      received += c.length;
      if (received > maxBytes) {
        req.destroy();
        const err = new Error('Request too large.');
        err.status = 413;
        return reject(err);
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch {
        const err = new Error('Invalid JSON body.');
        err.status = 400;
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

export function createGateway(cfg) {
  if (!cfg.token || cfg.token.length < 24) {
    throw new Error('ARO_GATEWAY_TOKEN must be set and at least 24 characters.');
  }
  const tokenDigest = sha(cfg.token);
  const state = { activeLlm: 0, imageBusy: false, imageSince: 0 };
  const hits = [];

  // A stuck reservation (client aborted mid-setup) expires instead of blocking chat forever.
  function busy() {
    if (state.imageBusy && Date.now() - state.imageSince > cfg.jobTimeoutMs + 5000) state.imageBusy = false;
    return state.imageBusy;
  }

  const log = (req, status, t0) =>
    console.log(`${new Date().toISOString()} ${req.method} ${req.url.split('?')[0]} ${status} ${Date.now() - t0}ms`);

  function authOk(req) {
    const h = req.headers.authorization || '';
    const m = /^Bearer (.+)$/.exec(h);
    if (!m) return false;
    return timingSafeEqual(sha(m[1]), tokenDigest);
  }

  function rateLimited() {
    const now = Date.now();
    while (hits.length && hits[0] < now - 60_000) hits.shift();
    if (hits.length >= cfg.ratePerMinute) return true;
    hits.push(now);
    return false;
  }

  async function llamaProps() {
    try {
      const p = await getJson(`${cfg.llama}/props`, 2000, llamaAuth());
      return {
        sleeping: p.is_sleeping === true,
        context: p.default_generation_settings?.n_ctx || null,
      };
    } catch {
      return null;
    }
  }

  async function llamaSleeping() {
    const p = await llamaProps();
    return p === null ? null : p.sleeping;
  }

  function hermesAuth() {
    return { authorization: `Bearer ${cfg.hermesKey}` };
  }

  async function hermesState() {
    if (!cfg.hermesKey) return 'unconfigured';
    try {
      await getJson(`${cfg.hermes}/v1/capabilities`, 2000, hermesAuth());
      return 'online';
    } catch {
      return 'offline';
    }
  }

  function llamaAuth() {
    return cfg.llamaKey ? { authorization: `Bearer ${cfg.llamaKey}` } : {};
  }

  async function comfyIdle() {
    try {
      const q = await getJson(`${cfg.comfy}/queue`, 3000);
      return (q.queue_running?.length ?? 0) === 0 && (q.queue_pending?.length ?? 0) === 0;
    } catch {
      return true; // ComfyUI gone: nothing is holding the GPU
    }
  }

  // Drop ComfyUI's cached models so Bonsai can reload into the VRAM they held.
  async function freeComfy() {
    try {
      await fetch(`${cfg.comfy}/free`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ unload_models: true, free_memory: true }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // ComfyUI gone or slow: nothing left to free.
    }
  }

  async function watchImageJob() {
    const deadline = Date.now() + cfg.jobTimeoutMs;
    await sleep(cfg.pollMs);
    while (Date.now() < deadline) {
      if (await comfyIdle()) break;
      await sleep(cfg.pollMs);
    }
    // Free first, release the lock second, so a chat can never race the unload.
    await freeComfy();
    state.imageBusy = false;
  }

  function proxy(req, res, upstreamBase, upstreamPath, extraHeaders, onDoneRaw) {
    let called = false;
    const onDone = (status) => {
      if (called) return;
      called = true;
      onDoneRaw?.(status);
    };
    const target = new URL(upstreamBase);
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k)) headers[k] = v;
    Object.assign(headers, extraHeaders);
    if (req.headers['content-length']) headers['content-length'] = req.headers['content-length'];

    const up = http.request(
      {
        hostname: target.hostname,
        port: target.port || 80,
        method: req.method,
        path: upstreamPath,
        headers,
      },
      (ur) => {
        const out = {};
        for (const [k, v] of Object.entries(ur.headers)) if (!HOP.has(k)) out[k] = v;
        res.writeHead(ur.statusCode || 502, out);
        res.flushHeaders();
        ur.pipe(res);
        ur.on('end', () => onDone(ur.statusCode));
      },
    );
    up.on('error', () => {
      if (!res.headersSent) json(res, 502, { error: { message: 'Upstream unavailable.', type: 'upstream_unavailable' } });
      else res.destroy();
      onDone(502);
    });
    up.on('close', () => onDone(0));
    // Client went away: stop the upstream so llama-server cancels generation.
    res.on('close', () => up.destroy());

    let received = 0;
    req.on('data', (c) => {
      received += c.length;
      if (received > cfg.maxBodyBytes) {
        up.destroy();
        if (!res.headersSent) json(res, 413, { error: { message: 'Request too large.', type: 'too_large' } });
        req.destroy();
      }
    });
    req.pipe(up);
  }

  async function handle(req, res) {
    const t0 = Date.now();
    res.on('finish', () => log(req, res.statusCode, t0));

    if (!authOk(req)) return json(res, 401, { error: { message: 'Unauthorized.', type: 'unauthorized' } });
    if (rateLimited()) {
      return json(res, 429, { error: { message: 'Too many requests.', type: 'rate_limited' } }, { 'retry-after': '10' });
    }

    const declared = Number(req.headers['content-length'] || 0);
    if (declared > cfg.maxBodyBytes) {
      return json(res, 413, { error: { message: 'Request too large.', type: 'too_large' } });
    }

    // Parse and normalise. Reject anything that could escape the allowlist.
    const rawPath = req.url.split('?')[0];
    if (/\.\.|%2e|%2f|%5c|\\|\/\//i.test(rawPath)) return json(res, 404, { error: { message: 'Not found.' } });
    let url;
    try {
      url = new URL(req.url, 'http://gateway.local');
    } catch {
      return json(res, 400, { error: { message: 'Bad request.' } });
    }
    const { pathname, search } = url;

    if (pathname === '/status' && req.method === 'GET') {
      const [llamaInfo, comfyUp, hermes] = await Promise.all([
        llamaProps(),
        getJson(`${cfg.comfy}/system_stats`, 2000).then(() => true, () => false),
        hermesState(),
      ]);
      return json(res, 200, {
        bonsai: llamaInfo === null ? 'offline' : llamaInfo.sleeping ? 'sleeping' : state.activeLlm > 0 ? 'busy' : 'online',
        bonsaiContext: llamaInfo?.context ?? null,
        comfy: comfyUp ? (busy() ? 'busy' : 'online') : 'offline',
        imageBusy: busy(),
        activeChats: state.activeLlm,
        hermes,
      });
    }

    // ---- Bonsai (llama-server)
    if (pathname.startsWith('/v1/')) {
      if (!allowed(LLAMA_ALLOW, req.method, pathname)) return json(res, 404, { error: { message: 'Not found.' } });
      const gpu = LLAMA_GPU.test(pathname);
      if (gpu && busy()) {
        return json(
          res,
          503,
          { error: { message: 'An image edit is using the GPU. Try again shortly.', type: 'gpu_busy' } },
          { 'retry-after': '5' },
        );
      }
      if (gpu) state.activeLlm++;
      let done = false;
      const finish = () => {
        if (gpu && !done) {
          done = true;
          state.activeLlm = Math.max(0, state.activeLlm - 1);
        }
      };
      res.on('close', finish);
      return proxy(req, res, cfg.llama, pathname + search, llamaAuth(), finish);
    }

    // ---- Hermes Agent
    if (pathname.startsWith('/hermes/')) {
      const sub = pathname.slice('/hermes'.length);
      if (!allowed(HERMES_ALLOW, req.method, sub)) return json(res, 404, { error: { message: 'Not found.' } });
      if (!cfg.hermesKey) {
        return json(res, 503, { error: { message: 'Hermes is not set up on this PC.', type: 'hermes_unconfigured' } });
      }
      return proxy(req, res, cfg.hermes, sub + search, hermesAuth());
    }

    // ---- Hermes skill installation (skill-install.mjs explains the guards)
    if (pathname === '/hermes-skills/install' && req.method === 'POST') {
      let body;
      try {
        // A skill is capped at 200 KB, so a request far beyond that is refused before parsing.
        body = await readBodyJson(req, Math.min(cfg.maxBodyBytes, 1024 * 1024));
      } catch (err) {
        return json(res, err.status || 400, { error: { message: err.message } });
      }
      try {
        const plan = planSkillInstall(cfg.hermesSkillsDir, body?.name, body?.files);
        const result = writeSkillInstall(plan);
        return json(res, 200, { ok: true, skill: body.name, replaced: result.replaced, filesCount: result.files });
      } catch (err) {
        if (err instanceof SkillInstallError) {
          return json(res, err.status, { error: { message: err.message, type: err.type } });
        }
        throw err;
      }
    }

    // ---- ComfyUI
    if (pathname.startsWith('/comfy/')) {
      const sub = pathname.slice('/comfy'.length);
      if (!allowed(COMFY_ALLOW, req.method, sub)) return json(res, 404, { error: { message: 'Not found.' } });

      if (req.method === 'POST' && sub === '/prompt') {
        if (cfg.gpuMode === 'sleep') {
          if (state.activeLlm > 0) {
            return json(
              res,
              503,
              { error: { message: 'Bonsai is answering. Try again shortly.', type: 'gpu_busy' } },
              { 'retry-after': '5' },
            );
          }
          // Reserve the GPU before any await so chats stop arriving.
          state.imageBusy = true;
          state.imageSince = Date.now();
          const deadline = Date.now() + cfg.sleepWaitMs;
          let ready = false;
          while (Date.now() < deadline) {
            const s = await llamaSleeping();
            if (s === null || s === true) {
              ready = true; // offline or asleep: VRAM is free
              break;
            }
            await sleep(Math.min(1000, cfg.pollMs));
          }
          if (!ready) {
            state.imageBusy = false;
            return json(
              res,
              503,
              {
                error: {
                  message: 'Bonsai has not released the GPU. Start llama-server with --sleep-idle-seconds.',
                  type: 'bonsai_not_idle',
                },
              },
              { 'retry-after': '15' },
            );
          }
        }
        return proxy(req, res, cfg.comfy, sub + search, {}, (status) => {
          if (cfg.gpuMode !== 'sleep') return;
          if (status && status < 300) watchImageJob();
          else state.imageBusy = false;
        });
      }

      return proxy(req, res, cfg.comfy, sub + search, {});
    }

    return json(res, 404, { error: { message: 'Not found.' } });
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error('gateway error:', err?.message);
      if (!res.headersSent) json(res, 500, { error: { message: 'Gateway error.' } });
      else res.destroy();
    });
  });
  server.state = state;
  server.handle = (req, res) =>
    handle(req, res).catch((err) => {
      console.error('gateway error:', err?.message);
      if (!res.headersSent) json(res, 500, { error: { message: 'Gateway error.' } });
      else res.destroy();
    });
  return server;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const cfg = loadConfig();
  const server = createGateway(cfg);
  server.listen(cfg.port, cfg.host, () => {
    console.log(
      `ARO gateway on http://${cfg.host}:${cfg.port}  llama=${cfg.llama}  comfy=${cfg.comfy}  hermes=${cfg.hermesKey ? cfg.hermes : 'off'}  gpu=${cfg.gpuMode}`,
    );
  });
}
