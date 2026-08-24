/**
 * 体の前提。いまは身長だけ。
 *
 * ## なぜ要るか
 *
 * 体重の予想を直線のまま伸ばすと、いつか 0 に届く線になる。実際には
 * 落ちるほど落ちにくくなるので、**現実的な落ち着き先**を持たせて、そこへ
 * 近づくほど緩む線にしてある（`forecast.ts` の `limit`）。その落ち着き先を
 * 出すのに身長が要る。
 *
 * ## どこに置くか
 *
 * localStorage。**記録ではないので IndexedDB にも同期にも載せない**（鍵と同じ扱い）。
 * 端末を変えたら入れ直す——毎日変わる値ではないし、そのために保存とバックアップと
 * 突き合わせの規則を 1 つ増やすほうが高くつく。
 *
 * ## 落ち着き先をどう決めるか
 *
 * BMI の帯で持つ。**しぼる向きは BMI 20、増える向きは BMI 25。**
 *
 * 標準体重（BMI 22）を落ち着き先にすると、絞っている途中の人には手前すぎて
 * すぐ線が寝てしまう。かといって痩せの境（BMI 18.5）まで下げると、そこを
 * 目指せる線に見えてしまう——目標を出さないアプリで、それはやらない。
 * 見た目を作る前提で無理なく到達できる範囲として BMI 20 を下、
 * 標準の上限として BMI 25 を上に置いた。どちらも**目安**で、
 * 実際にそこを越えたら越えた側の記録がそのまま線になる（越えられない壁ではない）。
 */

const STORAGE_KEY = 'overload:height-cm';

/** 設定に入っていないときの身長（cm）。 */
export const DEFAULT_HEIGHT_CM = 174;

/** しぼる向きの落ち着き先。 */
export const LEAN_BMI = 20;
/** 増える向きの落ち着き先。 */
export const HEAVY_BMI = 25;

/** 受け付ける身長の範囲。外れた値は既定に戻す（打ち間違いで線が壊れないように）。 */
const MIN_CM = 120;
const MAX_CM = 230;

export function isHeight(cm: number): boolean {
  return Number.isFinite(cm) && cm >= MIN_CM && cm <= MAX_CM;
}

export function storedHeight(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_HEIGHT_CM;
    const cm = Number(raw);
    return isHeight(cm) ? cm : DEFAULT_HEIGHT_CM;
  } catch {
    return DEFAULT_HEIGHT_CM;
  }
}

/** 0 や範囲外を渡したら記憶を消す（既定に戻る）。 */
export function storeHeight(cm: number): void {
  try {
    if (isHeight(cm)) localStorage.setItem(STORAGE_KEY, String(cm));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 保存できない環境では既定のまま動く。予想が少しずれるだけで、記録には効かない
  }
}

/** その身長でその BMI になる体重（kg）。 */
export function weightAtBmi(heightCm: number, bmi: number): number {
  const m = heightCm / 100;
  return bmi * m * m;
}

/** いまの体重の BMI。 */
export function bmiOf(heightCm: number, weightKg: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

/**
 * 体重の予想の落ち着き先。進む向き側の端を返す。
 *
 * すでにその端を越えているときは null。越えた先にどこで落ち着くのかは
 * このアプリには言えないので、**言わずに直線のまま**にする
 * （知らないことを、知っているような形で出さない）。
 */
export function settleWeight(heightCm: number, current: number, falling: boolean): number | null {
  const limit = weightAtBmi(heightCm, falling ? LEAN_BMI : HEAVY_BMI);
  if (falling) return current > limit ? limit : null;
  return current < limit ? limit : null;
}

/** 「BMI 20」。落ち着き先が何なのかを 1 語で言う。 */
export function settleName(falling: boolean): string {
  return `BMI ${falling ? LEAN_BMI : HEAVY_BMI}`;
}

/**
 * 体重が現実的に動く速さの上限（kg/日）。
 *
 * 減るほうは**週に体重の 1%** まで。これより速い減量は、続けても除脂肪体重ごと
 * 落ちていく速さで、見た目を作る目的からは外れる。増えるほうは**週 0.5%** まで
 * ——増量は速いほど脂肪の割合が増えるので、上限は減量より厳しく取る。
 *
 * ここで丸めるのは**予想の線だけ**で、実測は何も動かない。ひと月だけ出た速さを
 * 「3 か月続く」前提に使わないための蓋であって、実際の記録を否定するものではない。
 */
export function maxWeightChangePerDay(currentKg: number, falling: boolean): number {
  return (currentKg * (falling ? 0.01 : 0.005)) / 7;
}
