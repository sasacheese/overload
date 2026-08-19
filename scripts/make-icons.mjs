/**
 * アイコンの PNG を生成する。
 *
 * SVG から変換するツール（rsvg-convert・ImageMagick）は環境によって入っていないので、
 * 図形を直接描いて PNG を書き出す。依存を増やさず、どの環境でも同じ絵になる。
 *
 *   node scripts/make-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve(import.meta.dirname, '..', 'public');

// 無彩色の地と、信号として使う赤。styles.css の --bg / --accent と揃える
const BG = [0x0e, 0x0e, 0x0e];
const MARK = [0xdc, 0x32, 0x26];


const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // 各行の先頭にフィルタ種別 0 を挟むのが PNG の生データ形式
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function inPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 点から多角形の輪郭までの最短距離。角を丸めるために使う。 */
function distToPolygon(x, y, pts) {
  let best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, ay] = pts[j];
    const [bx, by] = pts[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}

/*
 * バーを担いだ V。src/components/Mark.tsx と同じ寸法（100 単位系）。
 * V は多角形の内側に加えて、輪郭から ROUND 以内も塗る。SVG 側で塗りと同じ色の線を
 * 重ねて角を丸めているのと同じ効果を、距離で出している。
 */
const BAR = { x0: 8, y0: 13, x1: 92, y1: 25, r: 3 };
const V = [
  [15, 34],
  [50, 89],
  [85, 34],
  [67, 34],
  [50, 66],
  [33, 34],
];
const ROUND = 1.5;

/**
 * @param scale maskable の安全域に収めるための縮小率
 * @returns 印の内側か
 */
function mark(x, y, scale) {
  const u = (v) => 0.5 + (v - 0.5) / scale;
  const px = u(x) * 100;
  const py = u(y) * 100;
  if (px < 0 || px > 100 || py < 0 || py > 100) return false;
  if (inRoundedRect(px, py, BAR.x0, BAR.y0, BAR.x1, BAR.y1, BAR.r)) return true;
  return inPolygon(px, py, V) || distToPolygon(px, py, V) <= ROUND;
}

/** 1 ピクセルを 4×4 でサンプリングして輪郭をなめらかにする。 */
function render(size, { round, scale }) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = round ? 0.225 : 0;
  const sub = 4;
  const total = sub * sub;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0;
      let hits = 0;
      for (let sy = 0; sy < sub; sy++) {
        for (let sx = 0; sx < sub; sx++) {
          const nx = (x + (sx + 0.5) / sub) / size;
          const ny = (y + (sy + 0.5) / sub) / size;
          if (round && !inRoundedRect(nx, ny, 0, 0, 1, 1, radius)) continue;
          bg += 1;
          if (mark(nx, ny, scale)) hits += 1;
        }
      }
      const i = (y * size + x) * 4;
      rgba[i + 3] = Math.round((bg / total) * 255);
      if (bg === 0) continue;
      const m = hits / bg;
      for (let c = 0; c < 3; c++) {
        rgba[i + c] = Math.round(BG[c] * (1 - m) + MARK[c] * m);
      }
    }
  }
  return rgba;
}

const targets = [
  // 印は canvas の 68% に収める。余白を取るほど記号として見える
  { name: 'icon-192.png', size: 192, round: true, scale: 0.68 },
  { name: 'icon-512.png', size: 512, round: true, scale: 0.68 },
  // maskable は端が切られる前提なので、さらに内側へ寄せる
  { name: 'maskable-icon-512.png', size: 512, round: false, scale: 0.48 },
  // iOS 側で角が丸められるので四角のまま出す
  { name: 'apple-touch-icon.png', size: 180, round: false, scale: 0.68 },
  // 32px ではバーと V の間が 1px を割るので、印を大きく取って形を優先する
  { name: 'favicon-32.png', size: 32, round: true, scale: 0.82 },
];

for (const { name, size, round, scale } of targets) {
  writeFileSync(resolve(OUT, name), encodePng(size, render(size, { round, scale })));
  console.log(`${name} (${size}×${size})`);
}
