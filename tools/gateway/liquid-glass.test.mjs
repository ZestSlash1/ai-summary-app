import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canRefract, edgeMap } from '../../lib/liquidGlass.ts';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const stops = (url) =>
  [...decodeURIComponent(url).matchAll(/offset='([\d.]+)' stop-color='rgb\((\d+),(\d+),(\d+)\)'/g)].map((m) => ({
    offset: Number(m[1]),
    rgb: [Number(m[2]), Number(m[3]), Number(m[4])],
  }));

test('the refraction map pushes at the rim and leaves the middle untouched', () => {
  const x = stops(edgeMap(400, 20, 'x'));
  assert.deepEqual(x[0], { offset: 0, rgb: [255, 0, 0] }, 'full push at the leading edge');
  assert.deepEqual(x.at(-1), { offset: 1, rgb: [0, 0, 0] }, 'opposite push at the trailing edge');
  const neutral = x.filter((s) => s.rgb[0] === 128).map((s) => s.offset);
  assert.deepEqual(neutral, [0.05, 0.95], 'neutral (128) from one bevel in to one bevel from the end');

  const y = stops(edgeMap(100, 20, 'y'));
  assert.ok(y.every((s) => s.rgb[0] === 0 && s.rgb[2] === 0), 'the y map lives in the green channel only');
  assert.equal(y[0].rgb[1], 255);
});

test('a bevel wider than half the element meets in the middle instead of overlapping', () => {
  const x = stops(edgeMap(20, 22, 'x'));
  const neutral = x.filter((s) => s.rgb[0] === 128).map((s) => s.offset);
  assert.deepEqual(neutral, [0.5, 0.5]);
  for (let i = 1; i < x.length; i++) assert.ok(x[i].offset >= x[i - 1].offset, 'stops stay in order');
});

test('refraction is off where there is no browser', () => {
  assert.equal(canRefract(), false);
});

test('the glass material has a solid fallback, and its motion stops under reduced motion', () => {
  const css = read('app/globals.css');
  assert.match(css, /@layer components \{\s*\/\*[\s\S]*?\*\/\s*\.aro-glass \{/, 'glass sits in the components layer so utilities can tune it');
  const transparency = css.match(/@media \(prefers-reduced-transparency: reduce\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.match(transparency, /\.aro-glass[\s\S]*backdrop-filter: none/, 'less transparency means solid glass');
  const motion = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.match(motion, /\.aro-beam > span \{\s*animation: none;/, 'the rim light holds still');
  assert.match(motion, /\.aro-aurora \{\s*animation: none;/, 'the aurora stops drifting');
  // light-dark() only takes colors; a number inside it silently drops the whole declaration.
  assert.doesNotMatch(css, /opacity:\s*light-dark\(/);
});

test('the composer is the refracting glass and lights its rim while a reply streams', () => {
  const composer = read('components/chat/Composer.tsx');
  assert.match(composer, /<LiquidRefraction target=\{glassRef\} \/>/);
  assert.match(composer, /data-on=\{streaming \|\| undefined\} className="aro-beam"/);
  assert.match(composer, /className="aro-glass group\/composer/);
});
