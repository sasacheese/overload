import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findRecords, RECORD_ORDER, type RecordInput } from './records.ts';
import type { ExerciseHistory } from './progression.ts';
import { exerciseId, isoDate, type Exercise, type SessionEntry } from './types.ts';

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
const assist: Exercise = { ...bench, id: exerciseId('assist'), group: 'back', loadMode: 'assist' };

function entry(sets: readonly (readonly [number, number])[]): SessionEntry {
  return {
    exerciseId: bench.id,
    sets: sets.map(([weight, reps]) => ({ weight, reps, done: true, note: '' })),
    note: '',
  };
}

function past(days: readonly (readonly (readonly [number, number])[])[], bodyWeight = 0): ExerciseHistory {
  // 新しい順に並べる（呼ぶ側の約束）
  return days.map((sets, i) => ({
    date: isoDate(`2026-08-${String(20 - i).padStart(2, '0')}`),
    entry: entry(sets),
    bodyWeight,
  }));
}

function input(over: Partial<RecordInput> & Pick<RecordInput, 'exercise' | 'today' | 'history'>): RecordInput {
  return { todaySessionVolume: 0, bestPastSessionVolume: 0, ...over };
}

test('記録が無い日は何も出さない', () => {
  const none = findRecords(
    input({ exercise: bench, today: { entry: entry([]), bodyWeight: 0 }, history: past([[[60, 8]]]) }),
  );
  assert.deepEqual(none, []);
});

test('推定 1RM の更新を拾う', () => {
  const found = findRecords(
    input({ exercise: bench, today: { entry: entry([[62.5, 8]]), bodyWeight: 0 }, history: past([[[60, 8]]]) }),
  );
  const e1rm = found.find((r) => r.kind === 'e1rm');
  assert.ok(e1rm);
  assert.equal(e1rm.detail, '推定 1RM 79.2kg');
  assert.equal(e1rm.previous, '76kg');
});

test('同じ重量でレップが増えたら拾う（重量アップと同格に扱う）', () => {
  const found = findRecords(
    input({ exercise: bench, today: { entry: entry([[60, 9]]), bodyWeight: 0 }, history: past([[[60, 8]]]) }),
  );
  const gain = found.find((r) => r.kind === 'reps-at-load');
  assert.ok(gain);
  assert.equal(gain.detail, '60kg × 9 回');
  assert.equal(gain.previous, '8 回');
});

test('その重量を初めてやった日はレップ更新にしない（比較対象が無い）', () => {
  const found = findRecords(
    input({ exercise: bench, today: { entry: entry([[65, 5]]), bodyWeight: 0 }, history: past([[[60, 8]]]) }),
  );
  assert.equal(found.find((r) => r.kind === 'reps-at-load'), undefined);
});

test('重量を上げてレップが落ちた日は、推定 1RM は動かないが重量更新は出る', () => {
  const found = findRecords(
    input({ exercise: bench, today: { entry: entry([[62.5, 5]]), bodyWeight: 0 }, history: past([[[60, 10]]]) }),
  );
  // 推定 1RM は重量 × レップなので、レップを落とすと動かない
  assert.equal(found.find((r) => r.kind === 'e1rm'), undefined);
  // 持てなかった重さを持ったことは負荷の前進なので、そちらで拾う
  const load = found.find((r) => r.kind === 'top-load');
  assert.ok(load);
  assert.equal(load.detail, '62.5kg');
  assert.equal(load.previous, '60kg');
  assert.equal(load.gain, '+2.5kg');
});

test('重量が変わらない日は重量更新を出さない', () => {
  const found = findRecords(
    input({ exercise: bench, today: { entry: entry([[60, 10]]), bodyWeight: 0 }, history: past([[[60, 8]]]) }),
  );
  assert.equal(found.find((r) => r.kind === 'top-load'), undefined);
});

test('アシストは補助を減らした日が重量更新（増えたようには書かない）', () => {
  const found = findRecords(
    input({
      exercise: assist,
      today: { entry: entry([[27.5, 6]]), bodyWeight: 70 },
      history: past([[[30, 6]]], 70),
    }),
  );
  const load = found.find((r) => r.kind === 'top-load');
  assert.ok(load);
  assert.equal(load.detail, '補助 27.5kg');
  assert.equal(load.previous, '補助 30kg');
  assert.equal(load.gain, '補助 −2.5kg');
});

test('同じ重量でセットの組み方が良くなった日を拾う（単一セットの最高は変わらない）', () => {
  // これまで 30kg × 10 + 10 + 8（計 28）→ 今日 30kg × 10 + 10 + 10（計 30）
  const today = { entry: entry([[30, 10], [30, 10], [30, 10]]), bodyWeight: 0 };
  const history = past([[[30, 10], [30, 10], [30, 8]]]);
  const found = findRecords(input({ exercise: bench, today, history }));

  // 単一セットの最高レップも推定 1RM もセット数も動いていない
  assert.equal(found.find((r) => r.kind === 'reps-at-load'), undefined);
  assert.equal(found.find((r) => r.kind === 'e1rm'), undefined);
  assert.equal(found.find((r) => r.kind === 'sets'), undefined);

  const total = found.find((r) => r.kind === 'reps-at-load-total');
  assert.ok(total, '同じ重量で 2 レップ多いのに何も祝われない');
  assert.equal(total.detail, '30kg 計 30 回');
  assert.equal(total.previous, '計 28 回');
  assert.equal(total.gain, '+2 回');
});

test('総レップは日をまたいで足さない（通算ではなく 1 日の積み上げを比べる）', () => {
  // 過去 2 日で 30kg を 20 レップずつ。今日 24 レップなら更新
  const today = { entry: entry([[30, 12], [30, 12]]), bodyWeight: 0 };
  const history = past([
    [[30, 10], [30, 10]],
    [[30, 10], [30, 10]],
  ]);
  const total = findRecords(input({ exercise: bench, today, history })).find(
    (r) => r.kind === 'reps-at-load-total',
  );
  assert.ok(total);
  assert.equal(total.previous, '計 20 回');
});

test('その重量を初めてやった日は総レップ更新にしない', () => {
  const found = findRecords(
    input({ exercise: bench, today: { entry: entry([[65, 5]]), bodyWeight: 0 }, history: past([[[60, 8]]]) }),
  );
  assert.equal(found.find((r) => r.kind === 'reps-at-load-total'), undefined);
});

test('増分はどの種類にも付く（引き算を人にさせない）', () => {
  const found = findRecords(
    input({
      exercise: bench,
      today: { entry: entry([[60, 9], [60, 9], [60, 9], [60, 9]]), bodyWeight: 0 },
      history: past([[[60, 8], [60, 8], [60, 8]]]),
      todaySessionVolume: 2160,
      bestPastSessionVolume: 1440,
    }),
  );
  for (const record of found) {
    if (record.previous === null) continue;
    assert.ok(record.gain, `${record.kind} に増分が無い`);
    assert.ok(record.gain.includes('+') || record.gain.includes('−'), `${record.kind}: ${record.gain}`);
  }
  assert.equal(found.find((r) => r.kind === 'sets')?.gain, '+1 セット');
  assert.equal(found.find((r) => r.kind === 'session-volume')?.gain, '+720kg');
});

test('レップ数で測る種目は単一セットの最高レップを拾う', () => {
  const today = { entry: { ...entry([[0, 14]]), exerciseId: roller.id }, bodyWeight: 0 };
  const found = findRecords(input({ exercise: roller, today, history: past([[[0, 12]]]) }));
  const reps = found.find((r) => r.kind === 'reps');
  assert.ok(reps);
  assert.equal(reps.detail, '14 回');
  assert.equal(reps.previous, '12 回');
  // 重さで測っていないので推定 1RM の更新は出ない
  assert.equal(found.find((r) => r.kind === 'e1rm'), undefined);
});

test('アシスト種目は補助を下げた日に更新が出る', () => {
  const found = findRecords(
    input({
      exercise: assist,
      today: { entry: entry([[27.5, 6]]), bodyWeight: 70 },
      history: past([[[30, 6]]], 70),
    }),
  );
  // 実効負荷 42.5kg > 40kg
  assert.ok(found.some((r) => r.kind === 'e1rm'));
});

test('セット数の更新を拾う。初回は出さない', () => {
  const more = findRecords(
    input({
      exercise: bench,
      today: { entry: entry([[60, 8], [60, 8], [60, 8], [60, 8]]), bodyWeight: 0 },
      history: past([[[60, 8], [60, 8], [60, 8]]]),
    }),
  );
  const sets = more.find((r) => r.kind === 'sets');
  assert.ok(sets);
  assert.equal(sets.detail, '4 セット');
  assert.equal(sets.previous, '3 セット');

  const first = findRecords(
    input({ exercise: bench, today: { entry: entry([[60, 8]]), bodyWeight: 0 }, history: [] }),
  );
  assert.equal(first.find((r) => r.kind === 'sets'), undefined);
});

test('種目の総量とセッションの総量の更新を拾う', () => {
  const found = findRecords(
    input({
      exercise: bench,
      today: { entry: entry([[60, 9], [60, 9]]), bodyWeight: 0 },
      history: past([[[60, 8], [60, 8]]]),
      todaySessionVolume: 2000,
      bestPastSessionVolume: 1800,
    }),
  );
  assert.ok(found.some((r) => r.kind === 'exercise-volume'));
  assert.ok(found.some((r) => r.kind === 'session-volume'));
});

test('比較できる過去が無ければ総量の更新は出さない（初日を更新と呼ばない）', () => {
  const found = findRecords(
    input({
      exercise: bench,
      today: { entry: entry([[60, 8]]), bodyWeight: 0 },
      history: [],
      todaySessionVolume: 480,
      bestPastSessionVolume: 0,
    }),
  );
  assert.equal(found.find((r) => r.kind === 'exercise-volume'), undefined);
  assert.equal(found.find((r) => r.kind === 'session-volume'), undefined);
});

test('複数当たったときは強い順に並ぶ（呼ぶ側は先頭だけ出せばよい）', () => {
  const found = findRecords(
    input({
      exercise: bench,
      today: { entry: entry([[60, 9], [60, 9], [60, 9], [60, 9]]), bodyWeight: 0 },
      history: past([[[60, 8], [60, 8], [60, 8]]]),
      todaySessionVolume: 2160,
      bestPastSessionVolume: 1440,
    }),
  );
  assert.ok(found.length >= 4);
  const ranks = found.map((r) => RECORD_ORDER.indexOf(r.kind));
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  assert.equal(found[0]?.kind, 'e1rm');
});

test('初めての種目でも到達点そのものは祝う（previous は null）', () => {
  const found = findRecords(
    input({ exercise: bench, today: { entry: entry([[40, 10]]), bodyWeight: 0 }, history: [] }),
  );
  assert.equal(found[0]?.kind, 'e1rm');
  assert.equal(found[0]?.previous, null);
});
