/**
 * 推定 1RM の推移。1 日の出来ではなく線の向きを見るための表示。
 * 悪い日が 1 回あっても線は上を向いたままなので、続ける判断がしやすい。
 */

type Props = {
  values: readonly number[];
  /** 直近の点を強調するか。自己ベスト更新時に色を変える。 */
  highlightLast: 'best' | 'normal';
};

export function Sparkline({ values, highlightLast }: Props) {
  if (values.length < 2) return null;

  const width = 100;
  const height = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    // 上下に 3px の余白を残して線が枠に張り付かないようにする
    const y = height - 3 - ((v - min) / span) * (height - 6);
    return [x, y] as const;
  });
  const last = points.at(-1)!;

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={last[0]} cy={last[1]} r="2.5" className={highlightLast === 'best' ? 'spark-best' : 'spark-dot'} />
    </svg>
  );
}
