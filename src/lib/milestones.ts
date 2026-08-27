/**
 * 長い弧のまとめ。1 セット・1 日の前進は祝福と締めが手厚く扱うが、
 * 「何ヶ月でどれだけ変わったか」を受け取る場所が無かった。ここに置くのは
 * その 3 つ——通算の積み上げ・初日から今日まで・更新の年表。
 *
 * どれも**過去の事実の言い換え**で、目標ではない。未達が出うる形
 * （週◯回のノルマ、達成率、ゲージ）はこのファイルにも作らない。
 *
 * - **通算の積み上げ**は絶対に減らない数字。休んでも下がらないので、
 *   休むことが罰にならない（週単位の連続記録と同じ性質を、数字の側で持つ）
 * - **初日から今日まで**は、目標と違って外れようがない。比べる相手が
 *   未来ではなく過去だから
 * - **更新の年表**は、記録が動いた日だけを並べる。動かなかった日は
 *   行ごと無い——足りない側の欄を作らない
 */

import { bodyWeightOn, countedSets, sessionVolume, sortedSessions } from './query.ts';
import { findRecords, type Achievement } from './records.ts';
import { comparable, loadWord, type ExerciseHistory, type Performance } from './progression.ts';
import { doneSets, type Exercise, type ExerciseId, type IsoDate, type Session, type SetRecord } from './types.ts';

/** 通算。days は ✓ が 1 つ以上ある日、volume は全期間の総ボリューム（kg）。 */
export type Lifetime = { days: number; volume: number };

export function lifetimeTotals(sessions: readonly Session[], exercises: readonly Exercise[]): Lifetime {
  let days = 0;
  let volume = 0;
  for (const session of sessions) {
    if (countedSets(session) === 0) continue;
    days += 1;
    volume += sessionVolume(session, exercises, bodyWeightOn(sessions, session.date));
  }
  return { days, volume };
}

/**
 * 積み上げの単位。10t を超えたら t で言う。
 *
 * 412,530kg は桁を数えないと読めないが、412.5t は読んだ瞬間に量として伝わる。
 * 逆に 2t 程度で t にすると「2」という小さい数字になり、積んだ量が痩せて見える。
 */
export function volumeParts(kg: number): { value: string; unit: 't' | 'kg' } {
  if (kg >= 10_000) {
    const tons = Math.round(kg / 100) / 10;
    return { value: tons.toLocaleString('ja-JP'), unit: 't' };
  }
  return { value: Math.round(kg).toLocaleString('ja-JP'), unit: 'kg' };
}

export function volumeLabel(kg: number): string {
  const { value, unit } = volumeParts(kg);
  return `${value} ${unit}`;
}

/** 一番強い負荷を扱ったセット。順序は progression の comparable に従う。 */
export function strongestSet(ex: Exercise, sets: readonly SetRecord[]): SetRecord | null {
  let best: SetRecord | null = null;
  for (const set of sets) {
    if (best === null || comparable(ex, set) > comparable(ex, best)) best = set;
  }
  return best;
}

export type JourneyPoint = { date: IsoDate; label: string };

/**
 * 初日から直近まで。「初日 40kg × 8 → 直近 70kg × 10」の材料。
 *
 * improved は初日より直近が強いか。強くなっていれば赤（前進の色）を使ってよい。
 * 落ちていても隠さない——落ちた日を無彩色の数字で出すのは、セットの差分と同じ扱い。
 */
export type Journey = { first: JourneyPoint; latest: JourneyPoint; improved: boolean };

export function journeyOf(ex: Exercise, history: ExerciseHistory): Journey | null {
  // 2 日ぶん無ければ「から」「まで」が無い
  if (history.length < 2) return null;
  const latest = history[0]!;
  const first = history.at(-1)!;
  const point = (h: Performance & { date: IsoDate }): { date: IsoDate; set: SetRecord | null } => ({
    date: h.date,
    set: strongestSet(ex, doneSets(h.entry)),
  });
  const a = point(first);
  const b = point(latest);
  if (a.set === null || b.set === null) return null;
  const label = (s: SetRecord) => `${loadWord(ex, s.weight)} × ${s.reps}`;
  return {
    first: { date: a.date, label: label(a.set) },
    latest: { date: b.date, label: label(b.set) },
    improved: comparable(ex, b.set) > comparable(ex, a.set),
  };
}

/** 年表の 1 件。セッション全体の記録（1 日の総量）は exerciseName が null。 */
export type TimelineRecord = { exerciseName: string | null; achievement: Achievement };
/** 記録が動いた 1 日。動かなかった日は配列に入らない。 */
export type TimelineDay = { date: IsoDate; records: TimelineRecord[] };

/**
 * 更新の年表。記録が動いた日だけを新しい順で返す。
 *
 * findRecords を過去に向かって流し直す。祝福と同じ判定を使うので、
 * ここに出る行と当時祝われたものが食い違わない。
 *
 * 初日の到達（previous が無いもの）は入れない。祝福は初回の到達点も祝うが、
 * 年表は「更新」の一覧なので、種目を足しただけの日が並ぶと薄まる。
 *
 * 全期間を舐めるので O(日数 × 種目の履歴)。開いたときに 1 回計算して
 * memoize する前提で、描画のたびに呼ばない。
 */
export function recordTimeline(sessions: readonly Session[], exercises: readonly Exercise[]): TimelineDay[] {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  // 古い順に流す。sortedSessions はメモだけの日も含むが、✓ が無ければ何も出ない
  const days = [...sortedSessions(sessions)].reverse();
  const histories = new Map<ExerciseId, (Performance & { date: IsoDate })[]>();
  let bestPastSessionVolume = 0;
  const out: TimelineDay[] = [];

  for (const session of days) {
    const bodyWeight = bodyWeightOn(sessions, session.date);
    const dayVolume = sessionVolume(session, exercises, bodyWeight);
    const records: TimelineRecord[] = [];
    // 1 日の総量は種目に属さないので、種目ごとの findRecords から重複して出る。1 回だけ拾う
    let sessionVolumeSeen = false;

    for (const entry of session.entries) {
      const exercise = byId.get(entry.exerciseId);
      if (!exercise || doneSets(entry).length === 0) continue;
      const history = histories.get(entry.exerciseId) ?? [];
      const found = findRecords({
        exercise,
        today: { entry, bodyWeight },
        history,
        todaySessionVolume: dayVolume,
        bestPastSessionVolume,
      });
      for (const achievement of found) {
        if (achievement.previous === null) continue;
        if (achievement.kind === 'session-volume') {
          if (sessionVolumeSeen) continue;
          sessionVolumeSeen = true;
          records.push({ exerciseName: null, achievement });
        } else {
          records.push({ exerciseName: exercise.name, achievement });
        }
      }
      histories.set(entry.exerciseId, [{ date: session.date, entry, bodyWeight }, ...history]);
    }

    bestPastSessionVolume = Math.max(bestPastSessionVolume, dayVolume);
    if (records.length > 0) out.push({ date: session.date, records });
  }

  return out.reverse();
}
