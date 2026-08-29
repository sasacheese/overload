import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHAMPIONS, championAt } from './olympia.ts';

test('CHAMPIONS: 1965 年からの 19 人。名前と回数が埋まっている', () => {
  assert.equal(CHAMPIONS.length, 19);
  assert.equal(CHAMPIONS[0]?.name, 'Larry Scott');
  assert.equal(CHAMPIONS.at(-1)?.name, 'Samson Dauda');
  for (const c of CHAMPIONS) {
    assert.ok(c.name.length > 0);
    assert.ok(c.wins >= 1);
    assert.ok(c.reign.length > 0);
    assert.ok(c.note.length > 0);
    assert.ok(c.flavor.ja.length > 0);
  }
});

test('CHAMPIONS: 本人の言葉（quote）は出典の確かな 3 つだけに絞る', () => {
  // ここが増えるときは、出典を確かめてから足すこと（olympia.ts の冒頭に方針）
  const quoted = CHAMPIONS.filter((c) => c.flavor.kind === 'quote').map((c) => c.name);
  assert.deepEqual(quoted, ['Arnold Schwarzenegger', 'Lee Haney', 'Ronnie Coleman']);
  for (const c of CHAMPIONS) {
    if (c.flavor.kind === 'quote') {
      assert.ok(c.flavor.original.length > 0);
      // 引用は短い言い回しに留める（長い引用は著作権の問題を持つ）
      assert.ok(c.flavor.original.split(' ').length <= 15);
    }
  }
});

test('championAt: 通算 n 枚目 → 初代から n 人目。全員そろったら 2 巡目', () => {
  assert.equal(championAt(1).champion.name, 'Larry Scott');
  assert.equal(championAt(1).lap, 1);
  assert.equal(championAt(3).champion.name, 'Arnold Schwarzenegger');
  assert.equal(championAt(19).champion.name, 'Samson Dauda');
  // 20 枚目で 2 巡目の初代に戻る
  assert.equal(championAt(20).champion.name, 'Larry Scott');
  assert.equal(championAt(20).lap, 2);
  assert.equal(championAt(20).index, 0);
});
