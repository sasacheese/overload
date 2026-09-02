/**
 * 今日のおすすめ。**空いている部位**と、そこで**前にやった種目**を出す。
 *
 * ## なぜ「空いた日数がいちばん長い部位」なのか
 *
 * 分割を組ませない方針なので、次に何をやるかは毎回本人が決める。決めるために要るのは
 * 献立ではなく事実で、いちばん効くのは「どこを長く置いているか」の 1 つ。
 * 回復に要る日数（部位でおおよそ 2〜3 日）を越えて置かれている部位のうち、
 * 最後にやったのが一番古いものを出す。同じ日数のものが複数あればそのまま並べる
 * ——どれを選ぶかは本人の判断で、こちらで 1 つに絞る理由が無い。
 *
 * ## 一度もやっていない部位は出さない
 *
 * 「最後にやったのが一番古い」は、最後にやった日があることが前提。一度も記録が
 * 無い部位を無限に古いものとして混ぜると、その部位が毎日先頭に出続けて、
 * おすすめが日によって変わらなくなる（=読まれなくなる）。記録の無い部位に
 * 気づくのは、この 1 行ではなくバランス（`balance.ts`）と体の図の仕事。
 *
 * ## 種目は記録があるものだけ
 *
 * 初めての種目を勧めない。数字を並べられない種目を勧めても、その日は前回が無い
 * 状態から始まるだけで、続けている種目より優先する理由が無い。**その部位で最近
 * やった順**に出すのは、それが本人の定番だから——同じ種目を続けることが
 * 漸進性過負荷の前提で、目新しさはここでは価値にならない。
 */

import { daysBetween } from './calendar.ts';
import {
  MUSCLE_GROUP_KEYS,
  doneSets,
  type Exercise,
  type ExerciseId,
  type IsoDate,
  type MuscleGroup,
  type Session,
} from './types.ts';

/** これだけ空いたら「空いている」と言う日数。前回の翌々日までは出さない。 */
export const RESTED_DAYS = 3;

/**
 * 1 部位あたりに出す種目の数。
 * 1 部位を 3 種目前後で回すのが標準的な組み方なので、その日の中身がそのまま並ぶ。
 * 増やすと一覧になってしまい、選ぶ手間が種目の追加と変わらなくなる。
 */
export const SUGGEST_EXERCISES = 3;

export type Suggestion = {
  group: MuscleGroup;
  /** その部位を最後にやった日。 */
  last: IsoDate;
  /** 空いている日数（最後にやった日から今日まで）。 */
  days: number;
  /** その部位で記録のある種目。最近やった順。 */
  exercises: Exercise[];
};

/** 種目ごとの最終実施日。基準日より後の記録は数えない。 */
function lastByExercise(sessions: readonly Session[], today: IsoDate): Map<ExerciseId, IsoDate> {
  const last = new Map<ExerciseId, IsoDate>();
  for (const session of sessions) {
    if (session.date > today) continue;
    for (const entry of session.entries) {
      if (doneSets(entry).length === 0) continue;
      const known = last.get(entry.exerciseId);
      if (known === undefined || known < session.date) last.set(entry.exerciseId, session.date);
    }
  }
  return last;
}

/**
 * 今日のおすすめ。空いていなければ空を返す（何も言わないのが正しい日がある）。
 *
 * 部位の最終実施日は、その部位の種目のうち一番新しいものを採る。アーカイブした
 * 種目でも、やった事実は部位を休ませていない事実なので日数には数える
 * ——勧める側（`exercises`）からだけ外す。
 */
export function suggestToday(
  sessions: readonly Session[],
  exercises: readonly Exercise[],
  today: IsoDate,
  restedDays: number = RESTED_DAYS,
): Suggestion[] {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const lastEx = lastByExercise(sessions, today);

  const lastGroup = new Map<MuscleGroup, IsoDate>();
  for (const [id, date] of lastEx) {
    const group = byId.get(id)?.group;
    if (group === undefined) continue;
    const known = lastGroup.get(group);
    if (known === undefined || known < date) lastGroup.set(group, date);
  }

  const rested = MUSCLE_GROUP_KEYS.map((group) => ({ group, last: lastGroup.get(group) }))
    .filter((g): g is { group: MuscleGroup; last: IsoDate } => g.last !== undefined)
    .map(({ group, last }) => ({ group, last, days: daysBetween(last, today) }))
    .filter((g) => g.days >= restedDays);
  if (rested.length === 0) return [];

  const oldest = Math.max(...rested.map((g) => g.days));
  return rested
    .filter((g) => g.days === oldest)
    .map((g) => ({
      ...g,
      exercises: exercises
        .filter((e) => !e.archived && e.group === g.group && lastEx.has(e.id))
        .sort((a, b) => lastEx.get(b.id)!.localeCompare(lastEx.get(a.id)!) || a.name.localeCompare(b.name, 'ja'))
        .slice(0, SUGGEST_EXERCISES),
    }));
}
