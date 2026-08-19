import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  bestSeries,
  byRecentUse,
  exerciseHistory,
  lastPerformed,
  previousEntry,
  sessionGroups,
  sessionVolume,
  sortedSessions,
} from './query.ts';
import { presetExercises } from './presets.ts';
import { exerciseId, isoDate, type Session } from './types.ts';

const bench = presetExercises().find((e) => e.id === 'bench-press')!;
const squat = presetExercises().find((e) => e.id === 'squat')!;

function session(date: string, sets: readonly (readonly [number, number])[], id = bench.id): Session {
  return {
    date: isoDate(date),
    entries: [{ exerciseId: id, sets: sets.map(([weight, reps]) => ({ weight, reps, done: true, note: '' })), note: '' }],
    note: '',
    bodyWeight: 0,
    updatedAt: 0,
  };
}

const sessions = [
  session('2026-08-01', [[57.5, 10]]),
  session('2026-08-08', [[60, 8]]),
  session('2026-08-15', [[60, 10]]),
];

test('sortedSessions: 新しい順。記録の無いセッションは落とす', () => {
  const empty: Session = { date: isoDate('2026-08-20'), entries: [], note: '', bodyWeight: 0, updatedAt: 0 };
  const sorted = sortedSessions([...sessions, empty]);
  assert.deepEqual(sorted.map((s) => s.date), ['2026-08-15', '2026-08-08', '2026-08-01']);
});

test('exerciseHistory: その種目をやった日だけ', () => {
  const withSquat = [...sessions, session('2026-08-18', [[100, 5]], squat.id)];
  assert.equal(exerciseHistory(withSquat, bench.id).length, 3);
  assert.equal(exerciseHistory(withSquat, squat.id).length, 1);
  assert.equal(exerciseHistory(withSquat, exerciseId('unknown')).length, 0);
});

test('previousEntry: 指定日より前の直近。同じ日は含めない', () => {
  assert.equal(previousEntry(sessions, bench.id, isoDate('2026-08-15'))?.date, '2026-08-08');
  assert.equal(previousEntry(sessions, bench.id, isoDate('2026-08-16'))?.date, '2026-08-15');
  assert.equal(previousEntry(sessions, bench.id, isoDate('2026-08-01')), undefined);
});

test('bestSeries: 古い順で推定 1RM が並ぶ', () => {
  const series = bestSeries(bench, exerciseHistory(sessions, bench.id));
  assert.deepEqual(series.map((s) => s.date), ['2026-08-01', '2026-08-08', '2026-08-15']);
  assert.ok(series[2]!.best > series[1]!.best);
});

test('sessionGroups / sessionVolume: 自重種目はボリュームに足さない', () => {
  const exercises = presetExercises();
  const mixed: Session = {
    date: isoDate('2026-08-18'),
    entries: [
      { exerciseId: bench.id, sets: [{ weight: 60, reps: 10, done: true, note: '' }], note: '' },
      { exerciseId: exerciseId('ab-roller'), sets: [{ weight: 0, reps: 10, done: true, note: '' }], note: '' },
    ],
    note: '',
    bodyWeight: 0,
    updatedAt: 0,
  };
  assert.deepEqual(sessionGroups(mixed, exercises).sort(), ['chest', 'core']);
  assert.equal(sessionVolume(mixed, exercises), 600);
});

test('lastPerformed: 種目ごとの最終実施日。未実施セットだけの日は数えない', () => {
  const withPending: Session = {
    date: isoDate('2026-08-20'),
    entries: [{ exerciseId: bench.id, sets: [{ weight: 65, reps: 5, done: false, note: '' }], note: '' }],
    note: '',
    bodyWeight: 0,
    updatedAt: 0,
  };
  const map = lastPerformed([...sessions, withPending]);
  assert.equal(map.get(bench.id), '2026-08-15');
  assert.equal(map.get(squat.id), undefined);
});

test('byRecentUse: 最近やった順。未実施はプリセットの並びを保つ', () => {
  const exercises = presetExercises();
  const sorted = byRecentUse(exercises, lastPerformed(sessions));
  assert.equal(sorted[0]?.id, bench.id); // 唯一やっている種目
  // 残りはプリセットの並び（胸 → 背中 → 脚 …）のまま
  const rest = sorted.slice(1).map((e) => e.id);
  assert.deepEqual(rest.slice(0, 3), ['incline-press', 'smith-incline-bench-press', 'dumbbell-press']);
});

test('byRecentUse: 独自に足した種目は末尾に回る', () => {
  const custom = { ...bench, id: exerciseId('custom-zzz'), name: 'なにか' };
  const sorted = byRecentUse([custom, ...presetExercises()], new Map());
  assert.equal(sorted.at(-1)?.id, 'custom-zzz');
});
