/**
 * 「今日」タブ。日付を 1 つ選び、その日の種目カードを並べる。
 *
 * 保存ボタンは置かない。ジムでは操作を 1 つ減らしたいし、書きかけで画面を落として
 * 記録が消えるのが一番困る。触った時点で IndexedDB に入る。
 *
 * 体重を一番上に置いているのは、トレーニングをしない日にも入れるものだから。
 * 種目カードの下にあると、開いて下までスクロールしないと入力に届かない。
 */

import { useMemo, useState } from 'react';
import { dateParts, relativeLabel, shiftDays } from '../lib/calendar.ts';
import { initialSets } from '../lib/progression.ts';
import {
  bodyWeightOn,
  countedSets,
  exerciseHistory,
  lastPerformed,
  previousEntry,
  sessionVolume,
} from '../lib/query.ts';

import { findRecords, type Achievement, type RecordKind } from '../lib/records.ts';
import type { Exercise, IsoDate, Session, SessionEntry } from '../lib/types.ts';
import { useSession, useStore } from '../store.tsx';
import { Celebration } from './Celebration.tsx';
import { ExerciseCard } from './ExerciseCard.tsx';
import { ExercisePicker } from './ExercisePicker.tsx';
import { Icon } from './Icon.tsx';
import { RestTimer } from './RestTimer.tsx';
import { TopBar } from './TopBar.tsx';
import { dayClass } from './Weekday.tsx';

type Props = {
  date: IsoDate;
  today: IsoDate;
  onDateChange: (date: IsoDate) => void;
  onCreateExercise: () => void;
};

/** 休憩タイマーはセッションを跨いで持ち回らない。リロードだけ耐えれば十分。 */
const REST_KEY = 'overload:rest';
/** 出し終えた祝福。同じ種類を 1 セッションで繰り返さないために覚えておく。 */
const SHOWN_KEY = 'overload:shownRecords';

function readRest(): { at: number; targetSec: number } | null {
  try {
    const raw = sessionStorage.getItem(REST_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { at, targetSec } = parsed as Record<string, unknown>;
    return typeof at === 'number' && typeof targetSec === 'number' ? { at, targetSec } : null;
  } catch {
    return null;
  }
}

function readShown(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SHOWN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

export function SessionView({ date, today, onDateChange, onCreateExercise }: Props) {
  const { exercises, sessions, saveSession } = useStore();
  const session = useSession(date);
  const [picking, setPicking] = useState(false);
  const [rest, setRest] = useState(readRest);
  const [celebration, setCelebration] = useState<{ achievement: Achievement; exerciseName: string } | null>(null);

  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const last = useMemo(() => lastPerformed(sessions), [sessions]);
  // 体重は当日の記録が無ければ直近の値を引き継ぐ。アシスト種目の実効負荷に効く
  const bodyWeight = useMemo(() => bodyWeightOn(sessions, date), [sessions, date]);
  /** その日より前の直近の記録。上部の帯に「前回」として出す。 */
  const latestBefore = useMemo(() => {
    const found = sessions
      .filter((s) => s.date < date && s.bodyWeight > 0)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    return found ? { date: found.date, weight: found.bodyWeight } : null;
  }, [sessions, date]);
  const volume = sessionVolume(session, exercises, bodyWeight);
  const sets = countedSets(session);
  const parts = dateParts(date);

  const setEntries = (entries: SessionEntry[]) => saveSession({ ...session, entries });

  const addExercise = (exercise: Exercise) => {
    const prev = previousEntry(sessions, exercise.id, date);
    setEntries([...session.entries, { exerciseId: exercise.id, sets: initialSets(exercise, prev?.entry), note: '' }]);
    setPicking(false);
  };

  const startRest = (exercise: Exercise) => {
    const next = { at: Date.now(), targetSec: exercise.restSec };
    setRest(next);
    try {
      sessionStorage.setItem(REST_KEY, JSON.stringify(next));
    } catch {
      // 保存できなくてもこの画面のあいだは動く
    }
  };

  /**
   * ✓ を付けた直後に記録の更新を探す。
   *
   * 更新した瞬間に出したいので、保存された state を待たず、渡された entry で判定する。
   * 当たった中で一番強いもの 1 つだけを出し、同じ種類はこのセッションで繰り返さない。
   */
  const celebrate = (exercise: Exercise, entry: SessionEntry) => {
    const shown = readShown();
    const merged: Session = {
      ...session,
      entries: session.entries.map((e) => (e.exerciseId === entry.exerciseId ? entry : e)),
    };
    const bestPastSessionVolume = Math.max(
      0,
      ...sessions.filter((s) => s.date !== date).map((s) => sessionVolume(s, exercises, bodyWeightOn(sessions, s.date))),
    );
    const records = findRecords({
      exercise,
      today: { entry, bodyWeight },
      history: exerciseHistory(sessions, exercise.id).filter((h) => h.date < date),
      todaySessionVolume: sessionVolume(merged, exercises, bodyWeight),
      bestPastSessionVolume,
    });

    const key = (kind: RecordKind) => `${date}:${exercise.id}:${kind}`;
    const fresh = records.find((r) => !shown.has(key(r.kind)));
    if (!fresh) return;
    shown.add(key(fresh.kind));
    try {
      sessionStorage.setItem(SHOWN_KEY, JSON.stringify([...shown]));
    } catch {
      // 覚えられなければ同じ祝福がもう一度出るだけ
    }
    setCelebration({ achievement: fresh, exerciseName: exercise.name });
  };

  const onSetCompleted = (exercise: Exercise, entry: SessionEntry) => {
    startRest(exercise);
    celebrate(exercise, entry);
  };

  const dismissRest = () => {
    setRest(null);
    try {
      sessionStorage.removeItem(REST_KEY);
    } catch {
      // 何もしない
    }
  };

  return (
    <>
      <TopBar
        today={date}
        todayWeight={session.bodyWeight}
        latest={latestBefore}
        onChange={(v) => saveSession({ ...session, bodyWeight: v })}
      />

      <header className="view-head">
        <div className="date-nav">
          <button type="button" className="icon-btn" aria-label="前の日" onClick={() => onDateChange(shiftDays(date, -1))}>
            <Icon name="left" />
          </button>
          <div className="date-current">
            <strong>
              {parts.date}(<span className={dayClass(parts.kind)}>{parts.weekday}</span>)
            </strong>
            <span className="muted">{relativeLabel(date, today)}</span>
          </div>
          <button type="button" className="icon-btn" aria-label="次の日" onClick={() => onDateChange(shiftDays(date, 1))}>
            <Icon name="right" />
          </button>
        </div>
        {date === today ? null : (
          <button type="button" className="ghost small" onClick={() => onDateChange(today)}>
            今日
          </button>
        )}
      </header>

      {session.entries.length > 0 ? (
        <div className="summary">
          <span>
            <strong>{session.entries.length}</strong>
            <span className="unit">種目</span>
          </span>
          <span>
            <strong>{sets}</strong>
            <span className="unit">セット</span>
          </span>
          {volume > 0 ? (
            <span>
              <strong>{Math.round(volume).toLocaleString('ja-JP')}</strong>
              <span className="unit">kg</span>
            </span>
          ) : null}
        </div>
      ) : null}

      <label className="note session-note">
        <span className="muted">この日のメモ</span>
        <textarea
          rows={2}
          value={session.note}
          placeholder="睡眠・食事・体調など"
          onChange={(e) => saveSession({ ...session, note: e.target.value })}
        />
      </label>

      {session.entries.map((entry, i) => {
        const exercise = byId.get(entry.exerciseId);
        if (!exercise) {
          return (
            <p key={entry.exerciseId} className="hint">
              一覧に無い種目の記録が残っている（{entry.exerciseId}）。設定からバックアップを取ってから消す。
            </p>
          );
        }
        return (
          <ExerciseCard
            key={entry.exerciseId}
            exercise={exercise}
            date={date}
            today={today}
            entry={entry}
            bodyWeight={bodyWeight}
            onChange={(next) => setEntries(session.entries.map((e, j) => (j === i ? next : e)))}
            onRemove={() => setEntries(session.entries.filter((_, j) => j !== i))}
            onSetCompleted={onSetCompleted}
          />
        );
      })}

      {session.entries.length === 0 ? (
        <p className="empty">種目を追加すると、前回と同じ数字が入った状態で並ぶ。あとは実際にやった数に直して ✓ を押す。</p>
      ) : null}

      {picking ? (
        <ExercisePicker
          exercises={exercises}
          exclude={new Set(session.entries.map((e) => e.exerciseId))}
          lastPerformed={last}
          onPick={addExercise}
          onClose={() => setPicking(false)}
          onCreate={() => {
            setPicking(false);
            onCreateExercise();
          }}
        />
      ) : null}

      <button type="button" className="fab" aria-label="種目を追加" onClick={() => setPicking(true)}>
        <Icon name="plus" />
      </button>

      <RestTimer startedAt={rest?.at ?? null} targetSec={rest?.targetSec ?? 90} onDismiss={dismissRest} />

      {celebration ? (
        <Celebration
          achievement={celebration.achievement}
          exerciseName={celebration.exerciseName}
          onClose={() => setCelebration(null)}
        />
      ) : null}
    </>
  );
}
