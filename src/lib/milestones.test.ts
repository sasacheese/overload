import assert from 'node:assert/strict';
import { test } from 'node:test';
import { journeyOf, lifetimeTotals, strongestSet, volumeLabel } from './milestones.ts';
import type { ExerciseHistory } from './progression.ts';
import { exerciseId, isoDate, type Exercise, type Session, type SessionEntry } from './types.ts';

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

const assist: Exercise = { ...bench, id: exerciseId('assist'), name: 'アシストチンニング', loadMode: 'assist' };

function entry(id: Exercise['id'], sets: readonly (readonly [number, number])[], done = true): SessionEntry {
  return { exerciseId: id, sets: sets.map(([weight, reps]) => ({ weight, reps, done, note: '' })), note: '' };
}

function session(date: string, entries: SessionEntry[], bodyWeight = 0): Session {
  return { date: isoDate(date), entries, note: '', bodyWeight, finishedAt: 0, updatedAt: 0 };
}

function history(days: readonly (readonly (readonly [number, number])[])[]): ExerciseHistory {
  // 新しい順（exerciseHistory の約束）
  return days.map((sets, i) => ({
    date: isoDate(`2026-08-${String(20 - i).padStart(2, '0')}`),
    entry: entry(bench.id, sets),
    bodyWeight: 0,
  }));
}

test('lifetimeTotals: ✓ のある日だけ数え、総量を足す', () => {
  const sessions = [
    session('2026-08-01', [entry(bench.id, [[60, 10]])]),
    session('2026-08-02', [entry(bench.id, [[60, 10]], false)]), // ✓ なしは数えない
    session('2026-08-03', [entry(bench.id, [[60, 5], [60, 5]])]),
  ];
  const totals = lifetimeTotals(sessions, [bench]);
  assert.equal(totals.days, 2);
  assert.equal(totals.volume, 600 + 600);
});

test('volumeLabel: 10t 以上は t、未満は kg', () => {
  assert.equal(volumeLabel(412_530), '412.5 t');
  assert.equal(volumeLabel(9_800), '9,800 kg');
});

test('strongestSet: 通常は推定 1RM が最大のセット', () => {
  const sets = [
    { weight: 60, reps: 10, done: true, note: '' },
    { weight: 70, reps: 3, done: true, note: '' },
  ];
  // e1rm: 60×(1+10/30)=80 > 70×(1+3/30)=77
  assert.equal(strongestSet(bench, sets)?.weight, 60);
});

test('strongestSet: アシストは補助が少ない方が強い', () => {
  const sets = [
    { weight: 30, reps: 10, done: true, note: '' },
    { weight: 25, reps: 5, done: true, note: '' },
  ];
  assert.equal(strongestSet(assist, sets)?.weight, 25);
});

test('journeyOf: 初日と直近を返し、伸びていれば improved', () => {
  const j = journeyOf(bench, history([[[70, 10]], [[65, 9]], [[60, 8]]]));
  assert.ok(j);
  assert.equal(j.first.label, '60kg × 8');
  assert.equal(j.latest.label, '70kg × 10');
  assert.equal(j.improved, true);
});

test('journeyOf: 1 日ぶんしか無ければ出さない', () => {
  assert.equal(journeyOf(bench, history([[[60, 8]]])), null);
});

test('journeyOf: 落ちていても隠さない（improved が false になるだけ）', () => {
  const j = journeyOf(bench, history([[[50, 8]], [[60, 8]]]));
  assert.ok(j);
  assert.equal(j.improved, false);
});

