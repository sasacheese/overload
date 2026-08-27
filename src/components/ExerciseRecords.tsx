/**
 * 種目シートの「記録」タブ。一覧のスパークラインを開いた先で、
 * 同じ推移を数字と一緒に読める面。
 *
 * 出すのは 4 つ。上から、通算の数字（何回・自己ベスト）、推移の折れ線と予想、
 * **初日から直近まで**、これまでの記録の一覧。どれも過去の事実で、目標は無い。
 *
 * 折れ線の組み立て（測り方・落ち着き先・伸びの上限）は種目カードの推移の節と
 * 同じ決めごとに従う。ここで別の式を使うと、カードとシートで違う線が出る。
 */

import { useMemo } from 'react';
import { dateLabel, relativeLabel, todayIso } from '../lib/calendar.ts';
import { forecast, shortfall, shortfallLabel } from '../lib/forecast.ts';
import { journeyOf, volumeParts } from '../lib/milestones.ts';
import { bodyweightCap } from '../lib/presets.ts';
import { formatEstimate, maxGainPerDay, metrics, setLine, trendLabel } from '../lib/progression.ts';
import { bestSeries, bodyWeightOn, exerciseHistory, exerciseTotals } from '../lib/query.ts';
import { doneSets, type Exercise } from '../lib/types.ts';
import { useStore } from '../store.tsx';
import { ForecastNote, TrendChart } from './TrendChart.tsx';

/** 一覧に出す日数の上限。それより古い日は数だけ言う。 */
const HISTORY_ROWS = 30;

/** カードの推移の節と同じ長さ（3 か月先まで）。 */
const TREND_HORIZON = 90;

export function ExerciseRecords({ exercise }: { exercise: Exercise }) {
  const { sessions } = useStore();
  const today = todayIso();

  const history = useMemo(() => exerciseHistory(sessions, exercise.id), [sessions, exercise.id]);
  const series = useMemo(() => bestSeries(exercise, history), [exercise, history]);
  const trendPoints = useMemo(() => series.map((s) => ({ date: s.date, value: s.best })), [series]);
  const journey = useMemo(() => journeyOf(exercise, history), [exercise, history]);
  /** 通算。やった日数・セット数・合計回数。伸び悩んだ時期にも必ず増えている側の数。 */
  const totals = useMemo(() => exerciseTotals(history), [history]);

  /* 測り方は履歴で決める（カードと同じ理由。今日の ✓ の有無で見出しを化けさせない） */
  const byLoad = history[0] ? metrics(exercise, history[0]).byLoad : exercise.loadMode !== 'bodyweight';
  /** この種目だけの積み上げ。重さで測れない日はレップなので足さない。 */
  const lifted = useMemo(
    () => history.reduce((total, h) => {
      const m = metrics(exercise, h);
      return m.byLoad ? total + m.volume : total;
    }, 0),
    [exercise, history],
  );

  const bodyWeight = bodyWeightOn(sessions, today);
  const capRatio = bodyweightCap(exercise.id);
  const trendLimit = byLoad && capRatio !== null && bodyWeight > 0 ? capRatio * bodyWeight : null;
  const flatPer30 = byLoad ? Math.max(0.5, (series.at(-1)?.best ?? 0) * 0.01) : 0.5;
  const trendMaxPerDay = maxGainPerDay(series.at(-1)?.best ?? 0, series.length);
  const trend = useMemo(
    () => forecast(trendPoints, today, { days: TREND_HORIZON, flatPer30, limit: trendLimit, maxPerDay: trendMaxPerDay }),
    [trendPoints, today, flatPer30, trendLimit, trendMaxPerDay],
  );
  const trendShort = useMemo(() => shortfall(trendPoints), [trendPoints]);

  if (history.length === 0) {
    return <p className="empty">まだ記録がない。「今日」に追加して ✓ を付けると、ここに推移が出る。</p>;
  }

  const best = Math.max(...series.map((s) => s.best));
  const unit = byLoad ? 'kg' : '回';
  const atBest = (series.at(-1)?.best ?? 0) >= best;
  const shownHistory = history.slice(0, HISTORY_ROWS);
  const total = volumeParts(lifted);

  return (
    <div className="ex-records">
      {/*
        通算。どれも絶対に減らない側の数字。
        「何日やったか」だけでは、1 日にどれだけ積んだかが読めない。セット数と
        合計回数を並べて、続けた量そのものを数として出す。
      */}
      <div className="summary">
        <span>
          <strong>{totals.days}</strong>
          <span className="unit">日</span>
        </span>
        <span>
          <strong>{totals.sets}</strong>
          <span className="unit">セット</span>
        </span>
        <span>
          <strong>{totals.reps.toLocaleString('ja-JP')}</strong>
          <span className="unit">回</span>
        </span>
      </div>

      <div className="summary">
        {/* 直近が自己ベストのときだけ赤が入る。赤 = いま前進の途中にある */}
        <span className={atBest ? 'hit' : ''}>
          <strong>{byLoad ? formatEstimate(best) : best}</strong>
          <span className="unit">{unit} ベスト</span>
        </span>
        {lifted > 0 ? (
          <span>
            <strong>{total.value}</strong>
            <span className="unit">{total.unit} 積み上げ</span>
          </span>
        ) : null}
      </div>

      {series.length >= 2 ? (
        <div className="trend-block">
          <div className="trend-head">
            <span className="muted">{trendLabel(exercise, byLoad)}</span>
            <strong>
              {byLoad ? `${formatEstimate(series.at(-1)?.best ?? 0)} kg` : `${series.at(-1)?.best ?? 0} 回`}
            </strong>
          </div>
          <TrendChart
            points={trendPoints}
            today={today}
            forecast={trend}
            label={trendLabel(exercise, byLoad)}
            tick={formatEstimate}
            atBest={atBest}
          />
          <ForecastNote
            forecast={trend}
            short={trendShort === null ? null : shortfallLabel(trendShort)}
            today={today}
            unit={unit}
            fmt={formatEstimate}
            settleName={capRatio === null ? undefined : `体重比 ${capRatio}×`}
          />
        </div>
      ) : (
        <p className="footnote">2 日ぶん記録すると折れ線が出る。</p>
      )}

      {journey ? (
        <p className="journey">
          <span className="journey-then">
            初日 <span className="muted">{relativeLabel(journey.first.date, today)}</span> {journey.first.label}
          </span>
          <span className={`journey-arrow${journey.improved ? ' is-up' : ''}`} aria-hidden="true">
            →
          </span>
          <span className={`journey-now${journey.improved ? ' is-up' : ''}`}>{journey.latest.label}</span>
        </p>
      ) : null}

      <ul className="past-list">
        {shownHistory.map((h) => (
          <li key={h.date}>
            <span className="past-date">
              {dateLabel(h.date)}
              <span className="muted"> {relativeLabel(h.date, today)}</span>
            </span>
            <span className="past-sets">{setLine(exercise, doneSets(h.entry))}</span>
            {h.entry.note.trim() !== '' ? <span className="past-note">{h.entry.note}</span> : null}
          </li>
        ))}
      </ul>
      {history.length > shownHistory.length ? (
        <p className="footnote">ほか {history.length - shownHistory.length} 日ぶんの記録がある。</p>
      ) : null}
    </div>
  );
}
