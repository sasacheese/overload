/**
 * 「体重」タブ。折れ線と、記録の一覧。
 *
 * 体重はトレーニングをしない日にも入れるものなので、種目の記録とは別の面に置く。
 * ここでも今日の値を入れられるようにしてあり、ジムに行かない日はこのタブだけで済む。
 *
 * 目標体重は持たない。今日の画面から目標を外したのと同じ理由で、達していない状態が
 * 毎日表示されると続かない。出すのは実測と、その差分だけ。
 */

import { useMemo, useState } from 'react';
import { dateLabel, dateParts, dayKind, daysBetween, shiftDays } from '../lib/calendar.ts';
import { format } from '../lib/progression.ts';
import type { IsoDate } from '../lib/types.ts';
import { useSession, useStore } from '../store.tsx';
import { Mark } from './Mark.tsx';
import { Stepper } from './Stepper.tsx';
import { dayClass } from './Weekday.tsx';

type Range = { label: string; days: number | null };

const RANGES: readonly Range[] = [
  { label: '1か月', days: 30 },
  { label: '3か月', days: 90 },
  { label: '全期間', days: null },
];

/** 一覧に出す行数。これ以上は折れ線で見るほうが早い。 */
const LIST_ROWS = 14;

export function BodyWeightView({ today }: { today: IsoDate }) {
  const { sessions, saveSession } = useStore();
  const session = useSession(today);
  const [days, setDays] = useState<number | null>(RANGES[0]!.days);

  /** 体重が入っている日だけ、古い順に。 */
  const all = useMemo(
    () =>
      sessions
        .filter((s) => s.bodyWeight > 0)
        .map((s) => ({ date: s.date, weight: s.bodyWeight }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [sessions],
  );

  const from = days === null ? null : shiftDays(today, -days);
  const points = useMemo(() => all.filter((p) => from === null || p.date >= from), [all, from]);
  const newest = all.at(-1);
  const oldestInRange = points[0];
  const changeInRange = newest && oldestInRange ? newest.weight - oldestInRange.weight : null;

  const rows = useMemo(() => [...all].reverse().slice(0, LIST_ROWS), [all]);
  const parts = dateParts(today);

  return (
    <>
      <div className="weigh-in">
        <span className="weigh-in-label">
          {/* 18px では線が 1px 未満になって濁るだけなので、三角だけにする（favicon-32 と同じ判断） */}
          <Mark className="app-mark" showLine={false} />
          <strong>
            {parts.date}(<span className={dayClass(parts.kind)}>{parts.weekday}</span>)
          </strong>
          {newest && newest.weight !== session.bodyWeight ? (
            <span className="weigh-in-latest">{format(newest.weight)} kg</span>
          ) : null}
        </span>
        <Stepper
          value={session.bodyWeight}
          step={0.1}
          min={0}
          max={250}
          label="今日の体重"
          suffix="kg"
          zeroLabel="—"
          onChange={(v) => saveSession({ ...session, bodyWeight: v })}
        />
      </div>

      {all.length === 0 ? (
        <p className="empty">まだ記録がない。上の欄に今日の体重を入れると、ここに変化が出る。</p>
      ) : (
        <>
          <div className="summary">
            <span>
              <strong>{format(newest!.weight)}</strong>
              <span className="unit">kg 直近</span>
            </span>
            {changeInRange !== null && points.length >= 2 ? (
              <span className={changeInRange < 0 ? 'hit' : ''}>
                <strong>
                  {changeInRange > 0 ? '+' : changeInRange < 0 ? '−' : '±'}
                  {format(Math.abs(changeInRange))}
                </strong>
                <span className="unit">kg この期間</span>
              </span>
            ) : null}
            <span>
              <strong>{all.length}</strong>
              <span className="unit">記録</span>
            </span>
          </div>

          <div className="weight-range" role="group" aria-label="表示する期間">
            {RANGES.map((r) => (
              <button
                type="button"
                key={r.label}
                className={days === r.days ? 'is-active' : ''}
                aria-pressed={days === r.days}
                onClick={() => setDays(r.days)}
              >
                {r.label}
              </button>
            ))}
          </div>

          <WeightChart points={points} today={today} />

          <ul className="weight-list">
            {rows.map((row, i) => {
              const older = rows[i + 1];
              const diff = older ? row.weight - older.weight : null;
              return (
                <li className="weight-row" key={row.date}>
                  <span className={dayClass(dayKind(row.date)) ?? 'muted'}>{dateLabel(row.date)}</span>
                  <span className="value">{format(row.weight)} kg</span>
                  <span className={`diff ${diff !== null && diff < 0 ? 'down' : ''}`}>
                    {diff === null || diff === 0
                      ? ''
                      : `${diff > 0 ? '+' : '−'}${format(Math.abs(diff))}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}

type Point = { date: IsoDate; weight: number };

/**
 * 折れ線。
 *
 * 縦軸は 0 から始めない。体重の変化幅は全体の数 % なので、0 起点にすると線が
 * 平らになって何も読み取れない。実測の範囲に上下 0.4kg の余白を足した窓で描く。
 * 横軸は日付の実距離で置く（記録の間隔が空いた期間が詰まって見えないように）。
 */
function WeightChart({ points, today }: { points: readonly Point[]; today: IsoDate }) {
  if (points.length < 2) {
    return <p className="empty">2 日ぶん記録すると折れ線が出る。</p>;
  }

  const width = 320;
  const height = 132;
  const padLeft = 30;
  const padBottom = 16;
  const padTop = 8;

  const first = points[0]!;
  const span = Math.max(1, daysBetween(first.date, today));
  const weights = points.map((p) => p.weight);
  const min = Math.min(...weights) - 0.4;
  const max = Math.max(...weights) + 0.4;
  const range = max - min;

  const x = (p: Point) => padLeft + (daysBetween(first.date, p.date) / span) * (width - padLeft - 4);
  const y = (w: number) => padTop + (1 - (w - min) / range) * (height - padTop - padBottom);

  const line = points.map((p) => `${x(p).toFixed(1)},${y(p.weight).toFixed(1)}`).join(' ');
  const area = `${padLeft},${height - padBottom} ${line} ${x(points.at(-1)!).toFixed(1)},${height - padBottom}`;
  const ticks = [max, (max + min) / 2, min];

  return (
    <svg className="weight-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="体重の推移">
      {ticks.map((t) => (
        <g key={t}>
          <line className="grid" x1={padLeft} x2={width - 4} y1={y(t)} y2={y(t)} />
          <text className="axis" x={0} y={y(t) + 3}>
            {format(Math.round(t * 10) / 10)}
          </text>
        </g>
      ))}
      <polygon className="area" points={area} />
      <polyline className="curve" points={line} />
      {points.map((p) => (
        <circle key={p.date} className="point" cx={x(p)} cy={y(p.weight)} r={points.length > 40 ? 1 : 1.8} />
      ))}
    </svg>
  );
}
