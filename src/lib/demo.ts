/**
 * サンプルの記録。人に見せる・初めて開いた人が中身を確かめるための、作りものの 9 週間。
 *
 * ## 決めごと
 *
 * - **決定的に作る。** 乱数の種を固定してあるので、同じ日に開けば誰でも同じ画面になる。
 *   紹介するときに「この画面のここ」と言える。
 * - **今日を基準に作る。**「3 週間前」が常に 3 週間前になるので、いつ開いても
 *   カレンダー・推移・停滞判定が生きた状態で見える。作った日で固定すると、
 *   時間が経つほど「昔の記録しか無いアプリ」に見えてしまう。
 * - **今日のセッションは途中まで**にしてある。1 セット目に ✓ が付いていて、
 *   残りが空いているので、見ている人がそのまま ✓ を押せば祝福・休憩タイマー・
 *   「今日を終える」まで一通り体験できる。しかも今日は重量を 1 段上げてあるので、
 *   ✓ を押せば必ず記録更新が出る。
 * - **保存はどこにも行かない。** ここは配列を作って返すだけで、保存しないかどうかは
 *   store 側（seed で渡されたら IndexedDB に触らない）が決める。
 *
 * ## 何を見せるか
 *
 * 3 分割（押す・引く・脚と体幹）を週 3 回。重量種目の漸進、アシストチンニング
 * （補助を下げる進み方）、自重種目（加重に移る瞬間）、体重の推移、メモ、
 * 機材設定、締め済みの日。全機能に 1 つずつ実物の記録が当たるようにしてある。
 */

import { shiftDays, todayIso } from './calendar.ts';
import { presetExercises } from './presets.ts';
import { exerciseId, type Exercise, type IsoDate, type Session, type SessionEntry, type SetRecord } from './types.ts';

/** 乱数。種を固定した mulberry32。ゆらぎを作るためだけに使う。 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** その日の夜の epoch ms。updatedAt と finishedAt に使う。 */
function eveningOf(date: IsoDate, hour = 21): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y!, m! - 1, d!, hour, 30).getTime();
}

type Plan = {
  id: string;
  /** 初回の重量。自重種目は 0。 */
  start: number;
  /** 上げ幅。アシストは負（補助を下げる）。 */
  step: number;
  /** 何回やるごとに 1 段動かすか。 */
  every: number;
  reps: number;
  sets: number;
};

/** 3 分割。id はプリセットに実在するものだけ（テストで担保）。 */
const ROUTINES: readonly (readonly Plan[])[] = [
  // 押す日
  [
    { id: 'bench-press', start: 55, step: 2.5, every: 3, reps: 8, sets: 3 },
    { id: 'incline-dumbbell-press', start: 20, step: 2, every: 3, reps: 10, sets: 3 },
    { id: 'shoulder-press', start: 32.5, step: 2.5, every: 4, reps: 10, sets: 3 },
    { id: 'cable-pushdown', start: 27.5, step: 2.5, every: 4, reps: 12, sets: 3 },
  ],
  // 引く日
  [
    { id: 'lat-pulldown', start: 47.5, step: 2.5, every: 3, reps: 10, sets: 3 },
    { id: 'assist-chinning', start: 32.5, step: -2.5, every: 3, reps: 6, sets: 3 },
    { id: 'seated-row', start: 42.5, step: 2.5, every: 4, reps: 12, sets: 3 },
    { id: 'barbell-curl', start: 22.5, step: 2.5, every: 4, reps: 10, sets: 3 },
  ],
  // 脚と体幹の日
  [
    { id: 'squat', start: 70, step: 2.5, every: 3, reps: 8, sets: 3 },
    { id: 'leg-press', start: 130, step: 5, every: 3, reps: 12, sets: 3 },
    { id: 'leg-curl', start: 35, step: 2.5, every: 4, reps: 12, sets: 3 },
    { id: 'back-extension', start: 0, step: 0, every: 1, reps: 10, sets: 3 },
    { id: 'hanging-leg-raise', start: 0, step: 0, every: 1, reps: 8, sets: 3 },
  ],
];

const WEEKS = 9;

/** 種目ごとの機材メモ。中身のある記録に見せるため、主要なものだけ埋める。 */
const TIPS: Record<string, string> = {
  'bench-press': 'ラックは 8 段目。足は引いて踏む。肩甲骨を寄せてから下ろす',
  'assist-chinning': '膝置きは 2 段目。補助を下げた週は反動を使わないこと',
  squat: 'セーフティは 3 段目・フックは 12 段目。バーは低めに担ぐ',
  'back-extension': 'パッドは腰骨の高さ。加重はプレートを胸に抱える',
};

const SESSION_NOTES: Record<number, string> = {
  4: '睡眠 7 時間。調子よかった',
  10: '仕事で遅くなって短め。メインだけ',
  16: '腰に張り。バックエクステンションは自重のまま',
};

/**
 * n 回目（0 が最初）の重量。every 回ごとに 1 段動く。
 *
 * バックエクステンションだけ特別で、6 回目から加重 5kg に移る
 * ——「自重で回数を伸ばし、足りなくなったら加重する」流れを見せるため。
 */
function loadAt(plan: Plan, n: number): number {
  if (plan.id === 'back-extension') return n >= 6 ? 5 : 0;
  if (plan.start === 0) return 0;
  return plan.start + plan.step * Math.floor(n / plan.every);
}

/** n 回目のレップ（セットごと）。段が上がった直後は下限に戻り、そこから伸びる。 */
function repsAt(plan: Plan, n: number, set: number, rand: () => number): number {
  if (plan.start === 0 && plan.id !== 'back-extension') {
    // 自重種目はレップで伸ばす。じわじわ増えて、最後のセットは少し落ちる
    return plan.reps + Math.floor(n / 2) - (set === plan.sets - 1 && rand() < 0.5 ? 1 : 0);
  }
  const phase = n % plan.every;
  const base = plan.reps + phase;
  // 最後のセットはときどき 1 落ちる。全部同じ数字だと作りものに見える
  return base - (set === plan.sets - 1 && rand() < 0.45 ? 1 : 0);
}

function makeSets(plan: Plan, n: number, rand: () => number, done: boolean): SetRecord[] {
  return Array.from({ length: plan.sets }, (_, set) => ({
    weight: loadAt(plan, n),
    reps: repsAt(plan, n, set, rand),
    done,
    note: '',
  }));
}

/**
 * サンプル一式。今日を基準に組み立てる。
 */
export function demoData(today: IsoDate = todayIso()): { exercises: Exercise[]; sessions: Session[] } {
  const rand = rng(0x5eed);
  const sessions: Session[] = [];

  /** 各種目を何回やったか。重量の段を決める。 */
  const counts = new Map<string, number>();

  // 週 3 回（今日、2 日前、4 日前、7 日前…）。今日が最新のセッションになる
  const trainingDays: IsoDate[] = [];
  for (let week = 0; week < WEEKS; week++) {
    for (const offset of [4, 2, 0]) {
      trainingDays.push(shiftDays(today, -(week * 7 + offset)));
    }
  }
  trainingDays.sort(); // 古い順

  // 体重。ゆるやかに落ちる。トレーニングの日以外もほぼ毎日つけている想定
  const weightOn = new Map<IsoDate, number>();
  const firstDay = trainingDays[0]!;
  for (let d = firstDay; d < today; d = shiftDays(d, 1)) {
    if (rand() < 0.15) continue; // つけ忘れる日もある
    weightOn.set(d, 0); // 値は下でまとめて埋める（日数に比例して落としたいため）
  }
  {
    let i = 0;
    const days = [...weightOn.keys()].sort();
    for (const d of days) {
      const t = i / Math.max(1, days.length - 1);
      weightOn.set(d, Math.round((71.6 - 2.1 * t + (rand() - 0.5) * 0.4) * 10) / 10);
      i++;
    }
  }

  trainingDays.forEach((date, index) => {
    const isToday = date === today;
    const routine = ROUTINES[index % ROUTINES.length]!;
    const entries: SessionEntry[] = [];

    routine.forEach((plan, position) => {
      const n = counts.get(plan.id) ?? 0;
      /*
       * 今日は 3 種目まで。1 種目めの 1 セット目にだけ ✓ が付いた「途中」の状態にする。
       *
       * 1〜2 種目だと過去の日に比べて薄く見えるし、5 種目あると ✓ を押し切るのが
       * 作業になる。3 つなら 1 日として成立して、押し切るのも一息で終わる。
       * 残りの ✓ を押せば、今日は重量を上げた日なので必ず記録更新が出る。
       */
      if (isToday && position > 2) return;
      const done = !isToday;
      const sets = makeSets(plan, n, rand, done);
      if (isToday && position === 0) sets[0]!.done = true;
      const note =
        !isToday && plan.id === 'squat' && index === 17 ? '深さ優先。重量は据え置き' : '';
      entries.push({ exerciseId: exerciseId(plan.id), sets, note });
      counts.set(plan.id, n + 1);
    });

    sessions.push({
      date,
      entries,
      note: SESSION_NOTES[index] ?? '',
      bodyWeight: isToday ? 0 : (weightOn.get(date) ?? 0),
      // 過去の日は締め済みにしておく。まとめを見直す導線もサンプルで見える
      finishedAt: isToday ? 0 : eveningOf(date),
      updatedAt: eveningOf(date, 22),
    });
    weightOn.delete(date);
  });

  // 体重だけの日（休養日）。カレンダーで「やった日」と区別されて見える
  for (const [date, weight] of weightOn) {
    if (weight <= 0) continue;
    sessions.push({ date, entries: [], note: '', bodyWeight: weight, finishedAt: 0, updatedAt: eveningOf(date, 8) });
  }

  const exercises = presetExercises().map((e) =>
    TIPS[e.id] !== undefined ? { ...e, tips: TIPS[e.id]! } : e,
  );

  return { exercises, sessions };
}
