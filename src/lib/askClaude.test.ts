import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_ENCODED_LENGTH, buildAskPrompt, claudeNewChatUrl } from './askClaude.ts';
import { presetExercises } from './presets.ts';
import { isoDate, type Session } from './types.ts';

const exercises = presetExercises();
const today = isoDate('2026-08-19');

function session(date: string, entries: readonly [string, readonly (readonly [number, number])[]][], note = ''): Session {
  return {
    date: isoDate(date),
    entries: entries.map(([id, sets]) => ({
      exerciseId: id as Session['entries'][number]['exerciseId'],
      sets: sets.map(([weight, reps]) => ({ weight, reps, done: true, note: '' })),
      note: '',
    })),
    note,
    bodyWeight: 0,
    finishedAt: 0,
    updatedAt: 0,
  };
}

const sessions = [
  session('2026-08-03', [['bench-press', [[55, 8], [55, 8], [55, 8]]]]),
  session('2026-08-11', [['bench-press', [[57.5, 7], [57.5, 7], [57.5, 7]]]], '睡眠6h'),
  session('2026-08-17', [['bench-press', [[60, 8], [60, 8], [60, 8]]], ['ab-roller', [[0, 7], [0, 6]]]]),
];

test('期間外のセッションは載せない', () => {
  const old = session('2026-01-05', [['squat', [[80, 8]]]]);
  const prompt = buildAskPrompt({ sessions: [...sessions, old], exercises, today, weeks: 4 });
  assert.ok(prompt.includes('ベンチプレス'));
  assert.ok(!prompt.includes('スクワット'));
});

test('全期間なら古い記録も載る', () => {
  const old = session('2026-01-05', [['squat', [[80, 8]]]]);
  const prompt = buildAskPrompt({ sessions: [...sessions, old], exercises, today, weeks: null });
  assert.ok(prompt.includes('スクワット'));
});

test('記録は古い順に並び、重量とレップが読める形で入る', () => {
  const prompt = buildAskPrompt({ sessions, exercises, today, weeks: 4 });
  const bench = prompt.split('\n').find((l) => l.includes('55x8,8,8'))!;
  assert.ok(bench.indexOf('55x8,8,8') < bench.indexOf('60x8,8,8'));
  assert.ok(prompt.includes('6-8rep/2.5kg刻み'));
});

test('自重種目は重量ではなくレップで出る', () => {
  const prompt = buildAskPrompt({ sessions, exercises, today, weeks: 4 });
  assert.ok(prompt.includes('自重x7,6'));
  assert.ok(prompt.includes('最高7rep'));
});

test('アシスト種目は補助である旨と実効負荷の向きが伝わる', () => {
  const s = session('2026-08-18', [['assist-chinning', [[30, 8], [30, 7]]]]);
  s.bodyWeight = 70;
  const prompt = buildAskPrompt({ sessions: [s], exercises, today, weeks: 4 });
  assert.ok(prompt.includes('補助30x8,7'));
  assert.ok(prompt.includes('数字を下げるほど負荷が上がる'));
  assert.ok(prompt.includes('体重 70kg'));
});

test('体重の推移が入る（ボディメイクの目的では扱う重量より効く）', () => {
  const a = session('2026-08-05', [['bench-press', [[60, 8]]]]);
  a.bodyWeight = 72;
  const b = session('2026-08-18', [['bench-press', [[60, 9]]]]);
  b.bodyWeight = 70.5;
  const prompt = buildAskPrompt({ sessions: [a, b], exercises, today, weeks: 4 });
  assert.ok(prompt.includes('体重 72kg → 70.5kg'));
});

test('依頼文はボディメイク寄りで、数字を並べさせない', () => {
  const prompt = buildAskPrompt({ sessions, exercises, today, weeks: 4 });
  assert.ok(prompt.includes('筋肥大やパワー競技ではない'));
  assert.ok(prompt.includes('続いていること・変わったこと'));
  assert.ok(prompt.includes('1〜2 個だけ'));
  assert.ok(!prompt.includes('表で出して'));
});

test('コツとメモが入る', () => {
  const withTips = exercises.map((e) => (e.id === 'bench-press' ? { ...e, tips: 'ラック8段目' } : e));
  const prompt = buildAskPrompt({ sessions, exercises: withTips, today, weeks: 4 });
  assert.ok(prompt.includes('ラック8段目'));
  assert.ok(prompt.includes('睡眠6h'));
});

test('セットごとのメモも渡る', () => {
  const s = session('2026-08-18', [['squat', [[80, 8]]]]);
  s.entries[0]!.sets[0]!.note = '右膝が内に入った';
  const prompt = buildAskPrompt({ sessions: [s], exercises, today, weeks: 4 });
  assert.ok(prompt.includes('スクワット1set: 右膝が内に入った'));
});

test('記録が無ければそう書いて、指示だけは残す', () => {
  const prompt = buildAskPrompt({ sessions: [], exercises, today, weeks: 4 });
  assert.ok(prompt.includes('この期間の記録がない'));
  assert.ok(prompt.includes('目的はボディメイク'));
});

test('URL 上限を超えないところまで節を落とす。指示は必ず残る', () => {
  // 全種目 × 40 セッション。日本語のメモも全部載せて確実に上限を超えさせる
  const many = Array.from({ length: 40 }, (_, i) =>
    session(
      isoDate(`2026-0${i < 20 ? 7 : 8}-${String((i % 20) + 1).padStart(2, '0')}`),
      exercises.map((e) => [e.id, [[60, 8], [60, 8], [60, 8]]] as const),
      'とても長い日々のメモをここに書いておく。これが全部載ると上限を超える。',
    ),
  );
  const full = buildAskPrompt({ sessions: many, exercises, today, weeks: null }, Infinity);
  const capped = buildAskPrompt({ sessions: many, exercises, today, weeks: null });

  assert.ok(claudeNewChatUrl(capped).length <= MAX_ENCODED_LENGTH);
  assert.ok(claudeNewChatUrl(full).length > MAX_ENCODED_LENGTH);
  // 削られても、記録の節と指示は残っている
  assert.ok(capped.includes('# 種目ごとの記録'));
  assert.ok(capped.includes('目的はボディメイク'));
  assert.ok(!capped.includes('# メモ'));
});

test('claudeNewChatUrl: 新規チャットの q に載る', () => {
  const url = new URL(claudeNewChatUrl('やあ'));
  assert.equal(url.origin + url.pathname, 'https://claude.ai/new');
  assert.equal(url.searchParams.get('q'), 'やあ');
});

test('体重の推移は休養日のぶんも含める（やった日だけに絞ると大半が落ちる）', () => {
  const trained = session('2026-08-05', [['bench-press', [[60, 8]]]]);
  trained.bodyWeight = 72;
  // トレーニングしていない日。体重だけ付けてある
  const restDay: Session = { ...session('2026-08-18', []), bodyWeight: 70.2 };
  const prompt = buildAskPrompt({ sessions: [trained, restDay], exercises, today, weeks: 4 });
  assert.ok(prompt.includes('体重 72kg → 70.2kg'));
});
