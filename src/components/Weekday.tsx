import { dayKind, type DayKind } from '../lib/calendar.ts';
import type { IsoDate } from '../lib/types.ts';

/**
 * 曜日の 1 文字。カレンダーの慣習に合わせて土は水色、日は赤にする。
 *
 * この 2 色だけが無彩色 + 赤という配色の例外。休日の区別は色以外に置き換えが
 * 効かない（文字を足すと画面が説明で埋まる）ので、意味のある色として通している。
 */
export function dayClass(kind: DayKind): string | undefined {
  return kind === 'sat' ? 'day-sat' : kind === 'sun' ? 'day-sun' : undefined;
}

/** 曜日 1 文字を、その日の種別に応じた色で出す。 */
export function Weekday({ iso, label }: { iso: IsoDate; label: string }) {
  return <span className={dayClass(dayKind(iso))}>{label}</span>;
}
