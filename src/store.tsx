/**
 * アプリの状態。IndexedDB を唯一の保存先とし、起動時に全部メモリへ読み込む。
 *
 * 記録は 1 日ぶんで数百バイト、10 年続けても数 MB なので、ページングは要らない。
 * 全部メモリにある方が「前回はどうだったか」を毎回同期的に引けて、
 * オフラインでも遅延なく動く。
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Backup } from './lib/backup.ts';
import * as db from './lib/db.ts';
import { presetExercises } from './lib/presets.ts';
import { isTombstone, mergedExercises, mergedSessions } from './lib/sync.ts';
import type { Exercise, ExerciseId, IsoDate, Session } from './lib/types.ts';
import { emptySession, worthStoring } from './lib/types.ts';

export type Store = {
  ready: boolean;
  /** IndexedDB が使えるか。false なら再読み込みで記録が消える。 */
  persistent: boolean;
  /** ストレージの永続化が許可されているか。false でも動くが追い出されうる。 */
  durable: boolean;
  error: string | null;
  exercises: Exercise[];
  sessions: Session[];
  saveSession: (session: Session) => void;
  upsertExercise: (exercise: Exercise) => void;
  /**
   * 種目を隠す。物理削除はしない。
   *
   * 記録がある種目を消すと履歴が壊れるのが元の理由だが、同期を入れてからは
   * それ以上の理由がある。削除は「無い」ことを表す更新を作れないので、
   * last-write-wins では次の同期で消したはずの種目が戻ってくる。
   * archived の切り替えなら普通の更新として伝わる。
   */
  removeExercise: (id: ExerciseId) => void;
  /** リモートから取り込んだぶんをまとめて反映する。 */
  applyRemote: (incoming: { sessions: readonly Session[]; exercises: readonly Exercise[] }) => Promise<void>;
  restore: (backup: Backup) => Promise<void>;
  wipe: () => Promise<void>;
  clearError: () => void;
};

const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreProvider の外で useStore を呼んだ');
  return store;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [persistent, setPersistent] = useState(true);
  const [durable, setDurable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);

  const report = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await db.isPersistent();
      if (cancelled) return;
      setPersistent(ok);
      db.requestPersistence().then((granted) => {
        if (!cancelled) setDurable(granted);
      });

      let loadedExercises = await db.readExercises();
      if (loadedExercises.length === 0) {
        loadedExercises = presetExercises();
        // 保存できない環境でも、この起動のあいだは初期種目で使えるようにする
        if (ok) await db.putMany(db.STORES.exercises, loadedExercises).catch(report);
      }
      const loadedSessions = await db.readSessions();
      if (cancelled) return;
      setExercises(loadedExercises);
      setSessions(loadedSessions);
    })()
      .catch((e) => {
        if (!cancelled) report(e);
      })
      // 何が起きても起動画面から先へ進める。読めなかった場合は空で始めて、
      // 画面に理由を出す。起動画面のまま固まるのが一番困る
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [report]);

  const saveSession = useCallback(
    (session: Session) => {
      const next: Session = { ...session, updatedAt: Date.now() };
      const keep = worthStoring(next);
      setSessions((prev) => {
        const rest = prev.filter((s) => s.date !== next.date);
        return keep ? [...rest, next] : rest;
      });
      (keep ? db.put(db.STORES.sessions, next) : db.deleteSession(next.date)).catch(report);
    },
    [report],
  );

  const upsertExercise = useCallback(
    (exercise: Exercise) => {
      // updatedAt はここで押す。呼び出し側に任せると、同期の要になる値が
      // 更新されないまま保存される経路が必ずどこかに残る
      const next: Exercise = { ...exercise, updatedAt: Date.now() };
      setExercises((prev) => {
        const i = prev.findIndex((e) => e.id === next.id);
        if (i < 0) return [...prev, next];
        return prev.map((e) => (e.id === next.id ? next : e));
      });
      db.put(db.STORES.exercises, next).catch(report);
    },
    [report],
  );

  const removeExercise = useCallback(
    (id: ExerciseId) => {
      const target = exercises.find((e) => e.id === id);
      if (target) upsertExercise({ ...target, archived: true });
    },
    [exercises, upsertExercise],
  );

  const applyRemote = useCallback(
    async ({ sessions: incomingSessions, exercises: incomingExercises }: {
      sessions: readonly Session[];
      exercises: readonly Exercise[];
    }) => {
      const keep = incomingSessions.filter((s) => !isTombstone(s));
      const drop = incomingSessions.filter(isTombstone).map((s) => s.date);
      try {
        await db.putMany(db.STORES.sessions, keep);
        await Promise.all(drop.map((date) => db.deleteSession(date)));
        if (incomingExercises.length > 0) await db.putMany(db.STORES.exercises, incomingExercises);
      } catch (e) {
        report(e);
        throw e;
      }
      setSessions((prev) => mergedSessions(prev, incomingSessions));
      if (incomingExercises.length > 0) {
        setExercises((prev) => mergedExercises(prev, incomingExercises));
      }
    },
    [report],
  );

  /**
   * バックアップから戻す。
   *
   * 先に書いてから、バックアップに無いものを消す。消してから書く順にすると、
   * 書き込みの途中で失敗したときに手元の記録だけが消えて何も残らない。
   * この順なら、失敗しても最悪「新旧が混ざった状態」で止まり、記録は失われない。
   */
  const restore = useCallback(
    async (backup: Backup) => {
      try {
        await db.putMany(db.STORES.exercises, backup.exercises);
        await db.putMany(db.STORES.sessions, backup.sessions);

        const keptDates = new Set(backup.sessions.map((s) => s.date));
        const keptIds = new Set(backup.exercises.map((e) => e.id));
        const staleDates = sessions.map((s) => s.date).filter((d) => !keptDates.has(d));
        const staleIds = exercises.map((e) => e.id).filter((id) => !keptIds.has(id));
        await Promise.all([
          ...staleDates.map((date) => db.deleteSession(date)),
          ...staleIds.map((id) => db.remove(db.STORES.exercises, id)),
        ]);

        setExercises(backup.exercises);
        setSessions(backup.sessions);
      } catch (e) {
        report(e);
        throw e;
      }
    },
    [report, sessions, exercises],
  );

  const wipe = useCallback(async () => {
    try {
      await db.wipe();
      const seeded = presetExercises();
      await db.putMany(db.STORES.exercises, seeded);
      setExercises(seeded);
      setSessions([]);
    } catch (e) {
      report(e);
      throw e;
    }
  }, [report]);

  const value = useMemo<Store>(
    () => ({
      ready,
      persistent,
      durable,
      error,
      exercises,
      sessions,
      saveSession,
      upsertExercise,
      removeExercise,
      applyRemote,
      restore,
      wipe,
      clearError: () => setError(null),
    }),
    [
      ready,
      persistent,
      durable,
      error,
      exercises,
      sessions,
      saveSession,
      upsertExercise,
      removeExercise,
      applyRemote,
      restore,
      wipe,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** その日のセッション。無ければ空のものを作って返す（保存はしない）。 */
export function useSession(date: IsoDate): Session {
  const { sessions } = useStore();
  return useMemo(
    () => sessions.find((s) => s.date === date) ?? emptySession(date),
    [sessions, date],
  );
}
