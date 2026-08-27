/**
 * 種目一覧の行に添える小さな推移。到達点（推定 1RM か最高レップ）の並びを
 * 1 本の線にしたもので、軸も目盛も持たない——上がっているか、止まっているか、
 * 落ちているかの形だけを見せる。数字が要るときは行を開けば推移の面がある。
 *
 * 線は無彩色。TrendChart の実線は赤だが、一覧では全行に付くので、
 * ここまで赤にすると信号としての赤が薄まる（赤の総面積が小さいほど効く）。
 * 赤を渡すのは**直近が自己ベストの行の終点**だけ——「いま前進の途中にある」
 * 種目が一覧の中で光る。
 */

const WIDTH = 72;
const HEIGHT = 26;
const PAD = 3;
/** これより古い点は描かない。72px に何十点も入れると線が毛羽立って形が消える。 */
const MAX_POINTS = 20;

type Props = {
  /** 到達点の並び。古い順。 */
  values: readonly number[];
  /** 直近が自己ベストか。終点に赤を渡すかが決まる。 */
  atBest: boolean;
};

export function Sparkline({ values, atBest }: Props) {
  const shown = values.slice(-MAX_POINTS);
  if (shown.length < 2) return null;

  const low = Math.min(...shown);
  const high = Math.max(...shown);
  // 変化の無い並びは中央に水平線を引く（0 割りを避けつつ、平らは平らに見せる）
  const range = high - low || 1;

  const x = (i: number) => PAD + (i / (shown.length - 1)) * (WIDTH - PAD * 2);
  const y = (v: number) => PAD + (1 - (v - low) / range) * (HEIGHT - PAD * 2);
  const line = shown.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  return (
    <svg className="sparkline" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
      <polyline className="sparkline-curve" points={line} />
      <circle
        className={`sparkline-end${atBest ? ' is-best' : ''}`}
        cx={x(shown.length - 1)}
        cy={y(shown.at(-1)!)}
        r="2"
      />
    </svg>
  );
}
