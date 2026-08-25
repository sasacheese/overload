/**
 * 種目の記録を別の種目にまとめる。
 *
 * ## なぜ要るか
 *
 * プリセットに無い種目は自分で作ることになる。あとから同じ種目がプリセットに入ると、
 * 一覧に同じものが 2 つ並び、しかも**自分で作った側には説明（やり方・効く筋肉・コツ）が
 * 付かない**——説明はプリセットの id に紐付いているため。記録を移す手段が無いと、
 * それまでの記録を捨てるか、説明を諦めるかの二択になる。
 *
 * 実際に「レッグレイズ」「ローマンチェア」を手で作って使っていた状態から、
 * あとで足したプリセットへ移す必要が出た。
 *
 * ## 規則
 *
 * - 移すのは**記録だけ**。移した先の設定（名前・レップの目安・刻み・コツ）はそのまま
 * - 同じ日に両方の記録がある日は、**セットを後ろに継ぎ足す**。順番を入れ替えない
 * - メモは両方あれば改行でつなぐ。片方を捨てない
 * - 元の種目に触っていない日は**そのまま返す**（同じ配列の同じ要素）。
 *   セッション配列の同一性で結果を使い回している計算があるので、無関係な日を
 *   作り直すと、その手当てが全部無駄になる
 * - 元の種目は消さない。呼ぶ側が非表示にする（削除は同期で戻ってくるため）
 */

import type { ExerciseId, Session, SessionEntry } from './types.ts';
import { doneSets, startedAt } from './types.ts';

/** まとめたときに動く量。取り消せない操作なので、押す前に数で見せる。 */
export type MergeImpact = {
  /** 記録のある日数。 */
  days: number;
  /** 実施済みのセット数。 */
  sets: number;
  /** 同じ日に移す先の記録もあって、継ぎ足しになる日数。 */
  collisions: number;
};

export function mergeImpact(
  sessions: readonly Session[],
  source: ExerciseId,
  target: ExerciseId,
): MergeImpact {
  let days = 0;
  let sets = 0;
  let collisions = 0;
  for (const session of sessions) {
    const from = session.entries.find((e) => e.exerciseId === source);
    if (!from) continue;
    days += 1;
    sets += doneSets(from).length;
    if (session.entries.some((e) => e.exerciseId === target)) collisions += 1;
  }
  return { days, sets, collisions };
}

/** 2 つの行を 1 つにする。セットは後ろに継ぎ、メモは両方残す。 */
function joinEntries(into: SessionEntry, from: SessionEntry): SessionEntry {
  const notes = [into.note.trim(), from.note.trim()].filter((n) => n !== '');
  // 先に始めた方の時刻を残す。まとめたのは 1 つの種目なので、実施順も先の側が正しい
  const stamps = [startedAt(into), startedAt(from)].filter((t) => t > 0);
  return {
    startedAt: stamps.length === 0 ? 0 : Math.min(...stamps),
    exerciseId: into.exerciseId,
    sets: [...into.sets, ...from.sets],
    note: notes.join('\n'),
  };
}

/**
 * `source` の記録を `target` に移したセッション一覧。
 *
 * 触った日だけ作り直す。`now` を渡すのは、同期の突き合わせで「移したほうが新しい」と
 * 判定されるように updatedAt を押すため（呼ぶ側が時刻を持つのは試験のしやすさのため）。
 */
export function mergedInto(
  sessions: readonly Session[],
  source: ExerciseId,
  target: ExerciseId,
  now: number,
): Session[] {
  if (source === target) return [...sessions];
  return sessions.map((session) => {
    const from = session.entries.find((e) => e.exerciseId === source);
    if (!from) return session;

    const moved = session.entries.some((e) => e.exerciseId === target)
      ? // 同じ日に両方ある。移す先へ継ぎ足して、元の行を落とす
        session.entries
          .filter((e) => e.exerciseId !== source)
          .map((e) => (e.exerciseId === target ? joinEntries(e, from) : e))
      : // 移す先が無い日は、行そのものの持ち主を書き換える（並び順はそのまま）
        session.entries.map((e) => (e.exerciseId === source ? { ...e, exerciseId: target } : e));

    return { ...session, entries: moved, updatedAt: now };
  });
}

/** まとめた結果、中身が変わった日だけ。保存する対象を絞るために使う。 */
export function changedSessions(before: readonly Session[], after: readonly Session[]): Session[] {
  return after.filter((session, i) => session !== before[i]);
}
