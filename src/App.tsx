import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TrendsView } from './components/TrendsView.tsx';
import { CalendarView } from './components/CalendarView.tsx';
import { ExercisesView } from './components/ExercisesView.tsx';
import { Gate } from './components/Gate.tsx';
import { Icon, type IconName } from './components/Icon.tsx';
import { Mark } from './components/Mark.tsx';
import { Wordmark } from './components/Wordmark.tsx';
import { SessionView } from './components/SessionView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { todayIso } from './lib/calendar.ts';
import { demoData } from './lib/demo.ts';
import { subscribeUpdate, updateReady, applyUpdate } from './lib/updates.ts';
import type { IsoDate } from './lib/types.ts';
import { clearDemo, storeDemo, storeKey, storeLocalOnly, storedEntry, type Entry } from './lib/vault.ts';
import { StoreProvider, useStore } from './store.tsx';
import { SyncProvider } from './sync.tsx';

/** ラベルは置かずアイコンだけ。name は読み上げと aria に使う。 */
const TABS = [
  { key: 'today', name: '今日', icon: 'barbell' },
  { key: 'calendar', name: '記録', icon: 'calendar' },
  { key: 'trends', name: '推移', icon: 'trend' },
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

/**
 * URL でサンプルを名指ししているか。
 *
 * `#demo` を受けるのは、**リンクを渡すだけで中身を見せられる**ようにするため
 * （`https://…/overload/#demo`）。既に自分の記録が入っている端末でも、この URL なら
 * サンプルが開く——人に見せるときに自分の記録を出さずに済むし、開発中に空の状態から
 * 作り直さなくても画面を確かめられる。`?demo` も同じ意味で受ける。
 *
 * 印は保存しない。URL から外して開き直せば、いつもの記録に戻る。
 */
function demoInUrl(): boolean {
  try {
    return location.hash === '#demo' || new URLSearchParams(location.search).has('demo');
  } catch {
    return false;
  }
}

/** URL からサンプルの名指しを外す。戻ったあと再読み込みしても戻ってこないように。 */
function dropDemoFromUrl(): void {
  try {
    const url = new URL(location.href);
    url.hash = '';
    url.searchParams.delete('demo');
    history.replaceState(null, '', url.toString());
  } catch {
    // 触れなくても、このタブでは戻れている
  }
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
  /*
   * URL の名指しは保存された入り方より強い。人に見せる・開発中に確かめる用途では、
   * その端末に何が入っていようとサンプルが開いてほしい。
   */
  const [entry, setEntry] = useState<Entry | null>(() =>
    demoInUrl() ? { kind: 'demo' } : storedEntry(),
  );

  /*
   * サンプルの記録。入っているあいだだけ作る。
   *
   * 「今日」を基準に組み立てるので、開いたタイミングで一度だけ作れば、
   * その表示のあいだ中は同じデータでいられる。
   */
  const seed = useMemo(() => (entry?.kind === 'demo' ? demoData() : undefined), [entry?.kind]);

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
        onDemo={() => {
          storeDemo();
          setEntry({ kind: 'demo' });
        }}
      />
    );
  }

  if (entry.kind === 'demo') {
    /*
     * サンプル。ストアはメモリだけ（seed 渡し）、同期は無効。
     * 触っても何も保存されないので、終えれば跡形なく入口に戻る。
     */
    return (
      /*
        key を分けてある。分けないと React が同じ位置の StoreProvider を使い回し、
        サンプルを抜けたあとも中身が残る（さらに、以降の書き込みが本物の保存先へ
        向かってしまう）。入り方が変わったらストアごと作り直す。
      */
      <StoreProvider key="demo" seed={seed}>
        <SyncProvider vaultKey={null}>
          <Shell
            demo
            onExitDemo={() => {
              clearDemo();
              dropDemoFromUrl();
              // 自分の記録があればそこへ、無ければ入口へ戻る
              setEntry(storedEntry());
            }}
          />
        </SyncProvider>
      </StoreProvider>
    );
  }

  return (
    <StoreProvider key="own">
      <SyncProvider vaultKey={entry.kind === 'key' ? entry.key : null}>
        <Shell />
      </SyncProvider>
    </StoreProvider>
  );
}

function Shell({ demo = false, onExitDemo }: { demo?: boolean; onExitDemo?: () => void }) {
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
    if (target.closest('input, textarea, select, .sheet, .celebrate, .confirm, .stepper, .wrap')) {
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
      case 'trends':
        return <TrendsView today={today} />;
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
      {/*
        帯とページャを束ねてある。広い画面では入れものを横並びにして左に筋を出すが、
        そのとき横に並んでよいのは「この束」と「筋」の 2 つだけ。束ねずに並べると、
        お知らせの帯まで列になってしまう。狭い画面では display: contents で
        この div を無かったことにするので、並びは元のまま。
      */}
      <div className="shell">
        {demo ? (
          /*
           * サンプルであることを常に出しておく。1 回のタップで入口に戻れる
           * ——押し間違えても失うものが無いので、確認は挟まない。
           */
          <button type="button" className="banner demo" onClick={onExitDemo}>
            サンプルの記録 — 触っても保存されない · 入口に戻る
          </button>
        ) : null}
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
            <main className={`view view-${tab}`}>{renderTab(tab)}</main>
          </div>
          {drag ? (
            <div
              className={`page is-moving ${drag.animating ? 'is-sliding' : ''}`}
              style={offset(drag.dir * width())}
              aria-hidden="true"
            >
              <main className={`view view-${drag.to}`}>{renderTab(drag.to)}</main>
            </div>
          ) : null}
        </div>
      </div>

      <nav className="tabbar">
        {/* 広い画面だけ出す。狭い画面では上部バーが名乗るので、二重に名乗らせない */}
        <span className="rail-brand">
          <Mark className="rail-mark" />
          <Wordmark />
        </span>
        {TABS.map((t) => (
          <button
            type="button"
            key={t.key}
            className={tab === t.key ? 'is-active' : ''}
            aria-current={tab === t.key ? 'page' : undefined}
            onClick={() => setTab(t.key)}
          >
            {/*
              字は常に置き、狭い画面では見えなくするだけ（読み上げには残る）。
              記号側に名前を持たせると、広い画面で字と記号が同じことを 2 回言う。
            */}
            <Icon name={t.icon} />
            <span className="tab-label">{t.name}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
