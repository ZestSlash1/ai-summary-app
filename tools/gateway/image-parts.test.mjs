import test from 'node:test';
import assert from 'node:assert/strict';
import { canSeeImages, imagesAsNotes } from '../../lib/imageParts.ts';

test('canSeeImages: text-only Ollama models cannot, vision ones and other sources can', () => {
  assert.equal(canSeeImages('ollama', 'huihui-qwen3-14b:latest'), false);
  assert.equal(canSeeImages('ollama', 'qwen3:8b'), false);
  assert.equal(canSeeImages('ollama', 'gemma3:1b'), false);
  assert.equal(canSeeImages('ollama', 'gemma3:4b'), true);
  assert.equal(canSeeImages('ollama', 'llama3.2-vision:11b'), true);
  assert.equal(canSeeImages('ollama', 'qwen2.5vl:7b'), true);
  assert.equal(canSeeImages('ollama', 'qwen3-vl:8b'), true);
  assert.equal(canSeeImages('gateway', 'anthropic/claude-sonnet-4'), true);
  assert.equal(canSeeImages('bonsai', 'bonsai-2-27b'), true);
});

test('imagesAsNotes swaps image parts for a note and leaves everything else alone', () => {
  const text = { type: 'text', text: 'make the sky overcast' };
  const image = { type: 'file', mediaType: 'image/jpeg', url: 'data:image/jpeg;base64,AAAA', filename: 'sky.jpg' };
  const other = { type: 'file', mediaType: 'application/pdf', url: 'data:application/pdf;base64,AAAA' };
  const withImage = { id: '1', role: 'user', parts: [text, image, other] };
  const plain = { id: '2', role: 'assistant', parts: [{ type: 'text', text: 'ok' }] };

  const [a, b] = imagesAsNotes([withImage, plain]);

  assert.deepEqual(a.parts[0], text);
  assert.deepEqual(a.parts[1], { type: 'text', text: '[Image attached: sky.jpg. You cannot see images.]' });
  assert.equal(a.parts[2], other, 'non-image files are not touched');
  assert.equal(b, plain, 'a message without images is returned as is');
  assert.equal(withImage.parts[1], image, 'the input is not modified');
});

test('imagesAsNotes names no file when the part has no filename', () => {
  const [m] = imagesAsNotes([{ role: 'user', parts: [{ type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,AAAA' }] }]);
  assert.equal(m.parts[0].text, '[Image attached. You cannot see images.]');
});
