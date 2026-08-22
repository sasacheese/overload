import assert from 'node:assert/strict';
import test from 'node:test';
import { demoData } from './demo.ts';
import { bodyWeightOn, exerciseHistory, previousEntry, sessionVolume } from './query.ts';
import { findRecords } from './records.ts';
import { doneSets, hasRecord, isoDate } from './types.ts';

const TODAY = isoDate('2026-08-21');

test('demoData: 決定的。同じ日を渡せば同じものができる', () => {
  const a = demoData(TODAY);
  const b = demoData(TODAY);
  assert.deepEqual(a.sessions, b.sessions);
  assert.deepEqual(a.exercises, b.exercises);
});

test('demoData: 全セッションの種目 id が実在する', () => {
  const { exercises, sessions } = demoData(TODAY);
  const known = new Set(exercises.map((e) => e.id as string));
  for (const s of sessions) {
    for (const entry of s.entries) {
      assert.ok(known.has(entry.exerciseId), `${s.date}: 未知の種目 ${entry.exerciseId}`);
    }
  }
});

test('demoData: 今日のセッションが途中の状態で入っている', () => {
  const { sessions } = demoData(TODAY);
  const today = sessions.find((s) => s.date === TODAY);
  assert.ok(today, '今日のセッションが無い');
  assert.equal(today.entries.length, 3, '今日は 3 種目で見せる');
  // 1 セット目だけ ✓。残りは見ている人が押す
  const first = today.entries[0]!;
  assert.equal(first.sets[0]?.done, true);
  assert.equal(first.sets.slice(1).every((s) => !s.done), true);
  // 締めていない（「今日を終える」を押せる状態で見せる）
  assert.equal(today.finishedAt, 0);
  // 体重は未記録。上部の帯に「前回」が出る状態で見せる
  assert.equal(today.bodyWeight, 0);
});

test('demoData: 残りの ✓ を押せば記録更新が出る（祝福まで体験できる）', () => {
  const { exercises, sessions } = demoData(TODAY);
  const today = sessions.find((s) => s.date === TODAY)!;
  const entry = today.entries[0]!;
  const exercise = exercises.find((e) => e.id === entry.exerciseId)!;

  // 2 セット目に ✓ を付けたと仮定して判定する（SessionView と同じ入り方）
  const checked = { ...entry, sets: entry.sets.map((s, i) => (i === 1 ? { ...s, done: true } : s)) };
  const bodyWeight = bodyWeightOn(sessions, TODAY);
  const records = findRecords({
    exercise,
    today: { entry: checked, bodyWeight },
    history: exerciseHistory(sessions, exercise.id).filter((h) => h.date < TODAY),
    todaySessionVolume: 0,
    bestPastSessionVolume: 0,
  });
  assert.ok(records.length >= 1, '✓ を押しても何も祝われない');
});

test('demoData: 過去の日は締め済みで、記録も体重もある', () => {
  const { sessions } = demoData(TODAY);
  const past = sessions.filter((s) => s.date < TODAY && s.entries.length > 0);
  assert.ok(past.length >= 20, `過去のセッションが少ない: ${past.length}`);
  for (const s of past) {
    assert.ok(s.finishedAt > 0, `${s.date}: 締めていない`);
    assert.ok(hasRecord(s), `${s.date}: 記録が無い`);
    for (const e of s.entries) {
      assert.ok(doneSets(e).length > 0, `${s.date}: ✓ の無い種目が過去に残っている`);
    }
  }
  // 体重の推移が下っている（サンプルの筋書き）
  const weights = sessions
    .filter((s) => s.bodyWeight > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => s.bodyWeight);
  assert.ok(weights.length >= 30, '体重の点が少ない');
  assert.ok(weights[0]! > weights.at(-1)!, '体重が下っていない');
});

test('demoData: 前回の数字が引ける（入力欄の初期値が成立する）', () => {
  const { sessions } = demoData(TODAY);
  const today = sessions.find((s) => s.date === TODAY)!;
  for (const entry of today.entries) {
    const prev = previousEntry(sessions, entry.exerciseId, TODAY);
    assert.ok(prev, `${entry.exerciseId}: 前回が無い`);
  }
});

test('demoData: アシスト種目と加重に移った自重種目が入っている', () => {
  const { exercises, sessions } = demoData(TODAY);
  const all = sessions.flatMap((s) => s.entries);
  assert.ok(all.some((e) => e.exerciseId === 'assist-chinning'), 'アシスト種目が無い');
  // バックエクステンション: 自重の日と加重の日の両方があること
  const backExt = all.filter((e) => e.exerciseId === 'back-extension').flatMap((e) => e.sets);
  assert.ok(backExt.some((s) => s.weight === 0), '自重の日が無い');
  assert.ok(backExt.some((s) => s.weight > 0), '加重の日が無い');
  // ボリュームが出る（重量種目が混ざっている）
  const past = sessions.filter((s) => s.date < TODAY && s.entries.length > 0);
  assert.ok(past.some((s) => sessionVolume(s, exercises, s.bodyWeight) > 0));
});
