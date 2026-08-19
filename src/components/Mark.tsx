/**
 * アプリの印。バーを担いだ V。
 *
 * 上の横棒がバーベル、下が V。V は肩幅から腰へ絞る逆三角形のシルエットで、
 * ワードマークの V と同じ字形を使っている（印と字で同じことを言う）。
 * バーが V の肩幅より少し外へ出ているのは、実際に担いだときの見え方に合わせたもの。
 *
 * 定型の三角をやめた理由: 三角形そのものは輪郭が一般的すぎて、何のしるしにも
 * 見えない。バーと V の 2 要素にすると固有の輪郭になり、間の余白も意味を持つ
 * （担いでいる、という関係が余白で読める）。
 *
 * 角は塗りと同じ色の線を重ねて丸めている（stroke-linejoin: round）。数学どおりの
 * 鋭角は小さく描くと潰れて濁るため。scripts/make-icons.mjs も同じ寸法で描く。
 */

/** バー。V の肩幅より外へ出す。 */
const BAR = { x: 8, y: 13, w: 84, h: 12, r: 3 } as const;

/** V。外側の輪 → 下の一点 → 内側の輪。 */
const V_PATH = 'M15 34 50 89 85 34 67 34 50 66 33 34Z';

/** 角を丸める量。線幅の半分。 */
const ROUND = 1.5;

export function Mark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" role="img" aria-label="OVERLOAD">
      <rect x={BAR.x} y={BAR.y} width={BAR.w} height={BAR.h} rx={BAR.r} fill="currentColor" />
      <path
        d={V_PATH}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={ROUND * 2}
        strokeLinejoin="round"
      />
    </svg>
  );
}
