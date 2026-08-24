import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shiftDays } from './calendar.ts';
import {
  MIN_POINTS,
  MIN_SPAN,
  forecast,
  forecastWords,
  shortfall,
  shortfallLabel,
  type TrendPoint,
} from './forecast.ts';
import { isoDate, type IsoDate } from './types.ts';

const today = isoDate('2026-08-24');

/** 今日から `agoDays` 日前の点。 */
function point(agoDays: number, value: number): TrendPoint {
  return { date: shiftDays(today, -agoDays), value };
}

/** `every` 日おきに `step` ずつ動く、きれいな直線。 */
function line(count: number, every: number, start: number, step: number): TrendPoint[] {
  return Array.from({ length: count }, (_, i) => point((count - 1 - i) * every, start + step * i));
}

const options = { days: 30, flatPer30: 0.3 };

test('shortfall: 点が足りないときは、あと何回で出るかを返す', () => {
  assert.deepEqual(shortfall([]), { kind: 'points', more: MIN_POINTS });
  assert.deepEqual(shortfall(line(2, 7, 70, -0.5)), { kind: 'points', more: MIN_POINTS - 2 });
  assert.equal(shortfall(line(MIN_POINTS, 7, 70, -0.5)), null);
});

test('shortfall: 点があっても幅が足りなければ出さない', () => {
  const dense = line(6, 1, 70, -0.1); // 6 点あるが 5 日ぶんしかない
  assert.deepEqual(shortfall(dense), { kind: 'span', more: MIN_SPAN - 5 });
  assert.match(shortfallLabel(shortfall(dense)!), /14 日ぶん/);
  assert.match(shortfallLabel({ kind: 'points', more: 2 })!, /あと 2 回/);
});

test('forecast: 足りないときは null', () => {
  assert.equal(forecast(line(3, 7, 70, -0.5), today, options), null);
  assert.equal(forecast(line(6, 1, 70, -0.1), today, options), null);
});

test('forecast: きれいな直線なら傾きをそのまま延ばす', () => {
  // 7 日で 0.5 ずつ落ちる = 30 日で約 2.14
  const f = forecast(line(8, 7, 72, -0.5), today, options)!;
  assert.ok(f !== null);
  assert.ok(Math.abs(f.perDay - -0.5 / 7) < 1e-6);
  assert.ok(Math.abs(f.per30 - (-0.5 / 7) * 30) < 1e-6);
  assert.equal(f.direction, 'down');
  assert.equal(f.days, 30);
  assert.equal(f.date, shiftDays(today, 30));
  // 最後の点（今日）が 68.5、そこから 30 日ぶん落ちる
  assert.ok(Math.abs(f.value - (68.5 - (0.5 / 7) * 30)) < 1e-6);
  assert.ok(Math.abs(f.change - -(0.5 / 7) * 30) < 1e-6);
});

test('forecast: ばらつきが無ければ幅はほぼ 0、あれば広がる', () => {
  const clean = forecast(line(8, 7, 72, -0.5), today, options)!;
  assert.ok(clean.margin < 1e-6);

  const noisy = line(8, 7, 72, -0.5).map((p, i) => ({ ...p, value: p.value + (i % 2 ? 0.8 : -0.8) }));
  assert.ok(forecast(noisy, today, options)!.margin > 1);
});

test('forecast: 帯は先へ行くほど広がる', () => {
  const noisy = line(10, 7, 60, 1).map((p, i) => ({ ...p, value: p.value + (i % 3) * 0.9 }));
  const f = forecast(noisy, today, options)!;
  const widths = f.band.map((b) => b.hi - b.lo);
  for (let i = 1; i < widths.length; i++) assert.ok(widths[i]! >= widths[i - 1]!);
  assert.equal(f.band[0]!.date, today);
  assert.equal(f.band.at(-1)!.date, f.date);
  // 線は必ず帯の中を通る
  for (const b of f.band) assert.ok(b.lo <= b.mid && b.mid <= b.hi);
});

test('forecast: 直近を重く見る。向きが変わったら新しい方に付く', () => {
  // 前半は落ちて、直近 5 週は上がっている
  const turn: TrendPoint[] = [
    point(84, 74),
    point(77, 73.4),
    point(70, 72.8),
    point(63, 72.2),
    point(56, 71.6),
    point(49, 71),
    point(28, 71.6),
    point(21, 72.2),
    point(14, 72.8),
    point(7, 73.4),
    point(0, 74),
  ];
  assert.equal(forecast(turn, today, options)!.direction, 'up');
});

test('forecast: 横ばいは向きを付けない', () => {
  const flat = line(8, 7, 70, 0.02); // 30 日で 0.086
  assert.equal(forecast(flat, today, options)!.direction, 'flat');
});

test('forecast: 観測した期間より先へは伸ばさない', () => {
  // 5 点 × 5 日 = 20 日ぶんしか見ていない
  const f = forecast(line(5, 5, 70, -0.2), today, { ...options, days: 90 })!;
  assert.equal(f.days, 20);
  assert.equal(f.date, shiftDays(today, 20));
});

test('forecast: 途切れた記録から先は予想しない', () => {
  const stale = line(6, 7, 70, -0.3).map((p) => ({ ...p, date: shiftDays(p.date, -40) as IsoDate }));
  // 35 日ぶんの記録で、最後の記録が 40 日前。使い切っているので出さない
  assert.equal(forecast(stale, today, options), null);
});

test('forecast: 同じ日に固まった点では傾きが決まらない', () => {
  const same: TrendPoint[] = Array.from({ length: 5 }, () => point(10, 70));
  assert.equal(forecast(same, today, options), null);
});

test('forecast: 並びが崩れていても結果は同じ', () => {
  const points = line(8, 7, 72, -0.5);
  const shuffled = [points[3]!, points[7]!, points[0]!, points[5]!, points[1]!, points[6]!, points[2]!, points[4]!];
  assert.deepEqual(forecast(shuffled, today, options), forecast(points, today, options));
});

test('forecastWords: 幅を必ず添える。横ばいは言い方を変える', () => {
  const up = forecast(line(8, 7, 60, 1.2), today, options)!;
  const words = forecastWords(up, today, 'kg', (n) => String(Math.round(n * 10) / 10));
  assert.equal(words.lead, 'この調子なら');
  assert.equal(words.when, '30日後');
  assert.match(words.value, /kg$/);
  assert.match(words.change!, /^直近から \+/);
  assert.match(words.margin, /^幅 ±/);

  const flat = forecast(line(8, 7, 70, 0.02), today, options)!;
  assert.equal(forecastWords(flat, today, 'kg', (n) => String(Math.round(n * 10) / 10)).lead, '横ばいが続けば');
});

test('forecastWords: まるめて 0 の差は出さない', () => {
  const flat = forecast(line(8, 7, 70, 0.001), today, options)!;
  assert.equal(forecastWords(flat, today, 'kg', (n) => String(Math.round(n * 10) / 10)).change, null);
});

test('forecast: 重みが全部同じなら素の最小二乗と一致する', () => {
  // 半減期を十分に長くすると重みは一様に近づく
  const points = line(8, 7, 60, 1.5).map((p, i) => ({ ...p, value: p.value + (i % 2 ? 0.5 : -0.5) }));
  const f = forecast(points, today, { ...options, halfLife: 1e9 })!;
  // 素の最小二乗を素直に計算して突き合わせる
  const n = points.length;
  const x = points.map((_, i) => i * 7);
  const y = points.map((p) => p.value);
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  const slope =
    x.reduce((a, v, i) => a + (v - mx) * (y[i]! - my), 0) / x.reduce((a, v) => a + (v - mx) ** 2, 0);
  assert.ok(Math.abs(f.perDay - slope) < 1e-9);
});
