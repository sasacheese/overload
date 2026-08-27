/**
 * カレンダー。やった日が一目で分かることと、空白が続いていることに気づけることの
 * 両方を担う。日単位の連続記録は出さない（休養日で切れて、休むことが罰になる）。
 * 代わりに「週」で続いているかを数える。
 */

import { useMemo, useState } from 'react';
import {
  WEEKDAY_LABELS,
  dateLabel,
  dayKindOfIndex,
  inMonth,
  monthGrid,
  monthOf,
  shiftMonth,
  weekStreak,
  type YearMonth,
} from '../lib/calendar.ts';
import { compareSeries, tooShortCount } from '../lib/compare.ts';
import { lifetimeTotals, volumeParts } from '../lib/milestones.ts';
import { bodyWeightOn, countedSets, sessionGroups, sessionVolume, sortedSessions } from '../lib/query.ts';
import { MUSCLE_GROUPS, type IsoDate, type MuscleGroup } from '../lib/types.ts';
import { useStore } from '../store.tsx';
import { AskClaudeButton } from './AskClaudeButton.tsx';
import { CompareChart } from './CompareChart.tsx';
import { Icon } from './Icon.tsx';
import { dayClass } from './Weekday.tsx';

type Props = {
  today: IsoDate;
  onPickDate: (date: IsoDate) => void;
};

export function CalendarView({ today, onPickDate }: Props) {
  const { sessions, exercises } = useStore();
  const [month, setMonth] = useState<YearMonth>(() => monthOf(today));

  const recorded = useMemo(() => {
    const map = new Map<IsoDate, { volume: number; sets: number; groups: readonly MuscleGroup[] }>();
    for (const session of sortedSessions(sessions)) {
      map.set(session.date, {
        volume: sessionVolume(session, exercises, bodyWeightOn(sessions, session.date)),
        sets: countedSets(session),
        groups: sessionGroups(session, exercises),
      });
    }
    return map;
  }, [sessions, exercises]);

  const weeks = useMemo(() => monthGrid(month), [month]);
  const monthDates = useMemo(() => [...recorded.keys()].filter((d) => inMonth(d, month)), [recorded, month]);
  const monthVolume = monthDates.reduce((n, d) => n + (recorded.get(d)?.volume ?? 0), 0);
  const streak = weekStreak([...recorded.keys()], today);
  // 濃さの基準はその月の最大ボリューム。月によって上限が違っても比較が効くようにする
  const peak = Math.max(1, ...monthDates.map((d) => recorded.get(d)?.volume ?? 0));

  const recent = useMemo(() => sortedSessions(sessions).slice(0, 8), [sessions]);

  /*
   * 通算の積み上げ。絶対に減らない数字で、休んでも下がらない
   * （週単位の連続記録と同じ性質を、数字の側で持つ）。
   */
  const lifetime = useMemo(() => lifetimeTotals(sessions, exercises), [sessions, exercises]);
  const lifted = volumeParts(lifetime.volume);

  /*
   * 種目どうしを重ねた推移。全期間を舐めるので、開いたときに 1 回だけ計算する。
   *
   * 縦軸は実測ではなく初日を 100 とした指数（lib/compare.ts）。桁の違う種目を
   * 同じ軸に置くための唯一の手で、見たいのが前進の量である以上、意味も合っている。
   */
  const compare = useMemo(() => compareSeries(sessions, exercises), [sessions, exercises]);
  const tooShort = useMemo(() => tooShortCount(sessions, exercises), [sessions, exercises]);

  return (
    <>
      {/* 広い画面では左にカレンダー、右に最近の記録。狭い画面では contents で素通り */}
      <div className="cal-main">
      <header className="view-head">
        <div className="date-nav">
          <button type="button" className="icon-btn" aria-label="前の月" onClick={() => setMonth(shiftMonth(month, -1))}>
            <Icon name="left" />
          </button>
          <div className="date-current">
            <strong>
              {month.year}年{month.month}月
            </strong>
          </div>
          <button type="button" className="icon-btn" aria-label="次の月" onClick={() => setMonth(shiftMonth(month, 1))}>
            <Icon name="right" />
          </button>
        </div>
      </header>

      <div className="summary">
        <span>
          <strong>{monthDates.length}</strong>
          <span className="unit">回</span>
        </span>
        <span>
          <strong>{Math.round(monthVolume).toLocaleString('ja-JP')}</strong>
          <span className="unit">kg</span>
        </span>
        <span className={streak >= 2 ? 'hit' : ''}>
          <strong>{streak}</strong>
          <span className="unit">週連続</span>
        </span>
      </div>

      {/* 月の数字の下に、全期間の積み上げを 1 行。月をめくっても変わらない基準線 */}
      {lifetime.days > 0 ? (
        <p className="lifetime">
          これまでに <strong>{lifetime.days}</strong> 日 · <strong>{lifted.value}</strong> {lifted.unit} 積み上げた
        </p>
      ) : null}

      <div className="calendar">
        <div className="cal-row cal-head">
          {WEEKDAY_LABELS.map((label, i) => (
            <span key={label} className={`cal-weekday ${dayClass(dayKindOfIndex(i)) ?? ''}`}>
              {label}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div className="cal-row" key={week[0]}>
            {week.map((day) => {
              const record = recorded.get(day);
              const outside = !inMonth(day, month);
              // 上限を抑えているのは、濃くなった日の文字が読めなくなるのを避けるため
              const intensity = record ? 0.16 + 0.44 * Math.min(1, record.volume / peak) : 0;
              return (
                <button
                  type="button"
                  key={day}
                  className={`cal-cell ${outside ? 'is-outside' : ''} ${day === today ? 'is-today' : ''} ${record ? 'has-record' : ''}`}
                  style={{ '--intensity': intensity } as React.CSSProperties}
                  onClick={() => onPickDate(day)}
                  aria-label={`${dateLabel(day)}${record ? ` ${record.sets}セット` : ' 記録なし'}`}
                >
                  <span className="cal-day">{Number(day.slice(8))}</span>
                  {/* 部位は色ではなく漢字で示す。色の点を撒くと画面が賑やかになる */}
                  <span className="cal-groups">
                    {record?.groups.map((g) => MUSCLE_GROUPS[g].short).join('') ?? ''}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <AskClaudeButton sessions={sessions} exercises={exercises} today={today} />

      </div>

      <div className="cal-aside">
      <h2 className="section-title with-icon">
        <Icon name="history" />
        最近のセッション
      </h2>
      {recent.length === 0 ? (
        <p className="empty">まだ記録がない。「今日」から始める。</p>
      ) : (
        <ul className="recent">
          {recent.map((session) => {
            const record = recorded.get(session.date);
            return (
              <li key={session.date}>
                <button type="button" className="recent-item" onClick={() => onPickDate(session.date)}>
                  <span className="recent-date">{dateLabel(session.date)}</span>
                  <span className="recent-groups">
                    {record?.groups.map((g) => MUSCLE_GROUPS[g].label).join('・') || 'メモのみ'}
                  </span>
                  <span className="muted">
                    {record?.sets ?? 0}セット · {Math.round(record?.volume ?? 0).toLocaleString('ja-JP')}kg
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {compare.length > 0 ? (
        <>
          <h2 className="section-title with-icon">
            <Icon name="trend" />
            種目の伸び
          </h2>
          {/*
            記録のある種目を全部重ねる。凡例を押すとその種目だけが浮き上がり、
            残りは無彩色に落ちる——色が意味を持つのは選んだ 1 本だけになる。
          */}
          <CompareChart series={compare} tooShort={tooShort} />
        </>
      ) : null}
    </div>
    </>
  );
}
