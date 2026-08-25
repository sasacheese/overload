/**
 * 「今日」タブ。日付を 1 つ選び、その日の種目カードを並べる。
 *
 * 保存ボタンは置かない。ジムでは操作を 1 つ減らしたいし、書きかけで画面を落として
 * 記録が消えるのが一番困る。触った時点で IndexedDB に入る。
 *
 * 体重を一番上に置いているのは、トレーニングをしない日にも入れるものだから。
 * 種目カードの下にあると、開いて下までスクロールしないと入力に届かない。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { dateParts, relativeLabel, shiftDays } from '../lib/calendar.ts';
import { initialSets } from '../lib/progression.ts';
import {
  bodyWeightOn,
  countedSets,
  exerciseHistory,
  lastPerformed,
  orderInDay,
  previousEntry,
  sessionVolume,
} from '../lib/query.ts';

import { recordFeedback } from '../lib/haptics.ts';
import { findRecords, type Achievement, type RecordKind } from '../lib/records.ts';
import { startedAt, type Exercise, type IsoDate, type Session, type SessionEntry } from '../lib/types.ts';
import { canFinish, wrapUp } from '../lib/wrapup.ts';
import { useSession, useStore } from '../store.tsx';
import { Celebration } from './Celebration.tsx';
import { Wrapup } from './Wrapup.tsx';
import { ExerciseCard } from './ExerciseCard.tsx';
import { ExercisePicker } from './ExercisePicker.tsx';
import { Icon } from './Icon.tsx';
import { RestTimer } from './RestTimer.tsx';
import { TopBar } from './TopBar.tsx';
import { dayClass } from './Weekday.tsx';

type Props = {
  date: IsoDate;
  today: IsoDate;
  onDateChange: (date: IsoDate) => void;
  onCreateExercise: () => void;
};

/** 休憩タイマーはセッションを跨いで持ち回らない。リロードだけ耐えれば十分。 */
const REST_KEY = 'overload:rest';
/** 出し終えた祝福。同じ種類を 1 セッションで繰り返さないために覚えておく。 */
const SHOWN_KEY = 'overload:shownRecords';
/** 畳んでいる種目。タブを行き来しても畳んだままにするために外へ出す。 */
const FOLD_KEY = 'overload:folded';

/**
 * ここから上は「広い画面」。左に筋が出るのと同じ境目（styles.css の 60rem）。
 *
 * 狭い画面では種目を 1 つだけ開く。1 枚が画面のほとんどを占めるので、複数開くと
 * 目当ての種目まで指を何度も送ることになる。広い画面は縦に余裕があるので、
 * 見比べられるように複数開けたままにする。
 */
const WIDE = '(min-width: 60rem)';

function useWide(): boolean {
  const [wide, setWide] = useState(() => {
    try {
      return matchMedia(WIDE).matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = matchMedia(WIDE);
    } catch {
      return;
    }
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

/** どのセットが始めた休憩かを覚えておく。✓ を外したときに畳むため。 */
type Rest = { at: number; targetSec: number; exerciseId: string; index: number };

function readRest(): Rest | null {
  try {
    const raw = sessionStorage.getItem(REST_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { at, targetSec, exerciseId, index } = parsed as Record<string, unknown>;
    if (typeof at !== 'number' || typeof targetSec !== 'number') return null;
    return { at, targetSec, exerciseId: String(exerciseId ?? ''), index: Number(index ?? -1) };
  } catch {
    return null;
  }
}

function readShown(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SHOWN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * 畳んでいる種目。日付とセットで持つ。
 *
 * 日付を含めているのは、別の日へ送ったときに畳みを持ち越さないため。日ごとに
 * 並ぶ種目が違うので、前の日で閉じたものが次の日でも閉じていると、開いた覚えの
 * 無いものが閉じたまま並ぶ。
 */
function readFolded(date: IsoDate): Set<string> | null {
  try {
    const raw = sessionStorage.getItem(FOLD_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { date: on, ids } = parsed as Record<string, unknown>;
    if (on !== date || !Array.isArray(ids)) return null;
    return new Set(ids.filter((v): v is string => typeof v === 'string'));
  } catch {
    return null;
  }
}

/**
 * その日、いま向かっている種目。いちばん最後に始めたもの、無ければ末尾。
 *
 * 途中でタブを閉じて開き直したとき、開いているべきは手を付けたところ。行の並びの
 * 末尾を採ると、先にまとめて種目を選んでおく日に、まだ触っていない種目が開く。
 */
function currentEntry(entries: readonly SessionEntry[]): SessionEntry | undefined {
  const started = [...entries].filter((e) => startedAt(e) > 0).sort((a, b) => startedAt(a) - startedAt(b));
  return started.at(-1) ?? entries.at(-1);
}

/**
 * その日を開いたときの畳み方。
 *
 * 触った覚えがあるならそれを正とする（null は「この日はまだ触っていない」）。
 * 触っていない日を狭い画面で開いたときは、いま向かっている 1 つだけ開く——
 * 1 つずつしか開かない画面で、読み込み直後だけ全部開いていると規則が崩れて見える。
 */
function initialFolded(date: IsoDate, entries: readonly SessionEntry[], wide: boolean): Set<string> {
  const stored = readFolded(date);
  if (stored !== null) return stored;
  if (wide || entries.length < 2) return new Set();
  const open = currentEntry(entries);
  return new Set(entries.filter((e) => e !== open).map((e) => e.exerciseId as string));
}

export function SessionView({ date, today, onDateChange, onCreateExercise }: Props) {
  const { exercises, sessions, saveSession, setBodyWeight } = useStore();
  const session = useSession(date);
  const wide = useWide();
  const [picking, setPicking] = useState(false);
  const [rest, setRest] = useState(readRest);
  const [folded, setFolded] = useState<ReadonlySet<string>>(() =>
    initialFolded(date, session.entries, wide),
  );
  const [celebration, setCelebration] = useState<{ achievements: Achievement[]; exerciseName: string } | null>(null);
  /** 締めの画面。fresh は「いま押して締めた」——あとから見直したときは光を出さない。 */
  const [wrap, setWrap] = useState<{ fresh: boolean } | null>(null);

  /*
   * 一番下まで来たら、浮いているボタンを引っこめて末尾の普通のボタンに任せる。
   *
   * 末尾のボタン自身を見張っているので、判定と表示がずれない。画面に入り始めた
   * 時点で入れ替わるので、2 つが重なって見える瞬間が無い。中身が短くて
   * スクロールが要らない日は、最初から末尾のボタンだけになる。
   */
  const addButton = useRef<HTMLButtonElement | null>(null);
  const [addInView, setAddInView] = useState(false);
  useEffect(() => {
    const el = addButton.current;
    if (el === null || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setAddInView(entry?.isIntersecting ?? false));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /*
   * 日付を送ったら、その日の畳みを読み直す（別の日の畳みを持ち越さない）。
   *
   * 依存は date だけ。session.entries を入れると、セットに数字を打つたびに
   * 畳み方が組み直されて、開いたばかりの種目が閉じてしまう。
   */
  useEffect(() => {
    setFolded(initialFolded(date, session.entries, wide));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  /**
   * 畳み方を決めて覚える。覚えられなければ、タブを離れたときに開いた状態へ戻るだけ。
   *
   * 直前の畳み方は引数で受け取る（描画時の値を読まない）。1 回の描画のあいだに
   * 2 度決まることがあり、そのとき古い方を元にすると片方の操作が消える。
   */
  const applyFold = (next: (prev: ReadonlySet<string>) => Set<string>) => {
    setFolded((prev) => {
      const ids = next(prev);
      try {
        sessionStorage.setItem(FOLD_KEY, JSON.stringify({ date, ids: [...ids] }));
      } catch {
        // 覚えられなくてもこの画面のあいだは畳んだまま
      }
      return ids;
    });
  };

  /**
   * 見出しを押したとき。
   *
   * 狭い画面では 1 つだけ開く（開いた種目以外は畳む）。広い画面はそのまま
   * 開け閉めするだけで、何枚でも並べて見比べられる。
   */
  const toggleFold = (exerciseId: string) => {
    const others = session.entries.map((e) => e.exerciseId as string).filter((id) => id !== exerciseId);
    applyFold((prev) => {
      if (!prev.has(exerciseId)) return new Set([...prev, exerciseId]);
      return wide ? new Set([...prev].filter((id) => id !== exerciseId)) : new Set(others);
    });
  };

  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const last = useMemo(() => lastPerformed(sessions), [sessions]);
  // 体重は当日の記録が無ければ直近の値を引き継ぐ。アシスト種目の実効負荷に効く
  const bodyWeight = useMemo(() => bodyWeightOn(sessions, date), [sessions, date]);
  /** その日より前の直近の記録。上部の帯に「前回」として出す。 */
  const latestBefore = useMemo(() => {
    const found = sessions
      .filter((s) => s.date < date && s.bodyWeight > 0)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    return found ? { date: found.date, weight: found.bodyWeight } : null;
  }, [sessions, date]);
  const volume = sessionVolume(session, exercises, bodyWeight);
  const sets = countedSets(session);
  const parts = dateParts(date);

  const setEntries = (entries: SessionEntry[]) => saveSession({ ...session, entries });

  const addExercise = (exercise: Exercise) => {
    // 同じ種目が 2 行に並ぶと、行の識別（種目 ID）と集計の両方が崩れる。
    // 選択肢からは除いてあるが、ここでも塞いでおく
    if (session.entries.some((e) => e.exerciseId === exercise.id)) {
      setPicking(false);
      return;
    }
    const prev = previousEntry(sessions, exercise.id, date);
    setEntries([...session.entries, { exerciseId: exercise.id, sets: initialSets(exercise, prev?.entry), note: '' }]);
    /*
     * 足したものだけを開く。いま向かう種目は必ず最後の 1 枚なので、それより上を
     * 畳んでおけば、追加した直後に指を送らなくても入力欄が目の前にある。
     * 終えた種目は畳まれて 1 行になり、その日の並びが一覧として残る。
     */
    applyFold(() => new Set(session.entries.map((e) => e.exerciseId as string)));
    setPicking(false);
  };

  const startRest = (exercise: Exercise, index: number) => {
    const next: Rest = { at: Date.now(), targetSec: exercise.restSec, exerciseId: exercise.id, index };
    setRest(next);
    try {
      sessionStorage.setItem(REST_KEY, JSON.stringify(next));
    } catch {
      // 保存できなくてもこの画面のあいだは動く
    }
  };

  /**
   * ✓ を付けた直後に記録の更新を探す。
   *
   * 更新した瞬間に出したいので、保存された state を待たず、渡された entry で判定する。
   * 当たったもののうち**まだ出していない種類を全部**渡し、祝福の側で一番強いものを
   * 主役に、残りを添えて出す。同じ種類はこのセッションで繰り返さない。
   */
  const celebrate = (exercise: Exercise, entry: SessionEntry) => {
    const shown = readShown();
    const merged: Session = {
      ...session,
      entries: session.entries.map((e) => (e.exerciseId === entry.exerciseId ? entry : e)),
    };
    const bestPastSessionVolume = Math.max(
      0,
      ...sessions.filter((s) => s.date !== date).map((s) => sessionVolume(s, exercises, bodyWeightOn(sessions, s.date))),
    );
    const records = findRecords({
      exercise,
      today: { entry, bodyWeight },
      history: exerciseHistory(sessions, exercise.id).filter((h) => h.date < date),
      todaySessionVolume: sessionVolume(merged, exercises, bodyWeight),
      bestPastSessionVolume,
    });

    const key = (kind: RecordKind) => `${date}:${exercise.id}:${kind}`;
    const fresh = records.filter((r) => !shown.has(key(r.kind)));

    /*
     * 出さなかったぶんも「出した」ことにする。
     *
     * 出さなかったぶん（上限で溢れたもの）も含め、当たった種類を全部覚えておかないと、
     * ✓ を外して入れ直すたびに次の順位の記録が出てくる（実際にそうなっていた）。
     * 1 セットに対して褒めるのは 1 回、を保つ。
     *
     * この時点で当たっていない種類は覚えないので、あとのセットで本当に新しい
     * 記録が出たときはちゃんと祝われる。
     */
    for (const record of records) shown.add(key(record.kind));
    try {
      sessionStorage.setItem(SHOWN_KEY, JSON.stringify([...shown]));
    } catch {
      // 覚えられなければ同じ祝福がもう一度出るだけ
    }

    if (fresh.length === 0) return;
    // 目で見る前に指へ返す。祝福の絵が出るより先に「動いた」ことが分かる
    recordFeedback();
    setCelebration({ achievements: fresh, exerciseName: exercise.name });
  };

  const onSetCompleted = (exercise: Exercise, entry: SessionEntry, index: number) => {
    startRest(exercise, index);
    celebrate(exercise, entry);
  };

  /*
   * ✓ を外したときは、そのセットが始めた休憩を畳む。
   *
   * 押し間違いで ✓ が付くことがあり、そのまま残ると意味のない残り時間を数え続ける。
   * 別のセットが始めた休憩は消さない（3 セット目の休憩中に 1 セット目を直すことがある）。
   */
  const onSetUndone = (exercise: Exercise, index: number) => {
    setRest((prev) => {
      if (!prev || prev.exerciseId !== exercise.id || prev.index !== index) return prev;
      try {
        sessionStorage.removeItem(REST_KEY);
      } catch {
        // 消せなければ表示が残るだけ
      }
      return null;
    });
  };

  /*
   * 締めの数字。開いているあいだだけ作る。
   *
   * 保存前の session をそのまま渡している。締めた瞬間に finishedAt を押すので
   * 保存済みの配列にはまだ反映されていないが、集計は entries しか見ないので
   * 結果は変わらない。
   */
  const summary = useMemo(
    () => (wrap === null ? null : wrapUp(session, exercises, sessions)),
    [wrap, session, exercises, sessions],
  );

  const finishable = canFinish(session, exercises);
  const finished = session.finishedAt > 0;
  const isToday = date === today;

  const dismissRest = () => {
    setRest(null);
    try {
      sessionStorage.removeItem(REST_KEY);
    } catch {
      // 何もしない
    }
  };

  /** 今日を締める。押した時刻を残して、まとめを出す。 */
  const finishDay = () => {
    saveSession({ ...session, finishedAt: Date.now() });
    setWrap({ fresh: true });
    // 締めたら休憩の残り時間は用が済んでいる。数え続ける意味がない
    dismissRest();
  };

  return (
    <>
      <TopBar
        today={date}
        todayWeight={session.bodyWeight}
        latest={latestBefore}
        onChange={(v) => setBodyWeight(session, v)}
      />

      {/*
        広い画面では 2 列にする。左は種目（触る場所）、右は日付と要点とメモ
        （見ておく場所）。狭い画面では display: contents でこの div を無かった
        ことにするので、縦一列の並びは元のまま。
      */}
      <div className="session-aside">
      <header className="view-head">
        <div className="date-nav">
          <button type="button" className="icon-btn" aria-label="前の日" onClick={() => onDateChange(shiftDays(date, -1))}>
            <Icon name="left" />
          </button>
          <div className="date-current">
            <strong>
              {parts.date}(<span className={dayClass(parts.kind)}>{parts.weekday}</span>)
            </strong>
            <span className="muted">{relativeLabel(date, today)}</span>
          </div>
          <button type="button" className="icon-btn" aria-label="次の日" onClick={() => onDateChange(shiftDays(date, 1))}>
            <Icon name="right" />
          </button>
        </div>
        {date === today ? null : (
          <button type="button" className="ghost small" onClick={() => onDateChange(today)}>
            今日
          </button>
        )}
      </header>

      {session.entries.length > 0 ? (
        <div className="summary">
          <span>
            <strong>{session.entries.length}</strong>
            <span className="unit">種目</span>
          </span>
          <span>
            <strong>{sets}</strong>
            <span className="unit">セット</span>
          </span>
          {volume > 0 ? (
            <span>
              <strong>{Math.round(volume).toLocaleString('ja-JP')}</strong>
              <span className="unit">kg</span>
            </span>
          ) : null}
        </div>
      ) : null}

      <label className="note session-note">
        <span className="muted">この日のメモ</span>
        <textarea
          rows={2}
          value={session.note}
          placeholder="睡眠・食事・体調など"
          onChange={(e) => saveSession({ ...session, note: e.target.value })}
        />
      </label>

      </div>

      <div className="session-main">
      {session.entries.map((entry, i) => {
        const exercise = byId.get(entry.exerciseId);
        if (!exercise) {
          return (
            <p key={entry.exerciseId} className="hint">
              一覧に無い種目の記録が残っている（{entry.exerciseId}）。設定からバックアップを取ってから消す。
            </p>
          );
        }
        return (
          <ExerciseCard
            key={entry.exerciseId}
            exercise={exercise}
            date={date}
            today={today}
            entry={entry}
            bodyWeight={bodyWeight}
            order={orderInDay(session, entry.exerciseId)}
            folded={folded.has(entry.exerciseId)}
            onToggleFold={() => toggleFold(entry.exerciseId)}
            onChange={(next) => setEntries(session.entries.map((e, j) => (j === i ? next : e)))}
            onRemove={() => setEntries(session.entries.filter((_, j) => j !== i))}
            onSetCompleted={onSetCompleted}
            onSetUndone={onSetUndone}
          />
        );
      })}

      {session.entries.length === 0 ? (
        <p className="empty">種目を追加すると、前回と同じ数字が入った状態で並ぶ。あとは実際にやった数に直して ✓ を押す。</p>
      ) : null}

      {/*
        面のいちばん下。浮いているもの（追加ボタン・休憩タイマー）は画面に貼り付いて
        いるので、ここに置いたボタンはスクロールしきった位置でその下に潜る。
        避ける高さはこの塊が自分で持つ（.session-foot の余白）。
      */}
      <div className="session-foot">
        <button
          type="button"
          className="ghost accent wide center-icon add-exercise"
          ref={addButton}
          onClick={() => setPicking(true)}
        >
          <Icon name="plus" />
          種目を追加
        </button>

        {/*
          今日を締める。✓ が 1 つも無い日には出さない——何もしていない日に
          終わりのボタンがあると、押すこと自体が記録のように見える。

          面は赤で塗らない。赤は「前進した」の合図に取ってあるので、押す前の操作には
          渡さない（地と反転した無彩色にしてある。浮いている追加ボタンと同じ扱い）。
          赤が出るのは押したあとのまとめの中だけ。

          過ぎた日には「終える」を出さない。もう終わっている日に終わりを宣言させても
          意味が無いので、まとめを開くだけの静かな操作にしてある（時刻も残さない）。
        */}
        {finishable && !finished ? (
          isToday ? (
            <button type="button" className="solid wide center-icon" onClick={finishDay}>
              <Icon name="flag" />
              今日を終える
            </button>
          ) : (
            <button type="button" className="quiet-action finish-again" onClick={() => setWrap({ fresh: false })}>
              この日のまとめを見る
            </button>
          )
        ) : null}

        {finished ? (
          <button type="button" className="quiet-action finish-again" onClick={() => setWrap({ fresh: false })}>
            この日は終えた · まとめをもう一度見る
          </button>
        ) : null}
      </div>

      </div>

      {picking ? (
        <ExercisePicker
          exercises={exercises}
          exclude={new Set(session.entries.map((e) => e.exerciseId))}
          lastPerformed={last}
          onPick={addExercise}
          onClose={() => setPicking(false)}
          onCreate={() => {
            setPicking(false);
            onCreateExercise();
          }}
        />
      ) : null}

      <button
        type="button"
        className={`fab ${addInView ? 'is-tucked' : ''}`}
        aria-label="種目を追加"
        aria-hidden={addInView}
        tabIndex={addInView ? -1 : undefined}
        onClick={() => setPicking(true)}
      >
        <Icon name="plus" />
      </button>

      <RestTimer startedAt={rest?.at ?? null} targetSec={rest?.targetSec ?? 90} onDismiss={dismissRest} />

      {celebration ? (
        <Celebration
          achievements={celebration.achievements}
          exerciseName={celebration.exerciseName}
          onClose={() => setCelebration(null)}
        />
      ) : null}

      {wrap && summary ? <Wrapup summary={summary} fresh={wrap.fresh} onClose={() => setWrap(null)} /> : null}
    </>
  );
}
