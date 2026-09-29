import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { createComfyClient, ComfyError, isJobId } from '../../lib/comfy-client.ts';
import { parseImageDataUrl, extractLatestImage } from '../../lib/imageParts.ts';

const workflow = JSON.parse(fs.readFileSync(new URL('../../lib/comfy/qwen_edit.api.json', import.meta.url), 'utf8'));
const map = JSON.parse(fs.readFileSync(new URL('../../lib/comfy/qwen_edit.map.json', import.meta.url), 'utf8'));
const JOB = '11111111-2222-3333-4444-555555555555';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function setup() {
  const s = { uploads: [], prompts: [], auth: [], viewQuery: null };
  const st = { promptStatus: 200, promptBody: { prompt_id: JOB }, history: {}, queue: { queue_running: [], queue_pending: [] }, viewOk: true };
  const srv = http.createServer((req, res) => {
    s.auth.push(req.headers.authorization);
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const url = new URL(req.url, 'http://x');
      const json = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (url.pathname === '/upload/image') { s.uploads.push(body.length); return json(200, { name: 'aro_up.png', subfolder: '', type: 'input' }); }
      if (url.pathname === '/prompt') { s.prompts.push(JSON.parse(body.toString())); return json(st.promptStatus, st.promptBody); }
      if (url.pathname === `/history/${JOB}`) return json(200, st.history);
      if (url.pathname === '/queue') return json(200, st.queue);
      if (url.pathname === '/view') {
        s.viewQuery = Object.fromEntries(url.searchParams);
        if (!st.viewOk) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'content-type': 'image/png' });
        return res.end(PNG);
      }
      res.writeHead(404); res.end();
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const client = createComfyClient({ baseUrl: `http://127.0.0.1:${srv.address().port}/`, apiKey: 'k-123', workflow, map });
  return { s, st, client, close: () => { srv.closeAllConnections?.(); srv.close(); } };
}

const doneEntry = (filename = 'aro_00001_.png') => ({
  status: { status_str: 'success', completed: true, messages: [] },
  outputs: { [map.output.node]: { images: [{ filename, subfolder: '', type: 'output' }] } },
});

test('startEdit uploads, patches the workflow and returns the ComfyUI prompt id', async () => {
  const t = await setup();
  const { jobId } = await t.client.startEdit({
    instruction: '  Make the sky overcast  ',
    image: { data: PNG, mediaType: 'image/png' },
    seed: 99,
    megapixels: 0.4,
  });
  assert.equal(jobId, JOB);
  assert.equal(t.s.uploads.length, 1);
  const sent = t.s.prompts[0].prompt;
  assert.equal(sent[map.inputImage.node].inputs[map.inputImage.field], 'aro_up.png');
  assert.equal(sent[map.prompt.node].inputs[map.prompt.field], 'Make the sky overcast');
  assert.equal(sent[map.seed.node].inputs[map.seed.field], 99);
  assert.equal(sent[map.megapixels.node].inputs[map.megapixels.field], 0.4);
  assert.ok(t.s.auth.every((a) => a === 'Bearer k-123'), 'bearer token sent on every call');
  // The template must not be mutated between requests.
  assert.notEqual(workflow[map.prompt.node].inputs[map.prompt.field], 'Make the sky overcast');
  t.close();
});

test('megapixels is clamped and a seed is generated when missing', async () => {
  const t = await setup();
  await t.client.startEdit({ instruction: 'x y z', image: { data: PNG, mediaType: 'image/png' }, megapixels: 50 });
  const sent = t.s.prompts[0].prompt;
  assert.equal(sent[map.megapixels.node].inputs[map.megapixels.field], 1);
  assert.ok(Number.isInteger(sent[map.seed.node].inputs[map.seed.field]));
  t.close();
});

test('rejects unsupported types and empty instructions before any network call', async () => {
  const t = await setup();
  await assert.rejects(t.client.startEdit({ instruction: 'ok ok', image: { data: PNG, mediaType: 'image/gif' } }), (e) => e instanceof ComfyError && e.code === 'rejected');
  await assert.rejects(t.client.startEdit({ instruction: '   ', image: { data: PNG, mediaType: 'image/png' } }), (e) => e.code === 'rejected');
  assert.equal(t.s.uploads.length, 0);
  t.close();
});

test('maps gateway 503s and auth failures to friendly errors', async () => {
  const t = await setup();
  const call = () => t.client.startEdit({ instruction: 'a b c', image: { data: PNG, mediaType: 'image/png' } });
  t.st.promptStatus = 503; t.st.promptBody = { error: { type: 'gpu_busy' } };
  await assert.rejects(call(), (e) => e.code === 'busy');
  t.st.promptBody = { error: { type: 'bonsai_not_idle' } };
  await assert.rejects(call(), (e) => e.code === 'unavailable' && /not ready/i.test(e.message));
  t.st.promptStatus = 401; t.st.promptBody = {};
  await assert.rejects(call(), (e) => e.code === 'unavailable' && /credentials/i.test(e.message));
  t.st.promptStatus = 400; t.st.promptBody = { error: { message: 'Prompt outputs failed validation' } };
  await assert.rejects(call(), (e) => e.code === 'rejected' && /validation/.test(e.message));
  t.close();
});

test('an unreachable server becomes an offline error', async () => {
  const client = createComfyClient({ baseUrl: 'http://127.0.0.1:1', workflow, map });
  await assert.rejects(client.getJob(JOB), (e) => e instanceof ComfyError && e.code === 'unavailable' && /offline/i.test(e.message));
});

test('getJob reports queued, running, done, error and unknown', async () => {
  const t = await setup();
  assert.deepEqual(await t.client.getJob(JOB), { status: 'unknown' });

  t.st.queue = { queue_running: [], queue_pending: [[1, JOB, {}, {}, []]] };
  assert.deepEqual(await t.client.getJob(JOB), { status: 'queued' });

  t.st.queue = { queue_running: [[0, JOB, {}, {}, []]], queue_pending: [] };
  assert.deepEqual(await t.client.getJob(JOB), { status: 'running' });

  t.st.history = { [JOB]: doneEntry() };
  assert.deepEqual(await t.client.getJob(JOB), { status: 'done', image: { filename: 'aro_00001_.png', subfolder: '', type: 'output' } });

  t.st.history = { [JOB]: { status: { status_str: 'error', messages: [['execution_error', { exception_message: 'CUDA out of memory\ntrace...' }]] } } };
  assert.deepEqual(await t.client.getJob(JOB), { status: 'error', message: 'CUDA out of memory' });

  t.st.history = { [JOB]: { status: { status_str: 'success' }, outputs: {} } };
  assert.equal((await t.client.getJob(JOB)).status, 'error');
  t.close();
});

test('job ids and output names are validated', async () => {
  const t = await setup();
  assert.equal(isJobId(JOB), true);
  for (const bad of ['', 'short', '../etc/passwd', 'a/b/c/d/e/f/g/h', 'id with spaces', 'x'.repeat(65)]) {
    assert.equal(isJobId(bad), false, bad);
    await assert.rejects(t.client.getJob(bad), (e) => e.code === 'rejected');
  }
  // A hostile file name from the server never becomes a URL.
  t.st.history = { [JOB]: doneEntry('../../secret.png') };
  assert.equal((await t.client.getJob(JOB)).status, 'error');
  t.close();
});

test('fetchImage streams the finished image and refuses unfinished jobs', async () => {
  const t = await setup();
  assert.equal(await t.client.fetchImage(JOB), null);
  t.st.history = { [JOB]: doneEntry('aro_00002_.png') };
  const img = await t.client.fetchImage(JOB);
  assert.equal(img.contentType, 'image/png');
  const bytes = Buffer.from(await new Response(img.body).arrayBuffer());
  assert.deepEqual(bytes, PNG);
  assert.deepEqual(t.s.viewQuery, { filename: 'aro_00002_.png', subfolder: '', type: 'output' });
  t.close();
});

test('parseImageDataUrl accepts only small png, jpeg and webp base64 images', () => {
  const ok = `data:image/png;base64,${PNG.toString('base64')}`;
  assert.equal(parseImageDataUrl(ok)?.mediaType, 'image/png');
  assert.equal(parseImageDataUrl(ok)?.data.length, PNG.length);
  assert.equal(parseImageDataUrl('data:image/gif;base64,AAAA'), null);
  assert.equal(parseImageDataUrl('data:text/html;base64,PGI+'), null);
  assert.equal(parseImageDataUrl('https://example.com/a.png'), null);
  assert.equal(parseImageDataUrl('data:image/png;base64,'), null);
  const huge = `data:image/png;base64,${'A'.repeat(12 * 1024 * 1024)}`;
  assert.equal(parseImageDataUrl(huge), null);
});

test('extractLatestImage takes the newest image from the latest user message only', () => {
  const url = `data:image/png;base64,${PNG.toString('base64')}`;
  const file = { type: 'file', url, mediaType: 'image/png' };
  assert.ok(extractLatestImage([{ role: 'user', parts: [{ type: 'text' }, file] }]));
  // An image on an older turn is not re-used for a later text-only message.
  assert.equal(extractLatestImage([{ role: 'user', parts: [file] }, { role: 'assistant', parts: [] }, { role: 'user', parts: [{ type: 'text' }] }]), null);
  assert.equal(extractLatestImage([]), null);
  assert.equal(extractLatestImage([{ role: 'user', parts: [{ type: 'file', url, mediaType: 'application/pdf' }] }]), null);
});
