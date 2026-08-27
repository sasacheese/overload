/**
 * 記録を積んだ状態で Claude の新規チャットを開くための組み立て。
 *
 * API は使わない。プロンプトをクエリに載せた URL を開くだけなので、鍵も費用も
 * かからず、ログインしている本人のアカウントでそのまま会話が始まる。
 * iOS / Android ではこの URL が Claude アプリの Universal Link・App Link に
 * なっているため、アプリが入っていればアプリ側が開く（無ければ Web 版）。
 * デスクトップアプリは claude.ai のリンクの受け皿にできないので、ボタン側で
 * プロンプトをクリップボードにも入れて、貼れるようにしてある。
 */

import { daysBetween, shiftDays } from './calendar.ts';
import { format, formatEstimate, metrics } from './progression.ts';
import { exerciseHistory, sortedSessions } from './query.ts';
import { MUSCLE_GROUPS, doneSets, type Exercise, type IsoDate, type Session } from './types.ts';

const NEW_CHAT_URL = 'https://claude.ai/new';

/**
 * エンコード後の URL 長の上限。
 *
 * 日本語は 1 文字が `%E3%81%82` の 9 文字になる。記録そのものは数字と記号なので
 * 1 文字ぶんで収まるが、種目名とメモは 9 倍で効く。8000 の根拠は受け取り側の
 * 上限（16KB 程度）から Cookie などを引いた残り。超える分は優先度の低い節から
 * 落とす（落としてもクリップボードには全文が入るので失われない）。
 */
export const MAX_ENCODED_LENGTH = 8000;

export type Period = { label: string; weeks: number | null };

export const PERIODS: readonly Period[] = [
  { label: '1週間', weeks: 1 },
  { label: '4週間', weeks: 4 },
  { label: '全期間', weeks: null },
];

/** 'YYYY-MM-DD' → '8/17'。URL に載せるので短く。 */
function shortDate(iso: IsoDate): string {
  return iso.slice(5).replace('-', '/').replace(/^0/, '').replace('/0', '/');
}

function line(ex: Exercise, sets: readonly { weight: number; reps: number }[]): string {
  if (sets.length === 0) return '-';
  const reps = sets.map((s) => s.reps).join(',');
  if (ex.loadMode === 'bodyweight' && sets.every((s) => s.weight === 0)) return `自重x${reps}`;
  const weights = [...new Set(sets.map((s) => s.weight))];
  const prefix = ex.loadMode === 'assist' ? '補助' : '';
  return weights.length === 1
    ? `${prefix}${format(weights[0]!)}x${reps}`
    : sets.map((s) => `${prefix}${format(s.weight)}x${s.reps}`).join('+');
}

function clamp(text: string, max: number): string {
  const chars = Array.from(text.trim().replace(/\s+/g, ' '));
  return chars.length <= max ? chars.join('') : chars.slice(0, max - 1).join('') + '…';
}

function block(heading: string, lines: readonly (string | null)[]): string | null {
  const body = lines.filter((l): l is string => Boolean(l && l.trim()));
  return body.length > 0 ? [heading, ...body].join('\n') : null;
}

const INSTRUCTION = [
  '---',
  'これは私のトレーニング記録。**目的はボディメイク**で、筋肥大やパワー競技ではない。',
  '見た目の質（バランス・引き締まり・姿勢・服の似合い方）が上がることが成功で、扱う重量の絶対値はそのための手段にすぎない。',
  '数字を並べた分析レポートや、一般論の説教は要らない。',
  '',
  'こう返してほしい。',
  '1. **続いていること・変わったこと**を、記録から具体的に 2〜3 個挙げて言葉にする。どこが効いているのかが分かると続けられる。ただし褒めるために事実を曲げなくていい。',
  '2. **見た目の観点で次に効く一手を 1〜2 個だけ**。多いと動けなくなる。どの種目をどう変えるか（重量・レップ・セット数・頻度・足す/やめる）まで具体的に。',
  '3. **バランスの偏り**があれば 1 つだけ。部位、押す/引く、前面/背面のどれかの観点で。',
  '4. 最後に一言。次にジムへ行くときに思い出せる短い言葉で。',
  '',
  '表は要らない。硬い分析より、読んだあとにジムへ行きたくなる語りかけで書いて。',
  '推定1RM が必要なら 重量×(1+レップ/30) で出していい（あくまで内部の目安として使い、私に数字を並べて見せる必要はない）。',
].join('\n');

export type AskInput = {
  sessions: readonly Session[];
  exercises: readonly Exercise[];
  today: IsoDate;
  weeks: number | null;
};

/**
 * @param maxEncodedLength URL に載せる場合の上限。クリップボードへ入れる分は
 *   制約が無いので `Infinity` を渡して全節を残す。
 */
export function buildAskPrompt(
  { sessions, exercises, today, weeks }: AskInput,
  maxEncodedLength: number = MAX_ENCODED_LENGTH,
): string {
  const from = weeks === null ? null : shiftDays(today, -weeks * 7);
  const inRange = sortedSessions(sessions).filter((s) => from === null || s.date >= from);

  if (inRange.length === 0) {
    return ['# トレーニング記録', 'この期間の記録がない。', INSTRUCTION].join('\n\n');
  }

  const oldest = inRange.at(-1)!.date;
  const span = Math.max(1, daysBetween(oldest, today) + 1);
  /*
   * 体重の推移は、ボディメイクの目的では扱う重量より効く情報なので頭に置く。
   *
   * inRange（やった日）から拾ってはいけない。体重は休養日にも付けるものなので、
   * やった日だけに絞ると記録のほとんどが落ちる。
   */
  const weights = [...sessions]
    .filter((s) => s.bodyWeight > 0 && (from === null || s.date >= from) && s.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date));
  const bodyLine =
    weights.length === 0
      ? null
      : weights.length === 1
        ? `体重 ${format(weights[0]!.bodyWeight)}kg`
        : `体重 ${format(weights.at(-1)!.bodyWeight)}kg → ${format(weights[0]!.bodyWeight)}kg`;

  const head = [
    `# トレーニング記録（${oldest} 〜 ${today}）`,
    `${inRange.length}回 / 週あたり ${(inRange.length / (span / 7)).toFixed(1)}回`,
    bodyLine,
    '（記録は「重量x各セットのレップ」。60x8,8,7 は 60kg を 8回・8回・7回）',
  ]
    .filter((l): l is string => l !== null)
    .join('\n');

  const byId = new Map(exercises.map((e) => [e.id, e]));
  /** この期間に実際にやった種目を、最後にやった日が新しい順に。 */
  const trained = [...new Set(inRange.flatMap((s) => s.entries.map((e) => e.exerciseId)))]
    .map((id) => byId.get(id))
    .filter((e): e is Exercise => e !== undefined);

  const records = trained.map((ex) => {
    const history = exerciseHistory(sessions, ex.id).filter((h) => from === null || h.date >= from);
    if (history.length === 0) return null;
    const measured = history.map((h) => metrics(ex, h));
    const best = Math.max(...measured.map((m) => m.best));
    const byLoad = measured.some((m) => m.byLoad);
    const setting =
      ex.loadMode === 'bodyweight'
        ? `自重/${ex.repMin}-${ex.repMax}rep`
        : ex.loadMode === 'assist'
          ? `補助マシン(数字を下げるほど負荷が上がる)/${ex.repMin}-${ex.repMax}rep/${ex.increment}kg刻み`
          : `${ex.repMin}-${ex.repMax}rep/${ex.increment}kg刻み`;
    const series = [...history].reverse().map((h) => `${shortDate(h.date)} ${line(ex, doneSets(h.entry))}`);
    const peak = byLoad ? `推定1RM最高${formatEstimate(best)}kg` : `最高${best}rep`;
    return `${ex.name}[${MUSCLE_GROUPS[ex.group].label}/${setting}/${peak}]\n  ${series.join('  ')}`;
  });

  const tips = trained
    .filter((ex) => ex.tips.trim() !== '')
    .map((ex) => `- ${ex.name}: ${clamp(ex.tips, 90)}`);

  const notes = inRange
    .flatMap((s) => {
      const parts: string[] = [];
      if (s.note.trim() !== '') parts.push(clamp(s.note, 60));
      for (const entry of s.entries) {
        const ex = byId.get(entry.exerciseId);
        if (!ex) continue;
        if (entry.note.trim() !== '') parts.push(`${ex.name}: ${clamp(entry.note, 60)}`);
        doneSets(entry).forEach((set, i) => {
          if (set.note.trim() !== '') parts.push(`${ex.name}${i + 1}set: ${clamp(set.note, 60)}`);
        });
      }
      return parts.length > 0 ? [`- ${shortDate(s.date)} ${parts.join(' / ')}`] : [];
    })
    .slice(0, 20);

  /*
   * 落としてよい節を、残したい順に並べる。上限を超えたら後ろから外す。
   * コツをメモより先に残すのは、機材の設定が分かると助言が具体的になるのに対し、
   * 日々のメモは無くても数字だけで筋の通った助言が返るため。
   */
  const optional = [
    block('# 種目ごとの記録（古い順）', records),
    block('# 機材の設定・自分用のコツ', tips),
    block('# メモ', notes),
  ].filter((b): b is string => b !== null);

  const assemble = (parts: readonly string[]) => [head, ...parts, INSTRUCTION].join('\n\n');
  const parts = [...optional];
  while (parts.length > 1 && encodedLength(assemble(parts)) > maxEncodedLength) parts.pop();

  // 記録の節だけでも超えるなら、最近やった種目に絞る（それでも足りなければ諦めて返す）
  if (encodedLength(assemble(parts)) > maxEncodedLength && records.length > 1) {
    for (let keep = records.length - 1; keep >= 1; keep -= 1) {
      const trimmed = [
        block('# 種目ごとの記録（古い順、直近にやった種目のみ）', records.slice(0, keep))!,
      ];
      if (encodedLength(assemble(trimmed)) <= maxEncodedLength) return assemble(trimmed);
    }
  }
  return assemble(parts);
}

function encodedLength(prompt: string): number {
  return NEW_CHAT_URL.length + 3 + encodeURIComponent(prompt).length;
}

export function claudeNewChatUrl(prompt: string): string {
  return `${NEW_CHAT_URL}?q=${encodeURIComponent(prompt)}`;
}
