import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptySession, hasRecord, isoDate, worthStoring, type Session } from './types.ts';

const base = (over: Partial<Session> = {}): Session => ({ ...emptySession(isoDate('2026-08-19')), ...over });

const done = { weight: 60, reps: 8, done: true, note: '' };

test('worthStoring: 体重だけの日も保存する（休養日に毎日つける使い方が前提）', () => {
  assert.ok(!worthStoring(base()));
  assert.ok(worthStoring(base({ bodyWeight: 69.8 })));
});

test('worthStoring: 種目の行があれば ✓ 前でも保存する', () => {
  const typing = base({
    entries: [{ exerciseId: 'bench-press' as Session['entries'][number]['exerciseId'], sets: [{ ...done, done: false }], note: '' }],
  });
  assert.ok(worthStoring(typing));
});

test('worthStoring: メモだけの日も保存する', () => {
  assert.ok(worthStoring(base({ note: '肩が痛い' })));
  assert.ok(!worthStoring(base({ note: '   ' })));
});

test('hasRecord: 体重だけの日は「やった日」にしない（カレンダーを埋めない）', () => {
  assert.ok(!hasRecord(base({ bodyWeight: 69.8 })));
  assert.ok(
    hasRecord(
      base({
        entries: [{ exerciseId: 'bench-press' as Session['entries'][number]['exerciseId'], sets: [done], note: '' }],
      }),
    ),
  );
});

test('hasRecord と worthStoring は別物。体重だけの日で判定が分かれる', () => {
  const weighOnly = base({ bodyWeight: 70 });
  assert.equal(hasRecord(weighOnly), false);
  assert.equal(worthStoring(weighOnly), true);
});
