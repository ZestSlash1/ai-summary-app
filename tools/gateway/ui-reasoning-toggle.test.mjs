import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function extractReasoning(part) {
  const reasoningText = part?.reasoning || part?.text || "";
  return reasoningText.trim() ? reasoningText : null;
}

test('extractReasoning extracts reasoning field or fallback text', () => {
  assert.equal(extractReasoning({ type: 'reasoning', reasoning: 'step 1: analyze' }), 'step 1: analyze');
  assert.equal(extractReasoning({ type: 'reasoning', text: 'thinking fallback' }), 'thinking fallback');
  assert.equal(extractReasoning({ type: 'reasoning', reasoning: 'primary', text: 'fallback' }), 'primary');
  assert.equal(extractReasoning({ type: 'reasoning', reasoning: '   ' }), null);
  assert.equal(extractReasoning({ type: 'reasoning' }), null);
});

// The app-wide source toggle was replaced by per-chat model refs; Bonsai now lives in the
// model picker's "On your PC" group, which must stay visible even when it is locked.
test('ModelSwitcher.tsx keeps a local Bonsai group and no em-dashes', () => {
  const filePath = path.resolve('components/ModelSwitcher.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');
  assert.ok(content.includes('On your PC · Bonsai'), 'Expected a local Bonsai group in the model picker');
  assert.ok(content.includes('locked: { subject: "bonsai"'), 'Expected Bonsai to stay listed (locked) for accounts without access');
  assert.ok(content.includes('locked: { subject: "paid"'), 'Expected paid models to show as locked for accounts without access');
  assert.ok(!content.includes('—'), 'ModelSwitcher should contain zero em-dashes');
});

test('ChatPanel.tsx handles reasoning parts with details and Thought process summary', () => {
  const filePath = path.resolve('components/ChatPanel.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');
  assert.ok(
    content.includes('part.type === "reasoning"'),
    'Expected ChatPanel to handle part.type === "reasoning"'
  );
  assert.ok(
    content.includes('Thought process'),
    'Expected ChatPanel to render "Thought process" summary'
  );
  assert.ok(
    content.includes('<details') && content.includes('<summary'),
    'Expected ChatPanel to render details and summary tags'
  );
  // UI copy check
  const summaryMatches = content.match(/<summary[^>]*>([\s\S]*?)<\/summary>/g) || [];
  for (const s of summaryMatches) {
    assert.ok(!s.includes('—'), `Summary UI copy should not contain em-dash: ${s}`);
  }
});
