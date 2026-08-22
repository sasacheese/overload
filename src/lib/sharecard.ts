/**
 * 締めの画面から書き出す「今日の一枚」。
 *
 * ## なぜ画像なのか
 *
 * 画面をそのまま撮ると、上部バーもタブも入って何を見せたいのか伝わらない。
 * その日の数字だけを 1 枚に組んで渡せば、人に見せるものと自分の記録が別々でいられる。
 * 外へ送るのは端末の共有シートに渡すところまでで、このアプリはどこにも送らない
 * （オフラインで動くことが要件なので、そもそも送り先を持っていない）。
 *
 * ## なぜ canvas なのか
 *
 * SVG を画像にする経路（`<img src="data:image/svg+xml">` → canvas）は、外部フォントを
 * 読まないこのアプリでも端末ごとに字形が変わるうえ、Safari では汚染扱いで
 * `toBlob` が落ちることがある。canvas に直接描けば、依存も足さずどの端末でも同じ絵が出る。
 *
 * 版面は 1080×1350（4:5）。SNS でいちばん縦に大きく出る比で、正方形に切られても
 * 中央の数字が残るように、要素を中央の帯に寄せてある。
 */

import { dateParts } from './calendar.ts';
import { MUSCLE_GROUPS, type IsoDate, type MuscleGroup } from './types.ts';

const W = 1080;
const H = 1350;

/** 画面と同じ配色。地は暗い側で固定する——明るい地に赤 1 色だと SNS の中で沈む。 */
const INK = {
  bg: '#0e0e0e',
  surface: '#181818',
  line: 'rgba(255,255,255,0.10)',
  fg: '#ededed',
  dim: '#9a9a9a',
  faint: '#5e5e5e',
  accent: '#dc3226',
} as const;

const SANS = '-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", "Helvetica Neue", Arial, sans-serif';

export type ShareCard = {
  date: string;
  /** 見出しの下に置く一言。 */
  praise: string;
  sets: number;
  exercises: number;
  volume: number;
  reps: number;
  groups: readonly MuscleGroup[];
  /** 記録更新の見出し（最大 3 つまで置く）。 */
  records: readonly string[];
  weekStreak: number;
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * 印（バーを担いだ V）。components/Mark.tsx と同じ寸法を 100 単位で描く。
 * 形を 2 箇所に持つことになるが、SVG を画像に変換する経路を挟むより崩れない。
 */
function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
  const u = size / 100;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  roundRect(ctx, 8 * u, 13 * u, 84 * u, 12 * u, 3 * u);
  ctx.fill();
  // V。外側の輪 → 下の一点 → 内側の輪。角は塗りと同じ色の線で丸める
  ctx.beginPath();
  ctx.moveTo(15 * u, 34 * u);
  ctx.lineTo(50 * u, 89 * u);
  ctx.lineTo(85 * u, 34 * u);
  ctx.lineTo(67 * u, 34 * u);
  ctx.lineTo(50 * u, 66 * u);
  ctx.lineTo(33 * u, 34 * u);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3 * u;
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}

/** ワードマーク。V だけ字形を差し替える（画面のワードマークと同じ組み方）。 */
function drawWordmark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.save();
  ctx.font = `600 ${size}px ${SANS}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK.fg;
  const track = size * 0.14;
  let cursor = x;
  const put = (ch: string) => {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + track;
  };
  put('O');
  // V。キャップハイトに合わせて字の中に置く
  const vh = size * 0.705;
  const vw = size * 0.663;
  ctx.fillStyle = INK.accent;
  ctx.beginPath();
  ctx.moveTo(cursor, y - vh);
  ctx.lineTo(cursor + vw / 2, y);
  ctx.lineTo(cursor + vw, y - vh);
  ctx.lineTo(cursor + vw * 0.773, y - vh);
  ctx.lineTo(cursor + vw / 2, y - vh * 0.4);
  ctx.lineTo(cursor + vw * 0.227, y - vh);
  ctx.closePath();
  ctx.fill();
  cursor += vw + track;
  ctx.fillStyle = INK.fg;
  for (const ch of 'ERLOAD') put(ch);
  ctx.restore();
}

/** 数字と単位の組。数字を大きく、単位を小さく足元に置く（画面の要約と同じ組み方）。 */
function drawStat(ctx: CanvasRenderingContext2D, x: number, y: number, value: string, unit: string): void {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK.fg;
  ctx.font = `600 96px ${SANS}`;
  ctx.fillText(value, x, y);
  const w = ctx.measureText(value).width;
  ctx.fillStyle = INK.dim;
  ctx.font = `500 30px ${SANS}`;
  ctx.fillText(unit, x + w + 12, y);
  ctx.restore();
}

/**
 * 1 枚を描く。返すのは描き終えた canvas。
 *
 * 端末の解像度に依らず同じ絵にしたいので、devicePixelRatio は掛けない。
 * 1080px 幅は等倍でそのまま十分な密度がある。
 */
export function drawShareCard(card: ShareCard): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = INK.bg;
  ctx.fillRect(0, 0, W, H);

  // 上端の赤い筋。面を赤で塗らずに、1 本だけ通して信号として置く
  ctx.fillStyle = INK.accent;
  ctx.fillRect(0, 0, W, 6);

  const pad = 96;

  // ── 名乗り
  drawMark(ctx, pad, 118, 54, INK.accent);
  drawWordmark(ctx, pad + 78, 165, 40);

  // ── 日付
  ctx.fillStyle = INK.dim;
  ctx.font = `500 32px ${SANS}`;
  ctx.textAlign = 'right';
  ctx.fillText(card.date, W - pad, 162);
  ctx.textAlign = 'left';

  ctx.strokeStyle = INK.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, 220);
  ctx.lineTo(W - pad, 220);
  ctx.stroke();

  /*
   * 一言。この 1 枚の主題なので、いちばん大きい文字にする。
   *
   * 版面に収まらないときだけ字を詰める。折り返すと 2 行目の位置に合わせて
   * 下の数字まで動かすことになり、日によって版面が変わる。実測では一番長い
   * 言い回しでも 1 行に収まるので、これは端末の字形が違ったときの保険。
   */
  ctx.fillStyle = INK.fg;
  const usable = W - pad * 2;
  let praiseSize = 62;
  ctx.font = `600 ${praiseSize}px ${SANS}`;
  while (ctx.measureText(card.praise).width > usable && praiseSize > 34) {
    praiseSize -= 2;
    ctx.font = `600 ${praiseSize}px ${SANS}`;
  }
  ctx.fillText(card.praise, pad, 330);

  // ── 数字。左揃えで 3 つ縦に積む。横に並べると桁数で行が揺れる
  let y = 500;
  drawStat(ctx, pad, y, String(card.sets), 'セット');
  drawStat(ctx, pad + 380, y, String(card.exercises), '種目');
  y += 150;
  if (card.volume > 0) {
    drawStat(ctx, pad, y, Math.round(card.volume).toLocaleString('ja-JP'), 'kg');
  } else {
    drawStat(ctx, pad, y, String(card.reps), 'レップ');
  }

  // ── 部位。色の点ではなく漢字 1 文字で示す（画面のカレンダーと同じ）
  y += 110;
  ctx.fillStyle = INK.dim;
  ctx.font = `500 34px ${SANS}`;
  ctx.fillText(card.groups.map((g) => MUSCLE_GROUPS[g].label).join(' · '), pad, y);

  // ── 記録更新。あった日だけ、赤い縦棒を添えて並べる
  y += 84;
  for (const line of card.records.slice(0, 3)) {
    ctx.fillStyle = INK.accent;
    ctx.fillRect(pad, y - 34, 4, 44);
    ctx.fillStyle = INK.fg;
    ctx.font = `600 38px ${SANS}`;
    ctx.fillText(line, pad + 26, y);
    y += 68;
  }

  // ── 足元。連続週だけ添える
  ctx.strokeStyle = INK.line;
  ctx.beginPath();
  ctx.moveTo(pad, H - 168);
  ctx.lineTo(W - pad, H - 168);
  ctx.stroke();

  ctx.fillStyle = INK.faint;
  ctx.font = `500 30px ${SANS}`;
  ctx.fillText(card.weekStreak >= 2 ? `${card.weekStreak} 週連続` : '', pad, H - 104);
  ctx.textAlign = 'right';
  ctx.fillText('OVERLOAD', W - pad, H - 104);

  return canvas;
}

export function shareFileName(date: string): string {
  return `overload-${date.replace(/[^\d]/g, '')}.png`;
}

export type ShareResult = 'shared' | 'saved' | 'failed';

/**
 * 1 枚を端末に渡す。
 *
 * 共有シートが使えるなら渡し、無ければファイルとして保存する。共有シートは
 * 利用者が押した流れの中でしか開けない（ユーザー操作の直後でないと拒否される）ので、
 * blob を作るところまでを await した上で呼んでいる。
 *
 * 取り消し（シートを閉じた）は失敗ではないので、そのまま 'shared' を返す。
 */
export async function shareCard(canvas: HTMLCanvasElement, fileName: string, text: string): Promise<ShareResult> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return 'failed';

  const file = new File([blob], fileName, { type: 'image/png' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return 'shared';
    } catch (e) {
      // 利用者が閉じただけなら何も言わない。保存に落とすと 2 度手間になる
      if (e instanceof DOMException && e.name === 'AbortError') return 'shared';
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // 押した直後に外すとダウンロードが始まらない端末があるので、一拍置いてから捨てる
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'saved';
}

/** 1 枚に載せる日付。画面の見出しと同じ言い回しにする。 */
export function cardDateLabel(iso: IsoDate): string {
  const parts = dateParts(iso);
  return `${parts.date}(${parts.weekday})`;
}
