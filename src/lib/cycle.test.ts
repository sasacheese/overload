import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STALL_SESSIONS, cycleLine, cycleOf, stallOf } from './cycle.ts';
import type { ExerciseHistory } from './progression.ts';
import { exerciseId, isoDate, type Exercise } from './types.ts';

const bench: Exercise = {
  id: exerciseId('bench'),
  name: 'ベンチプレス',
  group: 'chest',
  loadMode: 'weight',
  tips: '',
  increment: 2.5,
  repMin: 8,
  repMax: 10,
  sets: 3,
  restSec: 120,
  archived: false,
  updatedAt: 0,
};

const dips: Exercise = { ...bench, id: exerciseId('dips'), loadMode: 'bodyweight' };
const chin: Exercise = { ...bench, id: exerciseId('assist-chin'), loadMode: 'assist' };

/** 新しい順の履歴。[[重量, レップ], ...] を日付つきで並べる。 */
function history(days: readonly (readonly (readonly [number, number])[])[]): ExerciseHistory {
  return days.map((sets, i) => ({
    date: isoDate(`2026-08-${String(28 - i).padStart(2, '0')}`),
    bodyWeight: 70,
    entry: {
      exerciseId: bench.id,
      sets: sets.map(([weight, reps]) => ({ weight, reps, done: true, note: '' })),
      note: '',
    },
  }));
}

test('cycleOf: 履歴が無ければ null', () => {
  assert.equal(cycleOf(bench, []), null);
});

test('cycleOf: 同じ重量が続く範囲だけを数える。別の重量を挟んだら数え直す', () => {
  const h = history([
    [[60, 8], [60, 8], [60, 8]],
    [[60, 9], [60, 8], [60, 8]],
    [[57.5, 10], [57.5, 10], [57.5, 10]], // 前のサイクル
    [[57.5, 9], [57.5, 9], [57.5, 8]],
  ]);
  const c = cycleOf(bench, h)!;
  assert.equal(c.weight, 60);
  assert.equal(c.sessions, 2);
  assert.equal(c.graduated, false);
});

test('cycleOf: 上限到達セット数と、その分母（規定セット数と実施数の大きい方）', () => {
  const c = cycleOf(bench, history([[[60, 10], [60, 10], [60, 8]]]))!;
  assert.equal(c.reached, 2);
  assert.equal(c.targetSets, 3);

  // 4 セットやった日は分母も 4
  const more = cycleOf(bench, history([[[60, 10], [60, 10], [60, 10], [60, 8]]]))!;
  assert.equal(more.reached, 3);
  assert.equal(more.targetSets, 4);
});

test('cycleOf: 全セット上限到達で卒業。次の重量は刻みから', () => {
  const c = cycleOf(bench, history([[[60, 10], [60, 10], [60, 10]]]))!;
  assert.equal(c.graduated, true);
  assert.equal(c.next, 62.5);
});

test('cycleOf: 規定セット数に足りなければ、全部上限でも卒業ではない', () => {
  const c = cycleOf(bench, history([[[60, 10], [60, 10]]]))!;
  assert.equal(c.graduated, false);
  assert.equal(c.next, null);
});

test('cycleOf: アシストは補助を減らす方向へ進む。0 で止まる', () => {
  const c = cycleOf(chin, history([[[2, 10], [2, 10], [2, 10]]]))!;
  assert.equal(c.graduated, true);
  assert.equal(c.next, 0);
});

test('cycleOf: 自重のまま卒業したら next は無い（加重か難度で進む）', () => {
  const c = cycleOf(dips, history([[[0, 10], [0, 10], [0, 10]]]))!;
  assert.equal(c.graduated, true);
  assert.equal(c.next, null);
});

test('cycleOf: ウォームアップの軽い重量が混ざっても、主セットの重量で数える', () => {
  const c = cycleOf(bench, history([
    [[40, 10], [60, 9], [60, 8], [60, 8]],
    [[60, 8], [60, 8], [60, 8]],
  ]))!;
  assert.equal(c.weight, 60);
  assert.equal(c.sessions, 2);
  assert.equal(c.setCount, 3); // 40kg のセットはサイクルに入れない
});

test('cycleOf: 上限到達セット数がサイクル最多を更新したら reachedPeak', () => {
  const up = cycleOf(bench, history([
    [[60, 10], [60, 10], [60, 8]],
    [[60, 10], [60, 8], [60, 8]],
  ]))!;
  assert.equal(up.reachedPeak, true);

  // 初回は「最多」と言わない（比べる相手がいない）
  const first = cycleOf(bench, history([[[60, 10], [60, 8], [60, 8]]]))!;
  assert.equal(first.reachedPeak, false);
});

test('cycleLine: 目標ではなく現在地。0 到達の日は分数を出さない（未達の表示を作らない）', () => {
  const none = cycleOf(bench, history([[[60, 8], [60, 8], [60, 8]]]))!;
  assert.equal(cycleLine(bench, none), '60kgで 1 回目');

  const some = cycleOf(bench, history([
    [[60, 10], [60, 8], [60, 8]],
    [[60, 8], [60, 8], [60, 8]],
  ]))!;
  assert.equal(cycleLine(bench, some), '60kgで 2 回目 · 上限 10 レップ到達 1/3 セット — この負荷で最多');
});

test('cycleLine: 卒業は次の負荷まで言う。前の日の卒業は「前回卒業」', () => {
  const c = cycleOf(bench, history([[[60, 10], [60, 10], [60, 10]]]))!;
  assert.equal(cycleLine(bench, c), '卒業 — 全 3 セットで上限 10 レップ到達。次は 62.5kg');
  assert.equal(
    cycleLine(bench, c, isoDate('2026-08-29')),
    '前回卒業 — 全 3 セットで上限 10 レップ到達。次は 62.5kg',
  );
});

test('cycleLine: アシストの卒業。補助 0 は「補助なし」と言う', () => {
  const some = cycleOf(chin, history([[[20, 10], [20, 10], [20, 10]]]))!;
  assert.equal(cycleLine(chin, some), '卒業 — 全 3 セットで上限 10 レップ到達。次は 補助 17.5kg');

  const zero = cycleOf(chin, history([[[2, 10], [2, 10], [2, 10]]]))!;
  assert.equal(cycleLine(chin, zero), '卒業 — 全 3 セットで上限 10 レップ到達。次は補助なしでいける');
});

test('cycleLine: 自重の卒業は加重か難度を言う', () => {
  const c = cycleOf(dips, history([[[0, 10], [0, 10], [0, 10]]]))!;
  assert.equal(cycleLine(dips, c), '卒業 — 全 3 セットで上限 10 レップ到達。加重するか、難度を上げた種目へ');
});

test('stallOf: 合計レップが伸びない回が続いたら停滞。同じ数字の繰り返しも停滞', () => {
  const flat = [[60, 8], [60, 8], [60, 8]] as const;
  const h = history(Array.from({ length: STALL_SESSIONS + 1 }, () => flat));
  const s = stallOf(bench, h)!;
  assert.equal(s.weight, 60);
  assert.equal(s.sessions, STALL_SESSIONS + 1);
  assert.equal(s.since, STALL_SESSIONS);
});

test('stallOf: 合計レップが伸びていれば停滞ではない', () => {
  const h = history([
    [[60, 9], [60, 8], [60, 8]], // 25 レップ（伸びた）
    [[60, 8], [60, 8], [60, 8]],
    [[60, 8], [60, 8], [60, 8]],
    [[60, 8], [60, 8], [60, 8]],
    [[60, 8], [60, 8], [60, 8]],
  ]);
  assert.equal(stallOf(bench, h), null);
});

test('stallOf: 卒業した回があれば停滞ではない（次の負荷へ進む番）', () => {
  const grad = [[60, 10], [60, 10], [60, 10]] as const;
  const h = history(Array.from({ length: STALL_SESSIONS + 1 }, () => grad));
  assert.equal(stallOf(bench, h), null);
});

test('stallOf: 重量を上げればサイクルごと数え直される', () => {
  const h = history([
    [[62.5, 8], [62.5, 8], [62.5, 8]],
    [[60, 8], [60, 8], [60, 8]],
    [[60, 8], [60, 8], [60, 8]],
    [[60, 8], [60, 8], [60, 8]],
    [[60, 8], [60, 8], [60, 8]],
    [[60, 8], [60, 8], [60, 8]],
  ]);
  assert.equal(stallOf(bench, h), null);
});
