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

test('ModelSourceToggle.tsx includes Bonsai (Local) option and no em-dashes', () => {
  const filePath = path.resolve('components/ModelSourceToggle.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');
  assert.ok(
    content.includes('{ value: "bonsai", label: "Bonsai (Local)" }'),
    'Expected ModelSourceToggle to contain Bonsai option'
  );
  assert.ok(!content.includes('—'), 'ModelSourceToggle should contain zero em-dashes');
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
