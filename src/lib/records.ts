/**
 * 記録の更新を見つける。祝福を出す条件はここだけで決まる。
 *
 * ## 何を「前進」とみなすか
 *
 * ACSM は漸進性過負荷の実装手段を複数挙げている（負荷・レップ数・セット数・
 * ボリューム・density・頻度など）。このアプリが実際に記録しているのは
 * 重量とレップ数、そこから出るセット数とボリュームなので、その 4 つに絞る。
 * 休憩時間や可動域は記録していないので判定できない（できないものを混ぜない）。
 *
 * 重量とレップ数を対等に扱っているのは、8 週間の RCT で「重量を上げる群」と
 * 「重量を固定してレップを伸ばす群」の筋肥大・筋力がほぼ同等だったため。
 * つまり「同じ重量で 1 レップ増えた」は「重量が 2.5kg 増えた」と同格の前進で、
 * 前者だけ祝われないのは設計として間違っている。
 *
 * 逆に、総ボリューム（重量 × レップ）は説明変数として重視されていない
 * （同研究は効果を「努力と実施セット数」に帰属させ、volume load では説明していない）。
 * なので総ボリュームの更新は出すが、上の 2 つより下位に置く。
 *
 * ## 出し方
 *
 * 1 回の ✓ で複数の条件が当たることは普通にあるので、**一番強いものだけ**を出す。
 * 同じ種類は 1 セッションに 1 回だけ（3 セット全部で更新しても 1 回）。
 * 出しすぎると祝福が背景になる。
 *
 * @see https://journals.lww.com/acsm-healthfitness/fulltext/2022/03000/shareable_resource__ten_ways_to_implement_the.17.aspx
 * @see https://pmc.ncbi.nlm.nih.gov/articles/PMC9528903/
 */

import { e1rm, formatEstimate, format, loadOf, metrics, type ExerciseHistory, type Performance } from './progression.ts';
import { doneSets, type Exercise, type SetRecord } from './types.ts';

/** 強い順。この順で最初に当たったものだけを出す。 */
export const RECORD_ORDER = [
  'e1rm',
  'reps-at-load',
  'reps',
  'sets',
  'exercise-volume',
  'session-volume',
] as const;

export type RecordKind = (typeof RECORD_ORDER)[number];

export type Achievement = {
  kind: RecordKind;
  /** 見出しの一言。短くする。 */
  title: string;
  /** 事実 1 行。数字はここに集める。 */
  detail: string;
  /** 前の記録。無ければ null（初めて到達した場合）。 */
  previous: string | null;
};

const LABEL: Record<RecordKind, string> = {
  e1rm: '最高到達点',
  'reps-at-load': 'レップ更新',
  reps: 'レップ更新',
  sets: 'セット数更新',
  'exercise-volume': '種目の総量更新',
  'session-volume': '1日の総量更新',
};

export type RecordInput = {
  exercise: Exercise;
  /** 今日のその種目（✓ を付けた直後の状態）。 */
  today: Performance;
  /** 今日より前の、その種目をやった日（新しい順）。 */
  history: ExerciseHistory;
  /** 今日のセッション全体のボリューム。 */
  todaySessionVolume: number;
  /** 過去のセッション全体のボリュームの最高値。0 なら比較対象なし。 */
  bestPastSessionVolume: number;
};

/** その重量での単一セット最高レップ。過去にその重量をやっていなければ undefined。 */
function bestRepsAt(history: ExerciseHistory, weight: number): number | undefined {
  const reps = history.flatMap((h) => doneSets(h.entry).filter((s) => s.weight === weight).map((s) => s.reps));
  return reps.length === 0 ? undefined : Math.max(...reps);
}

function loadWord(exercise: Exercise, weight: number): string {
  if (exercise.loadMode === 'assist') return `補助 ${format(weight)}kg`;
  if (exercise.loadMode === 'bodyweight' && weight === 0) return '自重';
  return `${format(weight)}kg`;
}

/**
 * 当てはまる記録更新を、強い順に返す。空なら更新なし。
 *
 * 呼ぶ側は先頭だけを出せばよい。全部返しているのは、既に出した種類を
 * 飛ばして次を出すという判断を呼ぶ側でできるようにするため。
 */
export function findRecords(input: RecordInput): Achievement[] {
  const { exercise, today, history, todaySessionVolume, bestPastSessionVolume } = input;
  const now = metrics(exercise, today);
  if (now.setCount === 0) return [];

  const past = history.map((h) => metrics(exercise, h));
  const found: Achievement[] = [];

  // ── 1. 最高到達点（重量とレップの組を 1 つの数にした指標）
  if (now.byLoad) {
    const bestPast = Math.max(0, ...past.filter((m) => m.byLoad).map((m) => m.best));
    if (now.best > bestPast) {
      found.push({
        kind: 'e1rm',
        title: LABEL.e1rm,
        detail: `推定 1RM ${formatEstimate(now.best)}kg`,
        previous: bestPast > 0 ? `${formatEstimate(bestPast)}kg` : null,
      });
    }
  }

  // ── 2. 同じ重量でレップを伸ばした（重量アップと同格の前進）
  const repGains = doneSets(today.entry)
    .map((set) => ({ set, best: bestRepsAt(history, set.weight) }))
    .filter((v): v is { set: SetRecord; best: number } => v.best !== undefined && v.set.reps > v.best)
    .sort((a, b) => b.set.reps - b.best - (a.set.reps - a.best));
  const topGain = repGains[0];
  if (topGain && now.byLoad) {
    found.push({
      kind: 'reps-at-load',
      title: LABEL['reps-at-load'],
      detail: `${loadWord(exercise, topGain.set.weight)} × ${topGain.set.reps} レップ`,
      previous: `${topGain.best} レップ`,
    });
  }

  // ── 3. レップ数で測る種目（自重など）の単一セット最高レップ
  if (!now.byLoad) {
    const bestPast = Math.max(0, ...past.filter((m) => !m.byLoad).map((m) => m.best));
    if (now.best > bestPast) {
      found.push({
        kind: 'reps',
        title: LABEL.reps,
        detail: `${now.best} レップ`,
        previous: bestPast > 0 ? `${bestPast} レップ` : null,
      });
    }
  }

  // ── 4. 実施セット数（ACSM が挙げる手段の 1 つ）
  const bestPastSets = Math.max(0, ...past.map((m) => m.setCount));
  if (bestPastSets > 0 && now.setCount > bestPastSets) {
    found.push({
      kind: 'sets',
      title: LABEL.sets,
      detail: `${now.setCount} セット`,
      previous: `${bestPastSets} セット`,
    });
  }

  // ── 5. その種目の 1 日の総量
  const bestPastVolume = Math.max(0, ...past.map((m) => m.volume));
  if (bestPastVolume > 0 && now.volume > bestPastVolume) {
    found.push({
      kind: 'exercise-volume',
      title: LABEL['exercise-volume'],
      detail: now.byLoad
        ? `${Math.round(now.volume).toLocaleString('ja-JP')}kg`
        : `${now.volume} レップ`,
      previous: now.byLoad
        ? `${Math.round(bestPastVolume).toLocaleString('ja-JP')}kg`
        : `${bestPastVolume} レップ`,
    });
  }

  // ── 6. その日のセッション全体の総量
  if (bestPastSessionVolume > 0 && todaySessionVolume > bestPastSessionVolume) {
    found.push({
      kind: 'session-volume',
      title: LABEL['session-volume'],
      detail: `${Math.round(todaySessionVolume).toLocaleString('ja-JP')}kg`,
      previous: `${Math.round(bestPastSessionVolume).toLocaleString('ja-JP')}kg`,
    });
  }

  return found.sort((a, b) => RECORD_ORDER.indexOf(a.kind) - RECORD_ORDER.indexOf(b.kind));
}

/** 推定 1RM の計算をこのファイル内でも使えるようにしておく（テスト用の再輸出）。 */
export { e1rm, loadOf };
