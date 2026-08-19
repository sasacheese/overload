/**
 * セッション群から「前回どうだったか」を引く。純関数だけを置く。
 */

import { doneSets, hasRecord, type Exercise, type ExerciseId, type IsoDate, type Session, type SessionEntry } from './types.ts';
import { metrics, type ExerciseHistory, type Performance } from './progression.ts';
import { PRESET_ORDER } from './presets.ts';

/** 日付の新しい順。 */
export function sortedSessions(sessions: readonly Session[]): Session[] {
  return [...sessions].filter(hasRecord).sort((a, b) => b.date.localeCompare(a.date));
}

export function entryOf(session: Session | undefined, id: ExerciseId): SessionEntry | undefined {
  return session?.entries.find((e) => e.exerciseId === id);
}

/**
 * その日に使う体重。
 *
 * その日に記録が無ければ、それより前の直近の記録を使う。アシスト種目の実効負荷
 * （体重 − 補助重量）に必要なので、毎回入れさせるのではなく前回の値を引き継ぐ。
 */
export function bodyWeightOn(sessions: readonly Session[], date: IsoDate): number {
  const own = sessions.find((s) => s.date === date)?.bodyWeight ?? 0;
  if (own > 0) return own;
  return (
    [...sessions]
      .filter((s) => s.date <= date && s.bodyWeight > 0)
      .sort((a, b) => b.date.localeCompare(a.date))[0]?.bodyWeight ?? 0
  );
}

/** その種目を実際にやった日を新しい順で返す。体重は当時の値を付ける。 */
export function exerciseHistory(sessions: readonly Session[], id: ExerciseId): ExerciseHistory {
  return sortedSessions(sessions)
    .map((s) => ({ date: s.date, entry: entryOf(s, id), bodyWeight: bodyWeightOn(sessions, s.date) }))
    .filter(
      (h): h is { date: IsoDate; entry: SessionEntry; bodyWeight: number } =>
        h.entry !== undefined && doneSets(h.entry).length > 0,
    );
}

/** 指定日より前の直近の記録。今日の入力欄の初期値の元になる。 */
export function previousEntry(
  sessions: readonly Session[],
  id: ExerciseId,
  before: IsoDate,
): (Performance & { date: IsoDate }) | undefined {
  return exerciseHistory(sessions, id).find((h) => h.date < before);
}

/** 種目の最高到達点の推移（古い順）。スパークラインと停滞判定に使う。 */
export function bestSeries(ex: Exercise, history: ExerciseHistory): { date: IsoDate; best: number }[] {
  return [...history].reverse().map((h) => ({ date: h.date, best: metrics(ex, h).best }));
}

/** そのセッションで扱った部位（記録のある種目だけ）。 */
export function sessionGroups(session: Session, exercises: readonly Exercise[]): Exercise['group'][] {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const seen = new Set<Exercise['group']>();
  for (const entry of session.entries) {
    if (doneSets(entry).length === 0) continue;
    const group = byId.get(entry.exerciseId)?.group;
    if (group) seen.add(group);
  }
  return [...seen];
}

/**
 * セッション全体のボリューム。部位や種目をまたいで足す。
 * レップ数でしか測れない種目（自重・体重未記録のアシスト）は足さない。
 * 単位の違うものを合算すると、その日の総量が意味を持たなくなる。
 */
export function sessionVolume(session: Session, exercises: readonly Exercise[], bodyWeight = session.bodyWeight): number {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  return session.entries.reduce((total, entry) => {
    const ex = byId.get(entry.exerciseId);
    if (!ex) return total;
    const m = metrics(ex, { entry, bodyWeight });
    return m.byLoad ? total + m.volume : total;
  }, 0);
}

export function countedSets(session: Session): number {
  return session.entries.reduce((n, e) => n + doneSets(e).length, 0);
}

/** 種目ごとの最終実施日。 */
export function lastPerformed(sessions: readonly Session[]): Map<ExerciseId, IsoDate> {
  const map = new Map<ExerciseId, IsoDate>();
  for (const session of sessions) {
    for (const entry of session.entries) {
      if (doneSets(entry).length === 0) continue;
      const known = map.get(entry.exerciseId);
      if (known === undefined || known < session.date) map.set(entry.exerciseId, session.date);
    }
  }
  return map;
}

/**
 * 一覧に出す順。最近やった種目を上に、やっていない種目はプリセットの並びで続ける。
 * 静的な並びより、実際に触っている種目が上に来るほうがジムでの操作が短い。
 */
export function byRecentUse(
  exercises: readonly Exercise[],
  last: ReadonlyMap<ExerciseId, IsoDate>,
): Exercise[] {
  const fallback = (id: ExerciseId) => {
    const i = PRESET_ORDER.indexOf(id);
    return i < 0 ? PRESET_ORDER.length : i;
  };
  return [...exercises].sort((a, b) => {
    const da = last.get(a.id);
    const db = last.get(b.id);
    if (da && db) return db.localeCompare(da);
    if (da) return -1;
    if (db) return 1;
    return fallback(a.id) - fallback(b.id) || a.name.localeCompare(b.name, 'ja');
  });
}
