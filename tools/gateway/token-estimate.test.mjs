import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateTokens,
  estimateTokensFromText,
  estimateMessageTokens,
  estimateConversationTokens,
  getModelContextLimit,
  calculateContextUsage,
  BONSAI_SAFE_CONTEXT,
} from '../../lib/tokenEstimate.ts';

test('estimateTokens counts characters across text, reasoning, and tool results divided by 3.5', () => {
  const text = 'Hello world, this is a test message.'; // 36 chars
  assert.equal(estimateTokens(text), Math.ceil(36 / 3.5));
  assert.equal(estimateTokensFromText(text), Math.ceil(36 / 3.5));

  const message = {
    id: 'msg-1',
    role: 'assistant',
    content: 'Short content', // 13 chars
    parts: [
      { type: 'text', text: 'Text part' }, // 9 chars
      { type: 'reasoning', reasoning: 'Thinking deeply...' }, // 18 chars
      {
        type: 'tool-invocation',
        toolInvocation: {
          args: { query: 'test' }, // JSON: '{"query":"test"}' -> 16 chars
          result: { ok: true }, // JSON: '{"ok":true}' -> 11 chars
        },
      },
    ],
  };
  // total chars: 13 + 9 + 18 + 16 + 11 = 67 chars
  const expectedTokens = Math.ceil(67 / 3.5);
  assert.equal(estimateMessageTokens(message), expectedTokens);
  assert.equal(estimateTokens(message), expectedTokens);
});

test('estimateConversationTokens sums all messages in a conversation', () => {
  const messages = [
    { id: '1', role: 'user', content: '1234567' }, // 7 chars -> ceil(7/3.5) = 2
    { id: '2', role: 'assistant', content: '1234567890' }, // 10 chars -> ceil(10/3.5) = 3
  ];
  assert.equal(estimateConversationTokens(messages), 5);
});

test('counts AI SDK v7 tool parts: a repo file read is most of a coding chat', () => {
  // The shape the app actually stores today: "tool-<name>" with input and output. The estimator
  // used to look only for the old v4 "tool-invocation" shape, so none of this was counted.
  const fileBody = 'x'.repeat(14_000);
  const message = {
    id: 'a1',
    role: 'assistant',
    parts: [
      { type: 'tool-readRepoFile', state: 'output-available', input: { path: 'app/page.tsx' }, output: { content: fileBody } },
      { type: 'dynamic-tool', toolName: 'terminal', state: 'output-available', input: { label: 'npm test' }, output: { status: 'completed' } },
      { type: 'tool-searchRepo', state: 'output-error', input: { query: 'q' }, errorText: 'boom' },
    ],
  };
  const tokens = estimateMessageTokens(message);
  assert.ok(tokens > 14_000 / 3.5, `expected the 14k file to count, got ${tokens} tokens`);
  assert.ok(tokens < 14_400 / 3.5, `expected only the file plus small extras, got ${tokens} tokens`);
});

test('an unfinished tool call with no output still counts its input, and missing fields are fine', () => {
  const message = { id: 'a2', role: 'assistant', parts: [{ type: 'tool-listRepoFiles', state: 'input-available', input: { path: 'app' } }, { type: 'tool-x' }] };
  assert.equal(estimateMessageTokens(message), Math.ceil('{"path":"app"}'.length / 3.5));
});

test('getModelContextLimit returns bonsaiContext, a safe 32k when unknown, and 128k for others', () => {
  assert.equal(getModelContextLimit('bonsai::bonsai-2-27b', 65536), 65536);
  assert.equal(getModelContextLimit('bonsai::bonsai-2-27b', 32768), 32768);
  // Unknown must not guess high: a guess above the real window lets a prompt overflow llama-server.
  assert.equal(getModelContextLimit('bonsai::bonsai-2-27b', null), BONSAI_SAFE_CONTEXT);
  assert.equal(getModelContextLimit('bonsai::bonsai-2-27b', 0), BONSAI_SAFE_CONTEXT);
  assert.equal(getModelContextLimit('bonsai::bonsai-2-27b', undefined), 32768);
  assert.equal(getModelContextLimit('gateway::minimax/minimax-m3'), 131072);
  assert.equal(getModelContextLimit('omniroute::auto/best-free'), 131072);
});

test('calculateContextUsage flags amber at 70% and red at 85%', () => {
  const limit = 1000;
  const usage69 = calculateContextUsage(690, limit);
  assert.equal(usage69.level, 'normal');
  assert.equal(usage69.percent, 69);
  assert.equal(usage69.tokens, 690);
  assert.equal(usage69.limit, 1000);

  const usage70 = calculateContextUsage(700, limit);
  assert.equal(usage70.level, 'warning'); // amber
  assert.equal(usage70.percent, 70);

  const usage84 = calculateContextUsage(849, limit);
  assert.equal(usage84.level, 'warning');

  const usage85 = calculateContextUsage(850, limit);
  assert.equal(usage85.level, 'danger'); // red
  assert.equal(usage85.percent, 85);

  const usage120 = calculateContextUsage(1200, limit);
  assert.equal(usage120.level, 'danger');
  assert.equal(usage120.percent, 100); // capped at 100
});
