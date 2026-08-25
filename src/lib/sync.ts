/**
 * ローカルと Firestore の突き合わせ。ネットワークに触らない純関数だけを置く。
 *
 * 規則は updatedAt の大きい方を採る（last-write-wins）。単一の人間が数台の端末で
 * 使う前提なので、同じ日の同じ種目を 2 台で同時に編集することは実際には起きない。
 * ここで CRDT を持ち込むより、規則が 1 行で説明できるほうが後で自分が読める。
 *
 * 例外は 1 つだけ。**その日の体重は別の時計で採る**（`mergeSession`）。体重は
 * トレーニングと同じ日に、別の端末で、別の時刻に付くものなので、日ごと丸ごと
 * 入れ替えると必ずどちらかが消える。
 *
 * 送信待ちの列（outbox）は持っていない。オフライン中の変更が送れなかった場合も、
 * 次の同期で「ローカルの updatedAt が大きい」ことから同じ結論が出るため、
 * 列を別に持つと二重管理になるだけで得るものが無い。
 */

import { worthStoring, type Exercise, type IsoDate, type Session } from './types.ts';

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

/**
 * その日の体重を「いつ入れたか」。
 *
 * 印を持たない記録（この仕掛けより前のもの）は、**体重が入っているときだけ**
 * updatedAt で代用する。入っていない側は 0 ——「体重について何も言っていない」
 * として扱う。ここで updatedAt を返してしまうと、体重を一度も触っていない端末が
 * 記録を触っただけで最強の印を持ち、相手の体重を 0 で塗り潰す。
 */
function weighStamp(session: Session): number {
  const at = session.bodyWeightAt ?? 0;
  if (at > 0) return at;
  return session.bodyWeight > 0 ? session.updatedAt : 0;
}

/**
 * 同じ日の 2 つを 1 つにする。**記録と体重を別々の時刻で採る。**
 *
 * 体重は 1 日の中で記録とは独立に付く——朝に体重だけ入れて、夜にジムで種目を
 * 記録する。日ごと丸ごと updatedAt で入れ替えていたころは、あとから記録を触った
 * 端末の未記録（0）が、先に入れた体重をそのまま消していた。片方の端末で入れた
 * 体重がもう片方に出てこないのはこれが理由で、**記録は同期できているのに体重だけ
 * 消える**という形で出る。
 *
 * 規則は last-write-wins のまま。変えたのは「1 つの日に時計を 2 つ持たせた」ことだけで、
 * それぞれの中では相変わらず新しい方を採る。
 *
 * 片方がどちらも勝ったときは**その物をそのまま返す**。呼ぶ側が同一性で
 * 「動かす必要があるか」を判定するので、無駄に別の物を作らない。
 */
export function mergeSession(mine: Session, theirs: Session): Session {
  const record = theirs.updatedAt > mine.updatedAt ? theirs : mine;
  const ours = weighStamp(mine);
  const yours = weighStamp(theirs);
  // 同じ強さなら記録を採った側に合わせる
  const weigh = yours > ours ? theirs : ours > yours ? mine : record;
  if (weigh === record) return record;
  return { ...record, bodyWeight: weigh.bodyWeight, bodyWeightAt: weighStamp(weigh) };
}

export function planSessions(local: readonly Session[], remote: readonly Session[]): Plan<Session> {
  const remoteByDate = new Map(remote.map((s) => [s.date, s]));
  const localByDate = new Map(local.map((s) => [s.date, s]));
  const toLocal: Session[] = [];
  const toRemote: Session[] = [];

  for (const mine of local) {
    const theirs = remoteByDate.get(mine.date);
    if (theirs === undefined) {
      toRemote.push(mine);
      continue;
    }
    // 記録と体重、それぞれどちらが先行しているか。両方が同時に立つ日もある
    const localAhead = mine.updatedAt > theirs.updatedAt || weighStamp(mine) > weighStamp(theirs);
    const remoteAhead = theirs.updatedAt > mine.updatedAt || weighStamp(theirs) > weighStamp(mine);
    if (!localAhead && !remoteAhead) continue;

    const merged = mergeSession(mine, theirs);
    if (remoteAhead) toLocal.push(merged);
    if (localAhead) toRemote.push(merged);
  }
  for (const theirs of remote) {
    if (!localByDate.has(theirs.date)) toLocal.push(theirs);
  }
  return { toLocal, toRemote };
}

export function planExercises(local: readonly Exercise[], remote: readonly Exercise[]): Plan<Exercise> {
  return plan(local, remote, (e) => e.id, (e) => e.updatedAt);
}

/**
 * リモートでは「消した印」として扱うセッションか。
 *
 * 消したことを表す専用の仕組みを足す代わりに、空のセッションを送る。ローカルは
 * 保存する価値の無いものを保存しないので、取り込むときに落とせば、
 * 両側とも「その日は無い」で一致する。
 *
 * 判定を `worthStoring` の裏返しとして定義しているのは、2 つが食い違うと
 * 記録が消えるため。以前は「種目が空でメモも無い」だけで判定していて、
 * **体重だけ付けた休養日が消した印と見なされ、同期先の端末で体重が消えていた**。
 * 保存する条件と消した印の条件は必ず一致していなければならないので、
 * 別々に書かずに片方から導く。
 */
export function isTombstone(session: Session): boolean {
  return !worthStoring(session);
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
