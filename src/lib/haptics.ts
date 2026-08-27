/**
 * 触った合図。
 *
 * ジムでは画面を見ずに ✓ を押すことがある。目で確かめなくても入ったと分かるように、
 * ごく短い振動を返す。種類は 4 つだけ——**一段動いた**（5ms）、**入った**（10ms）、
 * **溜めた力が弾けた**（強い 1 発から減衰）、**記録が動いた**（間を置いた 2 発）。
 * 長い振動は驚きになるし、種類を増やすと意味が読めない。
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

/** ダイヤルや溜めゲージが一段動いた。連続で鳴っても耳障りにならない最小の長さ。 */
export function tickFeedback(): void {
  buzz(5);
}

/** ✓ が入った / 外れた。押したことが指に返るだけの長さ。 */
export function tapFeedback(): void {
  buzz(10);
}

/**
 * 溜めた ✓ が弾けた。強く始めて減衰させる。
 * 溜めている間の小刻み（tickFeedback）との落差で「解放」を出す。
 */
export function smashFeedback(): void {
  buzz([50, 30, 20]);
}

/** 記録が動いた。1 発では祝いに見えないので、間を置いて 2 発返す。 */
export function recordFeedback(): void {
  buzz([12, 60, 24]);
}
