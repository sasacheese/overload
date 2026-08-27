/**
 * 「推移」タブの**種目**の面。記録のある種目を 1 枚に重ねて、伸びを見比べる。
 *
 * ## 見返したくなる面にする
 *
 * 記録アプリの一覧は、たいてい「入れるための面」の延長で作られる——数字が並び、
 * 読み解くのは人の仕事になる。ここは**読み解いたあと**を置く面にしてある。
 * 開いた瞬間に「何本が伸びているか」が文で出て、線を選べばその種目の来し方が
 * 数字ではなく物語（初日 → 今日）として出る。数えるのではなく、眺める面。
 *
 * ## 積み上げ
 *
 *  1. **見出しの一文**。何種目が初日を超えているか、いちばん動いたのはどれか
 *  2. **期間**。1か月 / 3か月 / 全期間。切り替えると基準もその期間の初日へ移る
 *  3. **重ねた折れ線**（CompareChart）。縦軸は初日を 100 とした指数
 *  4. **選んだ種目の明細**。選ぶまでは全体の注記が座っていて、選ぶと入れ替わる
 *  5. **凡例**（CompareChart の中）。伸びた順で、押すと選択が変わる
 *
 * 選択は**この面が持つ**。絵と明細の 2 か所が同じ選択を見るので、どちらかの中に
 * 置くと渡し戻しになる。
 */

import { useMemo, useState } from 'react';
import { dateLabel, shiftDays } from '../lib/calendar.ts';
import { compareSeries, tooShortCount } from '../lib/compare.ts';
import { formatEstimate } from '../lib/progression.ts';
import { exerciseHistory, exerciseTotals } from '../lib/query.ts';
import { MUSCLE_GROUPS, type ExerciseId, type IsoDate } from '../lib/types.ts';
import { useStore } from '../store.tsx';
import { CompareChart, CompareLegend, seriesColor } from './CompareChart.tsx';

type Range = { label: string; days: number | null };

/** 体重の面と同じ刻み。同じタブの中で期間の意味が変わらないようにする。 */
const RANGES: readonly Range[] = [
  { label: '1か月', days: 30 },
  { label: '3か月', days: 90 },
  { label: '全期間', days: null },
];

export function ExerciseTrends({ today }: { today: IsoDate }) {
  const { sessions, exercises } = useStore();
  const [days, setDays] = useState<number | null>(null);
  const [picked, setPicked] = useState<ExerciseId | null>(null);

  const since = days === null ? null : shiftDays(today, -days);
  const series = useMemo(() => compareSeries(sessions, exercises, since), [sessions, exercises, since]);
  const tooShort = useMemo(() => tooShortCount(sessions, exercises, since), [sessions, exercises, since]);

  /** 選んだ種目。期間を変えて消えたときは、選択も落とす（下で判定する） */
  const chosen = series.find((s) => s.id === picked) ?? null;
  const chosenIndex = chosen ? series.indexOf(chosen) : -1;

  /** 選んだ種目の通算。期間で切らない——通算は通算のまま出す。 */
  const totals = useMemo(
    () => (chosen ? exerciseTotals(exerciseHistory(sessions, chosen.id)) : null),
    [sessions, chosen],
  );

  const rising = series.filter((s) => s.growth > 0).length;
  const lead = series[0];

  if (series.length === 0) {
    return (
      <p className="empty">
        同じ種目を 2 日ぶん記録すると、ここに線が出る。
        {tooShort > 0 ? `いまは ${tooShort} 種目が「あと 1 日」の状態。` : ''}
      </p>
    );
  }

  return (
    <div className="trends">
      {/*
        見出しの一文。数字の羅列ではなく、読める文で今の状態を言う。
        面を開いた瞬間に受け取るのはこの 1 行だけでいい。
      */}
      <p className="trends-lede">
        <strong>{rising}</strong> 種目が
        {days === null ? 'はじめた日' : 'この期間のはじめ'}より伸びている
      </p>
      {lead && lead.growth > 0 ? (
        <p className="trends-sub">
          いちばん動いたのは <strong>{lead.name}</strong>
          <span className="trends-lead-gain">+{Math.round(lead.growth * 100)}%</span>
        </p>
      ) : null}

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

      <CompareChart series={series} picked={chosen ? chosen.id : null} onPick={setPicked} />

      {/*
        絵のすぐ下。選ぶ前は全体の注記、選んだあとはその種目の来し方が座る。
        凡例より上に置いているのは、**線を見ている目の位置**に説明を出すため
        ——凡例の下だと、押した種目の話が画面の外へ落ちることがある。
      */}
      {chosen && totals ? (
        <div className="trends-focus" style={{ '--series': seriesColor(chosenIndex) } as React.CSSProperties}>
          <div className="trends-focus-head">
            <span className="trends-focus-group">{MUSCLE_GROUPS[chosen.group].label}</span>
            <strong className="trends-focus-name">{chosen.name}</strong>
          </div>

          {/* 初日 → 今日。目標ではなく過去の事実なので、外れようがない */}
          <div className="trends-journey">
            <span className="trends-then">
              <span className="trends-when">{dateLabel(chosen.points[0]!.date)}</span>
              <span className="trends-value">
                {formatEstimate(chosen.first)}
                {chosen.unit}
              </span>
            </span>
            <span className="trends-arrow" aria-hidden="true">
              →
            </span>
            <span className="trends-now">
              <span className="trends-when">{dateLabel(chosen.points.at(-1)!.date)}</span>
              <span className="trends-value">
                {formatEstimate(chosen.latest)}
                {chosen.unit}
              </span>
            </span>
            <span className={`trends-gain ${chosen.growth > 0 ? 'is-up' : ''}`}>
              {chosen.growth > 0 ? '+' : ''}
              {Math.round(chosen.growth * 100)}%
            </span>
          </div>

          {/* 通算。伸び悩んでも必ず増えている側の数 */}
          <p className="trends-totals">
            通算 <strong>{totals.days}</strong> 日 · <strong>{totals.sets}</strong> セット ·{' '}
            <strong>{totals.reps.toLocaleString('ja-JP')}</strong> 回
          </p>
        </div>
      ) : (
        <p className="footnote trends-note">
          縦軸は{days === null ? '初日' : 'この期間のはじめ'}を <strong>100</strong> とした指数。
          重さも回数も同じ物差しに直してあるので、軽い種目と重い種目の伸び方を並べて読める。
          線か凡例を押すと、その種目だけが浮き上がる。
          {tooShort > 0 ? ` 記録が 1 日だけの種目が ${tooShort} 件あり、線にできるまで出ない。` : ''}
        </p>
      )}

      <CompareLegend series={series} picked={chosen ? chosen.id : null} onPick={setPicked} />
    </div>
  );
}
