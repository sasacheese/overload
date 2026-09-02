import assert from 'node:assert/strict';
import { test } from 'node:test';
import { presetExercises } from './presets.ts';
import { RESTED_DAYS, SUGGEST_EXERCISES, suggestToday } from './suggest.ts';
import { exerciseId, isoDate, type Exercise, type Session } from './types.ts';

const exercises = presetExercises();

/** 1 日ぶんの記録。種目はいくつでも並べられる（すべて ✓ 済み）。 */
function day(date: string, ...ids: string[]): Session {
  return {
    date: isoDate(date),
    entries: ids.map((id) => ({
      exerciseId: exerciseId(id),
      sets: [{ weight: 60, reps: 8, done: true, note: '' }],
      note: '',
    })),
    note: '',
    bodyWeight: 0,
    finishedAt: 0,
    updatedAt: 0,
  };
}

const TODAY = isoDate('2026-09-02');

test('空いた日数がいちばん長い部位を出す', () => {
  const sessions = [
    day('2026-08-24', 'squat'), // 脚・9 日前
    day('2026-08-28', 'bench-press'), // 胸・5 日前
    day('2026-08-31', 'lat-pulldown'), // 背中・2 日前
  ];
  const found = suggestToday(sessions, exercises, TODAY);
  assert.deepEqual(
    found.map((s) => [s.group, s.days]),
    [['legs', 9]],
  );
  assert.equal(found[0]!.last, isoDate('2026-08-24'));
});

test('同じ日数の部位が複数あればそのまま並べる', () => {
  const sessions = [
    day('2026-08-28', 'bench-press', 'squat'), // 胸と脚・5 日前
    day('2026-08-30', 'lat-pulldown'), // 背中・3 日前
  ];
  assert.deepEqual(
    suggestToday(sessions, exercises, TODAY).map((s) => s.group),
    ['chest', 'legs'],
  );
});

test(`${RESTED_DAYS} 日空くまでは出さない`, () => {
  const twoDays = [day('2026-08-31', 'bench-press')];
  assert.deepEqual(suggestToday(twoDays, exercises, TODAY), []);
  const threeDays = [day('2026-08-30', 'bench-press')];
  assert.equal(suggestToday(threeDays, exercises, TODAY).length, 1);
});

test('一度もやっていない部位は出さない（毎日同じおすすめになるため）', () => {
  const sessions = [day('2026-08-28', 'bench-press')];
  assert.deepEqual(
    suggestToday(sessions, exercises, TODAY).map((s) => s.group),
    ['chest'],
  );
});

test('記録が 1 つも無ければ何も言わない', () => {
  assert.deepEqual(suggestToday([], exercises, TODAY), []);
  // ✓ の付いていない行だけの日は、やった日として数えない
  const planned: Session = {
    ...day('2026-08-20', 'bench-press'),
    entries: [{ exerciseId: exerciseId('bench-press'), sets: [{ weight: 60, reps: 8, done: false, note: '' }], note: '' }],
  };
  assert.deepEqual(suggestToday([planned], exercises, TODAY), []);
});

test('種目は記録のあるものだけを、最近やった順に', () => {
  const sessions = [
    day('2026-08-20', 'dumbbell-fly'),
    day('2026-08-25', 'bench-press', 'incline-press'),
    day('2026-08-30', 'lat-pulldown'),
  ];
  const [chest] = suggestToday(sessions, exercises, TODAY);
  assert.equal(chest!.group, 'chest');
  assert.deepEqual(
    chest!.exercises.map((e) => e.id),
    // 同じ日にやった 2 つは名前順（そこに優劣は無い）
    ['incline-press', 'bench-press', 'dumbbell-fly'].map(exerciseId),
  );
});

test(`種目は ${SUGGEST_EXERCISES} 個まで`, () => {
  const chestIds = exercises.filter((e) => e.group === 'chest').map((e) => e.id);
  assert.ok(chestIds.length > SUGGEST_EXERCISES);
  const sessions = [day('2026-08-25', ...chestIds), day('2026-08-30', 'lat-pulldown')];
  assert.equal(suggestToday(sessions, exercises, TODAY)[0]!.exercises.length, SUGGEST_EXERCISES);
});

test('アーカイブした種目は勧めないが、部位の日数には数える', () => {
  const archived: Exercise[] = exercises.map((e) => (e.id === exerciseId('bench-press') ? { ...e, archived: true } : e));
  const sessions = [
    day('2026-08-28', 'bench-press'), // 胸はこの日にやっている（5 日前）
    day('2026-08-20', 'squat'), // 脚は 13 日前
    day('2026-08-30', 'lat-pulldown'),
  ];
  const found = suggestToday(sessions, archived, TODAY);
  assert.deepEqual(
    found.map((s) => s.group),
    ['legs'],
  );
  // 胸だけが空いていれば、勧める種目が 0 でも部位は出す
  const onlyChest = suggestToday([sessions[0]!, sessions[2]!], archived, TODAY);
  assert.deepEqual(
    onlyChest.map((s) => [s.group, s.exercises.length]),
    [['chest', 0]],
  );
});

test('基準日より後の記録は数えない（過去の日を開いたときに未来を見ない）', () => {
  const sessions = [day('2026-08-20', 'bench-press'), day('2026-09-01', 'bench-press')];
  const found = suggestToday(sessions, exercises, isoDate('2026-08-25'));
  assert.deepEqual(
    found.map((s) => [s.group, s.days]),
    [['chest', 5]],
  );
});
