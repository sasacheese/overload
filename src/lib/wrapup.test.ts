import assert from 'node:assert/strict';
import test from 'node:test';
import { presetExercises } from './presets.ts';
import { isoDate, type Exercise, type Session } from './types.ts';
import { canFinish, wrapUp } from './wrapup.ts';

const exercises: Exercise[] = presetExercises();
const bench = exercises.find((e) => e.id === 'bench-press')!;
const squat = exercises.find((e) => e.id === 'squat')!;

function session(
  date: string,
  entries: readonly { id: string; sets: readonly (readonly [number, number])[] }[],
): Session {
  return {
    date: isoDate(date),
    entries: entries.map(({ id, sets }) => ({
      exerciseId: id as Exercise['id'],
      sets: sets.map(([weight, reps]) => ({ weight, reps, done: true, note: '' })),
      note: '',
    })),
    note: '',
    bodyWeight: 70,
    finishedAt: 0,
    updatedAt: 0,
  };
}

test('wrapUp: その日の数字を数える', () => {
  const today = session('2026-08-21', [
    { id: bench.id, sets: [[60, 8], [60, 8]] },
    { id: squat.id, sets: [[80, 5]] },
  ]);
  const w = wrapUp(today, exercises, [today]);
  assert.equal(w.sets, 3);
  assert.equal(w.exercises, 2);
  assert.equal(w.reps, 21);
  assert.equal(w.volume, 60 * 8 + 60 * 8 + 80 * 5);
  assert.deepEqual(w.groups, ['chest', 'legs']);
});

test('wrapUp: ✓ の付いていない種目は数に入れない', () => {
  const today = session('2026-08-21', [{ id: bench.id, sets: [[60, 8]] }]);
  today.entries.push({
    exerciseId: squat.id,
    sets: [{ weight: 80, reps: 5, done: false, note: '' }],
    note: '',
  });
  const w = wrapUp(today, exercises, [today]);
  assert.equal(w.exercises, 1);
  assert.equal(w.sets, 1);
});

test('wrapUp: 記録更新は種目ごとに一番強いものを 1 つだけ拾う', () => {
  const past = session('2026-08-19', [{ id: bench.id, sets: [[60, 8], [60, 8], [60, 8]] }]);
  // 3 セットとも重量を上げている。セットごとに拾うと 3 つ並んでしまう
  const today = session('2026-08-21', [{ id: bench.id, sets: [[62.5, 8], [62.5, 8], [62.5, 8]] }]);
  const w = wrapUp(today, exercises, [past, today]);
  const perExercise = w.records.filter((r) => r.exerciseName !== null);
  assert.equal(perExercise.length, 1);
  assert.equal(perExercise[0]?.exerciseName, bench.name);
  assert.equal(perExercise[0]?.achievement.kind, 'e1rm');
});

test('wrapUp: 1 日の総量の更新は種目に属さず 1 回だけ出る', () => {
  const past = session('2026-08-19', [{ id: bench.id, sets: [[60, 8]] }]);
  const today = session('2026-08-21', [
    { id: bench.id, sets: [[60, 8]] },
    { id: squat.id, sets: [[80, 8]] },
  ]);
  const w = wrapUp(today, exercises, [past, today]);
  const whole = w.records.filter((r) => r.exerciseName === null);
  assert.equal(whole.length, 1);
  assert.equal(whole[0]?.achievement.kind, 'session-volume');
});

test('wrapUp: 初日は更新として出さない（比べる過去が無い）', () => {
  const today = session('2026-08-21', [{ id: bench.id, sets: [[60, 8]] }]);
  const w = wrapUp(today, exercises, [today]);
  assert.equal(w.records.filter((r) => r.exerciseName === null).length, 0);
  assert.equal(w.totalDays, 1);
  assert.equal(w.weekCount, 1);
});

test('wrapUp: 前回比は「同じ種目をやった直近の日」と比べる', () => {
  // 分割して回している想定。直前の日（脚）と今日（胸）を並べても意味が無い
  const chestLastWeek = session('2026-08-14', [{ id: bench.id, sets: [[50, 10]] }]);
  const legsYesterday = session('2026-08-20', [{ id: squat.id, sets: [[100, 10], [100, 10], [100, 10]] }]);
  const today = session('2026-08-21', [{ id: bench.id, sets: [[55, 10]] }]);
  const w = wrapUp(today, exercises, [chestLastWeek, legsYesterday, today]);
  // 直前の脚の日（3000kg）ではなく、先週の胸の日（500kg）と比べる
  assert.equal(w.volumeRatio, 550 / 500 - 1);
});

test('wrapUp: 比べる相手がいなければ前回比は出さない', () => {
  const legs = session('2026-08-20', [{ id: squat.id, sets: [[100, 10]] }]);
  const firstChestDay = session('2026-08-21', [{ id: bench.id, sets: [[55, 10]] }]);
  assert.equal(wrapUp(firstChestDay, exercises, [legs, firstChestDay]).volumeRatio, null);
});

test('wrapUp: 重さで測れない日は前回比を出さない', () => {
  const past = session('2026-08-19', [{ id: bench.id, sets: [[50, 10]] }]);
  const today = session('2026-08-21', [{ id: bench.id, sets: [[55, 10]] }]);

  // 重さで測れない日（自重だけ）は比べない
  const roller = exercises.find((e) => e.id === 'ab-roller')!;
  const bodyOnly = session('2026-08-22', [{ id: roller.id, sets: [[0, 12]] }]);
  const w2 = wrapUp(bodyOnly, exercises, [past, today, bodyOnly]);
  assert.equal(w2.volumeRatio, null);
});

test('wrapUp: 一言は強い順。更新があればそれを言う', () => {
  // 重量を上げると、その種目の到達点と 1 日の総量の 2 つが動く
  const past = session('2026-08-19', [{ id: bench.id, sets: [[60, 8]] }]);
  const withRecord = session('2026-08-21', [{ id: bench.id, sets: [[62.5, 8]] }]);
  assert.equal(wrapUp(withRecord, exercises, [past, withRecord]).praise, '記録が 2 つ動いた日。');

  // 総量が前回に届かない伸び方なら、動くのは種目の更新 1 つだけ
  const heavier = session('2026-08-21', [{ id: bench.id, sets: [[70, 5]] }]);
  const w = wrapUp(heavier, exercises, [past, heavier]);
  assert.equal(w.records.length, 1);
  assert.equal(w.praise, '今日、記録が動いた。');
});

test('wrapUp: 更新も伸びも無い日は、続いていることを言う（責めない）', () => {
  // 前回と完全に同じ。更新は 1 つも出ない
  const past = session('2026-08-19', [{ id: bench.id, sets: [[60, 8]] }]);
  const same = session('2026-08-21', [{ id: bench.id, sets: [[60, 8]] }]);
  const w = wrapUp(same, exercises, [past, same]);
  assert.equal(w.records.length, 0);
  assert.equal(w.praise, '今週 2 回目。');
});

test('wrapUp: 同じ週の回数を数える（月曜起点）', () => {
  // 2026-08-17 は月曜。その週に 3 日
  const a = session('2026-08-17', [{ id: bench.id, sets: [[60, 8]] }]);
  const b = session('2026-08-19', [{ id: squat.id, sets: [[80, 8]] }]);
  const c = session('2026-08-21', [{ id: bench.id, sets: [[60, 8]] }]);
  const w = wrapUp(c, exercises, [a, b, c]);
  assert.equal(w.weekCount, 3);
});

test('canFinish: ✓ が 1 つも無い日は締められない', () => {
  const blank = session('2026-08-21', []);
  blank.entries.push({
    exerciseId: bench.id,
    sets: [{ weight: 60, reps: 8, done: false, note: '' }],
    note: '',
  });
  assert.equal(canFinish(blank, exercises), false);
  assert.equal(canFinish(session('2026-08-21', [{ id: bench.id, sets: [[60, 8]] }]), exercises), true);
});
