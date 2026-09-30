import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function formatContext(ctx) {
  if (!ctx || typeof ctx !== 'number') return null;
  const k = Math.round(ctx / 1024);
  return `${k}k context`;
}

function relayBonsaiContext(body) {
  return typeof body.bonsaiContext === "number" ? body.bonsaiContext : null;
}

function formatBonsaiNote(baseNote, ctxLabel, state) {
  return ctxLabel && state !== "offline" ? `${baseNote} · ${ctxLabel}` : baseNote;
}

test('formatContext formats 65536 as 64k context', () => {
  assert.equal(formatContext(65536), '64k context');
  assert.equal(formatContext(32768), '32k context');
  assert.equal(formatContext(null), null);
  assert.equal(formatContext(undefined), null);
  assert.equal(formatContext(0), null);
  assert.equal(formatContext('65536'), null);
});

test('relayBonsaiContext extracts numeric context or null', () => {
  assert.equal(relayBonsaiContext({ bonsaiContext: 65536 }), 65536);
  assert.equal(relayBonsaiContext({ bonsaiContext: '65536' }), null);
  assert.equal(relayBonsaiContext({ bonsaiContext: null }), null);
  assert.equal(relayBonsaiContext({}), null);
});

test('formatBonsaiNote appends ctxLabel when state is not offline', () => {
  const base = 'Runs on your home PC. Private and free.';
  assert.equal(formatBonsaiNote(base, '64k context', 'online'), 'Runs on your home PC. Private and free. · 64k context');
  assert.equal(formatBonsaiNote(base, '64k context', undefined), 'Runs on your home PC. Private and free. · 64k context');
  assert.equal(formatBonsaiNote(base, '64k context', 'offline'), 'Runs on your home PC. Private and free.');
  assert.equal(formatBonsaiNote(base, null, 'online'), 'Runs on your home PC. Private and free.');
});

test('app/api/home-gpu/route.ts relays bonsaiContext', () => {
  const content = fs.readFileSync(path.resolve('app/api/home-gpu/route.ts'), 'utf-8');
  assert.ok(content.includes('bonsaiContext: typeof body.bonsaiContext === "number" ? body.bonsaiContext : null'));
});

test('lib/useHomeGpu.ts includes bonsaiContext in GpuStatus', () => {
  const content = fs.readFileSync(path.resolve('lib/useHomeGpu.ts'), 'utf-8');
  assert.ok(content.includes('bonsaiContext?: number | null;'));
});

test('components/ModelSwitcher.tsx displays context label without em-dashes', () => {
  const content = fs.readFileSync(path.resolve('components/ModelSwitcher.tsx'), 'utf-8');
  assert.ok(content.includes('ctxLabel'));
  assert.ok(content.includes('k context'));
  assert.ok(!content.includes('—'), 'ModelSwitcher should contain zero em-dashes');
});

