/**
 * その日に引き当てたカード。祝福（記録更新・卒業）をあとから見返すための一覧。
 *
 * 祝福のカードは一瞬で消える。ジムでは休憩中に「今日は何を引いたか」を眺め直したく
 * なるし、過去の日を開いたときにもその日の収穫が読めてほしい。
 *
 * ## sessionStorage の「出した印」には頼らない
 *
 * 祝福の重複防止（SessionView の SHOWN_KEY）は演出のための印で、タブを閉じれば
 * 消えるし、過去の日には最初から無い。ここは**記録そのものから毎回計算し直す**。
 * findRecords はその日より前だけを履歴に取るので、あとの日に記録がさらに
 * 伸びていても、過去の日のカードは当時のまま変わらない。
 *
 * ## 並び
 *
 * 卒業 → 種目ごとの記録更新（種目はやった順・種目内は強い順）→ 1 日の総量。
 * 卒業を先頭に置くのは、祝福でも卒業のカードが記録更新を従えて 1 枚になる
 * （Graduation が records を添える）のと同じ格の序列。
 */

import { cycleOf, type Cycle } from './cycle.ts';
import { bodyWeightOn, exerciseHistory } from './query.ts';
import { findRecords, type Achievement } from './records.ts';
import { doneSets, type Exercise, type Session } from './types.ts';
import { wholeDayRecord } from './wrapup.ts';

export type DayCard =
  /** 卒業。レップ範囲を登り切った合図で、記録更新より上の格。 */
  | { kind: 'graduation'; exercise: Exercise; cycle: Cycle }
  /** 記録更新。exercise が null のものはセッション全体（1 日の総量）。 */
  | { kind: 'record'; exercise: Exercise | null; achievement: Achievement };

/** React の key やアニメーションの識別に使える、その日の中で一意な名前。 */
export function cardKey(card: DayCard): string {
  if (card.kind === 'graduation') return `graduation:${card.exercise.id}`;
  return `record:${card.exercise?.id ?? 'session'}:${card.achievement.kind}`;
}

export function dayCards(
  session: Session,
  exercises: readonly Exercise[],
  sessions: readonly Session[],
): DayCard[] {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const bodyWeight = bodyWeightOn(sessions, session.date);
  const graduations: DayCard[] = [];
  const records: DayCard[] = [];

  for (const entry of session.entries) {
    const exercise = byId.get(entry.exerciseId);
    if (!exercise || doneSets(entry).length === 0) continue;

    const past = exerciseHistory(sessions, exercise.id).filter((h) => h.date < session.date);
    const today = { date: session.date, entry, bodyWeight };

    // 卒業。今日を先頭にしたサイクルが graduated なら、この日が卒業の日
    const cycle = cycleOf(exercise, [today, ...past]);
    if (cycle?.graduated) graduations.push({ kind: 'graduation', exercise, cycle });

    records.push(
      ...findRecords({
        exercise,
        today,
        history: past,
        // 1 日の総量は種目に属さないので、ここでは見ない（下でまとめて 1 回）
        todaySessionVolume: 0,
        bestPastSessionVolume: 0,
      }).map((achievement): DayCard => ({ kind: 'record', exercise, achievement })),
    );
  }

  const whole = wholeDayRecord(session, exercises, sessions);
  return [...graduations, ...records, ...(whole ? [{ kind: 'record' as const, exercise: null, achievement: whole }] : [])];
}
