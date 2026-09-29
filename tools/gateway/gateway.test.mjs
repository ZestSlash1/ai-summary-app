// Run: node --test tools/gateway
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createGateway } from './server.mjs';

const TOKEN = 'test-token-0123456789-abcdefghijkl';
const LLAMA_KEY = 'llama-secret-value';

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
  const lp = await listen(llama);
  const cp = await listen(comfy);

  const gw = createGateway({
    host: '127.0.0.1',
    port: 0,
    token: TOKEN,
    llama: `http://127.0.0.1:${lp}`,
    llamaKey: LLAMA_KEY,
    comfy: `http://127.0.0.1:${cp}`,
    gpuMode: 'sleep',
    maxBodyBytes: 1024,
    ratePerMinute: 1000,
    sleepWaitMs: 400,
    jobTimeoutMs: 5000,
    pollMs: 50,
    ...overrides,
  });
  const gp = await listen(gw);
  const call = (method, path, { token = TOKEN, body } = {}) =>
    fetch(`http://127.0.0.1:${gp}${path}`, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
      body,
    });
  const close = () => [gw, llama, comfy].forEach((s) => (s.closeAllConnections?.(), s.close()));
  return { call, seen, llamaState, comfyState, gw, close };
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
