/**
 * 記録のある種目を **1 枚に重ねた**推移。凡例を押すとその種目だけが浮き上がる。
 *
 * ## 同じ尺度に乗せる
 *
 * 縦軸は実測ではなく**初日を 100 とした指数**（lib/compare.ts）。100 の線が
 * 「始めた日の自分」で、その上にいるぶんだけ伸びている。桁の違う種目——
 * 100kg のスクワットと 8kg のサイドレイズ——を同じ軸に置くための唯一の手で、
 * このアプリが見ているのが絶対値ではなく前進の量である以上、意味も合っている。
 *
 * ## ここだけ色を配る
 *
 * このアプリは無彩色 + 赤 1 色で通していて、赤は「前進した」の信号に取ってある
 * （styles.css の方針 2）。だが**何本もの線を見分ける**という仕事は色でしか
 * できない。ここは例外として色を配り、代わりに 2 つの縛りを置く。
 *
 *  1. 信号の赤（--accent）は線に使わない。祝福と前回比の赤と取り違えない
 *  2. 1 本を選んだら**残りは無彩色に落ちる**。色が意味を持つのは選んだ 1 本だけ、
 *     という状態を作れば、色数が増えても画面の性格は変わらない
 *
 * ## 押したら浮き上がる
 *
 * 凡例はボタン。押すと選択、もう一度押すと解除。線そのものも押せる（細い線を
 * 狙わせないよう、透明な太い線を重ねて当たり判定を広げてある）。
 */

import { useMemo } from 'react';
import { dateLabel, daysBetween } from '../lib/calendar.ts';
import type { CompareSeries } from '../lib/compare.ts';
import { formatEstimate } from '../lib/progression.ts';
import type { ExerciseId, IsoDate } from '../lib/types.ts';

const WIDTH = 340;
const HEIGHT = 200;
const PAD_LEFT = 30;
const PAD_RIGHT = 10;
const PAD_TOP = 12;
/** 下は日付の 1 行ぶん空ける。いつからいつまでの絵なのかが分からないと読めない */
const PAD_BOTTOM = 26;

/**
 * 線の色。
 *
 * 信号の赤（--accent）から色相を離した 8 色。彩度は中くらいで揃えてあり、
 * 明るい地でも暗い地でも同じ濃さに見える。9 種目以上あるときは先頭へ回る
 * ——同時に色で見分けられるのはせいぜい 8 本で、それ以上は選んで浮き上がらせる
 * ほうが早い。
 */
const HUES = [
  '#c2703f',
  '#3f8f8a',
  '#7b6fb0',
  '#b0913a',
  '#4b7fc4',
  '#a8577a',
  '#5f8f4e',
  '#8a7f6a',
] as const;

export function seriesColor(i: number): string {
  return HUES[i % HUES.length]!;
}

type Props = {
  series: readonly CompareSeries[];
  /**
   * いま選んでいる種目。選択は親が持つ——選んだ種目の明細を絵の外
   * （ExerciseTrends）に出すので、状態がここにあると渡し戻すことになる。
   */
  picked: ExerciseId | null;
  onPick: (id: ExerciseId | null) => void;
};

export function CompareChart({ series, picked, onPick }: Props) {

  /*
   * 描く窓。全部の線が収まる指数の範囲に余白を足す。
   *
   * 100（初日の線）は必ず窓に入れる。伸びた種目しか無い日でも基準線が見えないと、
   * どこからの伸びなのかが読めない。
   */
  const view = useMemo(() => {
    const all = series.flatMap((s) => s.points.map((p) => p.index));
    if (all.length === 0) return null;
    const low = Math.min(100, ...all);
    const high = Math.max(100, ...all);
    const pad = (high - low) * 0.12 || 5;
    const dates = series.flatMap((s) => s.points.map((p) => p.date));
    const from = dates.reduce((a, b) => (a < b ? a : b));
    const to = dates.reduce((a, b) => (a > b ? a : b));
    return { min: low - pad, max: high + pad, from, to, span: Math.max(1, daysBetween(from, to)) };
  }, [series]);

  if (view === null) return null;

  const x = (date: IsoDate) => PAD_LEFT + (daysBetween(view.from, date) / view.span) * (WIDTH - PAD_LEFT - PAD_RIGHT);
  const y = (index: number) =>
    PAD_TOP + (1 - (index - view.min) / (view.max - view.min)) * (HEIGHT - PAD_TOP - PAD_BOTTOM);

  const baseline = y(100);
  /** 目盛は 3 本だけ。線が何本も重なる面なので、横罫を増やすと下が読めなくなる */
  const ticks = [view.min, 100, view.max];
  const floor = HEIGHT - PAD_BOTTOM + 15;

  return (
    <svg
      className="compare-chart"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`${series.length} 種目の推移。初日を 100 とした指数で重ねたもの`}
    >
        {/* 初日の線。ここより上にいるぶんだけ伸びている */}
        <line className="compare-base" x1={PAD_LEFT} y1={baseline} x2={WIDTH - PAD_RIGHT} y2={baseline} />

        {/* いつからいつまでの絵なのか。両端だけ置けば読める */}
        <text className="compare-axis" x={PAD_LEFT} y={floor}>
          {dateLabel(view.from)}
        </text>
        <text className="compare-axis" x={WIDTH - PAD_RIGHT} y={floor} textAnchor="end">
          {dateLabel(view.to)}
        </text>
        {ticks.map((t) => (
          <text key={t} className="compare-tick" x={PAD_LEFT - 6} y={y(t) + 3} textAnchor="end">
            {Math.round(t)}
          </text>
        ))}

        {series.map((s, i) => {
          const on = picked === null || picked === s.id;
          const line = s.points.map((p) => `${x(p.date).toFixed(1)},${y(p.index).toFixed(1)}`).join(' ');
          const end = s.points.at(-1)!;
          return (
            <g
              key={s.id}
              className={`compare-series ${on ? '' : 'is-dim'} ${picked === s.id ? 'is-picked' : ''}`}
              style={{ '--series': seriesColor(i) } as React.CSSProperties}
            >
              {/* 細い線を指で狙わせないための、透明な当たり判定 */}
              <polyline className="compare-hit" points={line} onClick={() => onPick(picked === s.id ? null : s.id)} />
              <polyline className="compare-line" points={line} />
              <circle className="compare-end" cx={x(end.date)} cy={y(end.index)} r={picked === s.id ? 4 : 2.5} />
            </g>
          );
        })}
    </svg>
  );
}

/**
 * 凡例。絵とは別に出せるようにしてある——選んだ種目の明細を絵のすぐ下に
 * 置きたいので、絵と凡例のあいだに割り込める形にする必要があった。
 *
 * 伸びた順に並んでいるので、上から読むと「いちばん動いた種目」から目に入る。
 * 押すとその種目だけが浮き上がり、もう一度押すと解除。
 */
export function CompareLegend({ series, picked, onPick }: Props) {
  return (
    <ul className="compare-legend">
      {series.map((s, i) => {
        const on = picked === null || picked === s.id;
        return (
          <li key={s.id}>
            <button
              type="button"
              className={`compare-key ${on ? '' : 'is-dim'} ${picked === s.id ? 'is-picked' : ''}`}
              style={{ '--series': seriesColor(i) } as React.CSSProperties}
              aria-pressed={picked === s.id}
              onClick={() => onPick(picked === s.id ? null : s.id)}
            >
              <span className="compare-swatch" aria-hidden="true" />
              <span className="compare-name">{s.name}</span>
              {/* 指数だけでは何 kg なのか分からない。実測を小さく添える */}
              <span className="compare-real">
                {formatEstimate(s.latest)}
                {s.unit}
              </span>
              <span className={`compare-growth ${s.growth > 0 ? 'is-up' : ''}`}>
                {s.growth > 0 ? '+' : ''}
                {Math.round(s.growth * 100)}%
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
