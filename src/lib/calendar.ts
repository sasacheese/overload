/**
 * 日付の計算。すべてローカルタイムの 'YYYY-MM-DD' 文字列で完結させる。
 * Date に入れて戻す往復を挟むと、タイムゾーンで 1 日ずれる事故が起きるため。
 */

import { isoDate, type IsoDate } from './types.ts';

export const WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'] as const;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toIso(date: Date): IsoDate {
  return isoDate(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`);
}

export function todayIso(now: Date = new Date()): IsoDate {
  return toIso(now);
}

export type YearMonth = { year: number; month: number };

export function parseIso(iso: IsoDate): { year: number; month: number; day: number } {
  const [y, m, d] = iso.split('-');
  return { year: Number(y), month: Number(m), day: Number(d) };
}

/** ローカルタイムの Date に戻す。日付計算の内部だけで使う。 */
function toDate(iso: IsoDate): Date {
  const { year, month, day } = parseIso(iso);
  return new Date(year, month - 1, day);
}

export function shiftDays(iso: IsoDate, days: number): IsoDate {
  const d = toDate(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

export function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function monthOf(iso: IsoDate): YearMonth {
  const { year, month } = parseIso(iso);
  return { year, month };
}

/** 月曜を 0 とした曜日番号。トレーニングの週は月曜起点で数える。 */
export function weekdayIndex(iso: IsoDate): number {
  return (toDate(iso).getDay() + 6) % 7;
}

/** その日を含む週（月曜起点）の月曜日。 */
export function weekStart(iso: IsoDate): IsoDate {
  return shiftDays(iso, -weekdayIndex(iso));
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  const ms = toDate(to).getTime() - toDate(from).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * カレンダー表示用の格子。月曜起点で、前後の月の日も埋めて週単位に揃える。
 * 週数は月によって 4〜6 に変わるので、6 週固定にはしない。
 */
export function monthGrid({ year, month }: YearMonth): IsoDate[][] {
  const first = isoDate(`${year}-${pad(month)}-01`);
  const lastDay = new Date(year, month, 0).getDate();
  const last = isoDate(`${year}-${pad(month)}-${pad(lastDay)}`);
  const start = weekStart(first);
  const end = shiftDays(weekStart(last), 6);
  const weeks: IsoDate[][] = [];
  for (let cursor = start; cursor <= end; cursor = shiftDays(cursor, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => shiftDays(cursor, i)));
  }
  return weeks;
}

export function inMonth(iso: IsoDate, { year, month }: YearMonth): boolean {
  const p = parseIso(iso);
  return p.year === year && p.month === month;
}

/**
 * トレーニングした週が何週続いているか。
 *
 * 日単位の連続記録は休養日を挟むと必ず切れて、休むことが罰になってしまう。
 * 週に 1 回以上やっているかで数えると、休養を含む運用と両立する。
 * 今週まだ 0 回でも、先週までの連続は途切れていないので残す。
 */
export function weekStreak(dates: readonly IsoDate[], today: IsoDate): number {
  const weeks = new Set(dates.map(weekStart));
  const thisWeek = weekStart(today);
  let cursor = weeks.has(thisWeek) ? thisWeek : shiftDays(thisWeek, -7);
  let count = 0;
  while (weeks.has(cursor)) {
    count += 1;
    cursor = shiftDays(cursor, -7);
  }
  return count;
}

/** 'YYYY-MM-DD' → '8月18日(月)' */
export function dateLabel(iso: IsoDate): string {
  const { month, day } = parseIso(iso);
  return `${month}月${day}日(${WEEKDAY_LABELS[weekdayIndex(iso)]})`;
}

/**
 * 曜日の種別。土と日を分けているのは色を分けるため
 * （カレンダーの慣習に合わせて土は水色、日は赤）。
 */
export type DayKind = 'weekday' | 'sat' | 'sun';

export function dayKind(iso: IsoDate): DayKind {
  const i = weekdayIndex(iso);
  return i === 5 ? 'sat' : i === 6 ? 'sun' : 'weekday';
}

/** 月曜起点の曜日番号から種別を引く。カレンダーの見出し行のように日付が無い場所で使う。 */
export function dayKindOfIndex(index: number): DayKind {
  return index === 5 ? 'sat' : index === 6 ? 'sun' : 'weekday';
}

export type DateParts = { date: string; weekday: string; kind: DayKind };

/**
 * 日付を「8月18日」と「月」に分ける。
 *
 * 曜日だけ色を変えたいので、1 つの文字列では出せない。分けるのはここ 1 箇所にして、
 * 表示側で括弧を足す（括弧まで色が付くと休日の主張が強くなりすぎる）。
 */
export function dateParts(iso: IsoDate): DateParts {
  const { month, day } = parseIso(iso);
  return {
    date: `${month}月${day}日`,
    weekday: WEEKDAY_LABELS[weekdayIndex(iso)] ?? '',
    kind: dayKind(iso),
  };
}

/** 今日との距離を言葉にする。「前回いつやったか」を数えさせないため。 */
export function relativeLabel(iso: IsoDate, today: IsoDate): string {
  const diff = daysBetween(iso, today);
  if (diff === 0) return '今日';
  if (diff === 1) return '昨日';
  if (diff === 2) return 'おととい';
  if (diff < 0) return `${-diff}日後`;
  if (diff < 14) return `${diff}日前`;
  if (diff < 60) return `${Math.floor(diff / 7)}週間前`;
  return `${Math.floor(diff / 30)}か月前`;
}
