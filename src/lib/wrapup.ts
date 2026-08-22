/**
 * 1 日を締めるときにまとめるもの。
 *
 * ## なぜ「終える」を置いたか
 *
 * 記録は触った時点で保存されるので、終わりを宣言する必要は仕組みの上では無い。
 * それでも置いているのは、**やった分を一度だけまとめて受け取る場所**が要るから。
 * セットごとの祝福は 1 回ぶんの前進しか映さないし、要約の 3 つの数字は
 * 入力中ずっと出ているので、終わった実感には結びつかない。
 *
 * ## 何を出すか
 *
 * 出すのは全部その日の記録から出る事実だけにしてある。「よく頑張った」のような、
 * 何をしても同じ文が出る褒め方はしない——毎回同じなら次から読まれなくなる。
 * 一言（`praise`）も強い順に並べた事実の言い換えで、どれにも当てはまらない日は
 * 「やった、が残った」に落ちる。回数が少ない日を責める文は持たない。
 *
 * 判定はすべてここに閉じ込めてあり、画面（components/Wrapup.tsx）は
 * 出てきたものを並べるだけにしてある。
 */

import { weekStart, weekStreak } from './calendar.ts';
import { bodyWeightOn, countedSets, exerciseHistory, sessionGroups, sessionVolume, sortedSessions } from './query.ts';
import { metrics } from './progression.ts';
import { findRecords, sessionVolumeRecord, type Achievement } from './records.ts';
import { doneSets, type Exercise, type IsoDate, type MuscleGroup, type Session } from './types.ts';

/** 締めの画面に出す記録更新。種目に属さないもの（1 日の総量）は name が null。 */
export type DayRecord = {
  /** どの種目で出たか。セッション全体の記録なら null。 */
  exerciseName: string | null;
  achievement: Achievement;
};

export type WrapUp = {
  date: IsoDate;
  /** 実際に ✓ が付いた種目の数。行だけ足して触らなかった種目は数えない。 */
  exercises: number;
  sets: number;
  reps: number;
  /** 総ボリューム（kg）。重さで測れない種目しか無い日は 0。 */
  volume: number;
  groups: MuscleGroup[];
  /** その日に出た記録更新。強い順。 */
  records: DayRecord[];
  /** この日を含む週にトレーニングした日数。 */
  weekCount: number;
  /** 週単位の連続記録。日単位にしないのは、休養日で切れて休むことが罰になるため。 */
  weekStreak: number;
  /** 通算のトレーニング日数。 */
  totalDays: number;
  /**
   * 前回の同じ種類の日に対する総量の比（0.08 なら 8% 多い）。
   *
   * 比べる相手は「直前のセッション」ではなく、**今日と 1 つ以上同じ種目をやった
   * 直近の日**。分割して回していると直前の日は別の部位で、脚の日と腕の日の総量を
   * 並べても意味が無い（実際に 70% 落ちたように見えていた）。
   * 相手がいない・どちらかが 0（重さで測れない日）なら null。
   */
  volumeRatio: number | null;
  /** 事実に基づく一言。 */
  praise: string;
};

/**
 * その日に出た記録更新を集める。
 *
 * 種目ごとに一番強いものを 1 つだけ拾う。セットごとに全部拾うと、3 セットで
 * 3 回同じ種類が並んで、締めの画面が更新の一覧になってしまう。
 * 1 日の総量は種目に属さないので、種目ごとの判定から外して 1 回だけ見る。
 */
function recordsOfDay(session: Session, exercises: readonly Exercise[], sessions: readonly Session[]): DayRecord[] {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const bodyWeight = bodyWeightOn(sessions, session.date);
  const out: DayRecord[] = [];

  for (const entry of session.entries) {
    const exercise = byId.get(entry.exerciseId);
    if (!exercise || doneSets(entry).length === 0) continue;
    const found = findRecords({
      exercise,
      today: { entry, bodyWeight },
      history: exerciseHistory(sessions, exercise.id).filter((h) => h.date < session.date),
      // 1 日の総量はここでは見ない（種目の数だけ同じ更新が出てしまう）
      todaySessionVolume: 0,
      bestPastSessionVolume: 0,
    });
    const best = found[0];
    if (best) out.push({ exerciseName: exercise.name, achievement: best });
  }

  const todayVolume = sessionVolume(session, exercises, bodyWeight);
  const bestPast = Math.max(
    0,
    ...sessions
      .filter((s) => s.date < session.date)
      .map((s) => sessionVolume(s, exercises, bodyWeightOn(sessions, s.date))),
  );
  const whole = sessionVolumeRecord(todayVolume, bestPast);
  if (whole) out.push({ exerciseName: null, achievement: whole });

  return out;
}

/**
 * 一言。強い順に見て、最初に当てはまったものを返す。
 *
 * どれにも当てはまらない日でも必ず何かを返す。空の日を作ると「今日は言うことが無い」
 * という表示になり、それは責めているのと同じになる。
 *
 * 最後の 1 行に落ちるのは、記録も更新されず・前回より減っていて・その週も通算も
 * 1 日目という、実際にはほぼ起きない組み合わせのときだけ。それでも置いてあるのは、
 * ここが空になる経路を作らないため。
 */
function praiseFor(w: Omit<WrapUp, 'praise'>): string {
  if (w.records.length >= 2) return `記録が ${w.records.length} つ動いた日。`;
  if (w.records.length === 1) return '今日、記録が動いた。';
  if (w.volumeRatio !== null && w.volumeRatio >= 0.05) {
    return `前回より総量が ${Math.round(w.volumeRatio * 100)}% 多い。`;
  }
  if (w.weekStreak >= 4) return `${w.weekStreak} 週続いている。`;
  if (w.weekCount >= 2) return `今週 ${w.weekCount} 回目。`;
  if (w.weekStreak >= 2) return `${w.weekStreak} 週続いている。`;
  if (w.totalDays >= 2) return `これで通算 ${w.totalDays} 日。`;
  return 'やった、が残った。';
}

/**
 * 締めに出すものを 1 つにまとめる。
 *
 * @param session 締める日のセッション（保存済みの状態でなくてよい）
 */
export function wrapUp(session: Session, exercises: readonly Exercise[], sessions: readonly Session[]): WrapUp {
  const bodyWeight = bodyWeightOn(sessions, session.date);
  const worked = session.entries.filter((e) => doneSets(e).length > 0);

  const reps = worked.reduce((n, e) => n + doneSets(e).reduce((m, s) => m + s.reps, 0), 0);
  const volume = sessionVolume(session, exercises, bodyWeight);

  // その日を除いた過去。渡された session が保存前でも同じ結果になるようにする
  const past = sortedSessions(sessions).filter((s) => s.date < session.date);
  const dates = sortedSessions(sessions)
    .map((s) => s.date)
    .filter((d) => d !== session.date);
  const withToday = [...dates, session.date];

  /*
   * 比べる相手は「同じ種類の日」。今日やった種目を 1 つでも含む直近の日を採る。
   * 分割して回していると直前の日は別の部位なので、そこと並べても意味が無い。
   */
  const todayIds = new Set(worked.map((e) => e.exerciseId));
  const sameKind = past.find((s) => s.entries.some((e) => todayIds.has(e.exerciseId) && doneSets(e).length > 0));
  const previousVolume = sameKind ? sessionVolume(sameKind, exercises, bodyWeightOn(sessions, sameKind.date)) : 0;
  const volumeRatio = previousVolume > 0 && volume > 0 ? volume / previousVolume - 1 : null;

  const thisWeek = weekStart(session.date);
  const weekCount = new Set(withToday.filter((d) => weekStart(d) === thisWeek)).size;

  const base: Omit<WrapUp, 'praise'> = {
    date: session.date,
    exercises: worked.length,
    sets: countedSets(session),
    reps,
    volume,
    groups: sessionGroups(session, exercises),
    records: recordsOfDay(session, exercises, sessions),
    weekCount,
    weekStreak: weekStreak(withToday, session.date),
    totalDays: new Set(withToday).size,
    volumeRatio,
  };
  return { ...base, praise: praiseFor(base) };
}

/**
 * 締められる日か。
 *
 * ✓ が 1 つも無い日は締められない。まだ始まっていない日に終わりのボタンを出すと、
 * 何もしていないのに終えたことになる。集計は metrics を通しているので、
 * ここでも同じ判定（実施済みかつレップが 1 以上）になる。
 */
export function canFinish(session: Session, exercises: readonly Exercise[]): boolean {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  return session.entries.some((entry) => {
    const exercise = byId.get(entry.exerciseId);
    return exercise !== undefined && metrics(exercise, { entry, bodyWeight: 0 }).setCount > 0;
  });
}
