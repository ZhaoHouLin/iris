#!/usr/bin/env node
// Generates Iris app icon PNG files (pure Node.js, no extra packages)
// Usage: node scripts/generate-icons.js

const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

// ── CRC32 ──────────────────────────────────────────────────────────────────
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ── PNG writer ──────────────────────────────────────────────────────────────
// channels: 3=RGB, 4=RGBA
function writePNG(pixels, w, h, channels, outputPath) {
  const colorType = channels === 4 ? 6 : 2;
  const rowBytes = w * channels;
  const raw = Buffer.alloc(h * (rowBytes + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (rowBytes + 1)] = 0; // filter: None
    pixels.copy(raw, y * (rowBytes + 1) + 1, y * rowBytes, (y + 1) * rowBytes);
  }
  const compressed = zlib.deflateSync(raw, { level: 6 });

  function chunk(type, data) {
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;

  fs.writeFileSync(outputPath, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]));
  console.log('  wrote:', path.relative(process.cwd(), outputPath));
}

// ── Aperture geometry ───────────────────────────────────────────────────────
// Matches the SVG logo: 6 blades, inner r=15, outer r=46 (in 200×200 space)
// Each blade half-angle = 34°, blades rotated at 15°,75°,135°,195°,255°,315°
const BLADE_ANGLES = [15, 75, 135, 195, 255, 315].map(d => d * Math.PI / 180);
const HALF_ANGLE = 34 * Math.PI / 180;

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Returns [r,g,b] if (dx,dy) is inside a blade, null otherwise
function bladeColor(dx, dy, rI, rO) {
  const r = Math.sqrt(dx * dx + dy * dy);
  if (r < rI || r > rO) return null;
  const angle = Math.atan2(dy, dx);
  for (const ba of BLADE_ANGLES) {
    let rel = angle - ba;
    if (rel > Math.PI) rel -= 2 * Math.PI;
    if (rel < -Math.PI) rel += 2 * Math.PI;
    if (Math.abs(rel) <= HALF_ANGLE) {
      const t = clamp((r - rI) / (rO - rI), 0, 1);
      return [
        Math.round(lerp(0x8a, 0xe0, t)),
        Math.round(lerp(0x10, 0x20, t)),
        Math.round(lerp(0x30, 0x58, t)),
      ];
    }
  }
  return null;
}

// ── Icon dimensions ─────────────────────────────────────────────────────────
const SIZE = 1024;
const CX = SIZE / 2;
const CY = SIZE / 2;
const SCALE = SIZE / 200; // SVG was 200×200
const R_I = 15 * SCALE;   // inner (opening) radius
const R_O = 46 * SCALE;   // outer (blade tip) radius

const BG = [10, 4, 8]; // #0a0408

// icon.png — RGB, dark bg + aperture mark
function makeIcon() {
  const buf = Buffer.alloc(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const blade = bladeColor(x - CX, y - CY, R_I, R_O);
      const i = (y * SIZE + x) * 3;
      const c = blade ?? BG;
      buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
    }
  }
  return buf;
}

// android-icon-foreground.png — RGBA, mark on transparent bg
function makeForeground() {
  const buf = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const blade = bladeColor(x - CX, y - CY, R_I, R_O);
      const i = (y * SIZE + x) * 4;
      if (blade) {
        buf[i] = blade[0]; buf[i + 1] = blade[1]; buf[i + 2] = blade[2]; buf[i + 3] = 255;
      }
      // else: 0,0,0,0 (transparent, already zero from alloc)
    }
  }
  return buf;
}

// android-icon-background.png — RGB, solid brand dark
function makeBackground() {
  const buf = Buffer.alloc(SIZE * SIZE * 3);
  for (let i = 0; i < SIZE * SIZE; i++) {
    buf[i * 3] = BG[0]; buf[i * 3 + 1] = BG[1]; buf[i * 3 + 2] = BG[2];
  }
  return buf;
}

// android-icon-monochrome.png — RGB, white mark on black (for themed icons)
function makeMonochrome() {
  const buf = Buffer.alloc(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const blade = bladeColor(x - CX, y - CY, R_I, R_O);
      const i = (y * SIZE + x) * 3;
      const v = blade ? 255 : 0;
      buf[i] = v; buf[i + 1] = v; buf[i + 2] = v;
    }
  }
  return buf;
}

// ── Main ────────────────────────────────────────────────────────────────────
const assetsDir = path.join(__dirname, '..', 'assets');
console.log('Generating Iris icon assets...');
writePNG(makeIcon(),        SIZE, SIZE, 3, path.join(assetsDir, 'icon.png'));
writePNG(makeForeground(),  SIZE, SIZE, 4, path.join(assetsDir, 'android-icon-foreground.png'));
writePNG(makeBackground(),  SIZE, SIZE, 3, path.join(assetsDir, 'android-icon-background.png'));
writePNG(makeMonochrome(),  SIZE, SIZE, 3, path.join(assetsDir, 'android-icon-monochrome.png'));
console.log('\nDone. Next step: npx expo run:android');
