import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  compareToPrev,
  e1rm,
  formatEstimate,
  initialSets,
  loadOf,
  metrics,
  sessionsSinceBest,
  type Performance,
} from './progression.ts';
import { exerciseId, type Exercise, type SessionEntry, type SetRecord } from './types.ts';

const bench: Exercise = {
  id: exerciseId('bench'),
  name: 'ベンチプレス',
  group: 'chest',
  loadMode: 'weight',
  tips: '',
  increment: 2.5,
  repMin: 8,
  repMax: 12,
  sets: 3,
  restSec: 120,
  archived: false,
  updatedAt: 0,
};

const roller: Exercise = { ...bench, id: exerciseId('roller'), group: 'core', loadMode: 'bodyweight' };
const assist: Exercise = { ...bench, id: exerciseId('assist-chinning'), group: 'back', loadMode: 'assist' };

function entry(sets: readonly (readonly [number, number])[], id = bench.id): SessionEntry {
  return { exerciseId: id, sets: sets.map(([weight, reps]) => ({ weight, reps, done: true, note: '' })), note: '' };
}

function perf(sets: readonly (readonly [number, number])[], bodyWeight = 0, id = bench.id): Performance {
  return { entry: entry(sets, id), bodyWeight };
}

const set = (weight: number, reps: number): SetRecord => ({ weight, reps, done: true, note: '' });

test('e1rm: 1 レップはその重量、0 レップや重量 0 は 0', () => {
  assert.equal(e1rm(100, 1), 100);
  assert.equal(e1rm(60, 10), 60 * (1 + 10 / 30));
  assert.equal(e1rm(60, 0), 0);
  assert.equal(e1rm(0, 10), 0);
});

test('loadOf: アシスト種目は 体重 − 補助重量。体重が無ければ 0', () => {
  assert.equal(loadOf(bench, set(30, 8), 70), 30);
  assert.equal(loadOf(assist, set(30, 8), 70), 40);
  assert.equal(loadOf(assist, set(30, 8), 0), 0);
  // 補助が体重を超えても負にはしない
  assert.equal(loadOf(assist, set(90, 8), 70), 0);
});

test('metrics: 未実施のセットは集計に入らない', () => {
  const e: SessionEntry = {
    exerciseId: bench.id,
    sets: [set(60, 10), { ...set(60, 10), done: false }],
    note: '',
  };
  const m = metrics(bench, { entry: e, bodyWeight: 0 });
  assert.equal(m.volume, 600);
  assert.equal(m.setCount, 1);
  assert.ok(m.byLoad);
});

test('metrics: 自重種目はレップ数で測る', () => {
  const m = metrics(roller, perf([[0, 8], [0, 6]], 0, roller.id));
  assert.equal(m.volume, 14);
  assert.equal(m.best, 8);
  assert.ok(!m.byLoad);
});

test('metrics: アシスト種目は実効負荷で測る', () => {
  // 体重 70kg、補助 30kg → 実際に引いているのは 40kg
  const m = metrics(assist, perf([[30, 8], [30, 7]], 70, assist.id));
  assert.equal(m.volume, 40 * 8 + 40 * 7);
  assert.equal(m.topLoad, 40);
  assert.ok(m.byLoad);
});

test('metrics: 体重が未記録のアシスト種目はレップ数に落として測る', () => {
  const m = metrics(assist, perf([[30, 8], [30, 7]], 0, assist.id));
  assert.equal(m.volume, 15);
  assert.ok(!m.byLoad);
});

test('initialSets: 前回と同じ数字を置く（目標を足さない）', () => {
  const sets = initialSets(bench, entry([[60, 9], [60, 8], [60, 8]]));
  assert.deepEqual(sets, [
    { weight: 60, reps: 9, done: false, note: '' },
    { weight: 60, reps: 8, done: false, note: '' },
    { weight: 60, reps: 8, done: false, note: '' },
  ]);
});

test('initialSets: 前回のセット数をそのまま引き継ぐ', () => {
  assert.equal(initialSets(bench, entry([[60, 9], [60, 8], [60, 8], [50, 12]])).length, 4);
  assert.equal(initialSets(bench, entry([[60, 9]])).length, 1);
});

test('initialSets: 履歴が無ければ標準セット数ぶんの空行', () => {
  const sets = initialSets(bench, undefined);
  assert.equal(sets.length, bench.sets);
  assert.deepEqual(sets[0], { weight: 0, reps: bench.repMin, done: false, note: '' });
});

test('initialSets: 未実施のセットしか無い前回は履歴として扱わない', () => {
  const notDone: SessionEntry = { exerciseId: bench.id, sets: [{ ...set(60, 10), done: false }], note: '' };
  assert.equal(initialSets(bench, notDone).length, bench.sets);
});

test('compareToPrev: 差だけを出す。前回が無ければ何も出さない', () => {
  assert.deepEqual(compareToPrev(bench, set(60, 10), undefined), { kind: 'new', label: '' });
  assert.deepEqual(compareToPrev(bench, set(60, 10), set(60, 10)), { kind: 'same', label: '±0' });
});

test('compareToPrev: 伸びた/落ちたを推定 1RM の順で分ける', () => {
  assert.deepEqual(compareToPrev(bench, set(60, 11), set(60, 10)), { kind: 'up', label: '+1回' });
  assert.deepEqual(compareToPrev(bench, set(62.5, 10), set(60, 10)), { kind: 'up', label: '+2.5kg' });
  assert.deepEqual(compareToPrev(bench, set(60, 9), set(60, 10)), { kind: 'down', label: '−1回' });
  // 重量を上げてレップを落とした場合は推定 1RM で決める
  assert.equal(compareToPrev(bench, set(62.5, 7), set(60, 10)).kind, 'down');
  assert.equal(compareToPrev(bench, set(62.5, 7), set(60, 10)).label, '+2.5kg −3回');
});

test('compareToPrev: アシスト種目は補助が少ない方を伸びたとみなす', () => {
  const better = compareToPrev(assist, set(27.5, 6), set(30, 6));
  assert.equal(better.kind, 'up');
  assert.equal(better.label, '補助 −2.5kg');
  assert.equal(compareToPrev(assist, set(32.5, 6), set(30, 6)).kind, 'down');
});

test('sessionsSinceBest: 自己ベストからの経過セッション数', () => {
  assert.equal(sessionsSinceBest([]), 0);
  assert.equal(sessionsSinceBest([100, 90, 95]), 0);
  assert.equal(sessionsSinceBest([90, 95, 100]), 2);
  assert.equal(sessionsSinceBest([90, 100, 100]), 1);
});

test('formatEstimate: 推定値は小数第 1 位まで', () => {
  assert.equal(formatEstimate(101.3333), '101.3');
  assert.equal(formatEstimate(75), '75');
  assert.equal(formatEstimate(36.666), '36.7');
});
