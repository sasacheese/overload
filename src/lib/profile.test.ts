import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_HEIGHT_CM,
  HEAVY_BMI,
  LEAN_BMI,
  bmiOf,
  isHeight,
  settleName,
  settleWeight,
  weightAtBmi,
} from './profile.ts';

test('isHeight: ありえない身長は受け付けない', () => {
  assert.ok(isHeight(174));
  assert.ok(isHeight(120));
  assert.ok(isHeight(230));
  assert.ok(!isHeight(0));
  assert.ok(!isHeight(119));
  assert.ok(!isHeight(231));
  assert.ok(!isHeight(Number.NaN));
});

test('weightAtBmi / bmiOf: 往復して戻る', () => {
  const w = weightAtBmi(DEFAULT_HEIGHT_CM, 22);
  assert.ok(Math.abs(w - 66.6) < 0.1); // 174cm の標準体重
  assert.ok(Math.abs(bmiOf(DEFAULT_HEIGHT_CM, w) - 22) < 1e-9);
});

test('settleWeight: しぼる向きは BMI 20、増える向きは BMI 25', () => {
  const lean = weightAtBmi(DEFAULT_HEIGHT_CM, LEAN_BMI); // 約 60.6
  const heavy = weightAtBmi(DEFAULT_HEIGHT_CM, HEAVY_BMI); // 約 75.7
  assert.equal(settleWeight(DEFAULT_HEIGHT_CM, 69.4, true), lean);
  assert.equal(settleWeight(DEFAULT_HEIGHT_CM, 69.4, false), heavy);
});

test('settleWeight: すでに越えていたら言わない', () => {
  // BMI 20 を下回っている人に「まだ落ちる」とも「そこで止まる」とも言えない
  assert.equal(settleWeight(DEFAULT_HEIGHT_CM, 58, true), null);
  assert.equal(settleWeight(DEFAULT_HEIGHT_CM, 80, false), null);
  // 逆向きなら効く
  assert.ok(settleWeight(DEFAULT_HEIGHT_CM, 58, false) !== null);
  assert.ok(settleWeight(DEFAULT_HEIGHT_CM, 80, true) !== null);
});

test('settleName: 何を根拠にした線なのか言える', () => {
  assert.equal(settleName(true), 'BMI 20');
  assert.equal(settleName(false), 'BMI 25');
});
