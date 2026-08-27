/**
 * 溜め切った ✓ が弾けたとき、**画面ごと割る**演出。
 *
 * ボタンの中の破裂（PowerCheck の `.burst`）はセット行の中で完結していて、
 * 押している指で半分隠れる。溜めに 1 秒近くかけたことに見合う手応えを返すには、
 * 弾けた先が行の外——画面そのものへ出ていくほうが素直だった。
 *
 * 出るものは 4 つ。押した場所を中心に、
 *
 *  1. **閃光**。最初の 1 フレームを白で飛ばす
 *  2. **亀裂**。画面の外まで走る細い線。中心から引かれて（stroke-dashoffset）、
 *     割れ目が伸びていくように見せる
 *  3. **破片**。亀裂の間の面が外へ飛ぶ。数と距離は記録の格で変わる
 *  4. **衝撃波**。画面の対角を越える輪
 *
 * 加えて画面全体を一瞬ぶらす（`is-quaking` を html に付ける）。React が触らない
 * 要素なので、直接付けて外す。
 *
 * 動きを減らす設定では**丸ごと出さない**。画面が割れて揺れる絵は、その設定を
 * している人にとっては加減の問題ではない。
 */

import { useEffect, useRef, useState } from 'react';
import type { RecordTier } from '../lib/records.ts';
import { Overlay } from './Overlay.tsx';

/** 割れた絵の寿命。いちばん長い破片に合わせる。 */
export const SHATTER_MS = 900;

/** 画面が揺れている長さ。長いと酔うので、短く強く。 */
const QUAKE_MS = 420;

export type ShatterTier = RecordTier | 'plain';

/** 亀裂と破片の数。格が上がるほど激しく割れる。 */
const CRACKS: Record<ShatterTier, number> = { plain: 7, rare: 9, epic: 11, legend: 14 };
const CHUNKS: Record<ShatterTier, number> = { plain: 10, rare: 14, epic: 18, legend: 24 };

/**
 * 割れ目の向き。乱数は使わない——描き直しのたびに割れ方が変わると、
 * 同じ 1 回の破裂の途中で絵が飛ぶ。素数でずらした擬似的なばらつきで足りる。
 */
function crackAngle(i: number, count: number): number {
  return i * (360 / count) + ((i * 53) % 26) - 13;
}

type Props = {
  /** 割れる中心。押したボタンの画面上の位置（0〜100 の %）。 */
  origin: { x: number; y: number };
  tier: ShatterTier;
  onDone: () => void;
};

export function Shatter({ origin, tier, onDone }: Props) {
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('is-quaking');
    const stop = setTimeout(() => root.classList.remove('is-quaking'), QUAKE_MS);
    const end = setTimeout(() => done.current(), SHATTER_MS);
    return () => {
      clearTimeout(stop);
      clearTimeout(end);
      root.classList.remove('is-quaking');
    };
  }, []);

  const cracks = CRACKS[tier];
  const chunks = CHUNKS[tier];

  return (
    <Overlay>
      <div
        className={`shatter shatter-${tier}`}
        style={{ '--ox': `${origin.x}%`, '--oy': `${origin.y}%` } as React.CSSProperties}
        aria-hidden="true"
      >
        <span className="shatter-flash" />
        <span className="shatter-wave" />
        {Array.from({ length: cracks }, (_, i) => (
          <span
            key={`c${i}`}
            className="shatter-crack"
            style={
              {
                '--a': `${crackAngle(i, cracks)}deg`,
                '--d': `${(i * 17) % 60}ms`,
                '--w': `${1 + (i % 3)}px`,
              } as React.CSSProperties
            }
          />
        ))}
        {Array.from({ length: chunks }, (_, i) => (
          <span
            key={`k${i}`}
            className="shatter-chunk"
            style={
              {
                '--a': `${i * (360 / chunks) + ((i * 41) % 18) - 9}deg`,
                '--dist': `${46 + ((i * 37) % 44)}vmax`,
                '--spin': `${((i * 97) % 720) - 360}deg`,
                '--d': `${(i * 23) % 90}ms`,
                width: `${6 + (i % 4) * 5}px`,
                height: `${5 + ((i + 2) % 4) * 4}px`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
    </Overlay>
  );
}

/**
 * 動きを減らす設定かどうか。割れる絵はここで丸ごと止める。
 *
 * CSS 側で消すこともできるが、それだと出す側の DOM と html のクラス操作は
 * 走ったままになる（画面は揺れないのに揺らす指示だけが出る）。出さない判断を
 * 出す側でする。
 */
export function useShatterAllowed(): boolean {
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
