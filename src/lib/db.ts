/**
 * IndexedDB への保存。オフラインで開けることが要件なので、
 * ネットワークを一切前提にしない場所を唯一の正とする。
 *
 * 保存できない環境（プライベートブラウズなど）では黙って失敗させず、
 * メモリだけで動かして persistent=false を UI に伝える。
 */

import { normalizeExercise, normalizeSession } from './migrate.ts';
import type { Exercise, IsoDate, Session } from './types.ts';

const DB_NAME = 'overload';
const DB_VERSION = 1;

export const STORES = {
  exercises: 'exercises',
  sessions: 'sessions',
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB の操作に失敗した'));
  });
}

let handle: Promise<IDBDatabase | null> | null = null;

/**
 * 開くのを待つ上限。
 *
 * indexedDB.open は、success も error も blocked も飛ばないまま黙り込むことがある
 * （別のタブが version change を止めている、ストレージが壊れている等）。await が
 * 返らないと起動処理がそこで止まり、起動画面のまま何も出ない状態になる。
 * 保存できない環境として扱って先へ進めるほうがましなので、上限を切る。
 */
const OPEN_TIMEOUT_MS = 4000;

function openDb(): Promise<IDBDatabase | null> {
  handle ??= new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);

    let settled = false;
    const done = (db: IDBDatabase | null) => {
      if (settled) return;
      settled = true;
      resolve(db);
    };
    const timer = setTimeout(() => done(null), OPEN_TIMEOUT_MS);
    const finish = (db: IDBDatabase | null) => {
      clearTimeout(timer);
      done(db);
    };

    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return finish(null);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.exercises)) db.createObjectStore(STORES.exercises, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.sessions)) db.createObjectStore(STORES.sessions, { keyPath: 'date' });
    };
    req.onsuccess = () => finish(req.result);
    req.onerror = () => finish(null);
    req.onblocked = () => finish(null);
  });
  return handle;
}

export async function isPersistent(): Promise<boolean> {
  return (await openDb()) !== null;
}

/**
 * ストレージの永続化を要求する。
 *
 * 許可されると、この生成元のデータが空き容量不足や「一定期間開いていない」を理由に
 * 追い出されなくなる。守られるのは記録本体だけでなく、入口の鍵も同じ。
 * これを呼ばないと、iOS では 7 日以上開かなかったときに記録ごと消えることがある。
 *
 * インストール済みの PWA では自動で許可されることが多い。拒否されても
 * 動作は変わらないので、結果は表示にだけ使う。
 */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

async function tx<T>(store: StoreName, mode: IDBTransactionMode, run: (s: IDBObjectStore) => Promise<T>): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;

  let transaction: IDBTransaction;
  try {
    transaction = db.transaction(store, mode);
  } catch {
    /*
     * 期待するストアが無い DB を掴んでいる場合（別の版が作った、作成が途中で
     * 終わった等）ここが同期的に投げる。呼び出し元ごとに構えると必ずどこかで
     * 漏れるので、保存できない環境と同じ扱い（null）に寄せる。
     */
    return null;
  }

  /*
   * 完了の待ち受けを、要求を出す前に張る。
   *
   * IndexedDB のトランザクションは保留中の要求が無くなると自動で確定するので、
   * `await run(...)` のあとにハンドラを付ける書き方だと、先に complete が
   * 飛んでいた場合に永久に待つ。実際にこれで起動画面から進めなくなった。
   */
  const settled = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('トランザクションが失敗した'));
    transaction.onabort = () => reject(transaction.error ?? new Error('トランザクションが中断された'));
  });

  const result = await run(transaction.objectStore(store));
  await settled;
  return result;
}

export async function readAll<T>(store: StoreName): Promise<T[]> {
  return (await tx<T[]>(store, 'readonly', (s) => request(s.getAll() as IDBRequest<T[]>))) ?? [];
}

export async function put(store: StoreName, value: unknown): Promise<void> {
  await tx(store, 'readwrite', (s) => request(s.put(value)));
}

export async function putMany(store: StoreName, values: readonly unknown[]): Promise<void> {
  await tx(store, 'readwrite', async (s) => {
    for (const v of values) await request(s.put(v));
  });
}

export async function remove(store: StoreName, key: string): Promise<void> {
  await tx(store, 'readwrite', (s) => request(s.delete(key)));
}

export async function clear(store: StoreName): Promise<void> {
  await tx(store, 'readwrite', (s) => request(s.clear()));
}

/** 読み出しは必ず normalize を通す。古い版が書いたオブジェクトが混ざるため。 */
export async function readExercises(): Promise<Exercise[]> {
  return (await readAll<unknown>(STORES.exercises)).map(normalizeExercise);
}

export async function readSessions(): Promise<Session[]> {
  return (await readAll<unknown>(STORES.sessions)).map(normalizeSession);
}

export async function deleteSession(date: IsoDate): Promise<void> {
  await remove(STORES.sessions, date);
}

export async function wipe(): Promise<void> {
  await Promise.all([clear(STORES.exercises), clear(STORES.sessions)]);
}
