/**
 * アプリの印。
 *
 * 「前の水準を超える」を図にした。水平の線が前回までの水準で、その上に立って
 * 突き抜けている三角が今日。線は三角の底辺より外へ伸ばしてあり、
 * 三角が線の上に乗って越えている関係が読めるようにしている。
 *
 * ダンベルの絵にしなかったのは、器具の絵は道具の説明になってしまい
 * 「produce する」という立場が出ないため。図形 2 つで済ませて静かに保つ。
 *
 * 三角は currentColor、線は控えめな色を別に受け取る。置く場所によって
 * 線を出さない選択もできる（小さすぎると線が潰れて濁るため）。
 */
export function Mark({
  className,
  lineColor = 'currentColor',
  showLine = true,
}: {
  className?: string;
  lineColor?: string;
  showLine?: boolean;
}) {
  return (
    <svg className={className} viewBox="0 0 100 100" role="img" aria-label="OVERLOAD">
      <path d="M50 17 80 63 20 63Z" fill="currentColor" />
      {showLine ? (
        <rect x="8" y="63" width="84" height="4" fill={lineColor} opacity="0.55" rx="2" />
      ) : null}
    </svg>
  );
}
