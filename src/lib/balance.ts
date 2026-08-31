/**
 * バランス。種目を部位・押す/引く・前面/背面の 3 軸に分類し、
 * 直近数週間の実施セット数で偏りを見る。
 *
 * ## なぜ 3 軸か
 *
 * 目的はボディメイクなので、偏りは重量の停滞より先に見た目に出る。
 * 部位だけでは「肩はやっているが後ろだけ」「押す種目ばかり」を拾えないので、
 * 動作の向き（押す/引く）と体の面（前面/背面）を別の軸として持つ。
 *
 * ## 分類のしかた
 *
 * 主働筋（guide の先頭）から引く。押す/引くは本来種目の性質だが、主働筋が
 * 決まればほぼ決まる（大胸筋が主働で引く種目は無い）。自分で作った種目には
 * guide が無いので部位から引ける範囲で引き、決められない軸は「その他」に入れる。
 * その他は比率の分母に入れない——分からないものをどちらかに数えると、
 * 偏りの検出そのものが信用できなくなる。
 *
 * ## 出し方
 *
 * 数えて見せるだけで、直せとは言わない。あえて寄せている期間（弱点部位を
 * 集中的にやる週など）は正しい運用なので、偏り＝悪ではない。指摘は
 * 「少ない側がどれだけ少ないか」の事実だけにする。
 */

import { shiftDays } from './calendar.ts';
import { guideFor } from './presets.ts';
import {
  MUSCLE_GROUP_KEYS,
  doneSets,
  type Exercise,
  type IsoDate,
  type Muscle,
  type MuscleGroup,
  type Session,
} from './types.ts';

export type Motion = 'push' | 'pull' | 'other';
export type Plane = 'front' | 'back' | 'other';

export type Axes = { motion: Motion; plane: Plane };

/**
 * 筋肉 → 2 軸。体幹は押す/引くのどちらでもないので other。
 * 上腕は面で分かれる（二頭は前・三頭は後ろ）が、動作は逆になる
 * （二頭は引く・三頭は押す）——前面=押す、ではない。
 */
const MUSCLE_AXES: Record<Muscle, Axes> = {
  chest: { motion: 'push', plane: 'front' },
  frontDelt: { motion: 'push', plane: 'front' },
  sideDelt: { motion: 'push', plane: 'front' },
  rearDelt: { motion: 'pull', plane: 'back' },
  lats: { motion: 'pull', plane: 'back' },
  traps: { motion: 'pull', plane: 'back' },
  midBack: { motion: 'pull', plane: 'back' },
  biceps: { motion: 'pull', plane: 'front' },
  triceps: { motion: 'push', plane: 'back' },
  forearm: { motion: 'pull', plane: 'front' },
  abs: { motion: 'other', plane: 'front' },
  obliques: { motion: 'other', plane: 'front' },
  lowerBack: { motion: 'pull', plane: 'back' },
  // 臀・ハムはヒップヒンジ（引く動作）の主働。脚でも四頭（押す）とは軸が逆
  glutes: { motion: 'pull', plane: 'back' },
  quads: { motion: 'push', plane: 'front' },
  hams: { motion: 'pull', plane: 'back' },
  calves: { motion: 'push', plane: 'back' },
};

/**
 * guide が無い（自分で作った）種目のための、部位からの引き当て。
 * 腕はカールか押し下げか、脚はスクワットかレッグカールか、名前からは
 * 決められないので other にする。
 */
const GROUP_AXES: Record<MuscleGroup, Axes> = {
  chest: { motion: 'push', plane: 'front' },
  back: { motion: 'pull', plane: 'back' },
  shoulders: { motion: 'push', plane: 'front' },
  arms: { motion: 'other', plane: 'other' },
  legs: { motion: 'other', plane: 'other' },
  core: { motion: 'other', plane: 'front' },
};

export function axesOf(ex: Exercise): Axes {
  const primary = guideFor(ex.id)?.primary[0];
  return primary !== undefined ? MUSCLE_AXES[primary] : GROUP_AXES[ex.group];
}

/**
 * 集計の窓。4 週なのは、週 2 回の種目で 8 回ぶん——1 回サボっても比率が壊れず、
 * かといって昔のメニューの偏りを引きずらない長さ。
 */
export const BALANCE_WEEKS = 4;

export type Balance = {
  /** 窓の中で実施した総セット数。0 なら何も言えない。 */
  totalSets: number;
  groups: Record<MuscleGroup, number>;
  motion: Record<Motion, number>;
  plane: Record<Plane, number>;
};

export function balanceOf(
  sessions: readonly Session[],
  exercises: readonly Exercise[],
  today: IsoDate,
  weeks: number = BALANCE_WEEKS,
): Balance {
  const from = shiftDays(today, -(weeks * 7 - 1));
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const groups = Object.fromEntries(MUSCLE_GROUP_KEYS.map((g) => [g, 0])) as Record<MuscleGroup, number>;
  const motion: Record<Motion, number> = { push: 0, pull: 0, other: 0 };
  const plane: Record<Plane, number> = { front: 0, back: 0, other: 0 };
  let totalSets = 0;

  for (const session of sessions) {
    if (session.date < from || session.date > today) continue;
    for (const entry of session.entries) {
      const ex = byId.get(entry.exerciseId);
      if (!ex) continue;
      const count = doneSets(entry).length;
      if (count === 0) continue;
      const axes = axesOf(ex);
      totalSets += count;
      groups[ex.group] += count;
      motion[axes.motion] += count;
      plane[axes.plane] += count;
    }
  }
  return { totalSets, groups, motion, plane };
}

/** 偏りと言い始める比率。 */
const SKEW_RATIO = 2;
/** それを言うために要る最低セット数。数セットの週に比率を言っても意味が無い。 */
const SKEW_MIN_SETS = 12;

/**
 * 偏りの指摘。無ければ空。
 *
 * 片側がもう片側の 2 倍を超えたときだけ、少ない側を事実として言う。
 * 「直せ」とは言わない——あえて寄せている期間は正しい運用なので、
 * 気づけることと責められることを分ける。
 */
export function skewLines(b: Balance): string[] {
  const lines: string[] = [];
  const check = (a: number, z: number, nameA: string, nameZ: string) => {
    if (a + z < SKEW_MIN_SETS) return;
    if (a >= z * SKEW_RATIO) lines.push(`${nameZ}が${nameA}の半分以下（${nameA} ${a} / ${nameZ} ${z} セット）`);
    else if (z >= a * SKEW_RATIO) lines.push(`${nameA}が${nameZ}の半分以下（${nameA} ${a} / ${nameZ} ${z} セット）`);
  };
  check(b.motion.push, b.motion.pull, '押す', '引く');
  check(b.plane.front, b.plane.back, '前面', '背面');
  return lines;
}
