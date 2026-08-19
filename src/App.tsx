import { useCallback, useEffect, useRef, useState } from 'react';
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
import { type Entry, storeKey, storeLocalOnly, storedEntry } from './lib/vault.ts';
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

/** どちらの軸の操作か決めるまでに要る移動量。 */
const AXIS_THRESHOLD = 8;
/** タブを切り替えると判断する移動量（画面幅に対する割合）。 */
const COMMIT_RATIO = 0.26;
/** 速く払ったときは移動量が小さくても切り替える。 */
const FLICK_MS = 260;
const FLICK_PX = 44;
/** スライドの時間。CSS の transition と同じ値にする。 */
const SLIDE_MS = 270;


type Drag = {
  /** 移動先のタブ。 */
  to: Tab;
  /** 次のタブなら +1、前のタブなら -1。 */
  dir: 1 | -1;
  /** 指の移動量（px）。左へ払うと負。 */
  dx: number;
  /** 指を離したあとの自動スライド中か。 */
  animating: boolean;
};

/**
 * 入り方が決まるまでは入口を出す。鍵は同期先も決めるので、
 * SyncProvider より外側で確定させる必要がある。
 *
 * 鍵なしで使う場合は同期先が無い。鍵を渡さないだけで済むように、
 * SyncProvider は null を受け取ったら同期を無効にする作りにしてある。
 */
export function App() {
  const [entry, setEntry] = useState<Entry | null>(storedEntry);

  if (entry === null) {
    return (
      <Gate
        onKey={(key) => {
          storeKey(key);
          setEntry({ kind: 'key', key });
        }}
        onLocalOnly={() => {
          storeLocalOnly();
          setEntry({ kind: 'local' });
        }}
      />
    );
  }

  return (
    <SyncProvider vaultKey={entry.kind === 'key' ? entry.key : null}>
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
  const [drag, setDrag] = useState<Drag | null>(null);
  const [, bump] = useState(0);

  const pager = useRef<HTMLDivElement | null>(null);
  /** 操作の開始点と、どちらの軸の操作か。'y' に決まったらその指では何もしない。 */
  const gesture = useRef<{ x: number; y: number; at: number; axis: 'unknown' | 'x' | 'y' } | null>(null);

  useEffect(() => subscribeUpdate(() => bump((n) => n + 1)), []);

  const width = () => pager.current?.clientWidth ?? window.innerWidth;

  const neighbor = (dir: 1 | -1): Tab | null => {
    const i = TABS.findIndex((t) => t.key === tab) + dir;
    return TABS[i]?.key ?? null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch' || drag?.animating) return;
    const target = e.target as HTMLElement;
    // 数値欄やシートの上から始まった操作は奪わない
    if (target.closest('input, textarea, select, .sheet, .celebrate, .confirm, .stepper')) {
      gesture.current = null;
      return;
    }
    gesture.current = { x: e.clientX, y: e.clientY, at: Date.now(), axis: 'unknown' };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.axis === 'y') return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;

    if (g.axis === 'unknown') {
      if (Math.abs(dx) < AXIS_THRESHOLD && Math.abs(dy) < AXIS_THRESHOLD) return;
      // 縦の方が動いていればスクロールに任せる。横に決まった指だけ拾う
      if (Math.abs(dy) >= Math.abs(dx)) {
        g.axis = 'y';
        return;
      }
      const dir = dx < 0 ? 1 : -1;
      const to = neighbor(dir);
      if (to === null) {
        // 端では引っぱらない。動かないことで端だと分かる
        g.axis = 'y';
        return;
      }
      g.axis = 'x';
      setDrag({ to, dir, dx, animating: false });
      return;
    }

    setDrag((prev) => {
      if (!prev || prev.animating) return prev;
      const w = width();
      // 行き過ぎないように画面幅で止める
      return { ...prev, dx: Math.max(-w, Math.min(w, dx)) };
    });
  };

  const finish = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.axis !== 'x') return;
    setDrag((prev) => {
      if (!prev || prev.animating) return prev;
      const w = width();
      const moved = Math.abs(prev.dx);
      const quick = Date.now() - g.at < FLICK_MS && moved > FLICK_PX;
      const commit = moved > w * COMMIT_RATIO || quick;
      return { ...prev, animating: true, dx: commit ? -prev.dir * w : 0 };
    });
  };

  /**
   * 自動スライドが終わった時点でタブを入れ替える。
   *
   * animating でなければ何もしないので、何度呼んでも同じ結果になる。
   * transitionend と時間切れの両方から呼ぶため、この性質が必要。
   */
  const settle = useCallback(() => {
    setDrag((prev) => {
      if (!prev?.animating) return prev;
      if (prev.dx !== 0) setTab(prev.to);
      return null;
    });
  }, []);

  /*
   * 時間切れでも必ず片付ける。
   *
   * transitionend だけに任せると、開始と終了の値が同じだった場合や、
   * 面が生成された直後で前の値が無い場合に発火せず、2 面が重なったまま
   * 固まる（実際に起きた）。表示の後始末を 1 つのイベントに賭けない。
   */
  useEffect(() => {
    if (!drag?.animating) return;
    const id = setTimeout(settle, SLIDE_MS + 60);
    return () => clearTimeout(id);
  }, [drag?.animating, settle]);

  if (!ready) return <div className="booting">OVERLOAD</div>;

  const renderTab = (key: Tab) => {
    switch (key) {
      case 'today':
        return (
          <SessionView
            date={date}
            today={today}
            onDateChange={setDate}
            onCreateExercise={() => {
              setStartNewExercise(true);
              setTab('exercises');
            }}
          />
        );
      case 'calendar':
        return (
          <CalendarView
            today={today}
            onPickDate={(picked) => {
              setDate(picked);
              setTab('today');
            }}
          />
        );
      case 'weight':
        return <BodyWeightView today={today} />;
      case 'exercises':
        return <ExercisesView startNew={startNewExercise} onStartNewHandled={() => setStartNewExercise(false)} />;
      case 'settings':
        return <SettingsView />;
    }
  };

  /*
   * ずらしているあいだだけ transform を当てる。常に当てていると、transform は
   * position: fixed の基準になるので、シートや祝福が画面全体ではなくこの面の中に
   * 収まってしまう。止まっているときは外しておく。
   */
  const offset = (base: number) =>
    drag ? { transform: `translate3d(${drag.dx + base}px, 0, 0)` } : undefined;

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

      <div
        className="pager"
        ref={pager}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
      >
        <div
          className={`page ${drag ? 'is-moving' : ''} ${drag?.animating ? 'is-sliding' : ''}`}
          style={offset(0)}
          onTransitionEnd={(e) => {
            if (e.propertyName === 'transform') settle();
          }}
        >
          <main className="view">{renderTab(tab)}</main>
        </div>
        {drag ? (
          <div
            className={`page is-moving ${drag.animating ? 'is-sliding' : ''}`}
            style={offset(drag.dir * width())}
            aria-hidden="true"
          >
            <main className="view">{renderTab(drag.to)}</main>
          </div>
        ) : null}
      </div>

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
