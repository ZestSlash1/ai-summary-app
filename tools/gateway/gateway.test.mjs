// Run: node --test tools/gateway
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createGateway } from './server.mjs';

const TOKEN = 'test-token-0123456789-abcdefghijkl';
const LLAMA_KEY = 'llama-secret-value';
const HERMES_KEY = 'hermes-api-server-key';
const OMNIROUTE_KEY = 'omniroute-own-key';

function listen(server) {
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));
}

async function setup(overrides = {}) {
  const seen = { llamaAuth: null, comfyPaths: [] };
  const llamaState = { sleeping: false, slowChunks: false };
  const comfyState = { running: 0 };

  const llama = http.createServer((req, res) => {
    if (req.url === '/props') {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ is_sleeping: llamaState.sleeping }));
    }
    seen.llamaAuth = req.headers.authorization;
    if (req.url === '/v1/models') {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ data: [{ id: 'bonsai' }] }));
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: one\n\n');
    setTimeout(() => {
      res.write('data: two\n\n');
      res.end();
    }, 300);
  });
  const comfy = http.createServer((req, res) => {
    seen.comfyPaths.push(`${req.method} ${req.url}`);
    res.setHeader('content-type', 'application/json');
    if (req.url === '/queue') {
      return res.end(JSON.stringify({ queue_running: comfyState.running ? [1] : [], queue_pending: [] }));
    }
    if (req.url === '/system_stats') return res.end('{}');
    req.resume();
    res.end(JSON.stringify({ ok: true, url: req.url }));
  });
  seen.hermes = [];
  const hermesState = { up: true };
  const hermes = http.createServer((req, res) => {
    seen.hermes.push({
      path: `${req.method} ${req.url}`,
      auth: req.headers.authorization,
      sessionId: req.headers['x-hermes-session-id'],
      sessionKey: req.headers['x-hermes-session-key'],
    });
    if (!hermesState.up) {
      res.writeHead(500);
      return res.end();
    }
    if (req.url === '/v1/capabilities' || req.url === '/v1/models') {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ object: 'hermes.api_server.capabilities', data: [{ id: 'hermes-agent' }] }));
    }
    req.resume();
    res.writeHead(200, { 'content-type': 'text/event-stream', 'x-hermes-session-id': req.headers['x-hermes-session-id'] || '' });
    res.write('event: hermes.tool.progress\ndata: {"tool":"terminal","toolCallId":"c1","status":"running"}\n\n');
    setTimeout(() => {
      res.write('data: [DONE]\n\n');
      res.end();
    }, 300);
  });
  seen.omniroute = [];
  const omniroute = http.createServer((req, res) => {
    seen.omniroute.push({ path: `${req.method} ${req.url}`, auth: req.headers.authorization });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/models') return res.end(JSON.stringify({ data: [{ id: 'auto/best-free' }] }));
    req.resume();
    res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
  });
  seen.ollama = [];
  const ollamaState = { loaded: ['huihui:latest'], up: true };
  const ollama = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      seen.ollama.push({ path: `${req.method} ${req.url}`, auth: req.headers.authorization, body: Buffer.concat(chunks).toString() });
      res.setHeader('content-type', 'application/json');
      if (req.url === '/v1/models') return res.end(JSON.stringify({ data: [{ id: 'huihui:latest' }] }));
      if (req.url === '/api/version') return res.end('{"version":"0.0.0"}');
      if (req.url === '/api/ps') return res.end(JSON.stringify({ models: ollamaState.loaded.map((name) => ({ name })) }));
      res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
    });
  });
  const lp = await listen(llama);
  const cp = await listen(comfy);
  const hp = await listen(hermes);
  const op = await listen(omniroute);
  const olp = await listen(ollama);

  const gw = createGateway({
    host: '127.0.0.1',
    port: 0,
    token: TOKEN,
    llama: `http://127.0.0.1:${lp}`,
    llamaKey: LLAMA_KEY,
    comfy: `http://127.0.0.1:${cp}`,
    hermes: `http://127.0.0.1:${hp}`,
    hermesKey: HERMES_KEY,
    omniroute: `http://127.0.0.1:${op}`,
    omnirouteKey: '',
    ollama: `http://127.0.0.1:${olp}`,
    gpuMode: 'sleep',
    maxBodyBytes: 1024,
    ratePerMinute: 1000,
    sleepWaitMs: 400,
    jobTimeoutMs: 5000,
    pollMs: 50,
    ...overrides,
  });
  const gp = await listen(gw);
  const call = (method, path, { token = TOKEN, body, headers = {} } = {}) =>
    fetch(`http://127.0.0.1:${gp}${path}`, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json', ...headers },
      body,
    });
  const close = () => [gw, llama, comfy, hermes, omniroute, ollama].forEach((s) => (s.closeAllConnections?.(), s.close()));
  return { call, seen, llamaState, comfyState, hermesState, ollamaState, gw, close };
}

test('rejects missing and wrong tokens', async () => {
  const t = await setup();
  assert.equal((await t.call('GET', '/v1/models', { token: null })).status, 401);
  assert.equal((await t.call('GET', '/v1/models', { token: 'nope' })).status, 401);
  assert.equal((await t.call('GET', '/v1/models')).status, 200);
  t.close();
});

test('allowlist blocks everything else', async () => {
  const t = await setup();
  for (const [m, p] of [
    ['GET', '/comfy/manager/version'],
    ['GET', '/comfy/userdata'],
    ['GET', '/comfy/prompt'],
    ['POST', '/comfy/../etc/passwd'],
    ['GET', '/comfy/history/..%2f..%2fsecret'],
    ['GET', '/props'],
    ['GET', '/v1/props'],
    ['GET', '/slots'],
    ['POST', '/v1/embeddings'],
  ]) {
    assert.equal((await t.call(m, p)).status, 404, `${m} ${p}`);
  }
  assert.deepEqual(t.seen.comfyPaths, []);
  t.close();
});

test('swaps the client token for the llama key', async () => {
  const t = await setup();
  await t.call('GET', '/v1/models');
  assert.equal(t.seen.llamaAuth, `Bearer ${LLAMA_KEY}`);
  t.close();
});

test('streams chat chunks without buffering', async () => {
  const t = await setup();
  const t0 = Date.now();
  const res = await t.call('POST', '/v1/chat/completions', { body: '{}' });
  const reader = res.body.getReader();
  const first = await reader.read();
  const firstAt = Date.now() - t0;
  assert.match(new TextDecoder().decode(first.value), /one/);
  assert.ok(firstAt < 250, `first chunk took ${firstAt}ms`);
  while (!(await reader.read()).done);
  t.close();
});

test('rejects oversized bodies', async () => {
  const t = await setup();
  const res = await t.call('POST', '/comfy/upload/image', { body: 'x'.repeat(4096) });
  assert.equal(res.status, 413);
  t.close();
});

test('image job blocks chat until ComfyUI is idle, then releases', async () => {
  const t = await setup();
  t.llamaState.sleeping = true;
  t.comfyState.running = 1;
  const r = await t.call('POST', '/comfy/prompt', { body: '{}' });
  assert.equal(r.status, 200);
  await r.text();

  const blocked = await t.call('POST', '/v1/chat/completions', { body: '{}' });
  assert.equal(blocked.status, 503);
  assert.equal(blocked.headers.get('retry-after'), '5');
  assert.equal((await t.call('GET', '/v1/models')).status, 200, 'model list stays available');

  t.comfyState.running = 0;
  await new Promise((r2) => setTimeout(r2, 400));
  assert.ok(t.seen.comfyPaths.includes('POST /free'), 'gateway frees ComfyUI models when the job ends');
  const ok = await t.call('POST', '/v1/chat/completions', { body: '{}' });
  assert.equal(ok.status, 200);
  await ok.text();
  t.close();
});

test('image job refused while Bonsai is answering', async () => {
  const t = await setup();
  t.llamaState.sleeping = true;
  const chat = await t.call('POST', '/v1/chat/completions', { body: '{}' });
  const r = await t.call('POST', '/comfy/prompt', { body: '{}' });
  assert.equal(r.status, 503);
  await chat.text();
  t.close();
});

test('image job refused when Bonsai never sleeps', async () => {
  const t = await setup();
  t.llamaState.sleeping = false;
  const r = await t.call('POST', '/comfy/prompt', { body: '{}' });
  assert.equal(r.status, 503);
  const body = await r.json();
  assert.equal(body.error.type, 'bonsai_not_idle');
  assert.equal(t.gw.state.imageBusy, false, 'reservation released');
  t.close();
});

test('gpuMode off skips arbitration', async () => {
  const t = await setup({ gpuMode: 'off' });
  t.llamaState.sleeping = false;
  const r = await t.call('POST', '/comfy/prompt', { body: '{}' });
  assert.equal(r.status, 200);
  await r.text();
  const chat = await t.call('POST', '/v1/chat/completions', { body: '{}' });
  assert.equal(chat.status, 200);
  await chat.text();
  t.close();
});

test('status reports states', async () => {
  const t = await setup();
  t.llamaState.sleeping = true;
  const s = await (await t.call('GET', '/status')).json();
  assert.equal(s.bonsai, 'sleeping');
  assert.equal(s.comfy, 'online');
  t.close();
});

test('hermes: swaps the tunnel token for the Hermes key and passes session headers', async () => {
  const t = await setup();
  const r = await t.call('POST', '/hermes/v1/chat/completions', {
    body: '{"messages":[{"role":"user","content":"hi"}],"stream":true}',
    headers: { 'x-hermes-session-id': 'aro-chat-1', 'x-hermes-session-key': 'aro-gh-42' },
  });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-hermes-session-id'), 'aro-chat-1');
  await r.body?.cancel();
  const last = t.seen.hermes.at(-1);
  assert.equal(last.auth, `Bearer ${HERMES_KEY}`);
  assert.equal(last.sessionId, 'aro-chat-1');
  assert.equal(last.sessionKey, 'aro-gh-42');
  t.close();
});

test('hermes: streams tool progress before the turn ends', async () => {
  const t = await setup();
  const r = await t.call('POST', '/hermes/v1/chat/completions', { body: '{}' });
  const reader = r.body.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.match(first, /event: hermes\.tool\.progress/);
  await reader.cancel();
  t.close();
});

test('hermes: only chat, discovery, and run control are reachable', async () => {
  const t = await setup();
  for (const [m, p] of [
    ['GET', '/hermes/api/sessions/abc/messages'],
    ['POST', '/hermes/v1/responses'],
    ['GET', '/hermes/v1/browser-control/ws'],
    ['POST', '/hermes/v1/artifacts/upload'],
    ['DELETE', '/hermes/v1/runs/run_1'],
    ['POST', '/hermes/v1/runs/run_1/other'],
    ['GET', '/hermes/health'],
  ]) {
    const r = await t.call(m, p);
    await r.body?.cancel();
    assert.equal(r.status, 404, `${m} ${p}`);
  }
  for (const [m, p] of [
    ['GET', '/hermes/v1/models'],
    ['GET', '/hermes/v1/capabilities'],
    ['POST', '/hermes/v1/runs/chatcmpl-abc123/approval'],
    ['POST', '/hermes/v1/runs/run_abc/stop'],
  ]) {
    const r = await t.call(m, p, { body: m === 'POST' ? '{}' : undefined });
    await r.body?.cancel();
    assert.notEqual(r.status, 404, `${m} ${p}`);
  }
  assert.equal(t.seen.hermes.some((h) => h.path.includes('/api/sessions')), false);
  t.close();
});

test('hermes: answers 503 when no Hermes key is configured, without calling upstream', async () => {
  const t = await setup({ hermesKey: '' });
  const r = await t.call('POST', '/hermes/v1/chat/completions', { body: '{}' });
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error.type, 'hermes_unconfigured');
  assert.equal(t.seen.hermes.length, 0);
  t.close();
});

test('omniroute: passes the model list and chat through, never the tunnel token', async () => {
  const t = await setup();
  const models = await t.call('GET', '/omniroute/v1/models');
  assert.equal(models.status, 200);
  assert.deepEqual((await models.json()).data, [{ id: 'auto/best-free' }]);
  const chat = await t.call('POST', '/omniroute/v1/chat/completions', { body: '{}' });
  assert.equal(chat.status, 200);
  await chat.body?.cancel();
  assert.deepEqual(t.seen.omniroute.map((o) => o.path), ['GET /v1/models', 'POST /v1/chat/completions']);
  assert.equal(t.seen.omniroute.some((o) => o.auth), false);
  t.close();
});

test('omniroute: sends its own key when one is configured', async () => {
  const t = await setup({ omnirouteKey: OMNIROUTE_KEY });
  await (await t.call('GET', '/omniroute/v1/models')).body?.cancel();
  assert.equal(t.seen.omniroute.at(-1).auth, `Bearer ${OMNIROUTE_KEY}`);
  t.close();
});

test('omniroute: the dashboard, provider keys, and everything else stay local', async () => {
  const t = await setup();
  for (const [m, p] of [
    ['GET', '/omniroute/api/providers'],
    ['GET', '/omniroute/api/settings'],
    ['GET', '/omniroute/dashboard'],
    ['POST', '/omniroute/v1/embeddings'],
    ['GET', '/omniroute/v1/chat/completions'],
  ]) {
    const r = await t.call(m, p);
    await r.body?.cancel();
    assert.equal(r.status, 404, `${m} ${p}`);
  }
  assert.equal((await t.call('GET', '/omniroute/v1/models', { token: null })).status, 401);
  assert.deepEqual(t.seen.omniroute, []);
  t.close();
});

test('hermes: status reports online, offline, and unconfigured', async () => {
  const t = await setup();
  assert.equal((await (await t.call('GET', '/status')).json()).hermes, 'online');
  t.hermesState.up = false;
  assert.equal((await (await t.call('GET', '/status')).json()).hermes, 'offline');
  t.close();
  const u = await setup({ hermesKey: '' });
  assert.equal((await (await u.call('GET', '/status')).json()).hermes, 'unconfigured');
  u.close();
});

test('ollama: passes the model list and chat through, never the tunnel token', async () => {
  const t = await setup();
  const models = await t.call('GET', '/ollama/v1/models');
  assert.equal(models.status, 200);
  assert.deepEqual((await models.json()).data, [{ id: 'huihui:latest' }]);
  const chat = await t.call('POST', '/ollama/v1/chat/completions', { body: '{}' });
  assert.equal(chat.status, 200);
  await chat.text();
  assert.deepEqual(t.seen.ollama.map((o) => o.path), ['GET /v1/models', 'POST /v1/chat/completions']);
  assert.equal(t.seen.ollama.some((o) => o.auth), false);
  assert.equal((await t.call('GET', '/ollama/v1/models', { token: null })).status, 401);
  t.close();
});

test('ollama: its native API (pull, delete, copy) and everything else stay local', async () => {
  const t = await setup();
  for (const [m, p] of [
    ['POST', '/ollama/api/pull'],
    ['DELETE', '/ollama/api/delete'],
    ['POST', '/ollama/api/generate'],
    ['GET', '/ollama/api/tags'],
    ['POST', '/ollama/v1/embeddings'],
    ['GET', '/ollama/v1/chat/completions'],
  ]) {
    const r = await t.call(m, p, { body: m === 'GET' ? undefined : '{}' });
    await r.body?.cancel();
    assert.equal(r.status, 404, `${m} ${p}`);
  }
  assert.deepEqual(t.seen.ollama, []);
  t.close();
});

test('ollama: chat shares the GPU with image jobs', async () => {
  const t = await setup();
  t.llamaState.sleeping = true;
  // A running Ollama chat holds the GPU, so an image job is refused.
  t.gw.state.activeLlm = 1;
  const refused = await t.call('POST', '/comfy/prompt', { body: '{}' });
  assert.equal(refused.status, 503);
  t.gw.state.activeLlm = 0;
  // An image job holds it, so Ollama chat is refused but listing models still works.
  t.gw.state.imageBusy = true;
  t.gw.state.imageSince = Date.now();
  const chat = await t.call('POST', '/ollama/v1/chat/completions', { body: '{}' });
  assert.equal(chat.status, 503);
  assert.equal((await chat.json()).error.type, 'gpu_busy');
  const models = await t.call('GET', '/ollama/v1/models');
  assert.equal(models.status, 200);
  await models.body?.cancel();
  t.close();
});

test('ollama: an image job unloads the models Ollama holds first', async () => {
  const t = await setup();
  t.llamaState.sleeping = true;
  const r = await t.call('POST', '/comfy/prompt', { body: '{}' });
  assert.equal(r.status, 200);
  await r.text();
  const unload = t.seen.ollama.find((o) => o.path === 'POST /api/generate');
  assert.deepEqual(JSON.parse(unload.body), { model: 'huihui:latest', keep_alive: 0 });
  t.close();
});

test('ollama: status reports online, offline, and unconfigured', async () => {
  const t = await setup();
  assert.equal((await (await t.call('GET', '/status')).json()).ollama, 'online');
  t.close();
  const off = await setup({ ollama: 'http://127.0.0.1:9' });
  assert.equal((await (await off.call('GET', '/status')).json()).ollama, 'offline');
  off.close();
  const none = await setup({ ollama: '' });
  assert.equal((await (await none.call('GET', '/status')).json()).ollama, 'unconfigured');
  assert.equal((await none.call('POST', '/ollama/v1/chat/completions', { body: '{}' })).status, 503);
  none.close();
});
