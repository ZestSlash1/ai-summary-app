// ARO local gateway. Zero dependencies, Node 20+.
//
// Sits between the tunnel and the local model servers:
//   /v1/*     -> llama-server (Bonsai), allowlisted paths only
//   /comfy/*  -> ComfyUI, allowlisted paths only
// Every request needs "Authorization: Bearer <ARO_GATEWAY_TOKEN>".
// It also arbitrates the single 12 GB GPU: while an image job runs, chat requests get 503,
// and an image job only starts once llama-server reports it is asleep (VRAM released).

import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

  async function llamaSleeping() {
    try {
      const p = await getJson(`${cfg.llama}/props`, 2000, llamaAuth());
      return p.is_sleeping === true;
    } catch {
      return null; // unreachable
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
      const [sleeping, comfyUp] = await Promise.all([
        llamaSleeping(),
        getJson(`${cfg.comfy}/system_stats`, 2000).then(() => true, () => false),
      ]);
      return json(res, 200, {
        bonsai: sleeping === null ? 'offline' : sleeping ? 'sleeping' : state.activeLlm > 0 ? 'busy' : 'online',
        comfy: comfyUp ? (busy() ? 'busy' : 'online') : 'offline',
        imageBusy: busy(),
        activeChats: state.activeLlm,
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
  return server;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const cfg = loadConfig();
  const server = createGateway(cfg);
  server.listen(cfg.port, cfg.host, () => {
    console.log(`ARO gateway on http://${cfg.host}:${cfg.port}  llama=${cfg.llama}  comfy=${cfg.comfy}  gpu=${cfg.gpuMode}`);
  });
}
