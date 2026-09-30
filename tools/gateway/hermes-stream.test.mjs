import test from 'node:test';
import assert from 'node:assert/strict';
import { SseParser, HermesTranslator } from '../../lib/hermesStream.ts';

// Frames shaped exactly like hermes-agent's _write_sse_chat_completion output.
const chunk = (delta, extra = {}) =>
  `data: ${JSON.stringify({ id: 'chatcmpl-abc', object: 'chat.completion.chunk', created: 1, model: 'hermes-agent', choices: [{ index: 0, delta, finish_reason: null }], ...extra })}\n\n`;
const event = (name, data) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;

function run(wire, splitEvery = 0) {
  const parser = new SseParser();
  const tr = new HermesTranslator();
  const out = [];
  const pieces = splitEvery ? wire.match(new RegExp(`[\\s\\S]{1,${splitEvery}}`, 'g')) : [wire];
  for (const piece of pieces) for (const ev of parser.push(piece)) out.push(...tr.translate(ev));
  out.push(...tr.finish());
  return out;
}

const WIRE =
  chunk({ role: 'assistant' }) +
  chunk({ reasoning_content: 'Need to check ' }) +
  chunk({ reasoning_content: 'the tests.' }) +
  chunk({ content: 'Running the tests now.' }) +
  ': keepalive\n\n' +
  event('hermes.tool.progress', { tool: 'terminal', emoji: '💻', label: 'terminal: npm test', toolCallId: 'call_1', status: 'running' }) +
  event('hermes.tool.progress', { tool: 'terminal', toolCallId: 'call_1', status: 'completed' }) +
  event('hermes.status', { message: 'compressing context' }) +
  chunk({ content: 'All 41 tests pass.' }) +
  `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n` +
  'data: [DONE]\n\n';

test('text, reasoning, and tool steps come out in order as UI chunks', () => {
  const out = run(WIRE);
  assert.deepEqual(
    out.map((c) => c.type),
    [
      'reasoning-start', 'reasoning-delta', 'reasoning-delta', 'reasoning-end',
      'text-start', 'text-delta', 'text-end',
      'tool-input-available', 'tool-output-available',
      'text-start', 'text-delta', 'text-end',
    ]
  );
  const tool = out.find((c) => c.type === 'tool-input-available');
  assert.equal(tool.toolName, 'terminal');
  assert.equal(tool.dynamic, true);
  assert.deepEqual(tool.input, { label: 'terminal: npm test', emoji: '💻' });
  assert.equal(out.filter((c) => c.type === 'text-delta').map((c) => c.delta).join(' | '), 'Running the tests now. | All 41 tests pass.');
});

test('the result does not depend on how the network splits the bytes', () => {
  const whole = run(WIRE);
  for (const size of [1, 3, 7, 64]) assert.deepEqual(run(WIRE, size), whole, `split every ${size}`);
});

test('an approval request becomes a data part with only known choices', () => {
  const out = run(
    chunk({ content: 'I need to delete the build folder.' }) +
      event('approval.request', {
        event: 'approval.request', run_id: 'chatcmpl-abc', timestamp: 1.5, request_id: 'req-1',
        command: 'rm -rf ./build', description: 'Recursive delete', choices: ['once', 'session', 'always', 'deny', 'bogus'],
      })
  );
  const approval = out.find((c) => c.type === 'data-hermes-approval');
  assert.ok(approval, 'expected an approval part');
  assert.equal(approval.id, 'approval-chatcmpl-abc-req-1');
  assert.deepEqual(approval.data, {
    runId: 'chatcmpl-abc', requestId: 'req-1', command: 'rm -rf ./build', description: 'Recursive delete',
    choices: ['once', 'session', 'always', 'deny'],
  });
  // Text before the approval is closed first so the card sits after it.
  const types = out.map((c) => c.type);
  assert.ok(types.indexOf('text-end') < types.indexOf('data-hermes-approval'));
});

test('a stream cut off mid-step marks that step as stopped instead of running forever', () => {
  const out = run(event('hermes.tool.progress', { tool: 'web_search', label: 'web_search: hermes agent', toolCallId: 'call_9', status: 'running' }));
  assert.deepEqual(out.map((c) => c.type), ['tool-input-available', 'tool-output-error']);
  assert.equal(out[1].toolCallId, 'call_9');
});

test('a failed turn surfaces its error; a clean stop does not', () => {
  const failed = run(
    chunk({ content: 'Working' }) +
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'error' }], error: { message: 'provider timeout', type: 'agent_error' } })}\n\n`
  );
  assert.deepEqual(failed.at(-1), { type: 'error', errorText: 'Hermes stopped: provider timeout' });
  assert.equal(run(WIRE).some((c) => c.type === 'error'), false);
});

test('garbage and unknown events are ignored rather than crashing the stream', () => {
  const out = run('data: {not json\n\n' + event('hermes.future', { x: 1 }) + chunk({ content: 'ok' }));
  assert.deepEqual(out.map((c) => c.type), ['text-start', 'text-delta', 'text-end']);
});
