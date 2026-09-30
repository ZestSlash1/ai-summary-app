import test from 'node:test';
import assert from 'node:assert/strict';
import { parseModelRef, toModelRef, isQualifiedRef } from '../../lib/modelRef.ts';

test('a qualified ref carries its own source, whatever the old app-wide setting says', () => {
  assert.deepEqual(parseModelRef('bonsai::bonsai-2-27b', 'gateway'), { source: 'bonsai', id: 'bonsai-2-27b' });
  assert.deepEqual(parseModelRef('gateway::minimax/minimax-m3', 'bonsai'), { source: 'gateway', id: 'minimax/minimax-m3' });
  assert.deepEqual(parseModelRef('omniroute::auto/best-free'), { source: 'omniroute', id: 'auto/best-free' });
});

test('a bare id from an older chat reads with the legacy source', () => {
  // The bug from the screenshot: source switched to Bonsai, chat still held a Gateway id.
  assert.deepEqual(parseModelRef('minimax/minimax-m3', 'bonsai'), { source: 'bonsai', id: 'minimax/minimax-m3' });
  assert.deepEqual(parseModelRef('minimax/minimax-m3'), { source: 'gateway', id: 'minimax/minimax-m3' });
});

test('an unknown prefix is treated as part of the id, not as a source', () => {
  assert.deepEqual(parseModelRef('ollama::qwen', 'gateway'), { source: 'gateway', id: 'ollama::qwen' });
  assert.equal(isQualifiedRef('ollama::qwen'), false);
});

test('toModelRef and parseModelRef round-trip, including ids with colons and slashes', () => {
  for (const [source, id] of [['gateway', 'openai/gpt-5:thinking'], ['bonsai', 'bonsai-2-27b'], ['hermes', 'hermes-agent']]) {
    const ref = toModelRef(source, id);
    assert.equal(isQualifiedRef(ref), true);
    assert.deepEqual(parseModelRef(ref, 'omniroute'), { source, id });
  }
});
