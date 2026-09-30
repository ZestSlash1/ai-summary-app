import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pruneOldTurns } from '../../lib/historyPruning.ts';

test('pruneOldTurns drops oldest turns when context exceeds 90% but never drops mid tool call', () => {
  const messages = [
    { role: 'user', content: 'Turn 1' },
    { role: 'assistant', content: 'Reply 1' },
    { role: 'user', content: 'Turn 2' },
    { role: 'assistant', content: 'Reply 2' },
    { role: 'user', content: 'Turn 3' },
    { role: 'assistant', content: 'Reply 3' },
  ];
  const pruned = pruneOldTurns(messages, 2);
  assert.equal(pruned.length, 4);
  assert.equal(pruned[0].content, 'Turn 2');
});

test('pruneOldTurns never drops in the middle of a tool call exchange', () => {
  const messages = [
    { role: 'user', content: 'Turn 1' },
    {
      role: 'assistant',
      content: 'Calling tool',
      parts: [{ type: 'tool-listDirectory', toolCallId: 'call-1' }],
    },
    {
      role: 'tool',
      content: '{"files": ["app.ts"]}',
      toolCallId: 'call-1',
    },
    { role: 'assistant', content: 'Reply 1' },
    { role: 'user', content: 'Turn 2' },
    { role: 'assistant', content: 'Reply 2' },
  ];
  // Target index 2 lands on the tool result message, which must not become the start
  const pruned = pruneOldTurns(messages, 2);
  assert.equal(pruned.length, 2);
  assert.equal(pruned[0].content, 'Turn 2');
  assert.equal(pruned[0].role, 'user');
});

test('pruneOldTurns ensures pruned history starts with a user message', () => {
  const messages = [
    { role: 'user', content: 'Turn 1' },
    { role: 'assistant', content: 'Reply 1' },
    { role: 'user', content: 'Turn 2' },
    { role: 'assistant', content: 'Reply 2' },
  ];
  // Dropping 1 message lands on assistant, but turns must start with user
  const pruned = pruneOldTurns(messages, 1);
  assert.equal(pruned.length, 2);
  assert.equal(pruned[0].content, 'Turn 2');
  assert.equal(pruned[0].role, 'user');
});

test('pruneOldTurns preserves at least the latest user prompt when history is small', () => {
  const messages = [
    { role: 'user', content: 'Single prompt' },
    { role: 'assistant', content: 'Single reply' },
  ];
  const pruned = pruneOldTurns(messages, 2);
  assert.equal(pruned.length, 2);
  assert.equal(pruned[0].content, 'Single prompt');
});

test('lib/types.ts extends Conversation with continuedFrom and continuedIn', () => {
  const typesPath = path.resolve('lib/types.ts');
  const content = fs.readFileSync(typesPath, 'utf-8');
  assert.ok(content.includes('continuedFrom?: { id: string; title: string };'), 'Expected continuedFrom in Conversation');
  assert.ok(content.includes('continuedIn?: { id: string; title: string };'), 'Expected continuedIn in Conversation');
});

test('app/api/chat/route.ts guards context by pruning past 90% threshold', () => {
  const routePath = path.resolve('app/api/chat/route.ts');
  const content = fs.readFileSync(routePath, 'utf-8');
  assert.ok(content.includes('pruneOldTurns'), 'Expected pruneOldTurns in app/api/chat/route.ts');
  assert.ok(content.includes('0.9'), 'Expected 90% threshold check in app/api/chat/route.ts');
});

test('ChatPanel.tsx implements 80% threshold auto-continuation and header links without em-dashes', () => {
  const panelPath = path.resolve('components/ChatPanel.tsx');
  const content = fs.readFileSync(panelPath, 'utf-8');
  assert.ok(content.includes('contextUsage.percent >= 80'), 'Expected 80% threshold check in ChatPanel.tsx');
  assert.ok(content.includes('/api/chat/summary'), 'Expected call to /api/chat/summary in ChatPanel.tsx');
  assert.ok(content.includes('continuedFrom'), 'Expected continuedFrom in ChatPanel.tsx');
  assert.ok(content.includes('continuedIn'), 'Expected continuedIn in ChatPanel.tsx');
  assert.ok(content.includes('Continued from'), 'Expected Continued from link text in ChatPanel.tsx');
  assert.ok(content.includes('Continued in'), 'Expected Continued in link text in ChatPanel.tsx');
});

test('zero em-dashes across all Task 5 files', () => {
  const files = [
    'lib/historyPruning.ts',
    'app/api/chat/route.ts',
    'components/ChatPanel.tsx',
    'lib/storage.ts',
    'lib/types.ts',
    'tools/gateway/compact-history.test.mjs',
  ];
  for (const f of files) {
    const fullPath = path.resolve(f);
    const content = fs.readFileSync(fullPath, 'utf-8');
    assert.ok(!content.includes('\u2014'), `File ${f} must not contain em-dashes`);
  }
});
