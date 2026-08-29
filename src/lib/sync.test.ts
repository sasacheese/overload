import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isEmpty, isTombstone, mergeSession, mergedExercises, mergedSessions, planExercises, planSessions } from './sync.ts';
import { presetExercises } from './presets.ts';
import { isoDate, type Session } from './types.ts';

function session(date: string, updatedAt: number, reps = 8): Session {
  return {
    date: isoDate(date),
    entries: [{ exerciseId: 'bench-press' as Session['entries'][number]['exerciseId'], sets: [{ weight: 60, reps, done: true, note: '' }], note: '' }],
    note: '',
    bodyWeight: 0,
    finishedAt: 0,
    updatedAt,
  };
}

const empty = (date: string, updatedAt: number): Session => ({
  date: isoDate(date),
  entries: [],
  note: '',
  bodyWeight: 0,
  finishedAt: 0,
  updatedAt,
});

test('片側にしか無いものは、それぞれ反対側へ渡る', () => {
  const p = planSessions([session('2026-08-17', 100)], [session('2026-08-18', 200)]);
  assert.deepEqual(p.toRemote.map((s) => s.date), ['2026-08-17']);
  assert.deepEqual(p.toLocal.map((s) => s.date), ['2026-08-18']);
});

test('両側にあるときは updatedAt の大きい方が勝つ', () => {
  const newer = planSessions([session('2026-08-17', 200, 9)], [session('2026-08-17', 100, 8)]);
  assert.deepEqual(newer.toRemote.map((s) => s.updatedAt), [200]);
  assert.equal(newer.toLocal.length, 0);

  const older = planSessions([session('2026-08-17', 100, 8)], [session('2026-08-17', 200, 9)]);
  assert.deepEqual(older.toLocal.map((s) => s.updatedAt), [200]);
  assert.equal(older.toRemote.length, 0);
});

test('updatedAt が同じなら何もしない', () => {
  const p = planSessions([session('2026-08-17', 100)], [session('2026-08-17', 100)]);
  assert.ok(isEmpty(p));
});

test('種目も同じ規則で突き合わせる', () => {
  const [bench, ...rest] = presetExercises();
  const local = [{ ...bench!, name: 'ローカルで直した', updatedAt: 300 }, ...rest];
  const remote = [{ ...bench!, name: 'リモートの名前', updatedAt: 100 }];
  const p = planExercises(local, remote);
  assert.equal(p.toLocal.length, 0);
  assert.equal(p.toRemote.find((e) => e.id === 'bench-press')?.name, 'ローカルで直した');
  // リモートに無い種目もすべて送る
  assert.equal(p.toRemote.length, local.length);
});

test('空のセッションは消した印として扱い、取り込みでは落とす', () => {
  assert.ok(isTombstone(empty('2026-08-17', 500)));
  assert.ok(!isTombstone(session('2026-08-17', 500)));
  assert.ok(!isTombstone({ ...empty('2026-08-17', 500), note: '休養日' }));
  // 体重だけの日は消した印ではない（保存しておく必要がある）
  assert.ok(!isTombstone({ ...empty('2026-08-17', 500), bodyWeight: 69.8 }));
});

test('mergedSessions: 消した印が来た日はローカルからも消える', () => {
  const local = [session('2026-08-17', 100), session('2026-08-18', 100)];
  const merged = mergedSessions(local, [empty('2026-08-17', 500)]);
  assert.deepEqual(merged.map((s) => s.date), ['2026-08-18']);
});

test('mergedSessions: リモートが新しい日は置き換わり、無い日は残る', () => {
  const local = [session('2026-08-17', 100, 8), session('2026-08-18', 100, 8)];
  const merged = mergedSessions(local, [session('2026-08-17', 500, 12)]);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((s) => s.date === '2026-08-17')?.entries[0]?.sets[0]?.reps, 12);
});

test('mergedExercises: id で置き換わる', () => {
  const local = presetExercises();
  const merged = mergedExercises(local, [{ ...local[0]!, name: '別名', updatedAt: 9 }]);
  assert.equal(merged.length, local.length);
  assert.equal(merged.find((e) => e.id === local[0]!.id)?.name, '別名');
});

test('後から連携したとき、それまでの記録が全部送られる', () => {
  // リモートは空。あとから Firestore を繋いだ初回の状況
  const local = [session('2026-06-01', 100), session('2026-07-15', 200), session('2026-08-19', 300)];
  const p = planSessions(local, []);
  assert.equal(p.toLocal.length, 0);
  assert.deepEqual(p.toRemote.map((s) => s.date), ['2026-06-01', '2026-07-15', '2026-08-19']);
});

test('後から連携したとき、種目の設定も全部送られる', () => {
  const local = presetExercises().map((e) => ({ ...e, tips: 'ラック8段目', updatedAt: 5 }));
  const p = planExercises(local, []);
  assert.equal(p.toRemote.length, local.length);
  assert.equal(p.toLocal.length, 0);
  // 自分で書いたコツも一緒に上がる
  assert.ok(p.toRemote.every((e) => e.tips === 'ラック8段目'));
});

test('2 回目以降は変わっていない記録を送らない（初回だけ全部送る）', () => {
  const local = [session('2026-06-01', 100), session('2026-08-19', 300)];
  const first = planSessions(local, []);
  // 初回で送ったものがリモートに乗った状態で、もう一度突き合わせる
  const second = planSessions(local, first.toRemote);
  assert.ok(isEmpty(second));
});

test('体重だけの日は同期先で消されない（保存する条件と消した印の条件が一致している）', () => {
  const restDay: Session = {
    date: isoDate('2026-08-18'),
    entries: [],
    note: '',
    bodyWeight: 69.8,
    finishedAt: 0,
    updatedAt: 500,
  };
  // 受け取り側で落とされないこと
  assert.ok(!isTombstone(restDay));
  const merged = mergedSessions([], [restDay]);
  assert.deepEqual(merged.map((s) => s.date), ['2026-08-18']);
  assert.equal(merged[0]?.bodyWeight, 69.8);
});

test('本当に空になった日は消した印として働く', () => {
  const cleared: Session = { date: isoDate('2026-08-18'), entries: [], note: '', bodyWeight: 0, finishedAt: 0, updatedAt: 900 };
  assert.ok(isTombstone(cleared));
  assert.deepEqual(mergedSessions([session('2026-08-18', 100)], [cleared]), []);
});

/*
 * 体重は日ごと丸ごとの last-write-wins から外れる。
 *
 * 実際に起きていたこと: 朝にモバイルで体重だけ入れ、夜に Web でトレーニングを
 * 記録すると、Web 側のセッションのほうが updatedAt が大きいので日ごと入れ替わり、
 * 朝に入れた体重が 0 で塗り潰されていた。記録は同期できているのに体重だけ
 * 出てこない、という形で出る。
 */
test('体重を入れた側が古くても、記録を触っただけの側に消されない', () => {
  const weighed: Session = { ...empty('2026-08-20', 100), bodyWeight: 70.2, bodyWeightAt: 100 };
  // もう片方は体重に触っていない（0 のまま）が、あとから種目を記録した
  const trained: Session = { ...session('2026-08-20', 500), bodyWeight: 0 };

  const p = planSessions([trained], [weighed]);
  const merged = p.toLocal[0];
  assert.equal(merged?.bodyWeight, 70.2, 'ローカルに体重が渡る');
  assert.equal(merged?.entries.length, 1, '新しい方の記録は残る');
  // 記録の新しいローカル側が勝った日でも、リモートへ送り返して両側を揃える
  assert.equal(p.toRemote[0]?.bodyWeight, 70.2);
  assert.equal(p.toRemote[0]?.entries.length, 1);
});

test('向きが逆でも同じ（Web で入れた体重がモバイルへ渡る）', () => {
  const weighed: Session = { ...empty('2026-08-20', 100), bodyWeight: 70.2, bodyWeightAt: 100 };
  const trained: Session = { ...session('2026-08-20', 500), bodyWeight: 0 };
  const p = planSessions([weighed], [trained]);
  assert.equal(p.toLocal[0]?.bodyWeight, 70.2);
  assert.equal(p.toLocal[0]?.entries.length, 1);
});

test('あとから入れ直した体重は、古い体重を上書きする', () => {
  const older: Session = { ...empty('2026-08-20', 900), bodyWeight: 70.2, bodyWeightAt: 100 };
  const newer: Session = { ...empty('2026-08-20', 200), bodyWeight: 69.4, bodyWeightAt: 800 };
  // 記録は older が新しく、体重は newer が新しい。それぞれの新しい方が残る
  assert.equal(mergeSession(older, newer).bodyWeight, 69.4);
  assert.equal(mergeSession(older, newer).updatedAt, 900);
  assert.equal(mergeSession(newer, older).bodyWeight, 69.4);
});

test('印を持たない古い記録どうしは、これまでどおり日ごとに新しい方を採る', () => {
  const old: Session = { ...empty('2026-08-20', 100), bodyWeight: 70.2 };
  const recent: Session = { ...empty('2026-08-20', 500), bodyWeight: 69.9 };
  assert.equal(mergeSession(old, recent).bodyWeight, 69.9);
  // 体重に触っていない側（0）は「何も言っていない」ので、印が無くても勝たない
  const untouched: Session = { ...session('2026-08-20', 500), bodyWeight: 0 };
  assert.equal(mergeSession(untouched, old).bodyWeight, 70.2);
});

test('どちらも同じなら、体重を持つ日でも何もしない', () => {
  const day: Session = { ...session('2026-08-20', 100), bodyWeight: 70.2, bodyWeightAt: 90 };
  assert.ok(isEmpty(planSessions([day], [{ ...day }])));
});
