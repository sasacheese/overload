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
import { bodyWeightOn, exerciseHistory, sortedSessions } from './query.ts';
import { findRecords, type Achievement } from './records.ts';
import { doneSets, type Exercise, type IsoDate, type Session } from './types.ts';
import { wholeDayRecord } from './wrapup.ts';

export type DayCard =
  /** 卒業。レップ範囲を登り切った合図で、記録更新より上の格。 */
  | { kind: 'graduation'; exercise: Exercise; cycle: Cycle }
  /** 記録更新。exercise が null のものはセッション全体（1 日の総量）。 */
  | { kind: 'record'; exercise: Exercise | null; achievement: Achievement };

/** 卒業カードの名前。祝福を出す側（SessionView）もこれで番号を引く。 */
export function graduationKey(exerciseId: string): string {
  return `graduation:${exerciseId}`;
}

/** 記録更新カードの名前。exerciseId が null のものはセッション全体。 */
export function recordKey(exerciseId: string | null, kind: string): string {
  return `record:${exerciseId ?? 'session'}:${kind}`;
}

/** React の key やアニメーションの識別に使える、その日の中で一意な名前。 */
export function cardKey(card: DayCard): string {
  if (card.kind === 'graduation') return graduationKey(card.exercise.id);
  return recordKey(card.exercise?.id ?? null, card.achievement.kind);
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

/*
 * 日付 → その日より前に引いた達成の通算数。
 *
 * 全日ぶんの dayCards を数えるので安くはないが、sessions の配列が変わるまで
 * 使い回せる（保存のたびに配列は作り直されるので、勝手に数え直される）。
 * exercises 側でも引く——種目の設定（レップ上限）が変わると卒業の判定が変わるため。
 */
const countCache = new WeakMap<readonly Session[], WeakMap<readonly Exercise[], Map<IsoDate, number>>>();

function cardsBefore(sessions: readonly Session[], exercises: readonly Exercise[], date: IsoDate): number {
  let byExercises = countCache.get(sessions);
  if (!byExercises) {
    byExercises = new WeakMap();
    countCache.set(sessions, byExercises);
  }
  let counts = byExercises.get(exercises);
  if (!counts) {
    counts = new Map();
    let total = 0;
    // 古い順に積む。map には「その日より前の通算」を入れる
    for (const s of [...sortedSessions(sessions)].reverse()) {
      counts.set(s.date, total);
      total += dayCards(s, exercises, sessions).length;
    }
    byExercises.set(exercises, counts);
  }
  const known = counts.get(date);
  if (known !== undefined) return known;
  /*
   * counts に無い日 = sessions にまだ入っていない日。今日の 1 枚目を引いた瞬間は、
   * 保存が state に反映される前にここへ来る。記録のある直近の日の「その日より前の
   * 通算」に、その日ぶんを足せば「この日より前の通算」になる。
   */
  const lastBefore = [...counts.keys()].filter((d) => d < date).sort().at(-1);
  return lastBefore === undefined ? 0 : (counts.get(lastBefore) ?? 0) + dayCardsCount(sessions, exercises, lastBefore);
}

/** その日の枚数。cardsBefore の穴埋め用（キャッシュ済みの日しか呼ばれない）。 */
function dayCardsCount(sessions: readonly Session[], exercises: readonly Exercise[], date: IsoDate): number {
  const session = sessions.find((s) => s.date === date);
  return session ? dayCards(session, exercises, sessions).length : 0;
}

/**
 * このカードが通算何枚目か（1 起点）。裏面（歴代 Mr. Olympia）の割り当てに使う。
 *
 * 日付順 → その日の棚の並び順で数える。乱数も保存も使わず記録から毎回数えるので、
 * 過去の日のカードをめくり直しても同じ裏が出る。あとから過去の記録を直せば
 * 番号ごとずれるが、それは集計がすべて記録から出ることの裏返しで、受け入れる。
 *
 * @param session その日のセッション（保存前の状態でもよい）
 * @param key cardKey の値
 * @returns その日の棚に無いカードなら null
 */
export function cardNumber(
  session: Session,
  exercises: readonly Exercise[],
  sessions: readonly Session[],
  key: string,
): number | null {
  const today = dayCards(session, exercises, sessions);
  const i = today.findIndex((card) => cardKey(card) === key);
  if (i < 0) return null;
  return cardsBefore(sessions, exercises, session.date) + i + 1;
}
