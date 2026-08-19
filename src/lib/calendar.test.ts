import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dateLabel,
  dateParts,
  dayKind,
  dayKindOfIndex,
  daysBetween,
  inMonth,
  monthGrid,
  relativeLabel,
  shiftDays,
  shiftMonth,
  todayIso,
  weekStart,
  weekStreak,
  weekdayIndex,
} from './calendar.ts';
import { isoDate } from './types.ts';

const d = isoDate;

test('todayIso: ローカルタイムの日付になる（UTC 変換でずれない）', () => {
  // ローカルで 8/18 23:30 は、UTC では 8/18 14:30 でも 8/19 でもありうる
  assert.equal(todayIso(new Date(2026, 7, 18, 23, 30)), '2026-08-18');
  assert.equal(todayIso(new Date(2026, 0, 1, 0, 0)), '2026-01-01');
});

test('shiftDays: 月と年をまたぐ', () => {
  assert.equal(shiftDays(d('2026-08-31'), 1), '2026-09-01');
  assert.equal(shiftDays(d('2026-01-01'), -1), '2025-12-31');
  assert.equal(shiftDays(d('2024-02-28'), 1), '2024-02-29'); // 閏年
});

test('weekdayIndex: 月曜が 0', () => {
  assert.equal(weekdayIndex(d('2026-08-17')), 0); // 月
  assert.equal(weekdayIndex(d('2026-08-23')), 6); // 日
});

test('weekStart: 週の月曜。月曜自身は動かない', () => {
  assert.equal(weekStart(d('2026-08-17')), '2026-08-17');
  assert.equal(weekStart(d('2026-08-23')), '2026-08-17');
});

test('monthGrid: 月曜起点で週単位に揃い、前後の月で埋まる', () => {
  const weeks = monthGrid({ year: 2026, month: 8 });
  assert.equal(weeks[0]?.[0], '2026-07-27'); // 8/1 は土曜なので前月から
  assert.equal(weeks.at(-1)?.at(-1), '2026-09-06');
  assert.ok(weeks.every((w) => w.length === 7));
  assert.equal(weeks.flat().length, weeks.length * 7);
});

test('monthGrid: 1 日が月曜の月は前月を含まない', () => {
  const weeks = monthGrid({ year: 2026, month: 6 }); // 2026-06-01 は月曜
  assert.equal(weeks[0]?.[0], '2026-06-01');
});

test('shiftMonth: 年をまたぐ', () => {
  assert.deepEqual(shiftMonth({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 });
  assert.deepEqual(shiftMonth({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 });
});

test('inMonth', () => {
  assert.ok(inMonth(d('2026-08-01'), { year: 2026, month: 8 }));
  assert.ok(!inMonth(d('2026-07-31'), { year: 2026, month: 8 }));
});

test('daysBetween', () => {
  assert.equal(daysBetween(d('2026-08-10'), d('2026-08-18')), 8);
  assert.equal(daysBetween(d('2026-08-18'), d('2026-08-10')), -8);
});

test('weekStreak: 休養日で切れず、週単位で続く', () => {
  const today = d('2026-08-19'); // 水曜
  // 今週・先週・先々週に 1 回以上ある
  const dates = [d('2026-08-17'), d('2026-08-12'), d('2026-08-04'), d('2026-08-05')];
  assert.equal(weekStreak(dates, today), 3);
});

test('weekStreak: 今週まだ 0 回でも先週までの連続は残る', () => {
  const today = d('2026-08-19');
  assert.equal(weekStreak([d('2026-08-12'), d('2026-08-05')], today), 2);
});

test('weekStreak: 1 週空くと切れる', () => {
  const today = d('2026-08-19');
  assert.equal(weekStreak([d('2026-08-17'), d('2026-08-03')], today), 1);
  assert.equal(weekStreak([], today), 0);
});

test('dateLabel / relativeLabel', () => {
  assert.equal(dateLabel(d('2026-08-18')), '8月18日(火)');
  assert.equal(relativeLabel(d('2026-08-19'), d('2026-08-19')), '今日');
  assert.equal(relativeLabel(d('2026-08-18'), d('2026-08-19')), '昨日');
  assert.equal(relativeLabel(d('2026-08-14'), d('2026-08-19')), '5日前');
  assert.equal(relativeLabel(d('2026-08-01'), d('2026-08-19')), '2週間前');
  assert.equal(relativeLabel(d('2026-08-20'), d('2026-08-19')), '1日後');
});

test('dateParts: 日付と曜日を分けて返す', () => {
  assert.deepEqual(dateParts(d('2026-08-19')), { date: '8月19日', weekday: '水', kind: 'weekday' });
  assert.deepEqual(dateParts(d('2026-08-22')), { date: '8月22日', weekday: '土', kind: 'sat' });
  assert.deepEqual(dateParts(d('2026-08-23')), { date: '8月23日', weekday: '日', kind: 'sun' });
});

test('dayKind: 土と日を分ける（色を分けるため）', () => {
  assert.equal(dayKind(d('2026-08-21')), 'weekday'); // 金
  assert.equal(dayKind(d('2026-08-22')), 'sat');
  assert.equal(dayKind(d('2026-08-23')), 'sun');
});

test('dayKindOfIndex: 月曜起点の番号から引く', () => {
  assert.deepEqual([0, 4, 5, 6].map(dayKindOfIndex), ['weekday', 'weekday', 'sat', 'sun']);
});
