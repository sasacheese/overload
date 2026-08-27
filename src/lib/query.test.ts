import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  bestSeries,
  bodyWeightOn,
  byRecentUse,
  exerciseHistory,
  exerciseTotals,
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
    finishedAt: 0,
    updatedAt: 0,
  };
}

const sessions = [
  session('2026-08-01', [[57.5, 10]]),
  session('2026-08-08', [[60, 8]]),
  session('2026-08-15', [[60, 10]]),
];

test('sortedSessions: 新しい順。記録の無いセッションは落とす', () => {
  const empty: Session = { date: isoDate('2026-08-20'), entries: [], note: '', bodyWeight: 0, finishedAt: 0, updatedAt: 0 };
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
    finishedAt: 0,
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
    finishedAt: 0,
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

test('bodyWeightOn: その日 → それより前の直近 → 無ければ 0', () => {
  const withWeights: Session[] = [
    { ...session('2026-08-01', [[60, 8]]), bodyWeight: 71 },
    { ...session('2026-08-05', [[60, 8]]), bodyWeight: 0 },
    { ...session('2026-08-10', [[60, 8]]), bodyWeight: 70 },
  ];
  assert.equal(bodyWeightOn(withWeights, isoDate('2026-08-01')), 71); // その日
  assert.equal(bodyWeightOn(withWeights, isoDate('2026-08-05')), 71); // 直近に遡る
  assert.equal(bodyWeightOn(withWeights, isoDate('2026-08-07')), 71); // セッションが無い日
  assert.equal(bodyWeightOn(withWeights, isoDate('2026-08-10')), 70);
  assert.equal(bodyWeightOn(withWeights, isoDate('2026-09-01')), 70); // 最後の値を引き継ぐ
  assert.equal(bodyWeightOn(withWeights, isoDate('2026-07-20')), 0); // それより前に記録が無い
  assert.equal(bodyWeightOn([], isoDate('2026-08-01')), 0);
});

test('bodyWeightOn: 体重だけの日（休養日）も引き当てに使う', () => {
  const restDay: Session = { date: isoDate('2026-08-12'), entries: [], note: '', bodyWeight: 69.4, finishedAt: 0, updatedAt: 0 };
  const list = [{ ...session('2026-08-10', [[60, 8]]), bodyWeight: 70 }, restDay];
  // トレーニングの記録は無いが体重はある日。ここを飛ばすと古い値を使ってしまう
  assert.equal(bodyWeightOn(list, isoDate('2026-08-14')), 69.4);
});

test('sortedSessions: 同じ配列を渡せば同じ結果を返す（使い回しても内容が変わらない）', () => {
  const list = [session('2026-08-01', [[60, 8]]), session('2026-08-10', [[60, 8]])];
  const a = sortedSessions(list);
  const b = sortedSessions(list);
  assert.deepEqual(a.map((s) => s.date), b.map((s) => s.date));
  // 別の配列（中身は同じ）でも結果は同じ
  assert.deepEqual(sortedSessions([...list]).map((s) => s.date), a.map((s) => s.date));
});

test('exerciseTotals: やった日数・セット数・合計レップを数える', () => {
  const list = [session('2026-08-01', [[60, 8], [60, 7]]), session('2026-08-05', [[62.5, 6], [62.5, 6], [60, 9]])];
  assert.deepEqual(exerciseTotals(exerciseHistory(list, bench.id)), { days: 2, sets: 5, reps: 36 });
});

test('exerciseTotals: ✓ の付いていないセットは通算に入れない', () => {
  // 並べただけの行で数が増えると、「やった量」ではなく「開いた回数」になってしまう
  const half: Session = {
    date: isoDate('2026-08-01'),
    entries: [
      {
        exerciseId: bench.id,
        sets: [
          { weight: 60, reps: 8, done: true, note: '' },
          { weight: 60, reps: 8, done: false, note: '' },
        ],
        note: '',
      },
    ],
    note: '',
    bodyWeight: 0,
    finishedAt: 0,
    updatedAt: 0,
  };
  assert.deepEqual(exerciseTotals(exerciseHistory([half], bench.id)), { days: 1, sets: 1, reps: 8 });
});

test('exerciseTotals: 記録が無ければ全部 0', () => {
  assert.deepEqual(exerciseTotals(exerciseHistory([], bench.id)), { days: 0, sets: 0, reps: 0 });
});
