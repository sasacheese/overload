/**
 * カレンダー。やった日が一目で分かることと、空白が続いていることに気づけることの
 * 両方を担う。日単位の連続記録は出さない（休養日で切れて、休むことが罰になる）。
 * 代わりに「週」で続いているかを数える。
 */

import { useMemo, useState } from 'react';
import { BALANCE_WEEKS, balanceOf, skewLines } from '../lib/balance.ts';
import {
  WEEKDAY_LABELS,
  comebackCount,
  dateLabel,
  dayKindOfIndex,
  inMonth,
  monthGrid,
  monthOf,
  shiftMonth,
  weekStreak,
  type YearMonth,
} from '../lib/calendar.ts';
import { bodyWeightOn, countedSets, sessionGroups, sessionVolume, sortedSessions } from '../lib/query.ts';
import { MUSCLE_GROUPS, MUSCLE_GROUP_KEYS, type IsoDate, type MuscleGroup } from '../lib/types.ts';
import { useStore } from '../store.tsx';
import { AskClaudeButton } from './AskClaudeButton.tsx';
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
  /*
   * 通算と復帰。どちらも頭打ちしない・後退しない数字で、月をめくっても変わらない。
   * 連続（streak）は切れると 0 に戻るが、復帰は切れたあとに戻るたび増える
   * ——皆勤ではなく、戻れることを数える。
   */
  const totalDays = recorded.size;
  const comebacks = comebackCount([...recorded.keys()]);
  const bal = useMemo(() => balanceOf(sessions, exercises, today), [sessions, exercises, today]);
  const skews = skewLines(bal);
  const peakGroup = Math.max(1, ...MUSCLE_GROUP_KEYS.map((g) => bal.groups[g]));
  // 濃さの基準はその月の最大ボリューム。月によって上限が違っても比較が効くようにする
  const peak = Math.max(1, ...monthDates.map((d) => recorded.get(d)?.volume ?? 0));

  const recent = useMemo(() => sortedSessions(sessions).slice(0, 8), [sessions]);

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
        {/* 通算は最重要の指標。伸びが停滞している月も、これだけは必ず増えている */}
        <span>
          <strong>{totalDays}</strong>
          <span className="unit">通算</span>
        </span>
        <span className={streak >= 2 ? 'hit' : ''}>
          <strong>{streak}</strong>
          <span className="unit">週連続</span>
        </span>
        {/* 空いた週から戻った回数。1 回もサボっていない人には出ない（0 を見せない） */}
        {comebacks > 0 ? (
          <span>
            <strong>{comebacks}</strong>
            <span className="unit">復帰</span>
          </span>
        ) : null}
      </div>

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

      {/*
        直近のバランス。部位・押す/引く・前面/背面の 3 軸を、セット数の比で見せる。
        0 セットの部位も行ごと出す——やっていないことは、行が無いと気づけない。
        偏りの指摘は事実だけで、直せとは言わない（あえて寄せている期間もある）。
      */}
      <h2 className="section-title with-icon">
        <Icon name="balance" />
        直近 {BALANCE_WEEKS} 週のバランス
      </h2>
      {bal.totalSets === 0 ? (
        <p className="empty">直近 {BALANCE_WEEKS} 週間の記録がまだない。</p>
      ) : (
        <div className="balance">
          <div className="bal-groups">
            {MUSCLE_GROUP_KEYS.map((g) => {
              const count = bal.groups[g];
              return (
                <div key={g} className="bal-row">
                  <span className="bal-label">{MUSCLE_GROUPS[g].label}</span>
                  <span className="bal-bar" aria-hidden="true">
                    <span style={{ width: `${(count / peakGroup) * 100}%` }} />
                  </span>
                  <span className={`bal-count ${count === 0 ? 'is-zero' : ''}`}>{count}</span>
                </div>
              );
            })}
          </div>
          <AxisBar nameA="押す" nameB="引く" a={bal.motion.push} b={bal.motion.pull} />
          <AxisBar nameA="前面" nameB="背面" a={bal.plane.front} b={bal.plane.back} />
          {skews.map((line) => (
            <p key={line} className="footnote">
              {line}
            </p>
          ))}
          {bal.motion.other > 0 ? (
            <p className="footnote">体幹など押す/引くに分けない {bal.motion.other} セットは、比率に入れていない。</p>
          ) : null}
        </div>
      )}
    </div>
    </>
  );
}

/** 2 択の軸を 1 本の棒で。左右のどちらが多いかが、数字を読まなくても分かる。 */
function AxisBar({ nameA, nameB, a, b }: { nameA: string; nameB: string; a: number; b: number }) {
  const total = a + b;
  return (
    <div className="bal-axis" role="img" aria-label={`${nameA} ${a}セット、${nameB} ${b}セット`}>
      <span className="bal-axis-name">
        {nameA} <strong>{a}</strong>
      </span>
      <span className="bal-axis-bar">
        <span style={{ width: `${total === 0 ? 50 : (a / total) * 100}%` }} />
      </span>
      <span className="bal-axis-name">
        {nameB} <strong>{b}</strong>
      </span>
    </div>
  );
}
