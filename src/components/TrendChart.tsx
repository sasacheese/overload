/**
 * 実測と予想を 1 枚に置く折れ線。体重にも種目の到達点にも同じものを使う。
 *
 * ## 縦軸を 0 から始めない
 *
 * 体重の変化幅は全体の数 % で、推定 1RM もそれに近い。0 起点にすると線が平らになって
 * 何も読み取れない。実測と帯が収まる範囲に上下の余白を足した窓で描く。
 *
 * ## 横軸は日付の実距離
 *
 * 記録の間隔が空いた期間を詰めて描くと、線の傾きが実際より急に見える。予想は
 * その傾きを延ばしたものなので、詰めた軸の上に置くと予想まで嘘になる。
 *
 * ## 実測と予想を色で分ける
 *
 * 実測は赤の実線、予想は無彩色の破線と帯。赤は「実際に起きたこと」の合図に取ってあるので、
 * まだ起きていないものには渡さない。破線と帯は、線が 1 本の約束ではないことを形で言う。
 */

import { daysBetween } from '../lib/calendar.ts';
import { forecastWords, type Forecast, type TrendPoint } from '../lib/forecast.ts';
import type { IsoDate } from '../lib/types.ts';

type Props = {
  /** 実測。古い順。 */
  points: readonly TrendPoint[];
  today: IsoDate;
  /** 予想。無ければ実測だけを描く。 */
  forecast: Forecast | null;
  /** 読み上げ用の名前。 */
  label: string;
  /** 目盛の書式。 */
  tick: (n: number) => string;
  /** 直近の点を自己ベストとして強調するか。 */
  atBest?: boolean;
  /** カードの中に置くときは背を低くする。 */
  compact?: boolean;
};

const WIDTH = 320;
const HEIGHT = 132;
const PAD_LEFT = 30;
const PAD_RIGHT = 6;
const PAD_TOP = 8;
const PAD_BOTTOM = 16;

export function TrendChart({ points, today, forecast, label, tick, atBest = false, compact = false }: Props) {
  if (points.length < 2) return null;

  const first = points[0]!;
  const last = points.at(-1)!;
  const end = forecast?.date ?? (today > last.date ? today : last.date);
  const span = Math.max(1, daysBetween(first.date, end));

  const values = points.map((p) => p.value);
  const lows = forecast ? forecast.band.map((b) => b.lo) : [];
  const highs = forecast ? forecast.band.map((b) => b.hi) : [];
  const low = Math.min(...values, ...lows);
  const high = Math.max(...values, ...highs);
  /*
   * 上下の余白。線が枠に張り付くと、そこで頭打ちになったように見える。
   * 変化が無い日ばかりで幅が 0 になったときは、値の 2%（それも 0 なら 1）を窓にする。
   */
  const pad = (high - low) * 0.12 || Math.abs(high) * 0.02 || 1;
  const min = low - pad;
  const max = high + pad;
  const range = max - min;

  const x = (date: IsoDate) => PAD_LEFT + (daysBetween(first.date, date) / span) * (WIDTH - PAD_LEFT - PAD_RIGHT);
  const y = (v: number) => PAD_TOP + (1 - (v - min) / range) * (HEIGHT - PAD_TOP - PAD_BOTTOM);
  const at = (date: IsoDate, v: number) => `${x(date).toFixed(1)},${y(v).toFixed(1)}`;

  const line = points.map((p) => at(p.date, p.value)).join(' ');
  const floor = HEIGHT - PAD_BOTTOM;
  const area = `${x(first.date).toFixed(1)},${floor} ${line} ${x(last.date).toFixed(1)},${floor}`;
  const ticks = [max, (max + min) / 2, min];

  /*
   * 帯は上端を左から右へ、下端を右から左へ辿って閉じる。
   * 予想の線は今日の位置から始めるので、実測の最後が数日前でもそこは繋がない
   * （繋ぐと、記録の無い数日が実測のように見える）。
   */
  const band = forecast
    ? [...forecast.band.map((b) => at(b.date, b.hi)), ...[...forecast.band].reverse().map((b) => at(b.date, b.lo))].join(' ')
    : null;
  const projection = forecast ? forecast.band.map((b) => at(b.date, b.mid)).join(' ') : null;

  return (
    <svg
      className={`trend-chart${compact ? ' is-compact' : ''}`}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={forecast ? `${label}と予想` : label}
    >
      {ticks.map((t, i) => (
        <g key={i}>
          <line className="grid" x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={y(t)} y2={y(t)} />
          <text className="axis" x={0} y={y(t) + 3}>
            {tick(t)}
          </text>
        </g>
      ))}

      {band !== null ? <polygon className="band" points={band} /> : null}
      {projection !== null ? <polyline className="projection" points={projection} /> : null}

      <polygon className="area" points={area} />
      <polyline className="curve" points={line} />
      {points.map((p) => (
        <circle
          key={p.date}
          className={`point${atBest && p === last ? ' is-best' : ''}`}
          cx={x(p.date)}
          cy={y(p.value)}
          r={atBest && p === last ? 2.6 : points.length > 40 ? 1 : 1.8}
        />
      ))}

      {/* 今日の位置。ここから右は起きていないことだと形で分かる */}
      {forecast ? (
        <>
          <line className="divider" x1={x(today)} x2={x(today)} y1={PAD_TOP} y2={floor} />
          <circle className="horizon" cx={x(forecast.date)} cy={y(forecast.value)} r="2.6" />
        </>
      ) : null}
    </svg>
  );
}

type NoteProps = {
  forecast: Forecast | null;
  /** 予想が出ないとき、何が足りないかの 1 行。 */
  short: string | null;
  today: IsoDate;
  unit: string;
  fmt: (n: number) => string;
};

/**
 * 折れ線の下に置く 1 行。
 *
 * **数字だけを大きく置かない。** 予想は当てものではないので、値と同じ行に必ず幅を添える。
 * 出ないときは黙らず、あと何があれば出るのかだけ言う（「予想できません」は情報が無い）。
 */
export function ForecastNote({ forecast, short, today, unit, fmt }: NoteProps) {
  if (forecast === null) {
    return short === null ? null : <p className="forecast-note is-short">{short}</p>;
  }
  const words = forecastWords(forecast, today, unit, fmt);
  return (
    <p className="forecast-note">
      <span className="forecast-lead">{words.lead}</span>
      <span className="forecast-when">{words.when}</span>
      <strong className="forecast-value">{words.value}</strong>
      <span className="forecast-margin">{words.margin}</span>
      {words.change !== null ? <span className="forecast-change">{words.change}</span> : null}
    </p>
  );
}
