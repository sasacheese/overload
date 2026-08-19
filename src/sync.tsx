/**
 * 同期の進行役。
 *
 * ローカル（IndexedDB）を常に正とし、ここはその写しを Firestore と突き合わせる。
 * オフラインで開けることを SDK の読み込みや同期の成否に依存させないため、
 * 同期が一度も成功しなくてもアプリの機能は何も減らない。
 *
 * 走らせる契機は 4 つ。起動時・オンラインに戻ったとき・画面が前面に戻ったとき・
 * ローカルを触ってしばらく経ったとき。定期実行はしない。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as remote from './lib/remote.ts';
import { planExercises, planSessions } from './lib/sync.ts';
import { vaultId } from './lib/vault.ts';
import { useStore } from './store.tsx';

/** ローカルを触ってから送るまでの待ち。セット中の連打で毎回送らないため。 */
const PUSH_DELAY_MS = 4000;

/**
 * 自動で走る同期の最小間隔。
 *
 * 突き合わせは毎回すべての doc を読み直す（差分だけ取る仕組みを持たない代わりに、
 * 規則を 1 行で説明できるようにしている）。1 回で「セッション数 + 種目数」ぶんの
 * 読み取りが発生するので、画面の前面復帰ごとに走らせると無料枠の読み取り上限を
 * 無駄に削る。手で押したときはこの間隔を無視する。
 */
const MIN_AUTO_INTERVAL_MS = 60_000;

const LAST_SYNCED_KEY = 'overload:lastSyncedAt';

export type SyncPhase = 'off' | 'idle' | 'running' | 'error';

export type Sync = {
  /** Firebase の設定が入っているか。false なら同期そのものが無効。 */
  available: boolean;
  phase: SyncPhase;
  lastSyncedAt: number | null;
  error: string | null;
  syncNow: () => void;
};

const SyncContext = createContext<Sync | null>(null);

export function useSync(): Sync {
  const sync = useContext(SyncContext);
  if (!sync) throw new Error('SyncProvider の外で useSync を呼んだ');
  return sync;
}

function readLastSynced(): number | null {
  try {
    const raw = localStorage.getItem(LAST_SYNCED_KEY);
    return raw === null ? null : Number(raw) || null;
  } catch {
    return null;
  }
}

export function SyncProvider({ vaultKey, children }: { vaultKey: string | null; children: ReactNode }) {
  const { ready, sessions, exercises, applyRemote } = useStore();
  const available = remote.remoteConfigured() && vaultKey !== null;

  const [phase, setPhase] = useState<SyncPhase>(available ? 'idle' : 'off');
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(readLastSynced);

  /*
   * 実行中に最新の状態を読むためのミラー。同期は非同期なので state を直接見ると古い。
   *
   * 描画中に書かず、確定後の effect で写す。描画は中断・破棄されることがあるので、
   * その途中の値を ref に残すと、実際には使われなかった状態を同期に渡しうる。
   */
  const latest = useRef({ sessions, exercises });
  useEffect(() => {
    latest.current = { sessions, exercises };
  }, [sessions, exercises]);
  const running = useRef(false);
  // 直前の同期時刻。state と違って run の中から常に最新が読める
  const syncedAt = useRef<number | null>(lastSyncedAt);

  const run = useCallback(
    async (force: boolean) => {
      if (!available || vaultKey === null || running.current) return;
      if (!force && syncedAt.current !== null && Date.now() - syncedAt.current < MIN_AUTO_INTERVAL_MS) return;
      running.current = true;
      setPhase('running');
      setError(null);
      try {
        const vault = await vaultId(vaultKey);
        const incoming = await remote.fetchAll(vault);
        const sessionPlan = planSessions(latest.current.sessions, incoming.sessions);
        const exercisePlan = planExercises(latest.current.exercises, incoming.exercises);

        if (sessionPlan.toLocal.length > 0 || exercisePlan.toLocal.length > 0) {
          await applyRemote({
            sessions: sessionPlan.toLocal,
            exercises: exercisePlan.toLocal,
          });
        }
        await remote.pushSessions(vault, sessionPlan.toRemote);
        await remote.pushExercises(vault, exercisePlan.toRemote);

        // 差分が無かった回も時刻を進める。突き合わせが通ったこと自体が
        // 「送れている」の確認になるので、変更の有無で分けない
        const now = Date.now();
        syncedAt.current = now;
        setLastSyncedAt(now);
        try {
          localStorage.setItem(LAST_SYNCED_KEY, String(now));
        } catch {
          // 保存できなくても同期自体は済んでいる
        }
        setPhase('idle');
      } catch (e) {
        setPhase('error');
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        running.current = false;
      }
    },
    [available, vaultKey, applyRemote],
  );

  /*
   * 起動時とローカルの変更後。変更のたびにタイマーが張り直されるので実質デバウンス。
   *
   * 圏外では試行そのものを見送る。送ろうとして失敗させると設定画面が
   * 「同期できていない」になるが、圏内に戻れば updatedAt の比較から同じ結論が出て
   * 送られるので、実際には何も失われていない。起きていない障害を表示しない。
   */
  useEffect(() => {
    if (!ready || !available || !navigator.onLine) return;
    const id = setTimeout(() => void run(false), PUSH_DELAY_MS);
    return () => clearTimeout(id);
  }, [ready, available, sessions, exercises, run]);

  // 圏外から戻ったときと、画面が前面に戻ったとき
  useEffect(() => {
    if (!available) return;
    const trigger = () => {
      if (navigator.onLine && document.visibilityState === 'visible') void run(false);
    };
    window.addEventListener('online', trigger);
    document.addEventListener('visibilitychange', trigger);
    return () => {
      window.removeEventListener('online', trigger);
      document.removeEventListener('visibilitychange', trigger);
    };
  }, [available, run]);

  const value = useMemo<Sync>(
    () => ({
      available,
      phase,
      lastSyncedAt,
      error,
      syncNow: () => void run(true),
    }),
    [available, phase, lastSyncedAt, error, run],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
