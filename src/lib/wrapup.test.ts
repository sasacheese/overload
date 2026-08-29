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

test('wrapUp: 記録更新は種目ごとに全部拾う。同じ種類が重複はしない', () => {
  const past = session('2026-08-19', [{ id: bench.id, sets: [[60, 8], [60, 8], [60, 8]] }]);
  // 3 セットとも重量を上げている。セットごとに拾うと同じ種類が 3 つ並んでしまう
  const today = session('2026-08-21', [{ id: bench.id, sets: [[62.5, 8], [62.5, 8], [62.5, 8]] }]);
  const w = wrapUp(today, exercises, [past, today]);
  const perExercise = w.records.filter((r) => r.exerciseName !== null);

  assert.ok(perExercise.every((r) => r.exerciseName === bench.name));
  // 到達点・重量・種目の総量が動いている。強い順に並ぶ
  assert.deepEqual(
    perExercise.map((r) => r.achievement.kind),
    ['e1rm', 'top-load', 'exercise-volume'],
  );
  // 種類は 1 つずつ（3 セットぶん並ばない）
  assert.equal(new Set(perExercise.map((r) => r.achievement.kind)).size, perExercise.length);
  // 「動いたもの」の数は種目 1 つ + その日ぜんぶ の 2 つ
  assert.equal(w.progressed, 2);
});

test('wrapUp: やった種目の明細を出す（重量とレップがそのまま読める）', () => {
  const today = session('2026-08-21', [
    { id: bench.id, sets: [[60, 10], [60, 10], [65, 8]] },
    { id: squat.id, sets: [[80, 5]] },
  ]);
  const w = wrapUp(today, exercises, [today]);
  assert.equal(w.entries.length, 2);
  assert.equal(w.entries[0]?.exerciseName, bench.name);
  // 同じ重量が続くところはまとめ、変わったところで区切る
  assert.equal(w.entries[0]?.sets, '60kg × 10 · 10  /  65kg × 8');
  assert.equal(w.entries[0]?.setCount, 3);
  assert.equal(w.entries[0]?.reps, 28);
  assert.equal(w.entries[0]?.volume, 60 * 10 + 60 * 10 + 65 * 8);
  assert.equal(w.entries[1]?.sets, '80kg × 5');
});

test('wrapUp: ✓ の無い種目は明細に出さない', () => {
  const today = session('2026-08-21', [{ id: bench.id, sets: [[60, 8]] }]);
  today.entries.push({
    exerciseId: squat.id,
    sets: [{ weight: 80, reps: 5, done: false, note: '' }],
    note: '',
  });
  const w = wrapUp(today, exercises, [today]);
  assert.deepEqual(w.entries.map((e) => e.exerciseName), [bench.name]);
});

test('wrapUp: 種目の明細に、その種目で動いた更新がぶら下がる', () => {
  const past = session('2026-08-19', [
    { id: bench.id, sets: [[60, 8]] },
    { id: squat.id, sets: [[80, 5]] },
  ]);
  // ベンチだけ伸ばし、スクワットは前回と同じ
  const today = session('2026-08-21', [
    { id: bench.id, sets: [[60, 10]] },
    { id: squat.id, sets: [[80, 5]] },
  ]);
  const w = wrapUp(today, exercises, [past, today]);
  const benchEntry = w.entries.find((e) => e.exerciseName === bench.name);
  const squatEntry = w.entries.find((e) => e.exerciseName === squat.name);
  assert.ok(benchEntry && benchEntry.records.length > 0);
  assert.ok(squatEntry && squatEntry.records.length === 0);
});

test('wrapUp: 同じ重さでレップを積み増した日もまとめに出る', () => {
  // 冒頭の例。単一セットの最高も推定 1RM も動いていないが、前進している
  const past = session('2026-08-19', [{ id: bench.id, sets: [[30, 10], [30, 10], [30, 8]] }]);
  const today = session('2026-08-21', [{ id: bench.id, sets: [[30, 10], [30, 10], [30, 10]] }]);
  const w = wrapUp(today, exercises, [past, today]);
  const kinds = w.records.map((r) => r.achievement.kind);
  assert.ok(kinds.includes('reps-at-load-total'), '同じ重さで 2 レップ多いのに何も出ない');
  assert.ok(w.progressed >= 1);
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

  // 総量が前回に届かない伸び方なら、動いたのは種目 1 つぶん
  const heavier = session('2026-08-21', [{ id: bench.id, sets: [[70, 5]] }]);
  const w = wrapUp(heavier, exercises, [past, heavier]);
  assert.equal(w.progressed, 1);
  assert.equal(w.praise, '今日、記録が動いた。');
});

test('wrapUp: 更新も伸びも無い日は、続いていることを言う（責めない）', () => {
  // 前回と完全に同じ。更新は 1 つも出ない
  const past = session('2026-08-19', [{ id: bench.id, sets: [[60, 8]] }]);
  const same = session('2026-08-21', [{ id: bench.id, sets: [[60, 8]] }]);
  const w = wrapUp(same, exercises, [past, same]);
  assert.equal(w.records.length, 0);
  assert.equal(w.progressed, 0);
  assert.equal(w.praise, '今週 2 回目。');
});

test('wrapUp: 空いた週から戻った最初の日は、記録更新より復帰を言う', () => {
  // 8/3 週にやって、8/10 週が丸ごと空き、8/17 週に戻った。しかも重量を上げていて
  // 記録更新もある——それでも、その日に言うのは戻ったこと
  const before = session('2026-08-04', [{ id: bench.id, sets: [[60, 8]] }]);
  const back = session('2026-08-18', [{ id: bench.id, sets: [[62.5, 8]] }]);
  const w = wrapUp(back, exercises, [before, back]);
  assert.equal(w.comeback, true);
  assert.equal(w.praise, '空いた週から、戻ってきた。');

  // 同じ週の 2 回目からは通常どおり（毎回言うと安売りになる）
  const second = session('2026-08-20', [{ id: bench.id, sets: [[62.5, 8]] }]);
  const w2 = wrapUp(second, exercises, [before, back, second]);
  assert.equal(w2.comeback, false);

  // 先週もやっていれば復帰ではない
  const usual = session('2026-08-11', [{ id: bench.id, sets: [[60, 8]] }]);
  const w3 = wrapUp(back, exercises, [before, usual, back]);
  assert.equal(w3.comeback, false);
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
