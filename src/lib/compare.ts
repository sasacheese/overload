/**
 * 種目どうしを 1 枚のグラフに並べるための下ごしらえ。
 *
 * ## なぜ指数にするのか
 *
 * 記録している数字は種目ごとに桁が違う——スクワットの 100kg とサイドレイズの 8kg を
 * 同じ縦軸に置くと、軽い種目は全部が底に張り付いて線にならない。かといって種目ごとに
 * 軸を分けると、それは 1 枚のグラフではなく小さなグラフの寄せ集めになる。
 *
 * そこで**その種目の初日を 100 とした指数**に直す。100 より上なら初日より伸びた、
 * という 1 本の物差しになり、8kg の種目と 100kg の種目が同じ土俵に乗る。
 * このアプリが見ているのは絶対値ではなく前進の量なので、指数のほうが素直でもある。
 *
 * 元の数字（kg・回）を捨てるわけではない。凡例には実測を添えるし、種目 1 つぶんの
 * 推移は種目の面（ExerciseRecords）に実寸のまま残っている。
 *
 * ## 何を線にするか
 *
 * 種目カードや一覧のスパークラインと同じ**到達点**（重さで測る種目は推定 1RM、
 * 自重でレップだけの種目は最高レップ）。ここだけ別の指標を使うと、同じ種目の線が
 * 画面ごとに違う形になる。
 */

import { metrics, type ExerciseHistory } from './progression.ts';
import { exerciseHistory, sortedSessions } from './query.ts';
import type { Exercise, ExerciseId, IsoDate, MuscleGroup, Session } from './types.ts';

/** 線が引けるようになる最小の記録日数。1 日では傾きが無い。 */
export const MIN_DAYS = 2;

export type ComparePoint = {
  date: IsoDate;
  /** その日の到達点。実測（kg か レップ）。 */
  value: number;
  /** 初日を 100 とした指数。 */
  index: number;
};

export type CompareSeries = {
  id: ExerciseId;
  name: string;
  group: MuscleGroup;
  /** 実測の単位。凡例に添える。 */
  unit: 'kg' | '回';
  /** 古い順。 */
  points: readonly ComparePoint[];
  /** 初日と直近の実測。 */
  first: number;
  latest: number;
  /** 初日からの伸び（0.12 なら +12%）。 */
  growth: number;
};

/**
 * この種目を重さで測れているか。
 *
 * 履歴で決める（種目カードと同じ理由）。今日の入力の有無で単位が入れ替わると、
 * 同じ種目の線が日によって別の物差しになる。
 */
function byLoadOf(ex: Exercise, history: ExerciseHistory): boolean {
  return history[0] ? metrics(ex, history[0]).byLoad : ex.loadMode !== 'bodyweight';
}

/**
 * 記録のある種目を、同じ尺度（初日 = 100）の線にして返す。
 *
 * 伸びた順に並べる。凡例は上から読むものなので、いちばん動いた種目が先頭に来る。
 *
 * 除くのは 2 つだけ。**記録が 1 日しか無い種目**（線にならない）と、
 * **初日の到達点が 0 の種目**（0 を基準にすると指数が出せない。加重なしの自重種目で
 * レップも 0 の日など）。除いた数は呼ぶ側が数えられるよう、判定をここに閉じている。
 */
export function compareSeries(sessions: readonly Session[], exercises: readonly Exercise[]): CompareSeries[] {
  // sortedSessions のメモ化に乗せるため、種目ごとに同じ配列を渡す
  const sorted = sortedSessions(sessions);
  const out: CompareSeries[] = [];

  for (const ex of exercises) {
    const history = exerciseHistory(sorted, ex.id);
    if (history.length < MIN_DAYS) continue;

    // exerciseHistory は新しい順。線は古い順に引く
    const oldestFirst = [...history].reverse();
    const values = oldestFirst.map((h) => ({ date: h.date, value: metrics(ex, h).best }));
    const first = values[0]!.value;
    if (first <= 0) continue;

    const points = values.map((v) => ({ ...v, index: (v.value / first) * 100 }));
    const latest = points.at(-1)!.value;
    out.push({
      id: ex.id,
      name: ex.name,
      group: ex.group,
      unit: byLoadOf(ex, history) ? 'kg' : '回',
      points,
      first,
      latest,
      growth: latest / first - 1,
    });
  }

  return out.sort((a, b) => b.growth - a.growth);
}

/** 線に足りなかった種目の数。「まだ出ていない」ことを画面で言うために数える。 */
export function tooShortCount(sessions: readonly Session[], exercises: readonly Exercise[]): number {
  const sorted = sortedSessions(sessions);
  return exercises.filter((ex) => {
    const n = exerciseHistory(sorted, ex.id).length;
    return n > 0 && n < MIN_DAYS;
  }).length;
}
