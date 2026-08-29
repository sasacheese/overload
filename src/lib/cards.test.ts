import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardKey, cardNumber, dayCards } from './cards.ts';
import { presetExercises } from './presets.ts';
import { isoDate, type Exercise, type Session } from './types.ts';

const exercises = presetExercises();
const bench = exercises.find((e) => e.id === 'bench-press')!; // 6〜8 レップ × 3 セット
const squat = exercises.find((e) => e.id === 'squat')!;

function session(
  date: string,
  entries: readonly { id: string; sets: readonly (readonly [number, number])[]; done?: boolean }[],
): Session {
  return {
    date: isoDate(date),
    entries: entries.map(({ id, sets, done = true }) => ({
      exerciseId: id as Exercise['id'],
      sets: sets.map(([weight, reps]) => ({ weight, reps, done, note: '' })),
      note: '',
    })),
    note: '',
    bodyWeight: 70,
    finishedAt: 0,
    updatedAt: 0,
  };
}

test('dayCards: 記録更新がその日のカードになる。種目に属さない総量は exercise が null', () => {
  const past = session('2026-08-19', [{ id: bench.id, sets: [[60, 8], [60, 8], [60, 8]] }]);
  const today = session('2026-08-21', [{ id: bench.id, sets: [[62.5, 8], [62.5, 8], [62.5, 8]] }]);
  const cards = dayCards(today, exercises, [past, today]);

  const kinds = cards.map((c) => (c.kind === 'record' ? c.achievement.kind : 'graduation'));
  assert.ok(kinds.includes('e1rm'));
  assert.ok(kinds.includes('top-load'));
  // 総量のカードは最後に 1 枚だけ、種目に属さない形で並ぶ
  const whole = cards.at(-1)!;
  assert.equal(whole.kind, 'record');
  assert.equal(whole.kind === 'record' && whole.exercise, null);
});

test('dayCards: 卒業したらそのカードが先頭に来る', () => {
  const past = session('2026-08-19', [{ id: bench.id, sets: [[60, 8], [60, 7], [60, 7]] }]);
  // 全 3 セットで上限 8 に到達 → 卒業
  const today = session('2026-08-21', [{ id: bench.id, sets: [[60, 8], [60, 8], [60, 8]] }]);
  const cards = dayCards(today, exercises, [past, today]);
  assert.equal(cards[0]?.kind, 'graduation');
  assert.ok(cards[0]?.kind === 'graduation' && cards[0].cycle.next === 62.5);
});

test('dayCards: ✓ の無い日は空。棚そのものを出さない判定に使う', () => {
  const blank = session('2026-08-21', [{ id: bench.id, sets: [[60, 8]], done: false }]);
  assert.deepEqual(dayCards(blank, exercises, [blank]), []);
});

test('dayCards: 過去の日を開いても当時のカードのまま（あとの日の記録に食われない）', () => {
  const past = session('2026-08-19', [{ id: bench.id, sets: [[60, 8]] }]);
  const mid = session('2026-08-21', [{ id: bench.id, sets: [[62.5, 8]] }]);
  const later = session('2026-08-23', [{ id: bench.id, sets: [[65, 8]] }]);
  // 8/21 を開く。8/23 に 65kg を挙げていても、8/21 の重量更新カードは残る
  const cards = dayCards(mid, exercises, [past, mid, later]);
  assert.ok(cards.some((c) => c.kind === 'record' && c.achievement.kind === 'top-load'));
});

test('cardNumber: 日付順 → 棚の並び順の通し番号。日をまたいで続く', () => {
  const day1 = session('2026-08-19', [{ id: bench.id, sets: [[60, 8]] }]);
  const day2 = session('2026-08-21', [{ id: bench.id, sets: [[62.5, 8]] }]);
  const all = [day1, day2];

  const cards1 = dayCards(day1, exercises, all);
  const cards2 = dayCards(day2, exercises, all);
  assert.ok(cards1.length > 0 && cards2.length > 0);

  // 初日の 1 枚目は通算 1 枚目
  assert.equal(cardNumber(day1, exercises, all, cardKey(cards1[0]!)), 1);
  // 2 日目の 1 枚目は、初日の枚数の続きから
  assert.equal(cardNumber(day2, exercises, all, cardKey(cards2[0]!)), cards1.length + 1);
  // 棚に無いカードは番号を持たない
  assert.equal(cardNumber(day2, exercises, all, 'record:ghost:e1rm'), null);
});

test('cardNumber: まだ保存されていない日（今日の 1 枚目の直後）でも続きの番号になる', () => {
  const day1 = session('2026-08-19', [{ id: bench.id, sets: [[60, 8]] }]);
  const today = session('2026-08-21', [{ id: bench.id, sets: [[62.5, 8]] }]);
  // sessions に今日がまだ入っていない状態で、今日のカードの番号を引く
  const cards1 = dayCards(day1, exercises, [day1]);
  const cardsToday = dayCards(today, exercises, [day1]);
  assert.equal(cardNumber(today, exercises, [day1], cardKey(cardsToday[0]!)), cards1.length + 1);
});

test('cardKey: 同じ日の中で一意になる', () => {
  const past = session('2026-08-19', [
    { id: bench.id, sets: [[60, 8], [60, 7], [60, 7]] },
    { id: squat.id, sets: [[80, 5]] },
  ]);
  const today = session('2026-08-21', [
    { id: bench.id, sets: [[60, 8], [60, 8], [60, 8]] }, // 卒業 + 記録
    { id: squat.id, sets: [[82.5, 5]] }, // 記録
  ]);
  const cards = dayCards(today, exercises, [past, today]);
  const keys = cards.map(cardKey);
  assert.equal(new Set(keys).size, keys.length);
});
