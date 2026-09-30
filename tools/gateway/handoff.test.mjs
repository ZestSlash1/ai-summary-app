import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSystemMessages, handoffPrompt } from '../../lib/handoff.ts';
import { isSafeRepoSegment } from '../../lib/github.ts';

const text = (role, body, id = role) => ({ id, role, parts: [{ type: 'text', text: body }] });

test('hand-off summaries leave the message list, because AI SDK v7 rejects system messages in it', () => {
  // This is the exact shape a continued chat starts with. Sent as-is, the first message there
  // failed with "System messages are not allowed in the prompt or messages fields".
  const { system, rest } = splitSystemMessages([
    text('system', 'Continued from Old chat\n\nGoals: ship the thing.'),
    text('user', 'Continue please'),
  ]);
  assert.equal(system, 'Continued from Old chat\n\nGoals: ship the thing.');
  assert.deepEqual(rest.map((m) => m.role), ['user']);
  assert.equal(rest.some((m) => m.role === 'system'), false);
});

test('several hand-offs are joined in order, empty ones dropped, and other roles untouched', () => {
  const { system, rest } = splitSystemMessages([
    text('system', 'first', 's1'),
    text('system', '   ', 's2'),
    text('user', 'hi', 'u1'),
    text('assistant', 'hello', 'a1'),
    text('system', 'second', 's3'),
  ]);
  assert.equal(system, 'first\n\nsecond');
  assert.deepEqual(rest.map((m) => m.id), ['u1', 'a1']);
});

test('a chat with no hand-off is returned as is', () => {
  const messages = [text('user', 'hi'), text('assistant', 'yo')];
  const { system, rest } = splitSystemMessages(messages);
  assert.equal(system, '');
  assert.deepEqual(rest, messages);
  assert.equal(handoffPrompt(''), '');
});

test('hand-off text in the prompt is introduced and size-capped', () => {
  const prompt = handoffPrompt('x'.repeat(50_000), 1000);
  assert.match(prompt, /continues an earlier one/);
  assert.ok(prompt.length < 1300);
});

test('owner and repo names keep path tricks out of GitHub API paths', () => {
  for (const ok of ['anthropics', 'hermes-agent', 'my.repo_1', 'A']) assert.equal(isSafeRepoSegment(ok), true, ok);
  for (const bad of ['', '..', '.', 'a/b', 'a?x=1', 'a#b', '%2e%2e', 'a b', 'x'.repeat(101), '../user', undefined, 7]) {
    assert.equal(isSafeRepoSegment(bad), false, String(bad));
  }
});
