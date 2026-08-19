import { useEffect, useRef, useState } from 'react';
import { BodyWeightView } from './components/BodyWeightView.tsx';
import { CalendarView } from './components/CalendarView.tsx';
import { ExercisesView } from './components/ExercisesView.tsx';
import { Gate } from './components/Gate.tsx';
import { Icon, type IconName } from './components/Icon.tsx';
import { SessionView } from './components/SessionView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { todayIso } from './lib/calendar.ts';
import { subscribeUpdate, updateReady, applyUpdate } from './lib/updates.ts';
import type { IsoDate } from './lib/types.ts';
import { storeKey, storedKey } from './lib/vault.ts';
import { useStore } from './store.tsx';
import { SyncProvider } from './sync.tsx';

/** ラベルは置かずアイコンだけ。name は読み上げと aria に使う。 */
const TABS = [
  { key: 'today', name: '今日', icon: 'barbell' },
  { key: 'calendar', name: '記録', icon: 'calendar' },
  { key: 'weight', name: '体重', icon: 'trend' },
  { key: 'exercises', name: '種目', icon: 'list' },
  { key: 'settings', name: '設定', icon: 'settings' },
] as const satisfies readonly { key: string; name: string; icon: IconName }[];

type Tab = (typeof TABS)[number]['key'];

/** 開いたまま日付が変わることがあるので、復帰のたびに今日を引き直す。 */
function useToday(): IsoDate {
  const [today, setToday] = useState(() => todayIso());
  useEffect(() => {
    const check = () => setToday((prev) => (todayIso() === prev ? prev : todayIso()));
    const id = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);
  return today;
}

/** 横方向の移動量。これ未満はタップや縦スクロールの揺れとみなす。 */
const SWIPE_MIN_X = 56;
/** 横が縦の何倍動いていればスワイプと認めるか。縦スクロールを奪わないため。 */
const SWIPE_RATIO = 1.6;
/**
 * これより長い操作はスワイプではなく、ためらいや別の操作とみなす。
 * 短くしすぎると、意図してゆっくり払う操作を落とす。
 */
const SWIPE_MAX_MS = 900;

/**
 * タブを横スワイプで移動できるようにする。
 *
 * preventDefault は呼ばない。縦スクロールは素の挙動に任せ、指を離した時点の
 * 移動量だけを見て判定する。入力欄やシートの上から始まった操作は無視する
 * （数値欄をなぞる操作や、シート内のスクロールを奪ってしまうため）。
 */
function useSwipe(onSwipe: (direction: 1 | -1) => void) {
  const start = useRef<{ x: number; y: number; at: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select, .sheet, .celebrate, .stepper')) {
      start.current = null;
      return;
    }
    start.current = { x: e.clientX, y: e.clientY, at: Date.now() };
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const from = start.current;
    start.current = null;
    if (!from || e.pointerType !== 'touch') return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    if (Date.now() - from.at > SWIPE_MAX_MS) return;
    if (Math.abs(dx) < SWIPE_MIN_X || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return;
    onSwipe(dx < 0 ? 1 : -1);
  };

  return { onPointerDown, onPointerUp, onPointerCancel: () => (start.current = null) };
}

/**
 * 鍵を持っているかで入口を分ける。鍵は同期先も決めるので、
 * SyncProvider より外側で確定させる必要がある。
 */
export function App() {
  const [vaultKey, setVaultKey] = useState<string | null>(storedKey);

  if (vaultKey === null) {
    return (
      <Gate
        onUnlocked={(key) => {
          storeKey(key);
          setVaultKey(key);
        }}
      />
    );
  }

  return (
    <SyncProvider vaultKey={vaultKey}>
      <Shell />
    </SyncProvider>
  );
}

function Shell() {
  const { ready, persistent, error, clearError } = useStore();
  const today = useToday();
  const [date, setDate] = useState<IsoDate>(today);
  const [tab, setTab] = useState<Tab>('today');
  const [startNewExercise, setStartNewExercise] = useState(false);
  const [, bump] = useState(0);

  useEffect(() => subscribeUpdate(() => bump((n) => n + 1)), []);

  const swipe = useSwipe((direction) => {
    const i = TABS.findIndex((t) => t.key === tab);
    const next = TABS[Math.min(TABS.length - 1, Math.max(0, i + direction))];
    if (next) setTab(next.key);
  });

  if (!ready) return <div className="booting">OVERLOAD</div>;

  return (
    <div className="app">
      {!persistent ? (
        <p className="banner warn">
          この環境では記録を保存できない（プライベートブラウズなどで IndexedDB が使えない）。
          再読み込みすると消える。
        </p>
      ) : null}
      {error ? (
        <p className="banner warn" onClick={clearError}>
          保存に失敗した: {error}（タップで閉じる）
        </p>
      ) : null}
      {updateReady() ? (
        <button type="button" className="banner update" onClick={applyUpdate}>
          新しい版がある · タップで再読み込み
        </button>
      ) : null}

      <main className="view" {...swipe}>
        {tab === 'today' ? (
          <SessionView
            date={date}
            today={today}
            onDateChange={setDate}
            onCreateExercise={() => {
              setStartNewExercise(true);
              setTab('exercises');
            }}
          />
        ) : null}
        {tab === 'calendar' ? (
          <CalendarView
            today={today}
            onPickDate={(picked) => {
              setDate(picked);
              setTab('today');
            }}
          />
        ) : null}
        {tab === 'weight' ? <BodyWeightView today={today} /> : null}
        {tab === 'exercises' ? (
          <ExercisesView startNew={startNewExercise} onStartNewHandled={() => setStartNewExercise(false)} />
        ) : null}
        {tab === 'settings' ? <SettingsView /> : null}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            type="button"
            key={t.key}
            className={tab === t.key ? 'is-active' : ''}
            aria-current={tab === t.key ? 'page' : undefined}
            onClick={() => setTab(t.key)}
          >
            <Icon name={t.icon} label={t.name} />
          </button>
        ))}
      </nav>
    </div>
  );
}
