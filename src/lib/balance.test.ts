import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BALANCE_WEEKS, axesOf, balanceOf, skewLines, type Balance } from './balance.ts';
import { presetExercises } from './presets.ts';
import { exerciseId, isoDate, type Exercise, type Session } from './types.ts';

const presets = presetExercises();
const by = (id: string): Exercise => presets.find((e) => e.id === exerciseId(id))!;

const custom: Exercise = {
  id: exerciseId('custom-xyz'),
  name: '自作の腕種目',
  group: 'arms',
  loadMode: 'weight',
  tips: '',
  increment: 2.5,
  repMin: 8,
  repMax: 12,
  sets: 3,
  restSec: 90,
  archived: false,
  updatedAt: 0,
};

test('axesOf: プリセットは主働筋から引く', () => {
  assert.deepEqual(axesOf(by('bench-press')), { motion: 'push', plane: 'front' });
  assert.deepEqual(axesOf(by('lat-pulldown')), { motion: 'pull', plane: 'back' });
  // 三頭は面と動作が逆になる例（後面だが押す）
  assert.deepEqual(axesOf(by('cable-pushdown')), { motion: 'push', plane: 'back' });
  // 体幹は押す/引くのどちらでもない
  assert.equal(axesOf(by('leg-raise')).motion, 'other');
});

test('axesOf: guide の無い種目は部位から。決められない軸は other', () => {
  assert.deepEqual(axesOf(custom), { motion: 'other', plane: 'other' });
  assert.deepEqual(axesOf({ ...custom, group: 'chest' }), { motion: 'push', plane: 'front' });
});

function session(date: string, id: string, sets: number): Session {
  return {
    date: isoDate(date),
    entries: [
      {
        exerciseId: exerciseId(id),
        sets: Array.from({ length: sets }, () => ({ weight: 60, reps: 8, done: true, note: '' })),
        note: '',
      },
    ],
    note: '',
    bodyWeight: 0,
    finishedAt: 0,
    updatedAt: 0,
  };
}

test('balanceOf: 窓の中のセット数を 3 軸に足す。窓の外は数えない', () => {
  const today = isoDate('2026-08-29');
  const sessions = [
    session('2026-08-29', 'bench-press', 3), // 押す・前面・胸
    session('2026-08-27', 'lat-pulldown', 3), // 引く・背面・背中
    session('2026-08-02', 'squat', 2), // 窓の中（4 週 = 28 日）
    session('2026-08-01', 'squat', 5), // 窓の外
  ];
  const b = balanceOf(sessions, presets, today);
  assert.equal(BALANCE_WEEKS, 4);
  assert.equal(b.totalSets, 8);
  assert.equal(b.groups.chest, 3);
  assert.equal(b.groups.back, 3);
  assert.equal(b.groups.legs, 2);
  assert.equal(b.motion.push, 5); // ベンチ + スクワット（四頭が主働）
  assert.equal(b.motion.pull, 3);
  assert.equal(b.plane.front, 5);
  assert.equal(b.plane.back, 3);
});

test('balanceOf: 未実施のセットと知らない種目は数えない', () => {
  const today = isoDate('2026-08-29');
  const undone = session('2026-08-29', 'bench-press', 3);
  undone.entries[0]!.sets.forEach((s) => (s.done = false));
  const unknown = session('2026-08-28', 'ghost-exercise', 3);
  const b = balanceOf([undone, unknown], presets, today);
  assert.equal(b.totalSets, 0);
});

function balance(push: number, pull: number, front = 0, back = 0): Balance {
  return {
    totalSets: push + pull,
    groups: { chest: 0, back: 0, shoulders: 0, arms: 0, legs: 0, core: 0 },
    motion: { push, pull, other: 0 },
    plane: { front, back, other: 0 },
  };
}

test('skewLines: 2 倍を超えた偏りだけ、少ない側を事実として言う', () => {
  assert.deepEqual(skewLines(balance(10, 4)), ['引くが押すの半分以下（押す 10 / 引く 4 セット）']);
  assert.deepEqual(skewLines(balance(4, 10)), ['押すが引くの半分以下（押す 4 / 引く 10 セット）']);
  assert.deepEqual(skewLines(balance(8, 6)), []);
});

test('skewLines: セット数が少ないうちは比率を言わない', () => {
  assert.deepEqual(skewLines(balance(8, 3)), []); // 計 11 < 12
});

test('skewLines: 前面/背面も同じ基準で見る', () => {
  assert.deepEqual(skewLines(balance(0, 0, 12, 2)), ['背面が前面の半分以下（前面 12 / 背面 2 セット）']);
});
