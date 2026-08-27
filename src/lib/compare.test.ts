import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareSeries, tooShortCount } from './compare.ts';
import { presetExercises } from './presets.ts';
import { isoDate, type Exercise, type Session } from './types.ts';

const bench = presetExercises().find((e) => e.id === 'bench-press')!;
const squat = presetExercises().find((e) => e.id === 'squat')!;

function day(date: string, entries: readonly { ex: Exercise; sets: readonly (readonly [number, number])[] }[]): Session {
  return {
    date: isoDate(date),
    entries: entries.map(({ ex, sets }) => ({
      exerciseId: ex.id,
      sets: sets.map(([weight, reps]) => ({ weight, reps, done: true, note: '' })),
      note: '',
    })),
    note: '',
    bodyWeight: 70,
    finishedAt: 0,
    updatedAt: 0,
  };
}

test('compareSeries: 初日を 100 とした指数にそろえる', () => {
  const sessions = [
    day('2026-08-01', [{ ex: bench, sets: [[60, 10]] }]),
    day('2026-08-08', [{ ex: bench, sets: [[66, 10]] }]),
  ];
  const [series] = compareSeries(sessions, [bench]);
  assert.ok(series);
  assert.equal(series.points.length, 2);
  assert.equal(series.points[0]!.index, 100);
  // 到達点が 10% 伸びれば指数も 110。実測の比がそのまま出る
  assert.ok(Math.abs(series.points[1]!.index - 110) < 0.001);
  assert.ok(Math.abs(series.growth - 0.1) < 0.001);
});

test('compareSeries: 桁の違う種目が同じ土俵に乗る', () => {
  // 100kg の種目と 10kg の種目。伸び方が同じなら指数も同じになる
  const light = { ...bench, id: bench.id, name: '軽い種目' };
  const sessions = [
    day('2026-08-01', [{ ex: squat, sets: [[100, 5]] }]),
    day('2026-08-08', [{ ex: squat, sets: [[110, 5]] }]),
  ];
  const lightSessions = [
    day('2026-08-01', [{ ex: light, sets: [[10, 5]] }]),
    day('2026-08-08', [{ ex: light, sets: [[11, 5]] }]),
  ];
  const heavy = compareSeries(sessions, [squat])[0]!;
  const small = compareSeries(lightSessions, [light])[0]!;
  assert.ok(Math.abs(heavy.points[1]!.index - small.points[1]!.index) < 0.001);
  // 実測は捨てない。凡例に出す元の数字は残る
  assert.equal(heavy.latest > small.latest, true);
});

test('compareSeries: 伸びた順に並ぶ（凡例は上から読む）', () => {
  const sessions = [
    day('2026-08-01', [
      { ex: bench, sets: [[60, 10]] },
      { ex: squat, sets: [[100, 10]] },
    ]),
    day('2026-08-08', [
      { ex: bench, sets: [[63, 10]] }, // +5%
      { ex: squat, sets: [[120, 10]] }, // +20%
    ]),
  ];
  const series = compareSeries(sessions, [bench, squat]);
  assert.deepEqual(series.map((s) => s.id), [squat.id, bench.id]);
});

test('compareSeries: 1 日しか記録が無い種目は線にしない', () => {
  const sessions = [day('2026-08-01', [{ ex: bench, sets: [[60, 10]] }])];
  assert.deepEqual(compareSeries(sessions, [bench]), []);
  // 出せなかったことは数として分かるようにする
  assert.equal(tooShortCount(sessions, [bench]), 1);
});

test('tooShortCount: 一度もやっていない種目は数えない', () => {
  // 「まだ 2 日ぶん無い」と「そもそも記録が無い」は別のこと
  const sessions = [day('2026-08-01', [{ ex: bench, sets: [[60, 10]] }])];
  assert.equal(tooShortCount(sessions, [bench, squat]), 1);
});

test('compareSeries: 初日の到達点が 0 の種目は基準が作れないので出さない', () => {
  const chin = presetExercises().find((e) => e.loadMode === 'bodyweight');
  if (!chin) return;
  const zero = [
    day('2026-08-01', [{ ex: chin, sets: [[0, 0]] }]),
    day('2026-08-08', [{ ex: chin, sets: [[0, 5]] }]),
  ];
  assert.deepEqual(compareSeries(zero, [chin]), []);
});
