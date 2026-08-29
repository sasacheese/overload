/**
 * 1 日を締めるときにまとめるもの。
 *
 * ## なぜ「終える」を置いたか
 *
 * 記録は触った時点で保存されるので、終わりを宣言する必要は仕組みの上では無い。
 * それでも置いているのは、**やった分を一度だけまとめて受け取る場所**が要るから。
 * セットごとの祝福は 1 回ぶんの前進しか映さないし、要約の 3 つの数字は
 * 入力中ずっと出ているので、終わった実感には結びつかない。
 *
 * ## 何を出すか
 *
 * 出すのは全部その日の記録から出る事実だけにしてある。「よく頑張った」のような、
 * 何をしても同じ文が出る褒め方はしない——毎回同じなら次から読まれなくなる。
 * 一言（`praise`）も強い順に並べた事実の言い換えで、どれにも当てはまらない日は
 * 「やった、が残った」に落ちる。回数が少ない日を責める文は持たない。
 *
 * 数字（セット・種目・総量）だけでは「今日は何をやったのか」が残らないので、
 * **種目ごとの明細**（`entries`）も併せて出す。重量とレップの並びがそのまま読めれば、
 * あとから見返したときに他の記録を開かなくてもその日を思い出せる。
 * 明細には、その種目で動いた更新もぶら下げてある——何がどう進んだのかは、
 * 更新の一覧としてではなく、やった種目の隣にあるほうが読める。
 *
 * 判定はすべてここに閉じ込めてあり、画面（components/Wrapup.tsx）は
 * 出てきたものを並べるだけにしてある。
 */

import { isComebackWeek, weekStart, weekStreak } from './calendar.ts';
import { bodyWeightOn, countedSets, exerciseHistory, sessionGroups, sessionVolume, sortedSessions } from './query.ts';
import { metrics, setLine } from './progression.ts';
import { findRecords, sessionVolumeRecord, type Achievement } from './records.ts';
import { doneSets, type Exercise, type IsoDate, type MuscleGroup, type Session } from './types.ts';

/**
 * 締めの挨拶。日によって変わらない。
 *
 * 以前は事実の言い換え（`praise`）を画面のいちばん大きい字に置いていたが、
 * 「今日、記録が動いた。」が最大の文字で出ると、機械が読み上げているように見える。
 * **人が言う一言を上に置き、事実はその下に小さく添える。** 数字と更新は
 * そのまま下に並ぶので、伝わる中身は減っていない。
 *
 * 変わらない文をここに置いているのは、締めで出す言葉を 1 箇所にまとめておくため
 * （画面側は並べるだけにする）。
 */
export const GREETING = 'お疲れ様でした';

/** 締めの画面に出す記録更新。種目に属さないもの（1 日の総量）は name が null。 */
export type DayRecord = {
  /** どの種目で出たか。セッション全体の記録なら null。 */
  exerciseName: string | null;
  achievement: Achievement;
};

/** その日にやった種目 1 つぶんの明細。 */
export type DayEntry = {
  exerciseName: string;
  group: MuscleGroup;
  /** 「60kg × 10 · 10 · 8」。同じ重量が続くところはまとめてある。 */
  sets: string;
  setCount: number;
  reps: number;
  /** その種目の総量（kg）。重さで測れない種目は 0。 */
  volume: number;
  /** この種目で動いた更新。強い順。無ければ空。 */
  records: readonly Achievement[];
};

export type WrapUp = {
  date: IsoDate;
  /** 実際に ✓ が付いた種目の数。行だけ足して触らなかった種目は数えない。 */
  exercises: number;
  sets: number;
  reps: number;
  /** 総ボリューム（kg）。重さで測れない種目しか無い日は 0。 */
  volume: number;
  groups: MuscleGroup[];
  /** その日にやった種目の明細。入力した順。 */
  entries: DayEntry[];
  /** その日に出た記録更新。種目ごとに強い順、最後にセッション全体のもの。 */
  records: DayRecord[];
  /**
   * 記録が動いた「もの」の数。種目 1 つで 3 種類当たっても 1 と数える。
   *
   * 一言（`praise`）に出す数はこちら。更新の件数を出すと、重量を 2.5kg 上げた
   * だけの日が「記録が 4 つ動いた日。」になり、数が中身と合わなくなる。
   */
  progressed: number;
  /** この日を含む週にトレーニングした日数。 */
  weekCount: number;
  /** 週単位の連続記録。日単位にしないのは、休養日で切れて休むことが罰になるため。 */
  weekStreak: number;
  /**
   * 空いた週から戻ってきた最初の日か。
   *
   * 定着は「途切れないこと」ではなく「途切れても戻れること」なので、
   * 連続が切れたあとの最初の 1 回を、切れなかった週と同じかそれ以上に扱う。
   * その週の 2 回目からは通常どおり（毎回言うと安売りになる）。
   */
  comeback: boolean;
  /** 通算のトレーニング日数。 */
  totalDays: number;
  /**
   * 前回の同じ種類の日に対する総量の比（0.08 なら 8% 多い）。
   *
   * 比べる相手は「直前のセッション」ではなく、**今日と 1 つ以上同じ種目をやった
   * 直近の日**。分割して回していると直前の日は別の部位で、脚の日と腕の日の総量を
   * 並べても意味が無い（実際に 70% 落ちたように見えていた）。
   * 相手がいない・どちらかが 0（重さで測れない日）なら null。
   */
  volumeRatio: number | null;
  /**
   * 事実に基づく一言。挨拶（`GREETING`）の下に添える行で、
   * 「今日の一枚」では逆にこちらが主題になる（人に見せるのは事実のほう）。
   */
  praise: string;
};

/**
 * その日にやった種目の明細を、更新つきで組み立てる。
 *
 * 種目ごとに当たった更新を**全部**ぶら下げる。祝福は 1 回ぶんの前進を一瞬映すものなので
 * 一番強い 1 つでよかったが、締めは「何がどう進んだのか」を確かめる場所なので、
 * 重量も伸びてレップも伸びた日にその両方が残らないと、まとめとして足りない。
 * 並ぶ数が増えても読めるのは、更新の一覧ではなく**種目の下に添える**形にしてあるから。
 */
function entriesOfDay(session: Session, exercises: readonly Exercise[], sessions: readonly Session[]): DayEntry[] {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const bodyWeight = bodyWeightOn(sessions, session.date);
  const out: DayEntry[] = [];

  for (const entry of session.entries) {
    const exercise = byId.get(entry.exerciseId);
    if (!exercise) continue;
    const sets = doneSets(entry);
    if (sets.length === 0) continue;
    const m = metrics(exercise, { entry, bodyWeight });
    out.push({
      exerciseName: exercise.name,
      group: exercise.group,
      sets: setLine(exercise, sets),
      setCount: m.setCount,
      reps: m.totalReps,
      volume: m.byLoad ? m.volume : 0,
      records: findRecords({
        exercise,
        today: { entry, bodyWeight },
        history: exerciseHistory(sessions, exercise.id).filter((h) => h.date < session.date),
        // 1 日の総量はここでは見ない（種目の数だけ同じ更新が出てしまう）
        todaySessionVolume: 0,
        bestPastSessionVolume: 0,
      }),
    });
  }

  return out;
}

/** セッション全体の総量の更新。種目に属さないので 1 回だけ見る。 */
function wholeDayRecord(
  session: Session,
  exercises: readonly Exercise[],
  sessions: readonly Session[],
): Achievement | null {
  const bodyWeight = bodyWeightOn(sessions, session.date);
  const todayVolume = sessionVolume(session, exercises, bodyWeight);
  const bestPast = Math.max(
    0,
    ...sessions
      .filter((s) => s.date < session.date)
      .map((s) => sessionVolume(s, exercises, bodyWeightOn(sessions, s.date))),
  );
  return sessionVolumeRecord(todayVolume, bestPast);
}

/**
 * 一言。強い順に見て、最初に当てはまったものを返す。
 *
 * どれにも当てはまらない日でも必ず何かを返す。空の日を作ると「今日は言うことが無い」
 * という表示になり、それは責めているのと同じになる。
 *
 * 最後の 1 行に落ちるのは、記録も更新されず・前回より減っていて・その週も通算も
 * 1 日目という、実際にはほぼ起きない組み合わせのときだけ。それでも置いてあるのは、
 * ここが空になる経路を作らないため。
 */
function praiseFor(w: Omit<WrapUp, 'praise'>): string {
  // 復帰は記録更新より先に言う。空いたあとに戻ってくることが、このアプリの
  // 定義する定着そのものなので、その日は数字より戻ったことが主役になる
  if (w.comeback) return '空いた週から、戻ってきた。';
  if (w.progressed >= 2) return `${w.progressed}種目の記録を更新しました`;
  /*
   * 1 種目でも「更新した」と言う。
   *
   * ここは以前 GREETING と同じ「お疲れ様でした」を返していて、締めの画面に
   * 同じ一文が 2 行続けて出ていた（挨拶と、その下に添える一言）。挨拶の下は
   * **その日に何があったか**を言う場所なので、件数を言う上の枝と揃える。
   */
  if (w.progressed === 1) return '1種目の記録を更新しました';
  if (w.volumeRatio !== null && w.volumeRatio >= 0.05) {
    return `前回より総量が ${Math.round(w.volumeRatio * 100)}% 多い。`;
  }
  if (w.weekStreak >= 4) return `${w.weekStreak} 週続いている。`;
  if (w.weekCount >= 2) return `今週 ${w.weekCount} 回目。`;
  if (w.weekStreak >= 2) return `${w.weekStreak} 週続いている。`;
  if (w.totalDays >= 2) return `これで通算 ${w.totalDays} 日。`;
  return 'やった、が残った。';
}

/**
 * 締めに出すものを 1 つにまとめる。
 *
 * @param session 締める日のセッション（保存済みの状態でなくてよい）
 */
export function wrapUp(session: Session, exercises: readonly Exercise[], sessions: readonly Session[]): WrapUp {
  const bodyWeight = bodyWeightOn(sessions, session.date);
  const worked = session.entries.filter((e) => doneSets(e).length > 0);

  const reps = worked.reduce((n, e) => n + doneSets(e).reduce((m, s) => m + s.reps, 0), 0);
  const volume = sessionVolume(session, exercises, bodyWeight);

  // その日を除いた過去。渡された session が保存前でも同じ結果になるようにする
  const past = sortedSessions(sessions).filter((s) => s.date < session.date);
  const dates = sortedSessions(sessions)
    .map((s) => s.date)
    .filter((d) => d !== session.date);
  const withToday = [...dates, session.date];

  /*
   * 比べる相手は「同じ種類の日」。今日やった種目を 1 つでも含む直近の日を採る。
   * 分割して回していると直前の日は別の部位なので、そこと並べても意味が無い。
   */
  const todayIds = new Set(worked.map((e) => e.exerciseId));
  const sameKind = past.find((s) => s.entries.some((e) => todayIds.has(e.exerciseId) && doneSets(e).length > 0));
  const previousVolume = sameKind ? sessionVolume(sameKind, exercises, bodyWeightOn(sessions, sameKind.date)) : 0;
  const volumeRatio = previousVolume > 0 && volume > 0 ? volume / previousVolume - 1 : null;

  const thisWeek = weekStart(session.date);
  const weekCount = new Set(withToday.filter((d) => weekStart(d) === thisWeek)).size;

  const entries = entriesOfDay(session, exercises, sessions);
  const whole = wholeDayRecord(session, exercises, sessions);
  const records: DayRecord[] = [
    ...entries.flatMap((e) => e.records.map((achievement) => ({ exerciseName: e.exerciseName, achievement }))),
    ...(whole ? [{ exerciseName: null, achievement: whole }] : []),
  ];

  const base: Omit<WrapUp, 'praise'> = {
    date: session.date,
    exercises: worked.length,
    sets: countedSets(session),
    reps,
    volume,
    groups: sessionGroups(session, exercises),
    entries,
    records,
    progressed: entries.filter((e) => e.records.length > 0).length + (whole ? 1 : 0),
    weekCount,
    weekStreak: weekStreak(withToday, session.date),
    comeback: weekCount === 1 && isComebackWeek(withToday, session.date),
    totalDays: new Set(withToday).size,
    volumeRatio,
  };
  return { ...base, praise: praiseFor(base) };
}

/**
 * 締められる日か。
 *
 * ✓ が 1 つも無い日は締められない。まだ始まっていない日に終わりのボタンを出すと、
 * 何もしていないのに終えたことになる。集計は metrics を通しているので、
 * ここでも同じ判定（実施済みかつレップが 1 以上）になる。
 */
export function canFinish(session: Session, exercises: readonly Exercise[]): boolean {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  return session.entries.some((entry) => {
    const exercise = byId.get(entry.exerciseId);
    return exercise !== undefined && metrics(exercise, { entry, bodyWeight: 0 }).setCount > 0;
  });
}
