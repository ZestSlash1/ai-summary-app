import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseModelRef } from '../../lib/modelRef.ts';

test('summary prompt requests goals, decisions, files touched, and open tasks without em-dashes', () => {
  const prompt = 'Please provide a handoff summary: goals, decisions, files touched, open tasks.';
  assert.match(prompt, /goals/);
  assert.match(prompt, /decisions/);
  assert.match(prompt, /files touched/);
  assert.match(prompt, /open tasks/);
  assert.doesNotMatch(prompt, /—/);
});

test('app/api/chat/summary/route.ts implements summary endpoint without em-dashes', () => {
  const filePath = path.resolve('app/api/chat/summary/route.ts');
  assert.ok(fs.existsSync(filePath), 'Expected app/api/chat/summary/route.ts to exist');
  const content = fs.readFileSync(filePath, 'utf-8');
  assert.ok(content.includes('export async function POST'), 'Expected POST handler');
  assert.ok(content.includes('generateText'), 'Expected generateText call');
  assert.match(content, /goals/i);
  assert.match(content, /decisions/i);
  assert.match(content, /files touched/i);
  assert.match(content, /open tasks/i);
  assert.doesNotMatch(content, /—/, 'Expected no em-dashes in route.ts');
});

test('app/api/chat/summary/route.ts checks access for bonsai and hermes models', () => {
  const filePath = path.resolve('app/api/chat/summary/route.ts');
  const content = fs.readFileSync(filePath, 'utf-8');
  assert.ok(content.includes('canUseBonsai(session)'), 'Expected canUseBonsai check');
  assert.ok(content.includes('bonsaiDenied(session)'), 'Expected bonsaiDenied response for unauthorized bonsai access');
  assert.ok(content.includes('bonsaiDenied(session, \'Hermes\')'), 'Expected bonsaiDenied response for unauthorized hermes access');
});

test('model resolution for summary parses model references correctly', () => {
  assert.deepEqual(parseModelRef('bonsai::bonsai-2-27b'), { source: 'bonsai', id: 'bonsai-2-27b' });
  assert.deepEqual(parseModelRef('omniroute::deepseek-r1'), { source: 'omniroute', id: 'deepseek-r1' });
  assert.deepEqual(parseModelRef('hermes::hermes-agent'), { source: 'hermes', id: 'hermes-agent' });
  assert.deepEqual(parseModelRef('google/gemini-2.5-flash'), { source: 'gateway', id: 'google/gemini-2.5-flash' });
});
