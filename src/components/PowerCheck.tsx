/**
 * セット完了の ✓。**押しつづけて溜め切ると**弾けて入る。
 *
 * 長押しすると面が下から赤く満ちていき、満ちるほど震えと光が強くなり、満タンで
 * 破片が飛び散って ✓ が入る。**途中で離すと力が抜けて何も起きない**（塗りが下へ
 * 引いていく）——やり切ったセットを押し切って刻む、を操作そのものにしてある。
 * 溜めの長さは 1 秒未満なので、記録のたびの負担にはならない。
 *
 *  - スクロールに指を取られたら（pointercancel）静かに力が抜けるだけ
 *  - ✓ を外す側は溜めない。取り消しは記録ではないので、タップで静かに外れる
 *  - キーボード（Enter/Space）は溜めずに入る。長押しは指のための操作で、
 *    キーに同じ負担を課さない
 *
 * 記録更新と同時に入ったときは、破裂が更新の格に応じて派手になる。どの格かは
 * onToggle の戻り値で受け取る（lib/records.ts の recordTier）——破裂を描き始める
 * 瞬間に判定が要るので、あとから prop で降ってくるのを待たず、その場で返してもらう。
 */

import { useEffect, useRef, useState } from 'react';
import { smashFeedback, tickFeedback } from '../lib/haptics.ts';
import type { RecordTier } from '../lib/records.ts';
import { Icon } from './Icon.tsx';

/** 破裂の格。plain は更新なしの通常の破裂。 */
type BurstTier = RecordTier | 'plain';

/**
 * 満タンまでの長さ。
 *
 * 短いと「溜めた」実感が出る前に弾け、1 秒を超えると毎セットの負担になる。
 * 溜め切らないと入らない作りなので、ここは演出と記録の速さの両方に効く。
 */
const HOLD_MS = 800;

/** 途中で離したときに、力が抜けきるまで。 */
const DRAIN_MS = 180;

/** 溜まり具合の節目。越えるたびに指へ小さく返し、力が積み上がっていることを伝える。 */
const TICKS = [0.3, 0.6, 0.85] as const;

/** 破裂の絵の寿命。一番長い破片のアニメーションに合わせる。 */
const BURST_MS = 700;

/** 破片・火花の数と飛距離。格が上がるほど多く、遠くへ飛ぶ。 */
const SHARDS: Record<BurstTier, number> = { plain: 12, rare: 16, epic: 18, legend: 22 };
const SPARKS: Record<BurstTier, number> = { plain: 0, rare: 0, epic: 5, legend: 8 };
const REACH: Record<BurstTier, number> = { plain: 1, rare: 1.2, epic: 1.35, legend: 1.6 };

/**
 * 破片の飛び先。乱数は使わない。
 *
 * 毎回同じ散り方でも一瞬なので見分けは付かず、素数を掛けた擬似的なばらつきで足りる。
 * 乱数にすると描画のたびに style が変わり、React の再描画で破片が飛び直す。
 */
function shardStyle(i: number, tier: BurstTier): React.CSSProperties {
  return {
    '--sa': `${i * (360 / SHARDS[tier]) + ((i * 47) % 20) - 10}deg`,
    '--sd': `${(30 + ((i * 31) % 24)) * REACH[tier]}px`,
    '--sr': `${(i * 131) % 360}deg`,
    width: `${3 + (i % 3) * 2}px`,
    height: `${2 + ((i + 1) % 3) * 2}px`,
  } as React.CSSProperties;
}

/** 火花。破片と違って上へ舞い、瞬きながら消える。 */
function sparkStyle(i: number): React.CSSProperties {
  return {
    '--px': `${((i * 53) % 64) - 32}px`,
    '--py': `${-6 - ((i * 29) % 18)}px`,
    '--d': `${(i * 67) % 180}ms`,
  } as React.CSSProperties;
}

type Props = {
  done: boolean;
  label: string;
  /**
   * ✓ の付け外し。付けた結果が記録更新なら、その格を返してもらう
   * （破裂の派手さに使う）。外したときと更新なしのときは null。
   */
  onToggle: () => RecordTier | null;
};

export function PowerCheck({ done, label, onToggle }: Props) {
  const btn = useRef<HTMLButtonElement | null>(null);
  const [charging, setCharging] = useState(false);
  const [burst, setBurst] = useState<BurstTier | null>(null);
  const raf = useRef(0);
  const startAt = useRef(0);
  const ticked = useRef(0);
  /** いまの溜まり具合。途中で離したとき、ここから力が抜けていく。 */
  const charge = useRef(0);
  /**
   * pointer 側で処理済みの印。ボタンは pointerup のあとに click も出すので、
   * これを見て click を捨てる——**捨てないと、途中で離しても click で入ってしまう**。
   * キーボードの Enter/Space は pointer を経由せず click だけが来るため、
   * click 自体は生かしておく必要がある。
   */
  const swallowClick = useRef(false);

  const setCharge = (v: number) => {
    charge.current = v;
    btn.current?.style.setProperty('--charge', String(v));
  };

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  useEffect(() => {
    if (burst === null) return;
    const id = setTimeout(() => setBurst(null), BURST_MS);
    return () => clearTimeout(id);
  }, [burst]);

  /** 力が抜ける。満ちた赤が下へ引いていき、何も起きなかったことが目で分かる。 */
  const drain = () => {
    cancelAnimationFrame(raf.current);
    setCharging(false);
    const from = charge.current;
    if (from <= 0) return;
    const t0 = performance.now();
    const fall = () => {
      const q = Math.min(1, (performance.now() - t0) / DRAIN_MS);
      setCharge(from * (1 - q));
      if (q < 1) raf.current = requestAnimationFrame(fall);
    };
    raf.current = requestAnimationFrame(fall);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    /*
     * 印は新しい押下のたびに必ず消す。done の判定より先に置くのは、満タンで
     * 弾けたあと指をボタンの外で離すと click が来ず、印が残ったままになるため
     * ——残っていると、次の押下（✓ を外すタップ）が 1 回食われる。
     */
    swallowClick.current = false;
    if (done || !e.isPrimary) return;
    try {
      // 途中で指がわずかに滑っても離すまで追う。汗ばんだ指は真上に留まらない
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 捕まえられない環境では、真上で離したときだけ判定される素のボタンに近づくだけ
    }
    startAt.current = performance.now();
    ticked.current = 0;
    setCharging(true);
    const loop = () => {
      const p = Math.min(1, (performance.now() - startAt.current) / HOLD_MS);
      // 溜め始めは静かに、満タン手前で一気に。力が「かかっていく」感じは加速で出す
      setCharge(p * p);
      while (ticked.current < TICKS.length && p >= TICKS[ticked.current]!) {
        ticked.current += 1;
        tickFeedback();
      }
      if (p < 1) {
        raf.current = requestAnimationFrame(loop);
        return;
      }
      // 満タン。指を離すのを待たずに弾ける——溜め切った瞬間が一番気持ちいい
      swallowClick.current = true;
      cancelAnimationFrame(raf.current);
      setCharging(false);
      setCharge(0);
      setBurst(onToggle() ?? 'plain');
      smashFeedback();
    };
    raf.current = requestAnimationFrame(loop);
  };

  const onPointerUp = () => {
    if (done || swallowClick.current) return;
    // 溜め切る前に離した。入れない——押し切ることが記録の操作そのもの
    swallowClick.current = true;
    drain();
  };

  const onPointerCancel = () => {
    // スクロールに指を取られた。押すつもりの指ではないので、力が抜けるだけ
    drain();
  };

  return (
    <button
      type="button"
      ref={btn}
      className={`check ${done ? 'is-on' : ''} ${charging ? 'is-charging' : ''} ${
        burst ? `is-burst is-burst-${burst}` : ''
      }`}
      aria-label={label}
      aria-pressed={done}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      /* 長押しで端末のメニューを出させない。溜めている指を横取りされる */
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (swallowClick.current) {
          swallowClick.current = false;
          return;
        }
        const tier = onToggle();
        // キーボードで入れたときも破裂は返す（done はまだ入れる前の値）
        if (!done) setBurst(tier ?? 'plain');
      }}
    >
      <Icon name="check" />
      {burst ? (
        <span className={`burst burst-${burst}`} aria-hidden="true">
          <span className="burst-flash" />
          <span className="burst-ring" />
          {burst !== 'plain' ? <span className="burst-ring is-second" /> : null}
          {Array.from({ length: SHARDS[burst] }, (_, i) => (
            <span key={`s${i}`} className="burst-shard" style={shardStyle(i, burst)} />
          ))}
          {Array.from({ length: SPARKS[burst] }, (_, i) => (
            <span key={`k${i}`} className="burst-spark" style={sparkStyle(i)} />
          ))}
        </span>
      ) : null}
    </button>
  );
}
