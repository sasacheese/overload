/**
 * 記録の集計と比較。UI から独立した純関数だけを置いてテストを書く。
 *
 * 目標の自動設定は持たない。以前はダブルプログレッションで「今日の目標」を出して
 * 入力欄に流し込んでいたが、達成できなかった日に必ず未達が表示される作りになり、
 * 続ける妨げになると判断して外した。いまは入力欄に前回と同じ数字を置くだけで、
 * 前進があったときにだけ祝う（判定は records.ts）。
 *
 * アシストマシンは数字を下げるほど負荷が上がるので、比較の向きが逆になる。
 * 向きの分岐はこのファイルの中に閉じ込め、UI 側では扱わない。
 */

import { doneSets, type Exercise, type IsoDate, type SessionEntry, type SetRecord } from './types.ts';

/** Epley 式の推定 1RM。セット間の比較を 1 つの数に落とすためだけに使う。 */
export function e1rm(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

/**
 * 実際に持ち上げている重さ。
 *
 * assist は「体重 − 補助重量」。体重が未記録のときは 0 を返し、
 * 呼び出し側（metrics）がレップ数だけで測る方に切り替える。
 */
export function loadOf(ex: Exercise, set: SetRecord, bodyWeight: number): number {
  if (ex.loadMode === 'assist') {
    return bodyWeight > 0 ? Math.max(0, bodyWeight - set.weight) : 0;
  }
  return set.weight;
}

/** 記録 1 件ぶんの文脈。アシスト種目の実効負荷は当時の体重で決まる。 */
export type Performance = { entry: SessionEntry; bodyWeight: number };

export type Metrics = {
  /** 総ボリューム。重さで測れないときは総レップ数。 */
  volume: number;
  /** その日の最高到達点。重さで測れないときは 1 セットの最大レップ数。 */
  best: number;
  setCount: number;
  totalReps: number;
  /** 実施セットの最大実効負荷。 */
  topLoad: number;
  /** 重さで測れているか。false ならレップ数で測っている。 */
  byLoad: boolean;
};

const EMPTY: Metrics = { volume: 0, best: 0, setCount: 0, totalReps: 0, topLoad: 0, byLoad: false };

export function metrics(ex: Exercise, performance: Performance | undefined): Metrics {
  const sets = performance ? doneSets(performance.entry) : [];
  if (sets.length === 0) return EMPTY;
  const bodyWeight = performance?.bodyWeight ?? 0;
  const totalReps = sets.reduce((a, s) => a + s.reps, 0);
  const loads = sets.map((s) => loadOf(ex, s, bodyWeight));
  const topLoad = Math.max(...loads);

  // 自重種目、加重なしの自重、体重が未記録のアシスト種目はレップ数で測る
  if (topLoad <= 0) {
    return {
      volume: totalReps,
      best: Math.max(...sets.map((s) => s.reps)),
      setCount: sets.length,
      totalReps,
      topLoad: 0,
      byLoad: false,
    };
  }
  return {
    volume: sets.reduce((a, s, i) => a + loads[i]! * s.reps, 0),
    best: Math.max(...sets.map((s, i) => e1rm(loads[i]!, s.reps))),
    setCount: sets.length,
    totalReps,
    topLoad,
    byLoad: true,
  };
}

/**
 * 入力欄の初期値。前回と同じ数字を置く。
 *
 * ここに「前回 +1 レップ」のような目標を入れると、達成できなかった日が
 * 必ず未達として表示される。前回と同じ数字なら、上げても下げても
 * ただの記録として残る。
 */
export function initialSets(ex: Exercise, prev: SessionEntry | undefined): SetRecord[] {
  const previous = prev ? doneSets(prev) : [];
  if (previous.length === 0) {
    return Array.from({ length: ex.sets }, () => ({ weight: 0, reps: ex.repMin, done: false, note: '' }));
  }
  return previous.map((s) => ({ weight: s.weight, reps: s.reps, done: false, note: '' }));
}

export type DeltaKind = 'up' | 'same' | 'down' | 'new';

export type Delta = { kind: DeltaKind; label: string };

/**
 * 前回の同じセット番号との差。
 *
 * 差を出すだけで、良し悪しは言わない。伸びた場合だけ色を付け、
 * 落ちた場合は無彩色で数字だけ出す（責める表示を作らない）。
 */
export function compareToPrev(ex: Exercise, now: SetRecord, prev: SetRecord | undefined): Delta {
  if (!prev) return { kind: 'new', label: '' };

  const dw = round(now.weight - prev.weight);
  const dr = now.reps - prev.reps;
  if (dw === 0 && dr === 0) return { kind: 'same', label: '±0' };

  const parts: string[] = [];
  if (dw !== 0) {
    const sign = dw > 0 ? '+' : '−';
    // 数字の意味を必ず言う。補助が動いたのか、自重に足したぶんが動いたのか
    const prefix = ex.loadMode === 'assist' ? '補助 ' : ex.loadMode === 'bodyweight' ? '加重 ' : '';
    parts.push(`${prefix}${sign}${format(Math.abs(dw))}kg`);
  }
  if (dr !== 0) parts.push(`${dr > 0 ? '+' : '−'}${Math.abs(dr)}レップ`);

  const after = comparable(ex, now);
  const before = comparable(ex, prev);
  return { kind: after > before ? 'up' : after < before ? 'down' : 'same', label: parts.join(' ') };
}

/**
 * セット同士を比べるための 1 つの数。両辺を必ず同じ式で出す。
 *
 * アシスト種目は体重を知らなくても順序だけは決まる（補助が少ない方が上、
 * 同じならレップが多い方が上）。レップは 1000 未満なので、補助を 1000 倍して
 * 主キーにすれば辞書順の比較になる。
 */
function comparable(ex: Exercise, set: SetRecord): number {
  if (ex.loadMode === 'assist') return -set.weight * 1000 + set.reps;
  return e1rm(set.weight, set.reps) || set.reps;
}

/**
 * 自己ベストから何セッション経ったか。0 なら直近が自己ベスト。
 * 3 以上で「停滞」として扱い、負荷を落とす/レップ範囲を変える判断材料にする。
 */
export function sessionsSinceBest(bestsNewestFirst: readonly number[]): number {
  if (bestsNewestFirst.length === 0) return 0;
  let peak = -Infinity;
  let peakAt = 0;
  bestsNewestFirst.forEach((v, i) => {
    if (v > peak) {
      peak = v;
      peakAt = i;
    }
  });
  return peakAt;
}

export type ExerciseHistory = readonly (Performance & { date: IsoDate })[];

export function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 62.5 → "62.5"、60 → "60"。kg 表示の末尾 .0 を出さない。 */
export function format(n: number): string {
  return String(round(n));
}

/**
 * 到達点の呼び名。
 *
 * 加重した自重種目（バックエクステンションにプレートを抱えるなど）の到達点を
 * 「推定 1RM」と呼ぶと、**その種目を 1 回だけやるときの重さ**に見える。実際に出して
 * いるのは自重に足したぶんの到達点で、自重そのものは数に入っていない。数えていない
 * ものを名前で数えたことにしないため、自重種目だけ語を変える。
 *
 * 重さで測れない日（加重なしの自重）はそもそも到達点がレップなので、呼び名も要らない。
 */
export function peakName(ex: Exercise): string {
  return ex.loadMode === 'bodyweight' ? '到達点' : '推定 1RM';
}

/**
 * 推移の見出し。重さで測れているかは呼ぶ側が決める（今日ではなく履歴で決まる）。
 *
 * 組み立てず 3 つ書き分けているのは、日本語の切れ目が語ごとに違うため
 * （`推定 1RM の推移` には中黒代わりの空きが要るが、`到達点の推移` には要らない）。
 */
export function trendLabel(ex: Exercise, byLoad: boolean): string {
  if (!byLoad) return '最高レップの推移';
  return ex.loadMode === 'bodyweight' ? '到達点の推移' : '推定 1RM の推移';
}

/**
 * 推定値の表示。小数第 1 位まで。
 *
 * 推定 1RM は式から出した目安なので、101.33kg のように小数第 2 位まで出すと
 * 精度を持っているように見えてしまう。かといって整数に丸めると、伸びが
 * 1kg 未満の回に数字が動かず、推移として読めなくなる。
 */
export function formatEstimate(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/**
 * 入力した数字の意味を言葉にする。
 *
 * 「30kg」だけでは、持ち上げた重さなのか、マシンが肩代わりした重さなのか、
 * 自重に足したぶんなのかが分からない。数字を人に見せる場所（祝福・締め・一枚）は
 * 必ずこれを通す。
 */
export function loadWord(ex: Exercise, weight: number): string {
  if (ex.loadMode === 'assist') return `補助 ${format(weight)}kg`;
  if (ex.loadMode === 'bodyweight') return weight === 0 ? '自重' : `加重 ${format(weight)}kg`;
  return `${format(weight)}kg`;
}

/**
 * その日のセットの並びを 1 行にする。「60kg × 10 · 10 · 8」。
 *
 * 同じ重量が続くところはまとめる。セットごとに重量を書くと、3 セット同じ重さの
 * 日でも同じ数字が 3 回並んで、どこで重量が動いたのかが読み取れない。
 * 重量が変わったところだけ区切りが入るので、行の形がその日の組み立てになる。
 */
export function setLine(ex: Exercise, sets: readonly SetRecord[]): string {
  const runs: { weight: number; reps: number[] }[] = [];
  for (const set of sets) {
    const last = runs.at(-1);
    if (last && last.weight === set.weight) last.reps.push(set.reps);
    else runs.push({ weight: set.weight, reps: [set.reps] });
  }
  return runs.map((run) => `${loadWord(ex, run.weight)} × ${run.reps.join(' · ')}`).join('  /  ');
}
