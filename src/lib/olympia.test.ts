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
