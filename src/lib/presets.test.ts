import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PRESET_ORDER, guideFor, presetExercises } from './presets.ts';
import { MUSCLES, MUSCLE_GROUP_KEYS, LOAD_MODE_KEYS } from './types.ts';

/*
 * 手書きのデータ 40 件ぶんの整合性を機械で見る。
 *
 * 筋肉や部位の綴り間違いは型が捕まえるが、重複・範囲の逆転・0 以下の刻みは
 * 型では通ってしまい、画面に出るまで気づけない。
 */

const presets = presetExercises();

test('種目が 1 件以上あり、id が重複していない', () => {
  assert.ok(presets.length >= 20);
  assert.equal(new Set(presets.map((e) => e.id)).size, presets.length);
  assert.equal(new Set(presets.map((e) => e.name)).size, presets.length);
});

test('並び順の一覧が種目と 1 対 1', () => {
  assert.equal(PRESET_ORDER.length, presets.length);
  assert.deepEqual([...PRESET_ORDER].sort(), presets.map((e) => e.id as string).sort());
});

test('設定の値が使える範囲にある', () => {
  for (const e of presets) {
    assert.ok(e.name.trim() !== '', `${e.id}: 名前が空`);
    assert.ok(MUSCLE_GROUP_KEYS.includes(e.group), `${e.id}: 部位が不正`);
    assert.ok(LOAD_MODE_KEYS.includes(e.loadMode), `${e.id}: 負荷のかけ方が不正`);
    assert.ok(e.increment > 0, `${e.id}: 刻みが 0 以下`);
    assert.ok(e.repMin >= 1, `${e.id}: レップ下限が 1 未満`);
    assert.ok(e.repMin <= e.repMax, `${e.id}: レップの下限が上限を超えている`);
    assert.ok(e.sets >= 1, `${e.id}: セット数が 1 未満`);
    assert.ok(e.restSec >= 0, `${e.id}: 休憩が負`);
    // 保存前の初期値。ここが埋まっていると利用者のメモを上書きしてしまう
    assert.equal(e.tips, '', `${e.id}: tips は空で始める`);
    assert.equal(e.archived, false, `${e.id}: 最初から非表示になっている`);
    assert.equal(e.updatedAt, 0, `${e.id}: updatedAt が 0 でない`);
  }
});

test('すべての種目に説明がある', () => {
  for (const e of presets) {
    const guide = guideFor(e.id);
    assert.ok(guide, `${e.id}: 説明が無い`);
    assert.ok(guide.howTo.trim().length >= 10, `${e.id}: やり方が短すぎる`);
    assert.ok(guide.primary.length >= 1, `${e.id}: 主働筋が無い`);
    assert.ok(guide.cues.length >= 1, `${e.id}: コツが無い`);
  }
});

test('効く筋肉の指定に重複や矛盾が無い', () => {
  const known = new Set(Object.keys(MUSCLES));
  for (const e of presets) {
    const guide = guideFor(e.id)!;
    const all = [...guide.primary, ...guide.secondary];
    for (const m of all) assert.ok(known.has(m), `${e.id}: 未知の筋肉 ${m}`);
    assert.equal(new Set(guide.primary).size, guide.primary.length, `${e.id}: 主働筋が重複`);
    assert.equal(new Set(guide.secondary).size, guide.secondary.length, `${e.id}: 補助筋が重複`);
    // 主働と補助の両方に入れると一覧に 2 回出る
    for (const m of guide.primary) {
      assert.ok(!guide.secondary.includes(m), `${e.id}: ${m} が主働と補助の両方にある`);
    }
  }
});

test('部位ごとに少なくとも 1 種目ある（画面の分類が空にならない）', () => {
  for (const group of MUSCLE_GROUP_KEYS) {
    assert.ok(presets.some((e) => e.group === group), `${group} の種目が無い`);
  }
});

test('アシストマシンの種目が定義されていて、負荷のかけ方が assist になっている', () => {
  const assist = presets.filter((e) => e.loadMode === 'assist');
  assert.ok(assist.length >= 1);
  for (const e of assist) {
    // 数字を下げるほど負荷が上がることを説明に含めておく
    assert.ok(
      guideFor(e.id)!.cues.some((c) => c.includes('補助')),
      `${e.id}: 補助の向きの説明が無い`,
    );
  }
});
