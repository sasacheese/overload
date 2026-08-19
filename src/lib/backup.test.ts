import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backupFileName, buildBackup, githubNewFileUrl, isRepoSlug, parseBackup } from './backup.ts';
import { presetExercises } from './presets.ts';
import { exerciseId, isoDate, type Session } from './types.ts';

const session: Session = {
  date: isoDate('2026-08-18'),
  entries: [
    { exerciseId: exerciseId('bench-press'), sets: [{ weight: 60, reps: 10, done: true, note: '' }], note: '肩の位置よかった' },
  ],
  note: '睡眠 7 時間',
  bodyWeight: 0,
  updatedAt: 1_755_000_000_000,
};

test('buildBackup → parseBackup で往復する', () => {
  const backup = buildBackup(presetExercises(), [session], new Date(0));
  const parsed = parseBackup(JSON.stringify(backup));
  assert.deepEqual(parsed, backup);
});

test('buildBackup: 並び順が安定する（差分が読める）', () => {
  const a = buildBackup(presetExercises(), [session], new Date(0));
  const b = buildBackup([...presetExercises()].reverse(), [session], new Date(0));
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('parseBackup: 他アプリの JSON は拒否する', () => {
  assert.throws(() => parseBackup('{"app":"other","version":1}'), /このアプリのバックアップではない/);
});

test('parseBackup: JSON として壊れていれば拒否する', () => {
  assert.throws(() => parseBackup('{ぐちゃぐちゃ'), /JSON として読めない/);
});

test('parseBackup: 将来のバージョンは読まずに拒否する', () => {
  assert.throws(() => parseBackup('{"app":"overload","version":99}'), /新しすぎる/);
});

test('parseBackup: 壊れた箇所を場所つきで報告し、部分取り込みはしない', () => {
  const broken = {
    app: 'overload',
    version: 1,
    exportedAt: '2026-08-18T00:00:00.000Z',
    exercises: [],
    sessions: [{ date: '2026-08-18', entries: [{ exerciseId: 'x', sets: [{ weight: 'おもい', reps: 5, done: true }], note: '' }], note: '', bodyWeight: 0, updatedAt: 0 }],
  };
  assert.throws(() => parseBackup(JSON.stringify(broken)), /sessions\[0\]\.entries\[0\]\.sets\[0\]\.weight が数値ではない/);
});

test('parseBackup: 日付の形が違えば拒否する', () => {
  const bad = {
    app: 'overload',
    version: 1,
    exportedAt: '',
    exercises: [],
    sessions: [{ date: '2026/08/18', entries: [], note: '', bodyWeight: 0, updatedAt: 0 }],
  };
  assert.throws(() => parseBackup(JSON.stringify(bad)), /YYYY-MM-DD の形ではない/);
});

test('parseBackup: 未知の部位は拒否する', () => {
  const bad = {
    app: 'overload',
    version: 1,
    exportedAt: '',
    exercises: [{ id: 'x', name: 'x', group: 'ふともも', increment: 2.5, repMin: 8, repMax: 12, sets: 3, restSec: 60, bodyweight: false, archived: false }],
    sessions: [],
  };
  assert.throws(() => parseBackup(JSON.stringify(bad)), /既知の部位ではない/);
});

test('githubNewFileUrl: 本文をクエリに載せる', () => {
  const url = new URL(githubNewFileUrl('sasacheese/overload', 'data/x.json', '{"a":1}'));
  assert.equal(url.pathname, '/sasacheese/overload/new/main');
  assert.equal(url.searchParams.get('filename'), 'data/x.json');
  assert.equal(url.searchParams.get('value'), '{"a":1}');
});

test('isRepoSlug / backupFileName', () => {
  assert.ok(isRepoSlug('sasacheese/overload'));
  assert.ok(!isRepoSlug('overload'));
  assert.ok(!isRepoSlug('a/b/c'));
  assert.equal(backupFileName(new Date(2026, 7, 3)), 'overload-20260803.json');
});
