/**
 * 触った合図。
 *
 * ジムでは画面を見ずに ✓ を押すことがある。目で確かめなくても入ったと分かるように、
 * ごく短い振動を返す。長さは 2 種類だけ——**入った**（10ms）と**記録が動いた**
 * （3 回に分けた 40ms 相当）。長い振動は驚きになるし、種類を増やすと意味が読めない。
 *
 * `navigator.vibrate` が無い端末（iOS Safari が該当する）では何も起きない。
 * 鳴らない前提で作ってあるので、これが効くかどうかで操作の可否は変わらない。
 * 触覚を当てにした表示（「振動でお知らせ」のような文言）も置かない。
 */

function buzz(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // 効かない端末では何も起きなくてよい
  }
}

/** ✓ が入った / 外れた。押したことが指に返るだけの長さ。 */
export function tapFeedback(): void {
  buzz(10);
}

/** 記録が動いた。1 発では祝いに見えないので、間を置いて 2 発返す。 */
export function recordFeedback(): void {
  buzz([12, 60, 24]);
}
