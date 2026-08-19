/**
 * 効く筋肉の図。前面と背面を並べ、主働筋を赤・補助を薄い赤で塗る。
 *
 * 解剖図の写実性は狙っていない。ジムで一瞬見て「体のどのあたりか」が分かれば
 * 用は足りるので、丸みのある矩形と円で構成した幾何の抽象にしてある。写実的な
 * 筋肉図はこのアプリの静かな見た目から浮くし、小さく描くとかえって読めない。
 *
 * ここの key は types.ts の MUSCLES と 1 対 1。片方を足したらもう片方も足す。
 */

import { MUSCLES, type Muscle } from '../lib/types.ts';

type Props = {
  primary: readonly Muscle[];
  secondary: readonly Muscle[];
};

/** 左右対称の部位は 2 つの図形を 1 組にする。 */
const REGIONS: Record<Muscle, readonly (readonly [number, number, number, number, number])[]> = {
  // [x, y, width, height, 角丸]
  chest: [
    [25, 20, 8.5, 13, 3],
    [34.5, 20, 8.5, 13, 3],
  ],
  frontDelt: [
    [16.5, 18.5, 11, 11, 5.5],
    [40.5, 18.5, 11, 11, 5.5],
  ],
  sideDelt: [
    [14.5, 21, 7, 11, 3.5],
    [46.5, 21, 7, 11, 3.5],
    [78.5, 21, 7, 11, 3.5],
    [110.5, 21, 7, 11, 3.5],
  ],
  biceps: [
    [17, 31, 7, 13, 3.5],
    [44, 31, 7, 13, 3.5],
  ],
  forearm: [
    [14, 45, 6.5, 15, 3],
    [47.5, 45, 6.5, 15, 3],
    [78, 45, 6.5, 15, 3],
    [111.5, 45, 6.5, 15, 3],
  ],
  abs: [[28, 34, 12, 20, 2]],
  obliques: [
    [24.5, 36, 3.5, 16, 1.75],
    [40, 36, 3.5, 16, 1.75],
  ],
  quads: [
    [25, 56, 8, 24, 3.5],
    [35, 56, 8, 24, 3.5],
  ],
  calves: [
    [26, 82, 6.5, 18, 3],
    [35.5, 82, 6.5, 18, 3],
    [90, 84, 6.5, 16, 3],
    [99.5, 84, 6.5, 16, 3],
  ],
  // ── 背面 ──
  traps: [[89, 16, 18, 9, 3]],
  rearDelt: [
    [80.5, 18.5, 11, 11, 5.5],
    [104.5, 18.5, 11, 11, 5.5],
  ],
  lats: [
    [88, 26, 9, 20, 3],
    [99, 26, 9, 20, 3],
  ],
  midBack: [[92, 25, 12, 14, 2]],
  triceps: [
    [81, 31, 7, 13, 3.5],
    [108, 31, 7, 13, 3.5],
  ],
  lowerBack: [[92, 44, 12, 12, 2]],
  glutes: [
    [89, 56, 8.5, 13, 4],
    [98.5, 56, 8.5, 13, 4],
  ],
  hams: [
    [89.5, 70, 8, 18, 3.5],
    [98.5, 70, 8, 18, 3.5],
  ],
};

/** 塗りの重なり順。広い部位を先に描き、細い部位が隠れないようにする。 */
const DRAW_ORDER: readonly Muscle[] = [
  'traps',
  'lats',
  'midBack',
  'chest',
  'frontDelt',
  'rearDelt',
  'sideDelt',
  'abs',
  'obliques',
  'lowerBack',
  'glutes',
  'biceps',
  'triceps',
  'forearm',
  'quads',
  'hams',
  'calves',
];

export function BodyMap({ primary, secondary }: Props) {
  const primarySet = new Set(primary);
  const secondarySet = new Set(secondary);

  return (
    <svg className="bodymap" viewBox="0 0 132 116" role="img" aria-label={ariaLabel(primary, secondary)}>
      {/* 頭と首。塗り分けの対象ではないので、常に地の色 */}
      {[34, 98].map((cx) => (
        <g key={cx} className="base">
          <circle cx={cx} cy={9} r={6} />
          <rect x={cx - 3} y={14} width={6} height={4} rx={1.5} />
        </g>
      ))}

      {DRAW_ORDER.map((muscle) => {
        const state = primarySet.has(muscle) ? 'primary' : secondarySet.has(muscle) ? 'secondary' : 'base';
        return (
          <g key={muscle} className={state}>
            {REGIONS[muscle].map(([x, y, w, h, r], i) => (
              <rect key={i} x={x} y={y} width={w} height={h} rx={r} />
            ))}
          </g>
        );
      })}

      <text className="bodymap-caption" x={34} y={112} textAnchor="middle">
        前
      </text>
      <text className="bodymap-caption" x={98} y={112} textAnchor="middle">
        後
      </text>
    </svg>
  );
}

function ariaLabel(primary: readonly Muscle[], secondary: readonly Muscle[]): string {
  const main = primary.map((m) => MUSCLES[m]).join('、');
  const sub = secondary.map((m) => MUSCLES[m]).join('、');
  return sub === '' ? `効く筋肉: ${main}` : `効く筋肉: ${main}。補助: ${sub}`;
}
