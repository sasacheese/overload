import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STRONG_LENGTH, entryFrom, formatKey, isStrongKey, normalizeKey, vaultId } from './vault.ts';

test('normalizeKey: 区切りと大小を吸収する', () => {
  assert.equal(normalizeKey('abcd-efgh 1234'), 'ABCDEFGH1234');
  assert.equal(normalizeKey('  x  '), 'X');
});

test('formatKey: 4 文字ずつ区切る', () => {
  assert.equal(formatKey('ABCD1234EFGH5678JKMN'), 'ABCD-1234-EFGH-5678-JKMN');
  assert.equal(formatKey('AB'), 'AB');
});

test('isStrongKey: 短い鍵は弱いと判定する（拒否はしない）', () => {
  assert.ok(!isStrongKey('secret'));
  assert.ok(isStrongKey('ABCD1234EFGH5678JKMN'));
  assert.ok(isStrongKey('a'.repeat(STRONG_LENGTH)));
  // 区切りは長さに数えない
  assert.ok(!isStrongKey('ABCD-1234'));
});

test('vaultId: 同じ鍵からは同じ ID、違う鍵からは違う ID', async () => {
  const a = await vaultId('ABCD1234EFGH5678JKMN');
  const b = await vaultId('abcd-1234-efgh-5678-jkmn'); // 正規化されて同じ
  const c = await vaultId('ABCD1234EFGH5678JKMP');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('vaultId: 鍵の生値がそのまま ID にならない', async () => {
  const key = 'ABCD1234EFGH5678JKMN';
  assert.ok(!(await vaultId(key)).includes(key.toLowerCase()));
});

test('entryFrom: 鍵があれば鍵で入る', () => {
  assert.deepEqual(entryFrom('ABCD1234EFGH5678JKMN', false), {
    kind: 'key',
    key: 'ABCD1234EFGH5678JKMN',
  });
});

test('entryFrom: 鍵が無く印だけなら鍵なしで入る', () => {
  assert.deepEqual(entryFrom(null, true), { kind: 'local' });
});

test('entryFrom: どちらも無ければ決まっていない（入口を出す）', () => {
  assert.equal(entryFrom(null, false), null);
  // 空文字は「無い」と同じ扱い。localStorage から空で返ることがある
  assert.equal(entryFrom('', false), null);
});

test('entryFrom: 両方立っていたら鍵が勝つ', () => {
  // 起きないようにしてあるが、起きたときに同期できる方を採る。鍵なしを採ると
  // 同期していた記録に手が届かないまま使い続けることになる
  assert.deepEqual(entryFrom('ABCD1234EFGH5678JKMN', true), {
    kind: 'key',
    key: 'ABCD1234EFGH5678JKMN',
  });
});
