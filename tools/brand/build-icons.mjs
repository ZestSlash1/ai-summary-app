// Builds every app icon from lib/aroMark.ts, so the favicon, the home-screen icons, and the
// in-app mark are one drawing. Run after changing the mark:  node tools/brand/build-icons.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import { markSvg } from '../../lib/aroMark.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TILE = '#09090c';

// name, size, tile corner radius (in the 120-unit drawing), how much of the tile the bubble fills.
// Maskable icons fill the whole square and keep the bubble inside the 80% safe zone.
const PNGS = [
  ['public/icon-16.png', 16, 0, 0.9],
  ['public/icon-32.png', 32, 0, 0.9],
  ['public/icon-48.png', 48, 0, 0.9],
  ['public/icon-180.png', 180, 0, 0.88],
  ['public/apple-touch-icon.png', 180, 0, 0.88],
  ['public/icon-192.png', 192, 26, 0.9],
  ['public/icon-512.png', 512, 26, 0.9],
  ['public/icon-maskable-512.png', 512, 0, 0.72],
];

async function render(size, radius, scale) {
  const svg = markSvg({ tile: { fill: TILE, radius }, scale });
  return sharp(Buffer.from(svg), { density: Math.ceil((72 * size) / 120) * 2 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
}

const built = {};
for (const [file, size, radius, scale] of PNGS) {
  built[file] = await render(size, radius, scale);
  writeFileSync(path.join(root, file), built[file]);
  console.log(file, size + 'px', built[file].length + ' bytes');
}

// The favicon is three PNGs in one .ico (PNG-in-ICO, supported by every current browser).
const sizes = [16, 32, 48];
const images = sizes.map((s) => built[`public/icon-${s}.png`]);
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = images.map((img, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(sizes[i] === 256 ? 0 : sizes[i], 0); e.writeUInt8(sizes[i], 1);
  e.writeUInt8(0, 2); e.writeUInt8(0, 3); e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(img.length, 8); e.writeUInt32LE(offset, 12);
  offset += img.length;
  return e;
});
writeFileSync(path.join(root, 'app/favicon.ico'), Buffer.concat([header, ...entries, ...images]));
console.log('app/favicon.ico', sizes.join('+'));

// The mark on its own, transparent, for anywhere a file is wanted.
writeFileSync(path.join(root, 'public/aro-mark.svg'), markSvg());
console.log('public/aro-mark.svg');
