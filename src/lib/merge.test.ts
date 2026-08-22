import assert from 'node:assert/strict';
import test from 'node:test';
import { changedSessions, mergeImpact, mergedInto } from './merge.ts';
import { exerciseId, isoDate, type Session, type SessionEntry } from './types.ts';

const MINE = exerciseId('custom-leg-raise');
const PRESET = exerciseId('leg-raise');
const OTHER = exerciseId('squat');
const NOW = 1_800_000_000_000;

function entry(id: string, reps: readonly number[], note = ''): SessionEntry {
  return {
    exerciseId: exerciseId(id),
    sets: reps.map((r) => ({ weight: 0, reps: r, done: true, note: '' })),
    note,
  };
}

function session(date: string, entries: SessionEntry[]): Session {
  return { date: isoDate(date), entries, note: '', bodyWeight: 70, finishedAt: 0, updatedAt: 1 };
}

test('mergedInto: 移す先が無い日は、行の持ち主だけ書き換える', () => {
  const before = [session('2026-08-10', [entry(OTHER, [8]), entry(MINE, [12, 12, 10])])];
  const after = mergedInto(before, MINE, PRESET, NOW);
  assert.equal(after[0]?.entries.length, 2);
  // 並び順はそのまま。中身も減らない
  assert.deepEqual(
    after[0]?.entries.map((e) => e.exerciseId),
    [OTHER, PRESET],
  );
  assert.deepEqual(after[0]?.entries[1]?.sets.map((s) => s.reps), [12, 12, 10]);
  assert.equal(after[0]?.updatedAt, NOW);
});

test('mergedInto: 同じ日に両方あれば、セットを後ろに継ぎ足す', () => {
  const before = [session('2026-08-10', [entry(PRESET, [10, 10], '先にあった'), entry(MINE, [12], '手で作った')])];
  const after = mergedInto(before, MINE, PRESET, NOW);
  const merged = after[0]!.entries;
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.exerciseId, PRESET);
  assert.deepEqual(merged[0]?.sets.map((s) => s.reps), [10, 10, 12]);
  // メモはどちらも捨てない
  assert.equal(merged[0]?.note, '先にあった\n手で作った');
});

test('mergedInto: 元の種目に触っていない日はそのまま返す（同一性を壊さない）', () => {
  const untouched = session('2026-08-08', [entry(OTHER, [8])]);
  const touched = session('2026-08-10', [entry(MINE, [12])]);
  const before = [untouched, touched];
  const after = mergedInto(before, MINE, PRESET, NOW);
  assert.equal(after[0], untouched, '無関係な日が作り直されている');
  assert.notEqual(after[1], touched);
  assert.deepEqual(changedSessions(before, after), [after[1]]);
});

test('mergedInto: 自分自身へのまとめは何も変えない', () => {
  const before = [session('2026-08-10', [entry(MINE, [12])])];
  const after = mergedInto(before, MINE, MINE, NOW);
  assert.deepEqual(after, before);
});

test('mergeImpact: 動く量を日数・セット数・継ぎ足しになる日で出す', () => {
  const sessions = [
    session('2026-08-06', [entry(MINE, [12, 12])]),
    session('2026-08-08', [entry(OTHER, [8])]),
    session('2026-08-10', [entry(PRESET, [10]), entry(MINE, [12, 11, 10])]),
  ];
  assert.deepEqual(mergeImpact(sessions, MINE, PRESET), { days: 2, sets: 5, collisions: 1 });
  assert.deepEqual(mergeImpact(sessions, OTHER, PRESET), { days: 1, sets: 1, collisions: 0 });
});

test('mergeImpact: ✓ の付いていないセットは数に入れない', () => {
  const half: SessionEntry = {
    exerciseId: MINE,
    sets: [
      { weight: 0, reps: 12, done: true, note: '' },
      { weight: 0, reps: 12, done: false, note: '' },
    ],
    note: '',
  };
  assert.deepEqual(mergeImpact([session('2026-08-10', [half])], MINE, PRESET), {
    days: 1,
    sets: 1,
    collisions: 0,
  });
});
