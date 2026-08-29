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
 * ## 1 セットだけでなく、その日の積み上げも見る
 *
 * 4 つの手段にはそれぞれ、**1 セットで測る面**と**その日ぶんを合計して測る面**がある。
 * 単発だけを見ていると、次のような日が 1 つも祝われない。
 *
 *     これまで  30kg × 10 + 30kg × 10 + 30kg × 8   （同じ重量で 計 28 レップ）
 *     今日      30kg × 10 + 30kg × 10 + 30kg × 10  （同じ重量で 計 30 レップ）
 *
 * 単一セットの最高レップは 10 のままなので `reps-at-load` は当たらず、推定 1RM も
 * セット数も動かない。だが同じ重さで 2 レップ多く挙げているので明確な前進で、
 * `reps-at-load-total`（同じ重量での 1 日の合計レップ）がこれを拾う。
 *
 * 同じ理由で `top-load`（扱った重量そのもの）も置いてある。推定 1RM は重量とレップの
 * 積なので、重量を上げてレップを落とした日は動かないが、これまで持てなかった重さを
 * 持ったことは負荷の前進そのものなので、別に数える。
 *
 * ## 出し方
 *
 * 当たったものは**全部**返す。何がどう動いたのかを見せるのが目的なので、呼ぶ側は
 * 「一番強い 1 つを主役にして、残りを添える」形で出す。
 * 同じ種類は 1 セッションに 1 回だけ（3 セット全部で更新しても 1 回）。
 *
 * @see https://journals.lww.com/acsm-healthfitness/fulltext/2022/03000/shareable_resource__ten_ways_to_implement_the.17.aspx
 * @see https://pmc.ncbi.nlm.nih.gov/articles/PMC9528903/
 */

import {
  e1rm,
  format,
  formatEstimate,
  loadOf,
  loadRank,
  loadWord,
  metrics,
  peakName,
  type ExerciseHistory,
  type Performance,
} from './progression.ts';
import { doneSets, type Exercise, type SetRecord } from './types.ts';

/** 強い順。呼ぶ側はこの順に受け取る。 */
export const RECORD_ORDER = [
  'e1rm',
  'top-load',
  'reps-at-load',
  'reps',
  'reps-at-load-total',
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
  /**
   * 前の記録からどれだけ動いたか（`+2 レップ`）。previous が無ければ null。
   *
   * detail と previous を引き算すれば出る数だが、**その引き算を人にさせない**ために
   * 別に持つ。「何がどのくらい進歩したのか」がこの 1 語で読めるようにする。
   */
  gain: string | null;
};

const LABEL: Record<RecordKind, string> = {
  e1rm: '最高到達点',
  'top-load': '重量更新',
  'reps-at-load': 'レップ更新',
  reps: 'レップ更新',
  'reps-at-load-total': '総レップ更新',
  sets: 'セット数更新',
  'exercise-volume': '種目の総量更新',
  'session-volume': '1日の総量更新',
};

/** 総量のように桁が大きい数。カンマを入れて整数で出す。 */
function heavy(n: number): string {
  return Math.round(n).toLocaleString('ja-JP');
}

function gainKg(diff: number, show: (n: number) => string = format): string {
  return `+${show(diff)}kg`;
}

function gainCount(diff: number, unit: string): string {
  return `+${diff} ${unit}`;
}

/**
 * その日のセッション全体の総量の更新。
 *
 * 種目ごとの判定（findRecords）から切り離してあるのは、これだけが種目に属さない
 * 記録だから。種目ごとの呼び出しに混ぜると、その日にやった種目の数だけ同じ更新が
 * 出てくる。文言をここに置いておくのは、祝福と締めの画面で言い方を揃えるため。
 */
export function sessionVolumeRecord(today: number, bestPast: number): Achievement | null {
  if (bestPast <= 0 || today <= bestPast) return null;
  return {
    kind: 'session-volume',
    title: LABEL['session-volume'],
    detail: `${heavy(today)}kg`,
    previous: `${heavy(bestPast)}kg`,
    gain: gainKg(today - bestPast, heavy),
  };
}

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

/**
 * その重量での「1 日の合計レップ」の過去最高。やっていなければ undefined。
 *
 * 日をまたいで足さない。比べたいのは 1 日の積み上げ同士であって、通算ではない。
 */
function bestTotalRepsAt(history: ExerciseHistory, weight: number): number | undefined {
  const totals = history
    .map((h) => doneSets(h.entry).filter((s) => s.weight === weight).reduce((n, s) => n + s.reps, 0))
    .filter((n) => n > 0);
  return totals.length === 0 ? undefined : Math.max(...totals);
}

/** 一番強い負荷を扱ったセットの、入力どおりの数字。 */
function topWeight(ex: Exercise, sets: readonly SetRecord[]): number | undefined {
  const first = sets[0];
  if (!first) return undefined;
  return sets.reduce((best, s) => (loadRank(ex, s.weight) > loadRank(ex, best) ? s.weight : best), first.weight);
}

/**
 * 当てはまる記録更新を、強い順に返す。空なら更新なし。
 *
 * 全部返しているのは、何がどう動いたかを並べて見せられるようにするため。
 * 1 つだけ出したい呼び出し（セット直後の祝福の主役）は先頭を採ればよい。
 */
export function findRecords(input: RecordInput): Achievement[] {
  const { exercise, today, history, todaySessionVolume, bestPastSessionVolume } = input;
  const now = metrics(exercise, today);
  if (now.setCount === 0) return [];

  const past = history.map((h) => metrics(exercise, h));
  const sets = doneSets(today.entry);
  const found: Achievement[] = [];

  // ── 1. 最高到達点（重量とレップの組を 1 つの数にした指標）
  if (now.byLoad) {
    const bestPast = Math.max(0, ...past.filter((m) => m.byLoad).map((m) => m.best));
    if (now.best > bestPast) {
      found.push({
        kind: 'e1rm',
        title: LABEL.e1rm,
        detail: `${peakName(exercise)} ${formatEstimate(now.best)}kg`,
        previous: bestPast > 0 ? `${formatEstimate(bestPast)}kg` : null,
        gain: bestPast > 0 ? gainKg(now.best - bestPast, formatEstimate) : null,
      });
    }
  }

  // ── 2. 扱った重量そのもの。重量を上げてレップを落とした日は推定 1RM が動かない
  const nowTop = topWeight(exercise, sets);
  const pastTop = topWeight(exercise, history.flatMap((h) => doneSets(h.entry)));
  if (
    now.byLoad &&
    nowTop !== undefined &&
    pastTop !== undefined &&
    loadRank(exercise, nowTop) > loadRank(exercise, pastTop)
  ) {
    const diff = Math.abs(nowTop - pastTop);
    found.push({
      kind: 'top-load',
      title: LABEL['top-load'],
      detail: loadWord(exercise, nowTop),
      previous: loadWord(exercise, pastTop),
      // アシストは補助が減ったぶんが前進。+ を付けると増えたように読める
      gain: exercise.loadMode === 'assist' ? `補助 −${format(diff)}kg` : gainKg(diff),
    });
  }

  // ── 3. 同じ重量でレップを伸ばした（重量アップと同格の前進）
  const repGains = sets
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
      gain: gainCount(topGain.set.reps - topGain.best, 'レップ'),
    });
  }

  // ── 4. レップ数で測る種目（自重など）の単一セット最高レップ
  if (!now.byLoad) {
    const bestPast = Math.max(0, ...past.filter((m) => !m.byLoad).map((m) => m.best));
    if (now.best > bestPast) {
      found.push({
        kind: 'reps',
        title: LABEL.reps,
        detail: `${now.best} レップ`,
        previous: bestPast > 0 ? `${bestPast} レップ` : null,
        gain: bestPast > 0 ? gainCount(now.best - bestPast, 'レップ') : null,
      });
    }
  }

  /*
   * ── 5. 同じ重量での 1 日の合計レップ
   *
   * 単一セットの最高レップが変わらなくても、同じ重さで多く挙げていれば前進。
   * 冒頭の例（10 + 10 + 8 → 10 + 10 + 10）を拾うのはここ。
   */
  const totalGains = [...new Set(sets.map((s) => s.weight))]
    .map((weight) => ({
      weight,
      now: sets.filter((s) => s.weight === weight).reduce((n, s) => n + s.reps, 0),
      best: bestTotalRepsAt(history, weight),
    }))
    .filter((v): v is { weight: number; now: number; best: number } => v.best !== undefined && v.now > v.best)
    .sort((a, b) => b.now - b.best - (a.now - a.best));
  const topTotal = totalGains[0];
  if (topTotal) {
    found.push({
      kind: 'reps-at-load-total',
      title: LABEL['reps-at-load-total'],
      detail: `${loadWord(exercise, topTotal.weight)} 計 ${topTotal.now} レップ`,
      previous: `計 ${topTotal.best} レップ`,
      gain: gainCount(topTotal.now - topTotal.best, 'レップ'),
    });
  }

  // ── 6. 実施セット数（ACSM が挙げる手段の 1 つ）
  const bestPastSets = Math.max(0, ...past.map((m) => m.setCount));
  if (bestPastSets > 0 && now.setCount > bestPastSets) {
    found.push({
      kind: 'sets',
      title: LABEL.sets,
      detail: `${now.setCount} セット`,
      previous: `${bestPastSets} セット`,
      gain: gainCount(now.setCount - bestPastSets, 'セット'),
    });
  }

  // ── 7. その種目の 1 日の総量
  const bestPastVolume = Math.max(0, ...past.map((m) => m.volume));
  if (bestPastVolume > 0 && now.volume > bestPastVolume) {
    const diff = now.volume - bestPastVolume;
    found.push({
      kind: 'exercise-volume',
      title: LABEL['exercise-volume'],
      detail: now.byLoad ? `${heavy(now.volume)}kg` : `${now.volume} レップ`,
      previous: now.byLoad ? `${heavy(bestPastVolume)}kg` : `${bestPastVolume} レップ`,
      gain: now.byLoad ? gainKg(diff, heavy) : gainCount(diff, 'レップ'),
    });
  }

  // ── 8. その日のセッション全体の総量
  const wholeDay = sessionVolumeRecord(todaySessionVolume, bestPastSessionVolume);
  if (wholeDay) found.push(wholeDay);

  return found.sort((a, b) => RECORD_ORDER.indexOf(a.kind) - RECORD_ORDER.indexOf(b.kind));
}

/** 推定 1RM の計算をこのファイル内でも使えるようにしておく（テスト用の再輸出）。 */
export { e1rm, loadOf };
