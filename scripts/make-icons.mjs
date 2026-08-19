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
// 「前回までの水準」を表す線。主役は三角なので、明るさを落として従にする
const LINE = [0x59, 0x59, 0x59];

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

function inTriangle(x, y, [ax, ay], [bx, by], [cx, cy]) {
  const sign = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
  const d1 = sign(x, y, ax, ay, bx, by);
  const d2 = sign(x, y, bx, by, cx, cy);
  const d3 = sign(x, y, cx, cy, ax, ay);
  return (d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0);
}

function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/**
 * 「前の水準を超える」の図。src/components/Mark.tsx と同じ形。
 *
 * 水平の線が前回までの水準で、その上に立って突き抜けている三角が今日。
 * 線は三角の底辺より外へ伸ばして、越えている関係が読めるようにしている。
 *
 * scale は maskable の安全域に収めるための縮小率。三角形は重心が下寄りに
 * 見えるので、光学的な中心に合わせて少し上へずらす。
 *
 * @returns 'mark' | 'line' | null
 */
function mark(x, y, scale, withLine) {
  const u = (v) => 0.5 + (v - 0.5) / scale;
  const px = u(x);
  const py = u(y) + 0.03;
  if (px < 0 || px > 1 || py < 0 || py > 1) return null;
  if (inTriangle(px, py, [0.5, 0.13], [0.16, 0.66], [0.84, 0.66])) return 'mark';
  if (withLine && inRoundedRect(px, py, 0.05, 0.66, 0.95, 0.705, 0.023)) return 'line';
  return null;
}

/** 1 ピクセルを 4×4 でサンプリングして輪郭をなめらかにする。 */
function render(size, { round, scale, withLine }) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = round ? 0.225 : 0;
  const sub = 4;
  const total = sub * sub;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0;
      let markHits = 0;
      let lineHits = 0;
      for (let sy = 0; sy < sub; sy++) {
        for (let sx = 0; sx < sub; sx++) {
          const nx = (x + (sx + 0.5) / sub) / size;
          const ny = (y + (sy + 0.5) / sub) / size;
          if (round && !inRoundedRect(nx, ny, 0, 0, 1, 1, radius)) continue;
          bg += 1;
          const hit = mark(nx, ny, scale, withLine);
          if (hit === 'mark') markHits += 1;
          else if (hit === 'line') lineHits += 1;
        }
      }
      const i = (y * size + x) * 4;
      rgba[i + 3] = Math.round((bg / total) * 255);
      if (bg === 0) continue;
      const m = markHits / bg;
      const l = lineHits / bg;
      for (let c = 0; c < 3; c++) {
        rgba[i + c] = Math.round(BG[c] * (1 - m - l) + MARK[c] * m + LINE[c] * l);
      }
    }
  }
  return rgba;
}

const targets = [
  // 印は canvas の 62% に収める。余白を取るほど記号として見える
  { name: 'icon-192.png', size: 192, round: true, scale: 0.62, withLine: true },
  { name: 'icon-512.png', size: 512, round: true, scale: 0.62, withLine: true },
  // maskable は端が切られる前提なので、さらに内側へ寄せる
  { name: 'maskable-icon-512.png', size: 512, round: false, scale: 0.44, withLine: true },
  // iOS 側で角が丸められるので四角のまま出す
  { name: 'apple-touch-icon.png', size: 180, round: false, scale: 0.62, withLine: true },
  // 32px では線が 1px 未満に潰れて濁るだけなので、三角だけにして輪郭を優先する
  { name: 'favicon-32.png', size: 32, round: true, scale: 0.74, withLine: false },
];

for (const { name, size, round, scale, withLine } of targets) {
  writeFileSync(resolve(OUT, name), encodePng(size, render(size, { round, scale, withLine })));
  console.log(`${name} (${size}×${size})${withLine ? '' : ' 線なし'}`);
}
