import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseModelRef, toModelRef, isQualifiedRef, SOURCE_INFO } from '../../lib/modelRef.ts';
import { getModelContextLimit, OLLAMA_CONTEXT } from '../../lib/tokenEstimate.ts';

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
  assert.deepEqual(parseModelRef('lmstudio::qwen', 'gateway'), { source: 'gateway', id: 'lmstudio::qwen' });
  assert.equal(isQualifiedRef('lmstudio::qwen'), false);
});

test('ollama is a local source, and its ids keep their colons', () => {
  assert.deepEqual(parseModelRef('ollama::huihui-qwen3-14b', 'gateway'), { source: 'ollama', id: 'huihui-qwen3-14b' });
  // Ollama tags look like "qwen3:8b": only the first "::" splits source from id.
  assert.deepEqual(parseModelRef('ollama::qwen3:8b', 'gateway'), { source: 'ollama', id: 'qwen3:8b' });
  assert.equal(isQualifiedRef('ollama::qwen3:8b'), true);
  assert.equal(SOURCE_INFO.ollama.local, true);
});

test('an ollama chat is measured against the window its model was created with', () => {
  assert.equal(getModelContextLimit('ollama::huihui-qwen3-14b'), OLLAMA_CONTEXT);
  assert.equal(OLLAMA_CONTEXT, 12288);
  // The Modelfile is where that window is set; the two must not drift apart.
  const modelfile = readFileSync(new URL('../ollama/huihui-qwen3-14b.Modelfile', import.meta.url), 'utf8');
  assert.match(modelfile, new RegExp(`^PARAMETER num_ctx ${OLLAMA_CONTEXT}\r?$`, 'm'));
});

test('toModelRef and parseModelRef round-trip, including ids with colons and slashes', () => {
  for (const [source, id] of [['gateway', 'openai/gpt-5:thinking'], ['bonsai', 'bonsai-2-27b'], ['ollama', 'qwen3:8b'], ['hermes', 'hermes-agent']]) {
    const ref = toModelRef(source, id);
    assert.equal(isQualifiedRef(ref), true);
    assert.deepEqual(parseModelRef(ref, 'omniroute'), { source, id });
  }
});
