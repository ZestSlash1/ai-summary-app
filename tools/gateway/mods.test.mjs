import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import {
  MODS,
  MODS_KEY,
  MODS_INIT_SCRIPT,
  DEFAULT_MODS,
  normalizeMods,
  parseStoredMods,
  setMod,
  changedCount,
  modAttributes,
} from '../../lib/mods.ts';

test('every mod has a unique id, a default that its own rules accept, and no em-dashes in its words', () => {
  const ids = MODS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const mod of MODS) {
    assert.match(mod.name + mod.description, /^[^—]*$/, mod.id);
    if (mod.kind === 'choice') {
      assert.ok(mod.options.some((o) => o.value === mod.default), `${mod.id} default is one of its options`);
    }
  }
});

test('storage can hold anything: only valid mods and values survive', () => {
  assert.deepEqual(normalizeMods(null), DEFAULT_MODS);
  assert.deepEqual(normalizeMods('nope'), DEFAULT_MODS);
  const state = normalizeMods({ focus: true, accent: 'violet', size: 'enormous', glow: 'yes', nonsense: true });
  assert.equal(state.focus, true);
  assert.equal(state.accent, 'violet');
  assert.equal(state.size, DEFAULT_MODS.size, 'a value the mod does not list falls back');
  assert.equal(state.glow, DEFAULT_MODS.glow, 'a string where a switch belongs falls back');
  assert.equal('nonsense' in state, false);
  assert.deepEqual(parseStoredMods('{not json'), DEFAULT_MODS);
  assert.deepEqual(parseStoredMods(null), DEFAULT_MODS);
});

test('setMod refuses bad input and never mutates the old state', () => {
  const before = { ...DEFAULT_MODS };
  const next = setMod(before, 'accent', 'ember');
  assert.equal(next.accent, 'ember');
  assert.equal(before.accent, 'blue');
  assert.equal(setMod(before, 'accent', 'chartreuse'), before);
  assert.equal(setMod(before, 'focus', 'on'), before);
  assert.equal(setMod(before, 'missing', true), before);
});

test('changedCount counts only what differs from the defaults', () => {
  assert.equal(changedCount(DEFAULT_MODS), 0);
  assert.equal(changedCount(setMod(setMod(DEFAULT_MODS, 'focus', true), 'accent', 'rose')), 2);
  assert.equal(changedCount(setMod(setMod(DEFAULT_MODS, 'focus', true), 'focus', false)), 0);
});

test('switches become on/off and picks become their value', () => {
  const attrs = modAttributes(normalizeMods({ spotlight: true, glow: false, accent: 'mint' }));
  assert.equal(attrs['data-mod-spotlight'], 'on');
  assert.equal(attrs['data-mod-glow'], 'off');
  assert.equal(attrs['data-mod-accent'], 'mint');
  assert.equal(attrs['data-mod-code'], 'default');
  assert.equal(Object.keys(attrs).length, MODS.length);
});

// The boot script is a second copy of the rules, written as plain ES5 to run before React.
// Run it against a fake page and require it to agree with modAttributes, so they cannot drift.
function runBoot(stored) {
  const attrs = {};
  const sandbox = {
    localStorage: { getItem: (k) => (k === MODS_KEY ? stored : null) },
    document: { documentElement: { setAttribute: (k, v) => (attrs[k] = v) } },
  };
  vm.runInNewContext(MODS_INIT_SCRIPT, sandbox);
  return attrs;
}

test('the boot script agrees with the app for saved, empty, and corrupt storage', () => {
  for (const saved of [
    { accent: 'violet', focus: true, size: 'large', code: 'terminal', glow: false },
    {},
    { accent: 'chartreuse', focus: 'maybe', size: 3 },
  ]) {
    assert.deepEqual(runBoot(JSON.stringify(saved)), modAttributes(normalizeMods(saved)));
  }
  assert.deepEqual(runBoot(null), modAttributes(DEFAULT_MODS));
  assert.deepEqual(runBoot('{broken'), {}, 'corrupt storage sets nothing, and CSS keeps its defaults');
});

test('every mod value the CSS can see has a rule in globals.css', () => {
  const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');
  for (const mod of MODS) {
    if (mod.kind === 'toggle' && mod.id !== 'field' && mod.id !== 'aurora' && mod.id !== 'glow') {
      assert.match(css, new RegExp(`data-mod-${mod.id}="(on|off)"`), `${mod.id} has CSS`);
    }
    if (mod.kind === 'choice') {
      for (const o of mod.options.filter((o) => o.value !== mod.default)) {
        assert.match(css, new RegExp(`data-mod-${mod.id}="${o.value}"`), `${mod.id}=${o.value} has CSS`);
      }
    }
  }
});
