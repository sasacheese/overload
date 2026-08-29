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
 * ## 版面
 *
 * 幅は 1080 で固定、高さは中身で伸びる（下限 1350 = 4:5）。以前は 1080×1350 の
 * 固定版面だったが、**やった種目とその重量・レップ**を載せるようになって、
 * 日によって行数が変わるようになった。行数に合わせて字を詰めると、種目が多い日だけ
 * 読めない 1 枚になる。字の大きさを保って紙のほうを伸ばすほうが、どの日も同じ密度で読める。
 *
 * 下限を 4:5 にしてあるのは、SNS でいちばん縦に大きく出る比だから。種目が少ない日は
 * この比のままで、多い日だけ縦に伸びる。
 *
 * ## 測ってから描く
 *
 * 高さが中身で決まるので、描く前に高さが要る。同じ関数（`renderBody`）を
 * **測るときと描くときで 2 回**通し、1 回目の戻り値で canvas の高さを決めてから
 * 2 回目で描く。組み方を 2 箇所に書くと、測った高さと描いた中身がずれる。
 */

import { dateParts } from './calendar.ts';
import { MUSCLE_GROUPS, type IsoDate, type MuscleGroup } from './types.ts';

const W = 1080;
/** 下限の高さ。中身が少ない日はこの 4:5 のままにする。 */
const MIN_H = 1350;
const PAD = 96;

/** 載せ切る数の上限。これを超えたぶんは「ほか N …」に畳む。 */
const MAX_ENTRIES = 12;
const MAX_RECORDS = 6;

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

/** その日にやった種目 1 つぶん。 */
export type ShareCardEntry = {
  name: string;
  /** 「60kg × 10 · 10 · 8」。 */
  sets: string;
  /** その種目で記録が動いたか。動いた種目には印を付ける。 */
  progressed: boolean;
};

/** 何がどう進んだか 1 つぶん。 */
export type ShareCardRecord = {
  title: string;
  detail: string;
  previous: string | null;
  gain: string | null;
  /** どの種目で出たか。セッション全体なら「この日ぜんぶ」。 */
  where: string;
};

export type ShareCard = {
  date: string;
  /** 見出しの下に置く一言。 */
  praise: string;
  sets: number;
  exercises: number;
  volume: number;
  reps: number;
  groups: readonly MuscleGroup[];
  /** やった種目と、その重量・レップ。 */
  entries: readonly ShareCardEntry[];
  /** 記録更新。 */
  records: readonly ShareCardRecord[];
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
 * 幅に収まるように折り返す。呼ぶ前に ctx.font を決めておく。
 *
 * まず空白で割り、それでも収まらない塊だけ 1 文字ずつ送る。日本語には空白が
 * 無いので後者だけでも足りるが、`60kg × 10 · 10` のような並びが数字の途中で
 * 割れると読めなくなるので、切れ目があるならそちらを優先する。
 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';

  const pushChars = (chunk: string) => {
    for (const ch of chunk) {
      if (line !== '' && ctx.measureText(line + ch).width > maxWidth) {
        lines.push(line);
        line = ch;
      } else {
        line += ch;
      }
    }
  };

  for (const token of text.split(/(\s+)/)) {
    if (token === '') continue;
    if (ctx.measureText(line + token).width <= maxWidth) {
      line += token;
      continue;
    }
    if (line !== '') {
      lines.push(line.trimEnd());
      line = '';
    }
    pushChars(token.trimStart());
  }
  if (line.trim() !== '') lines.push(line.trimEnd());
  return lines.length === 0 ? [''] : lines;
}

/**
 * 幅に収まらない分を削って末尾に … を置く。呼ぶ前に ctx.font を決めておく。
 *
 * 折り返せない場所（種目名・出どころ）に使う。長い名前をそのまま描くと版面の
 * 外へ出て切れるが、切れた字と削った字は見え方が違う——末尾に … があれば、
 * 続きがあることが分かる。
 */
function clip(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const chars = [...text];
  while (chars.length > 1) {
    chars.pop();
    if (ctx.measureText(`${chars.join('')}…`).width <= maxWidth) break;
  }
  return `${chars.join('')}…`;
}

/** 節の見出し。細い横線と小さい字だけで、面は作らない。 */
function sectionHead(ctx: CanvasRenderingContext2D, y: number, text: string, draw: boolean): number {
  if (draw) {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = INK.faint;
    ctx.font = `600 28px ${SANS}`;
    ctx.fillText(text, PAD, y);
    const w = ctx.measureText(text).width;
    ctx.strokeStyle = INK.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD + w + 24, y - 10);
    ctx.lineTo(W - PAD, y - 10);
    ctx.stroke();
    ctx.restore();
  }
  return y + 54;
}

/**
 * 中身を組む。`draw` が false のときは何も描かずに高さだけ返す。
 *
 * 測る回と描く回で同じ道を通すためにこの形にしてある。組み方を 2 つ持つと、
 * 高さだけ合っていて中身がはみ出す 1 枚が出る。
 *
 * @returns 最後に置いたものの下端
 */
function renderBody(ctx: CanvasRenderingContext2D, card: ShareCard, draw: boolean): number {
  const usable = W - PAD * 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  if (draw) {
    // 上端の赤い筋。面を赤で塗らずに、1 本だけ通して信号として置く
    ctx.fillStyle = INK.accent;
    ctx.fillRect(0, 0, W, 6);

    // ── 名乗り
    drawMark(ctx, PAD, 118, 54, INK.accent);
    drawWordmark(ctx, PAD + 78, 165, 40);

    // ── 日付
    ctx.fillStyle = INK.dim;
    ctx.font = `500 32px ${SANS}`;
    ctx.textAlign = 'right';
    ctx.fillText(card.date, W - PAD, 162);
    ctx.textAlign = 'left';

    ctx.strokeStyle = INK.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, 220);
    ctx.lineTo(W - PAD, 220);
    ctx.stroke();
  }

  /*
   * 一言。この 1 枚の主題なので、いちばん大きい文字にする。
   * 版面に収まらないときだけ字を詰め、それでも余るときだけ折り返す。
   */
  let praiseSize = 62;
  ctx.font = `600 ${praiseSize}px ${SANS}`;
  while (ctx.measureText(card.praise).width > usable && praiseSize > 42) {
    praiseSize -= 2;
    ctx.font = `600 ${praiseSize}px ${SANS}`;
  }
  const praiseLines = wrapText(ctx, card.praise, usable);
  let y = 330;
  if (draw) {
    ctx.fillStyle = INK.fg;
    for (const line of praiseLines) {
      ctx.fillText(line, PAD, y);
      y += praiseSize * 1.28;
    }
    y -= praiseSize * 1.28;
  } else {
    y += (praiseLines.length - 1) * praiseSize * 1.28;
  }

  // ── 数字。左揃えで積む。横に 3 つ並べると桁数で行が揺れる
  y += 170;
  drawStatIf(ctx, PAD, y, String(card.sets), 'セット', draw);
  drawStatIf(ctx, PAD + 380, y, String(card.exercises), '種目', draw);
  y += 150;
  if (card.volume > 0) {
    drawStatIf(ctx, PAD, y, Math.round(card.volume).toLocaleString('ja-JP'), 'kg', draw);
  } else {
    drawStatIf(ctx, PAD, y, String(card.reps), '回', draw);
  }

  // ── 部位。色の点ではなく漢字で示す（画面のカレンダーと同じ）
  y += 106;
  if (card.groups.length > 0) {
    if (draw) {
      ctx.fillStyle = INK.dim;
      ctx.font = `500 34px ${SANS}`;
      ctx.fillText(card.groups.map((g) => MUSCLE_GROUPS[g].label).join(' · '), PAD, y);
    }
    y += 36;
  }

  /*
   * ── やったこと。種目名とその日の重量・レップ。
   *
   * この 1 枚を「何をやったか」が伝わるものにしているのは、数字だけの版面が
   * その日の中身を何も語らないため。セット行は幅で折り返す（重量が動いた日は長くなる）。
   */
  const shownEntries = card.entries.slice(0, MAX_ENTRIES);
  if (shownEntries.length > 0) {
    y += 70;
    y = sectionHead(ctx, y, 'やったこと', draw);
    for (const entry of shownEntries) {
      if (draw) {
        /*
         * 記録が動いた種目には赤い印を立てる。
         *
         * 印の有無で名前の位置は動かさない。印のぶんだけ字下げすると、動いた種目と
         * 動かなかった種目で行頭が揃わず、並びが階段になる。
         */
        if (entry.progressed) {
          ctx.fillStyle = INK.accent;
          ctx.fillRect(PAD, y - 30, 5, 38);
        }
        ctx.fillStyle = INK.fg;
        ctx.font = `600 40px ${SANS}`;
        ctx.fillText(clip(ctx, entry.name, usable - 22), PAD + 22, y);
      }
      ctx.font = `500 34px ${SANS}`;
      const lines = wrapText(ctx, entry.sets, usable - 22);
      y += 46;
      if (draw) ctx.fillStyle = INK.dim;
      for (const line of lines) {
        if (draw) ctx.fillText(line, PAD + 22, y);
        y += 42;
      }
      y += 16;
    }
    const rest = card.entries.length - shownEntries.length;
    if (rest > 0) {
      if (draw) {
        ctx.fillStyle = INK.faint;
        ctx.font = `500 30px ${SANS}`;
        ctx.fillText(`ほか ${rest} 種目`, PAD, y);
      }
      y += 44;
    }
    y -= 16;
  }

  /*
   * ── 進んだこと。何が、どこまで、どれだけ動いたか。
   *
   * 見出しだけでは「更新した」しか伝わらない。前の記録と増分まで置いて、
   * 1 枚で進歩の大きさが読めるようにする。
   */
  const shownRecords = card.records.slice(0, MAX_RECORDS);
  if (shownRecords.length > 0) {
    y += 70;
    y = sectionHead(ctx, y, '進んだこと', draw);
    for (const record of shownRecords) {
      if (draw) {
        // 縦棒は「これまで」の行まで通す。見出しだけに添えると 1 件が 2 つに割れて見える
        ctx.fillStyle = INK.accent;
        ctx.fillRect(PAD, y - 28, 4, record.previous ? 132 : 92);

        ctx.fillStyle = INK.accent;
        ctx.font = `700 26px ${SANS}`;
        ctx.fillText(record.title, PAD + 26, y);
        const titleWidth = ctx.measureText(record.title).width;
        ctx.fillStyle = INK.dim;
        ctx.font = `500 26px ${SANS}`;
        const whereAt = PAD + 26 + titleWidth + 20;
        ctx.fillText(clip(ctx, record.where, W - PAD - whereAt), whereAt, y);

        /*
         * 到達した数字と増分は同じ行に置く。増分は右端に寄せるので、数字が長い日は
         * 到達した側を削る（増分が消えると「どれだけ進んだか」が読めなくなる）。
         */
        ctx.font = `600 40px ${SANS}`;
        const gainWidth = record.gain ? ctx.measureText(record.gain).width + 32 : 0;
        ctx.fillStyle = INK.fg;
        ctx.font = `600 42px ${SANS}`;
        ctx.fillText(clip(ctx, record.detail, usable - 26 - gainWidth), PAD + 26, y + 52);

        if (record.gain) {
          ctx.textAlign = 'right';
          ctx.fillStyle = INK.accent;
          ctx.font = `600 40px ${SANS}`;
          ctx.fillText(record.gain, W - PAD, y + 52);
          ctx.textAlign = 'left';
        }
        if (record.previous) {
          ctx.fillStyle = INK.faint;
          ctx.font = `500 28px ${SANS}`;
          ctx.fillText(`これまで ${record.previous}`, PAD + 26, y + 96);
        }
      }
      y += record.previous ? 138 : 104;
    }
    const rest = card.records.length - shownRecords.length;
    if (rest > 0) {
      if (draw) {
        ctx.fillStyle = INK.faint;
        ctx.font = `500 30px ${SANS}`;
        ctx.fillText(`ほか ${rest} つ更新`, PAD, y);
      }
      y += 44;
    }
    y -= 34;
  }

  return y;
}

function drawStatIf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  value: string,
  unit: string,
  draw: boolean,
): void {
  if (draw) drawStat(ctx, x, y, value, unit);
}

/** 足元。連続週だけ添える。高さが決まってから下端に置く。 */
function drawFoot(ctx: CanvasRenderingContext2D, card: ShareCard, height: number): void {
  ctx.strokeStyle = INK.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, height - 168);
  ctx.lineTo(W - PAD, height - 168);
  ctx.stroke();

  ctx.fillStyle = INK.faint;
  ctx.font = `500 30px ${SANS}`;
  ctx.textAlign = 'left';
  ctx.fillText(card.weekStreak >= 2 ? `${card.weekStreak} 週連続` : '', PAD, height - 104);
  ctx.textAlign = 'right';
  ctx.fillText('OVERLOAD', W - PAD, height - 104);
  ctx.textAlign = 'left';
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
  canvas.height = MIN_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 1 回目は測るだけ。足元のぶんを足して高さを決める
  const contentBottom = renderBody(ctx, card, false);
  const height = Math.max(MIN_H, Math.round(contentBottom + 236));
  // 高さを変えると中身が消える。地から描き直す
  canvas.height = height;

  ctx.fillStyle = INK.bg;
  ctx.fillRect(0, 0, W, height);
  renderBody(ctx, card, true);
  drawFoot(ctx, card, height);

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
