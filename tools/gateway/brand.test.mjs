import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { markSvg, EYES, BUBBLE_PATH } from '../../lib/aroMark.ts';

const sharp = createRequire(import.meta.url)('sharp');
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url));

test('every mood draws a face, and the mark carries the shared bubble', () => {
  for (const mood of Object.keys(EYES)) {
    const svg = markSvg({ mood });
    assert.ok(svg.includes(BUBBLE_PATH), `${mood} has the bubble`);
    for (const eye of EYES[mood]) assert.ok(svg.includes(eye.d), `${mood} has its eyes`);
  }
  assert.ok(markSvg({ scale: 0.6 }).includes('scale(0.6)'));
});

test('the app icons exist at the sizes the manifest and layout promise', async () => {
  const sizes = {
    'public/icon-16.png': 16,
    'public/icon-32.png': 32,
    'public/icon-48.png': 48,
    'public/icon-180.png': 180,
    'public/apple-touch-icon.png': 180,
    'public/icon-192.png': 192,
    'public/icon-512.png': 512,
    'public/icon-maskable-512.png': 512,
  };
  for (const [file, size] of Object.entries(sizes)) {
    const meta = await sharp(read(file)).metadata();
    assert.deepEqual([meta.width, meta.height], [size, size], file);
  }
});

test('the icons were built from the current mark, not an older one', async () => {
  // Rebuild the 192 icon in memory and compare it with the file. A changed drawing with
  // stale icons shows up as a large difference; renderer noise stays small.
  const fresh = await sharp(Buffer.from(markSvg({ tile: { fill: '#09090c', radius: 26 }, scale: 0.9 })), { density: 192 })
    .resize(192, 192).raw().toBuffer();
  const file = await sharp(read('public/icon-192.png')).raw().toBuffer();
  assert.equal(file.length, fresh.length);
  let diff = 0;
  for (let i = 0; i < file.length; i++) diff += Math.abs(file[i] - fresh[i]);
  assert.ok(diff / file.length < 4, `mean difference ${(diff / file.length).toFixed(2)} of 255: run node tools/brand/build-icons.mjs`);
});

test('the favicon is a valid .ico holding the 16, 32 and 48 pixel icons', () => {
  const ico = read('app/favicon.ico');
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1, 'type: icon');
  const count = ico.readUInt16LE(4);
  assert.equal(count, 3);
  const found = [];
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 16;
    const size = ico.readUInt32LE(at + 8);
    const offset = ico.readUInt32LE(at + 12);
    assert.deepEqual([...ico.subarray(offset, offset + 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'PNG data');
    assert.ok(offset + size <= ico.length);
    found.push(ico[at]);
  }
  assert.deepEqual(found, [16, 32, 48]);
});

test('the old "a" mark and its mascot are gone from the app', () => {
  const brand = read('components/BrandMark.tsx').toString();
  assert.ok(!brand.includes('data-mark="bowl"') && !brand.includes('data-mark="spark"'));
  assert.ok(brand.includes('@/lib/aroMark'));
  const mascot = read('components/Mascot.tsx').toString();
  assert.ok(!mascot.includes('#10B981') && mascot.includes('BrandMark'));
  assert.ok(!read('components/chat/Welcome.tsx').toString().includes('drawSVG'), 'welcome no longer draws strokes');
});
