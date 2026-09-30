import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createGateway } from './server.mjs';

function fakeLlama(props) {
  return http.createServer((req, res) => {
    if (req.url === '/props') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(props));
      return;
    }
    res.writeHead(404).end();
  });
}

test('status reports bonsaiContext from llama props', async () => {
  const llama = fakeLlama({ is_sleeping: false, default_generation_settings: { n_ctx: 65536 } });
  await new Promise((r) => llama.listen(0, '127.0.0.1', r));
  const llamaPort = llama.address().port;

  const gw = createGateway({
    token: 'test-token-at-least-24-chars-long',
    llama: `http://127.0.0.1:${llamaPort}`,
    comfy: 'http://127.0.0.1:1',
    hermesKey: '',
  });
  const server = http.createServer((req, res) => gw.handle(req, res));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const gwPort = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${gwPort}/status`, {
      headers: { Authorization: 'Bearer test-token-at-least-24-chars-long' },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.bonsai, 'online');
    assert.equal(body.bonsaiContext, 65536);
  } finally {
    server.close();
    llama.close();
  }
});
