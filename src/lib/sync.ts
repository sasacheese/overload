/**
 * ローカルと Firestore の突き合わせ。ネットワークに触らない純関数だけを置く。
 *
 * 規則は updatedAt の大きい方を採る（last-write-wins）。単一の人間が数台の端末で
 * 使う前提なので、同じ日の同じ種目を 2 台で同時に編集することは実際には起きない。
 * ここで CRDT を持ち込むより、規則が 1 行で説明できるほうが後で自分が読める。
 *
 * 送信待ちの列（outbox）は持っていない。オフライン中の変更が送れなかった場合も、
 * 次の同期で「ローカルの updatedAt が大きい」ことから同じ結論が出るため、
 * 列を別に持つと二重管理になるだけで得るものが無い。
 */

import type { Exercise, IsoDate, Session } from './types.ts';

export type Plan<T> = {
  /** リモートが新しいので、ローカルに書くもの。 */
  toLocal: T[];
  /** ローカルが新しいので、リモートに送るもの。 */
  toRemote: T[];
};

function plan<T, K>(
  local: readonly T[],
  remote: readonly T[],
  keyOf: (v: T) => K,
  timeOf: (v: T) => number,
): Plan<T> {
  const remoteByKey = new Map(remote.map((v) => [keyOf(v), v]));
  const localByKey = new Map(local.map((v) => [keyOf(v), v]));
  const toLocal: T[] = [];
  const toRemote: T[] = [];

  for (const mine of local) {
    const theirs = remoteByKey.get(keyOf(mine));
    if (!theirs) toRemote.push(mine);
    else if (timeOf(mine) > timeOf(theirs)) toRemote.push(mine);
    else if (timeOf(theirs) > timeOf(mine)) toLocal.push(theirs);
  }
  for (const theirs of remote) {
    if (!localByKey.has(keyOf(theirs))) toLocal.push(theirs);
  }
  return { toLocal, toRemote };
}

export function planSessions(local: readonly Session[], remote: readonly Session[]): Plan<Session> {
  return plan(local, remote, (s) => s.date, (s) => s.updatedAt);
}

export function planExercises(local: readonly Exercise[], remote: readonly Exercise[]): Plan<Exercise> {
  return plan(local, remote, (e) => e.id, (e) => e.updatedAt);
}

/**
 * 中身が空のセッションは、リモートでは「消した印」として扱う。
 *
 * 消したことを表す専用の仕組みを足す代わりに、空のセッションを送る。ローカルは
 * 空を保存しないので、取り込むときに落とせば、両側とも「その日は無い」で一致する。
 */
export function isTombstone(session: Session): boolean {
  return session.entries.length === 0 && session.note.trim() === '';
}

export function applicableToLocal(sessions: readonly Session[]): Session[] {
  return sessions.filter((s) => !isTombstone(s));
}

/** 取り込んだあとのローカルの姿。表示に使う。 */
export function mergedSessions(local: readonly Session[], toLocal: readonly Session[]): Session[] {
  const byDate = new Map<IsoDate, Session>(local.map((s) => [s.date, s]));
  for (const s of toLocal) {
    if (isTombstone(s)) byDate.delete(s.date);
    else byDate.set(s.date, s);
  }
  return [...byDate.values()];
}

export function mergedExercises(local: readonly Exercise[], toLocal: readonly Exercise[]): Exercise[] {
  const byId = new Map(local.map((e) => [e.id, e]));
  for (const e of toLocal) byId.set(e.id, e);
  return [...byId.values()];
}

/** 何もすることが無いか。ログに出す前の判定に使う。 */
export function isEmpty<T>(p: Plan<T>): boolean {
  return p.toLocal.length === 0 && p.toRemote.length === 0;
}
