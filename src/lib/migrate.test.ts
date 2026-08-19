import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeExercise, normalizeSession, normalizeSet } from './migrate.ts';

test('normalizeSet: 後から足した note が無い古い記録も読める', () => {
  assert.deepEqual(normalizeSet({ weight: 60, reps: 10, done: true }), {
    weight: 60,
    reps: 10,
    done: true,
    note: '',
  });
});

test('normalizeSet: 型が壊れていても落ちずに既定値に寄せる', () => {
  assert.deepEqual(normalizeSet({ weight: 'おもい', reps: null, done: 1, note: 42 }), {
    weight: 0,
    reps: 0,
    done: false,
    note: '',
  });
  assert.deepEqual(normalizeSet(undefined), { weight: 0, reps: 0, done: false, note: '' });
});

test('normalizeSession: entries が無ければ空配列', () => {
  assert.deepEqual(normalizeSession({ date: '2026-08-19' }), {
    date: '2026-08-19',
    entries: [],
    note: '',
    bodyWeight: 0,
    updatedAt: 0,
  });
});

test('normalizeSession: 入れ子も揃える', () => {
  const s = normalizeSession({
    date: '2026-08-19',
    entries: [{ exerciseId: 'bench-press', sets: [{ weight: 60, reps: 8, done: true }] }],
    updatedAt: 5,
  });
  assert.equal(s.entries[0]?.note, '');
  assert.equal(s.entries[0]?.sets[0]?.note, '');
  assert.equal(s.updatedAt, 5);
});

test('normalizeExercise: 欠けた設定はプリセットから借りる', () => {
  const e = normalizeExercise({ id: 'bench-press', name: 'ベンチプレス', group: 'chest' });
  assert.equal(e.repMin, 6); // プリセットの値
  assert.equal(e.repMax, 8);
  assert.equal(e.increment, 2.5);
  assert.equal(e.loadMode, 'weight');
  assert.equal(e.tips, '');
  assert.equal(e.updatedAt, 0);
});

test('normalizeExercise: v0.2 までの bodyweight 真偽値も読める', () => {
  const old = normalizeExercise({ id: 'custom-x', name: '自重の何か', group: 'core', bodyweight: true });
  assert.equal(old.loadMode, 'bodyweight');
  // プリセットの loadMode が優先される（保存側に loadMode が無い場合）
  assert.equal(normalizeExercise({ id: 'assist-chinning', name: 'アシストチンニング', group: 'back' }).loadMode, 'assist');
});

test('normalizeExercise: 未知の loadMode は既定に寄せる', () => {
  const e = normalizeExercise({ id: 'custom-y', name: 'なにか', group: 'chest', loadMode: 'ばね' });
  assert.equal(e.loadMode, 'weight');
});

test('normalizeExercise: プリセットに無い種目でも既定値で成立する', () => {
  const e = normalizeExercise({ id: 'custom-x', name: '謎の種目', group: 'よくわからない部位' });
  assert.equal(e.group, 'chest'); // 未知の部位は既定に寄せる
  assert.equal(e.repMin, 8);
  assert.equal(e.sets, 3);
});

test('normalizeExercise: 保存済みの値はプリセットより優先する', () => {
  const e = normalizeExercise({ id: 'bench-press', name: '自分のベンチ', group: 'chest', repMax: 12, tips: 'ラック 8 段目' });
  assert.equal(e.name, '自分のベンチ');
  assert.equal(e.repMax, 12);
  assert.equal(e.tips, 'ラック 8 段目');
});
