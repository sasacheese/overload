/**
 * 溜め切った ✓ が弾けたとき、**画面ごと砕け散る**演出。
 *
 * ガラスにヒビが走る絵ではない。**拳で殴られたレンガが粉々になって爆散する**、
 * という絵にしてある。割れ目が伸びていく静かな壊れ方ではなく、当たった瞬間に
 * 全部が砕けて外へ飛ぶ壊れ方。溜めに 1 秒近くかけたことに見合う手応えを返すのが
 * 目的なので、時間をかけて広がるものより、最初の 1 拍が最大であるほうが合っている。
 *
 * 出るものは 5 つ。押した場所を中心に、
 *
 *  1. **衝撃の光**。芯の白と、十字に伸びる閃光。当たった瞬間を確定させる
 *  2. **粉塵**。大きく柔らかい塊が外へ膨らんで薄れる。「粉々」を担うのはこれ
 *  3. **瓦礫**。欠片が放射状にまっすぐ飛んで薄れる。落とさない——重さで落ちる絵は
 *     時間の長い演出で、こちらは弾けた一瞬だけを見せたいので、途中で下へ引くと
 *     そこで拍が切れる
 *  4. **細礫**。細かい粒を大量に。粉塵と瓦礫のあいだを埋めるのがこれで、
 *     数がそのまま「粉々になった」の density になる
 *  5. **衝撃波**。画面の対角を越える輪
 *
 * 加えて画面全体を短く強くぶらす（`is-quaking` を html に付ける）。
 * React が触らない要素なので、直接付けて外す。
 *
 * 動きを減らす設定では**丸ごと出さない**。画面が砕けて揺れる絵は、その設定を
 * している人にとっては加減の問題ではない。
 */

import { useEffect, useRef, useState } from 'react';
import type { RecordTier } from '../lib/records.ts';
import { Overlay } from './Overlay.tsx';

/** 砕けた絵の寿命。いちばん長い粉塵に合わせる。 */
export const SMASH_MS = 1100;

/** 画面が揺れている長さ。長いと酔うので、短く強く。 */
const QUAKE_MS = 460;

export type SmashTier = RecordTier | 'plain';

/**
 * 飛び散るものの数。格が上がるほど激しく砕ける。
 *
 * 細礫は瓦礫の 4 倍ほど撒く。**粉々に見えるかどうかは粒の数で決まる**ので、
 * 大きい欠片を増やすより細かいものを増やすほうが効く（大きいのを増やすと、
 * 砕けたというより物が飛んできたように見える）。
 */
const CHUNKS: Record<SmashTier, number> = { plain: 22, rare: 28, epic: 34, legend: 42 };
const GRIT: Record<SmashTier, number> = { plain: 80, rare: 100, epic: 125, legend: 155 };
const DUST: Record<SmashTier, number> = { plain: 7, rare: 9, epic: 11, legend: 13 };

/**
 * 飛び先。乱数は使わない——描き直しのたびに散り方が変わると、同じ 1 回の
 * 破裂の途中で絵が飛ぶ。素数でずらした擬似的なばらつきで足りる。
 */
function spread(i: number, count: number, jitter: number): number {
  return i * (360 / count) + ((i * 53) % (jitter * 2)) - jitter;
}

/** 瓦礫。まっすぐ飛んで薄れる。大きさも飛距離もばらけさせて群れに見せる。 */
function chunkStyle(i: number, count: number): React.CSSProperties {
  const size = 4 + (i % 6) * 3;
  return {
    '--a': `${spread(i, count, 16)}deg`,
    '--d': `${26 + ((i * 37) % 48)}vmax`,
    '--spin': `${((i * 97) % 900) - 450}deg`,
    '--delay': `${(i * 13) % 70}ms`,
    width: `${size}px`,
    height: `${size - 1 - (i % 3)}px`,
  } as React.CSSProperties;
}

/**
 * 細礫。瓦礫より小さく、速く、遠くへ。
 *
 * 数が多いので、飛距離を 3 段にばらけさせて層を作る。全部同じ速さで広がると
 * 1 枚の輪に見えて、粒が散っているようには見えない。
 */
function gritStyle(i: number, count: number): React.CSSProperties {
  const layer = i % 3;
  return {
    '--a': `${spread(i, count, 26)}deg`,
    '--d': `${(30 + layer * 22) + ((i * 41) % 26)}vmax`,
    '--delay': `${(i * 7) % 70}ms`,
    width: `${1 + (i % 3)}px`,
    height: `${1 + ((i + 1) % 3)}px`,
  } as React.CSSProperties;
}

/** 粉塵。ゆっくり膨らんで薄れる。「粉々」の実体はこれが担う。 */
function dustStyle(i: number, count: number): React.CSSProperties {
  return {
    '--a': `${spread(i, count, 26)}deg`,
    '--d': `${10 + ((i * 31) % 20)}vmax`,
    '--size': `${16 + ((i * 23) % 18)}vmax`,
    '--delay': `${(i * 19) % 90}ms`,
  } as React.CSSProperties;
}

type Props = {
  /** 砕ける中心。押したボタンの画面上の位置（0〜100 の %）。 */
  origin: { x: number; y: number };
  tier: SmashTier;
  onDone: () => void;
};

export function Smash({ origin, tier, onDone }: Props) {
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('is-quaking');
    const stop = setTimeout(() => root.classList.remove('is-quaking'), QUAKE_MS);
    const end = setTimeout(() => done.current(), SMASH_MS);
    return () => {
      clearTimeout(stop);
      clearTimeout(end);
      root.classList.remove('is-quaking');
    };
  }, []);

  const chunks = CHUNKS[tier];
  const grit = GRIT[tier];
  const dust = DUST[tier];

  return (
    <Overlay>
      <div
        className={`smash smash-${tier}`}
        style={{ '--ox': `${origin.x}%`, '--oy': `${origin.y}%` } as React.CSSProperties}
        aria-hidden="true"
      >
        {/* 粉塵はいちばん奥。瓦礫がその手前を飛ぶ */}
        {Array.from({ length: dust }, (_, i) => (
          <span key={`d${i}`} className="smash-dust" style={dustStyle(i, dust)} />
        ))}
        <span className="smash-ring" />
        <span className="smash-flare" />
        <span className="smash-core" />
        {Array.from({ length: chunks }, (_, i) => (
          <span key={`c${i}`} className="smash-chunk" style={chunkStyle(i, chunks)} />
        ))}
        {Array.from({ length: grit }, (_, i) => (
          <span key={`g${i}`} className="smash-grit" style={gritStyle(i, grit)} />
        ))}
      </div>
    </Overlay>
  );
}

/**
 * 動きを減らす設定かどうか。砕ける絵はここで丸ごと止める。
 *
 * CSS 側で消すこともできるが、それだと出す側の DOM と html のクラス操作は
 * 走ったままになる（画面は揺れないのに揺らす指示だけが出る）。出さない判断を
 * 出す側でする。
 */
export function useSmashAllowed(): boolean {
  const [allowed, setAllowed] = useState(true);
  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = matchMedia('(prefers-reduced-motion: reduce)');
    } catch {
      return;
    }
    const on = () => setAllowed(!mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return allowed;
}
