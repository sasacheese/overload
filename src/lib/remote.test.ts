import assert from 'node:assert/strict';
import { test } from 'node:test';
import { securityRules } from './remote.ts';

test('securityRules: 同期先 ID を固定した文面になる', () => {
  const rules = securityRules('abc123');
  assert.match(rules, /rules_version = '2';/);
  assert.match(rules, /match \/vaults\/\{vault\}\/\{document=\*\*\}/);
  // 固定していないと誰でも自分の領域を作れてしまうので、ここが要
  assert.match(rules, /request\.auth != null && vault == 'abc123'/);
});

test('securityRules: ID がそのまま埋まる（貼り替えの手間を残さない）', () => {
  assert.ok(securityRules('deadbeef').includes("vault == 'deadbeef'"));
  assert.ok(!securityRules('deadbeef').includes('ここに'));
});
