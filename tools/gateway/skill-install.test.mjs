import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MARKER, SkillInstallError, planSkillInstall, writeSkillInstall } from './skill-install.mjs';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aro-skill-install-'));
}
const SKILL = { 'SKILL.md': '---\nname: demo\ndescription: Demo\n---\nDo it.' };
const fails = (fn, status) =>
  assert.throws(fn, (err) => err instanceof SkillInstallError && err.status === status, `expected HTTP ${status}`);

test('installs a skill and marks it as ARO-managed', () => {
  const dir = tmp();
  const result = writeSkillInstall(planSkillInstall(dir, 'demo', { ...SKILL, 'scripts/run.sh': 'echo hi' }));
  assert.deepEqual(result, { replaced: false, files: 2 });
  assert.equal(fs.readFileSync(path.join(dir, 'demo', 'scripts', 'run.sh'), 'utf8'), 'echo hi');
  assert.ok(fs.existsSync(path.join(dir, 'demo', MARKER)));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('refuses to touch a skill folder ARO did not create (Pinokio, or one made by hand)', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'pinokio'));
  fs.writeFileSync(path.join(dir, 'pinokio', 'SKILL.md'), 'ORIGINAL');
  fails(() => writeSkillInstall(planSkillInstall(dir, 'pinokio', SKILL)), 409);
  assert.equal(fs.readFileSync(path.join(dir, 'pinokio', 'SKILL.md'), 'utf8'), 'ORIGINAL');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('reinstalling replaces the old version and drops files the new one no longer has', () => {
  const dir = tmp();
  writeSkillInstall(planSkillInstall(dir, 'demo', { ...SKILL, 'old.md': 'old' }));
  const result = writeSkillInstall(planSkillInstall(dir, 'demo', { 'SKILL.md': 'v2' }));
  assert.equal(result.replaced, true);
  assert.equal(fs.readFileSync(path.join(dir, 'demo', 'SKILL.md'), 'utf8'), 'v2');
  assert.equal(fs.existsSync(path.join(dir, 'demo', 'old.md')), false);
  assert.deepEqual(fs.readdirSync(dir), ['demo'], 'no staging folder left behind');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('one bad file rejects the whole install before anything is written', () => {
  const dir = tmp();
  fails(() => planSkillInstall(dir, 'demo', { ...SKILL, 'C:/Windows/evil.txt': 'x' }), 400);
  fails(() => planSkillInstall(dir, 'demo', { ...SKILL, '../escape.md': 'x' }), 400);
  fails(() => planSkillInstall(dir, 'demo', { ...SKILL, 'a/../../escape.md': 'x' }), 400);
  fails(() => planSkillInstall(dir, 'demo', { ...SKILL, 'logo.png': 'x' }), 400);
  fails(() => planSkillInstall(dir, 'demo', { ...SKILL, 'nul.md': 'a\0b' }), 400);
  fails(() => planSkillInstall(dir, 'demo', { ...SKILL, [MARKER]: '{}' }), 400);
  fails(() => planSkillInstall(dir, 'demo', { ...SKILL, 'skill.MD': 'same name, other case' }), 400);
  assert.deepEqual(fs.readdirSync(dir), [], 'nothing was created');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('needs a top-level SKILL.md, a safe name, and a configured folder', () => {
  const dir = tmp();
  fails(() => planSkillInstall(dir, 'demo', { 'docs/SKILL.md': 'nested only' }), 400);
  fails(() => planSkillInstall(dir, '../demo', SKILL), 400);
  fails(() => planSkillInstall(dir, 'has space', SKILL), 400);
  fails(() => planSkillInstall(dir, 'demo', {}), 400);
  fails(() => planSkillInstall('', 'demo', SKILL), 503);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('enforces the 200 KB total, counted in bytes not characters', () => {
  const dir = tmp();
  fails(() => planSkillInstall(dir, 'demo', { ...SKILL, 'big.md': 'é'.repeat(101 * 1024) }), 413);
  assert.ok(planSkillInstall(dir, 'demo', { ...SKILL, 'ok.md': 'x'.repeat(150 * 1024) }));
  fs.rmSync(dir, { recursive: true, force: true });
});
