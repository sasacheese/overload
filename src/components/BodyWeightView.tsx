/**
 * 「体重」タブ。折れ線と、記録の一覧。
 *
 * 体重はトレーニングをしない日にも入れるものなので、種目の記録とは別の面に置く。
 * ここでも今日の値を入れられるようにしてあり、ジムに行かない日はこのタブだけで済む。
 *
 * 目標体重は持たない。今日の画面から目標を外したのと同じ理由で、達していない状態が
 * 毎日表示されると続かない。出すのは実測と、その差分と、記録をそのまま延ばした予想だけ。
 *
 * 予想は目標ではない。届くべき線ではなく、いまの記録の延長線を破線で置いてあるだけで、
 * 外しても何も起きない（`lib/forecast.ts`）。元にするのは**いま見ている期間**なので、
 * 上の 1か月 / 3か月 / 全期間 を切り替えると予想も切り替わる。
 */

import { useMemo, useState } from 'react';
import { dateLabel, dayKind, shiftDays } from '../lib/calendar.ts';
import { forecast, shortfall, shortfallLabel } from '../lib/forecast.ts';
import { maxWeightChangePerDay, settleName, settleWeight, storedHeight } from '../lib/profile.ts';
import { format } from '../lib/progression.ts';
import type { IsoDate } from '../lib/types.ts';
import { useSession, useStore } from '../store.tsx';
import { TopBar } from './TopBar.tsx';
import { ForecastNote, TrendChart } from './TrendChart.tsx';
import { dayClass } from './Weekday.tsx';

type Range = { label: string; days: number | null };

const RANGES: readonly Range[] = [
  { label: '1か月', days: 30 },
  { label: '3か月', days: 90 },
  { label: '全期間', days: null },
];

/** 一覧に出す行数。これ以上は折れ線で見るほうが早い。 */
const LIST_ROWS = 14;

/**
 * 何日先まで予想するか。
 *
 * 以前は 30 日だった。直線で伸ばしていたので、それ以上先は当たらないというより
 * **意味を持たなかった**（放っておけば 0 に届く線なので、先を出すほど嘘になる）。
 * いまは速さの上限と落ち着き先で線が寝るので、3 か月先まで出す——「どのへんで
 * 落ち着くのか」は、線が寝きるところまで見えて初めて読める。
 * 見ている期間が短ければ forecast 側でさらに短く切られる。
 */
const HORIZON = 90;

/** 30 日で 0.3kg 未満の動きは横ばいとして扱う。日々のぶれと区別が付かない。 */
const FLAT_PER_30 = 0.3;

export function BodyWeightView({ today }: { today: IsoDate }) {
  const { sessions, setBodyWeight } = useStore();
  const session = useSession(today);
  const [days, setDays] = useState<number | null>(RANGES[0]!.days);
  /*
   * 身長。落ち着き先を出すのに要る。設定で変えられるが、ここでは読むだけなので
   * マウント時の値でよい（変えたら設定から戻ってきた時点で読み直される）。
   */
  const [height] = useState(() => storedHeight());

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

  /*
   * 予想の元は「いま見ている期間」。全期間の傾きで 1か月 の窓に線を引くと、
   * 目の前の点と線がずれて見える（切り替えたのに何も変わらないのも同じくらい困る）。
   */
  const series = useMemo(() => points.map((p) => ({ date: p.date, value: p.weight })), [points]);

  /*
   * 予想は 2 度通す。
   *
   * 落ち着き先も速さの上限も「どちらへ向かっているか」で変わる（減るなら BMI 20 と
   * 週 1%、増えるなら BMI 25 と週 0.5%）。向きは線を引いてみないと分からないので、
   * 1 度目で向きだけ取り、2 度目でその向きの上限を渡して引き直す。
   * 純関数なので 2 度呼んでも同じ答えになる。
   */
  const trend = useMemo(() => {
    const probe = forecast(series, today, { days: HORIZON, flatPer30: FLAT_PER_30 });
    if (probe === null) return null;
    const falling = probe.perDay < 0;
    const current = probe.now;
    return forecast(series, today, {
      days: HORIZON,
      flatPer30: FLAT_PER_30,
      limit: settleWeight(height, current, falling),
      maxPerDay: maxWeightChangePerDay(current, falling),
    });
  }, [series, today, height]);
  const short = useMemo(() => shortfall(series), [series]);

  const rows = useMemo(() => [...all].reverse().slice(0, LIST_ROWS), [all]);
  /** 今日より前の直近の記録。上部の帯に「前回」として出す。 */
  const latestBefore = useMemo(() => all.filter((p) => p.date < today).at(-1) ?? null, [all, today]);

  return (
    <>
      <TopBar
        today={today}
        todayWeight={session.bodyWeight}
        latest={latestBefore}
        onChange={(v) => setBodyWeight(session, v)}
      />

      {all.length === 0 ? (
        <p className="empty">まだ記録がない。上の欄に今日の体重を入れると、ここに変化が出る。</p>
      ) : (
        <>
          {/* 広い画面では左に要点と折れ線、右に一覧。狭い画面では contents で素通り */}
          <div className="weight-main">
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

          <div className="segmented" role="group" aria-label="表示する期間">
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

          {/* 折れ線と予想の 1 行は 1 つの塊。広い画面の列の隙間で引き離さない */}
          {series.length < 2 ? (
            <p className="empty">2 日ぶん記録すると折れ線が出る。</p>
          ) : (
            <div className="trend-block">
              <TrendChart
                points={series}
                today={today}
                forecast={trend}
                label="体重の推移"
                tick={(n) => format(Math.round(n * 10) / 10)}
              />
              <ForecastNote
                forecast={trend}
                short={short === null ? null : shortfallLabel(short)}
                today={today}
                unit="kg"
                fmt={(n) => format(Math.round(n * 10) / 10)}
                settleName={trend === null ? undefined : settleName(trend.perDay < 0)}
              />
            </div>
          )}

          </div>

          <div className="weight-aside">
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
          </div>
        </>
      )}
    </>
  );
}
