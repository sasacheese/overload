/**
 * サイクル。同じ負荷で何回やって、レップ範囲のどこまで来たかを出す。
 *
 * ## なぜセッション単位ではなくサイクル単位か
 *
 * ダブルプログレッションでは、負荷を上げた直後にレップが下限へ落ちる。
 * セッション同士を並べるとこれは「後退」に見えるが、実際にはサイクルの起点で、
 * 進歩の単位は**同じ負荷でのひとまとまり**にある。同じ負荷でセット数や
 * 上限到達セット数が増えることも、重量が動かないだけで前進そのもの。
 *
 * ## 目標との違い
 *
 * ここで出すのは「この負荷で n 回目・上限到達 k セット」という**現在地の事実**だけで、
 * 今日届くべき数字は出さない（目標を入力欄に流し込む作りは、達成できなかった日に
 * 必ず未達を表示するので外した経緯がある。README 1 章）。卒業も同じで、
 * **成功したときにしか出ない判定**だから表示できる——達成できなかった日には
 * 何も出ず、何も言われない。
 *
 * ## 卒業と次の負荷
 *
 * 規定セット数のすべてで上限レップに到達した回があれば「卒業」。次の負荷は
 * 種目の刻みから計算して**提示だけ**する。入力欄には入れない——上げるかどうか、
 * いつ上げるかは本人が決める（体調の悪い日に同じ重量を続けるのも正しい選択）。
 *
 * 自重のまま（加重 0）で卒業したときは数字を出せないので、加重か難度変更を
 * 次の段階として言う。アシストは補助を刻みぶん**減らす**方向に進む。
 */

import { format, loadRank, loadWord, round, type ExerciseHistory } from './progression.ts';
import { doneSets, type Exercise, type IsoDate, type SetRecord } from './types.ts';

export type Cycle = {
  /** サイクルの負荷（入力どおりの数字）。自重のままなら 0。 */
  weight: number;
  /** この負荷で何セッション目か。別の負荷を挟んだら数え直す。 */
  sessions: number;
  /** 直近セッションの、この負荷でのセット数。 */
  setCount: number;
  /** 充足度の分母。種目の規定セット数と、実際にやった数の大きい方。 */
  targetSets: number;
  /** 直近セッションで上限レップに到達したセット数。 */
  reached: number;
  /** 上限到達セット数がこのサイクルの最多を更新したか（2 回目以降のみ真になりうる）。 */
  reachedPeak: boolean;
  /** 規定セット数すべてで上限に到達した（卒業）。 */
  graduated: boolean;
  /** 卒業した場合の次の負荷。自重のまま・補助 0 など、数字で進めないときは null。 */
  next: number | null;
  /** 直近セッションの日付。「今日卒業した」と「前回卒業した」を言い分けるのに使う。 */
  latestDate: IsoDate;
};

/** その日の主セットの負荷。重量が混ざった日も、サイクルは一番強い負荷で数える。 */
function topWeight(ex: Exercise, sets: readonly SetRecord[]): number {
  return sets.reduce(
    (best, s) => (loadRank(ex, s.weight) > loadRank(ex, best) ? s.weight : best),
    sets[0]!.weight,
  );
}

/** このサイクルに属するセッション（新しい順）。主セットの負荷が同じ日が続く範囲。 */
function currentRun(ex: Exercise, history: ExerciseHistory): { date: IsoDate; sets: SetRecord[] }[] {
  const run: { date: IsoDate; sets: SetRecord[] }[] = [];
  for (const h of history) {
    const sets = doneSets(h.entry);
    if (sets.length === 0) continue;
    const weight = run[0]?.sets[0]?.weight ?? topWeight(ex, sets);
    if (topWeight(ex, sets) !== weight) break;
    // ウォームアップ等で別の重量が混ざった日は、主セットぶんだけをサイクルに数える
    run.push({ date: h.date, sets: sets.filter((s) => s.weight === weight) });
  }
  return run;
}

export function cycleOf(ex: Exercise, history: ExerciseHistory): Cycle | null {
  const run = currentRun(ex, history);
  const current = run[0];
  if (!current) return null;

  const weight = current.sets[0]!.weight;
  const reachedOf = (sets: readonly SetRecord[]) => sets.filter((s) => s.reps >= ex.repMax).length;
  const reached = reachedOf(current.sets);
  const needed = Math.max(1, ex.sets);
  const graduated = current.sets.length >= needed && current.sets.every((s) => s.reps >= ex.repMax);
  const bestBefore = Math.max(0, ...run.slice(1).map((r) => reachedOf(r.sets)));

  let next: number | null = null;
  if (graduated) {
    if (ex.loadMode === 'assist') next = weight > 0 ? Math.max(0, round(weight - ex.increment)) : null;
    else if (ex.loadMode === 'bodyweight') next = weight > 0 ? round(weight + ex.increment) : null;
    else next = round(weight + ex.increment);
  }

  return {
    weight,
    sessions: run.length,
    setCount: current.sets.length,
    targetSets: Math.max(needed, current.sets.length),
    reached,
    reachedPeak: run.length >= 2 && reached > bestBefore,
    graduated,
    next,
    latestDate: current.date,
  };
}

/**
 * サイクルの 1 行。目標ではなく現在地の言い方にする。
 *
 * 上限到達は **1 セットでも到達してから**出す。0/3 を出すと、それは今日の未達の
 * 表示になってしまう（そこを数えさせない、がこのアプリの前提）。
 *
 * @param viewDate 見ている日。卒業がその日より前なら「前回」を頭に付ける
 */
export function cycleLine(ex: Exercise, c: Cycle, viewDate: IsoDate = c.latestDate): string {
  // 回数は「回」で言う（レップという語を画面に出さない。祝福や差分の表記と揃える）
  if (c.graduated) {
    const when = c.latestDate < viewDate ? '前回卒業' : '卒業';
    const done = `全 ${c.setCount} セットで上限の ${ex.repMax} 回に到達`;
    if (c.next === null) {
      if (ex.loadMode === 'bodyweight') return `${when} — ${done}。加重するか、難度を上げた種目へ`;
      return `${when} — ${done}`;
    }
    if (ex.loadMode === 'assist' && c.next === 0) return `${when} — ${done}。次は補助なしでいける`;
    return `${when} — ${done}。次は ${loadWord(ex, c.next)}`;
  }
  const head = `${loadWord(ex, c.weight)}で ${c.sessions} セッション目`;
  if (c.reached === 0) return head;
  const range = `上限の ${ex.repMax} 回に ${c.reached}/${c.targetSets} セット到達`;
  return c.reachedPeak ? `${head} · ${range} — この負荷で最多` : `${head} · ${range}`;
}

export type GraduationShift = {
  /** 卒業した負荷。 */
  from: string;
  /** 次の負荷。数字で進めない（自重のまま卒業など）ときは null。 */
  to: string | null;
  /** 動く量（`+2.5kg` / `補助 −2.5kg`）。to が無ければ null。 */
  gain: string | null;
};

/**
 * 卒業の「どこから → どこへ」。祝福の画面が横に並べて出すための素材。
 *
 * 記録更新の祝福（records.ts の previous → now）と同じ形にしてある。
 * アシストは減った量を「補助 −2.5kg」と言う——+ を付けると増えたように読める。
 * 補助 0 は「補助なし」。数字の 0kg より、到達した状態の名前のほうが伝わる。
 */
export function graduationShift(ex: Exercise, c: Cycle): GraduationShift {
  const from = loadWord(ex, c.weight);
  if (c.next === null) return { from, to: null, gain: null };
  if (ex.loadMode === 'assist') {
    return {
      from,
      to: c.next === 0 ? '補助なし' : loadWord(ex, c.next),
      gain: `補助 −${format(round(c.weight - c.next))}kg`,
    };
  }
  return { from, to: loadWord(ex, c.next), gain: `+${format(round(c.next - c.weight))}kg` };
}

/** 停滞と見なすまでの「伸びが無い」連続回数。週 2 回やる種目なら約 2 週間ぶん。 */
export const STALL_SESSIONS = 4;

export type Stall = {
  weight: number;
  /** この負荷で何回やったか。 */
  sessions: number;
  /** 伸びが止まってから何回か。 */
  since: number;
};

/**
 * 停滞の検出。同じ負荷での 1 日の合計レップが、直近 STALL_SESSIONS 回にわたって
 * サイクル内の最高を上回っていなければ停滞と見なす。
 *
 * 「同じ数字を繰り返している」のも停滞に含める。自己ベスト系の判定
 * （sessionsSinceBest）は同じ数字を出し続ける限り「ベストに居る」と言うので、
 * ここでは使えない——卒業に近づいていないことを拾いたい。
 *
 * 卒業した回があれば停滞ではない（次の負荷へ進む番で、種目を疑う場面ではない）。
 * 負荷を上げればサイクルごと数え直すので、この判定は自然にリセットされる。
 */
export function stallOf(ex: Exercise, history: ExerciseHistory): Stall | null {
  const cycle = cycleOf(ex, history);
  if (cycle === null || cycle.graduated) return null;

  const totals = currentRun(ex, history)
    .map((r) => r.sets.reduce((n, s) => n + s.reps, 0))
    .reverse(); // 古い順

  let max = -Infinity;
  let lastProgress = 0;
  totals.forEach((total, i) => {
    if (total > max) {
      max = total;
      lastProgress = i;
    }
  });
  const since = totals.length - 1 - lastProgress;
  return since >= STALL_SESSIONS ? { weight: cycle.weight, sessions: cycle.sessions, since } : null;
}
