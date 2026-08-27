/**
 * セット完了の ✓。押せば入るのは今まで通りで、**押しつづけると力が溜まる**。
 *
 * 長押しすると面が下から赤く満ちていき、満ちるほど震えが強くなり、満タンで
 * 破片が飛び散って ✓ が入る。1 セットやり切った体感をそのまま画面に返すための
 * 演出で、赤 =「前進した」の割り当て（styles.css の方針 2）はここでも守っている
 * ——赤く塗られるのは、記録が入るその瞬間へ向かう溜めだけ。
 *
 * 操作としては**飾り**に徹させる。
 *  - 途中で離しても普通のタップとして ✓ が入る。溜め切らないと入らない作りにすると、
 *    ジムで一番よく触るボタンが一番遅いボタンになってしまう
 *  - スクロールに指を取られたら（pointercancel）何もしない。押すつもりが無かった指
 *  - ✓ を外す側は溜めない。取り消しは記録ではないので、静かに外れるだけでいい
 */

import { useEffect, useRef, useState } from 'react';
import { smashFeedback, tickFeedback } from '../lib/haptics.ts';
import { Icon } from './Icon.tsx';

/**
 * 満タンまでの長さ。
 *
 * 短いと「溜めた」実感が出る前に弾け、1 秒を超えると待たされる操作になる。
 * タップでも入るので、ここは記録の速さではなく演出の気持ちよさだけで決めてよい。
 */
const HOLD_MS = 800;

/** 溜まり具合の節目。越えるたびに指へ小さく返し、力が積み上がっていることを伝える。 */
const TICKS = [0.3, 0.6, 0.85] as const;

/** 破片の数。これより少ないと「欠けた」、多いと「粉」に見える。 */
const SHARDS = 12;

/** 弾けた絵の寿命。一番長い破片のアニメーションに合わせる。 */
const BURST_MS = 700;

/**
 * 破片の飛び先。乱数は使わない。
 *
 * 毎回同じ散り方でも一瞬なので見分けは付かず、素数を掛けた擬似的なばらつきで足りる。
 * 乱数にすると描画のたびに style が変わり、React の再描画で破片が飛び直す。
 */
function shardStyle(i: number): React.CSSProperties {
  return {
    '--sa': `${i * (360 / SHARDS) + ((i * 47) % 20) - 10}deg`,
    '--sd': `${30 + ((i * 31) % 24)}px`,
    '--sr': `${(i * 131) % 360}deg`,
    width: `${3 + (i % 3) * 2}px`,
    height: `${2 + ((i + 1) % 3) * 2}px`,
  } as React.CSSProperties;
}

type Props = {
  done: boolean;
  label: string;
  onToggle: () => void;
};

export function PowerCheck({ done, label, onToggle }: Props) {
  const btn = useRef<HTMLButtonElement | null>(null);
  const [charging, setCharging] = useState(false);
  const [burst, setBurst] = useState(false);
  const raf = useRef(0);
  const startAt = useRef(0);
  const ticked = useRef(0);
  /**
   * pointer 側で ✓ を入れた印。ボタンは pointerup のあとに click も出すので、
   * これを見て 2 回目の切り替えを捨てる。キーボードの Enter/Space は pointer を
   * 経由せず click だけが来るため、click 自体は生かしておく必要がある。
   */
  const swallowClick = useRef(false);

  const setCharge = (v: number) => btn.current?.style.setProperty('--charge', String(v));

  const cancelCharge = () => {
    cancelAnimationFrame(raf.current);
    setCharging(false);
    setCharge(0);
  };

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  useEffect(() => {
    if (!burst) return;
    const id = setTimeout(() => setBurst(false), BURST_MS);
    return () => clearTimeout(id);
  }, [burst]);

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
      // 捕まえられない環境では、真上で離したときだけ入る素のボタンに近づくだけ
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
      cancelCharge();
      setBurst(true);
      onToggle();
      smashFeedback();
    };
    raf.current = requestAnimationFrame(loop);
  };

  const onPointerUp = () => {
    if (done || swallowClick.current) return;
    // 溜め切る前に離した。普通のタップとして入れる。溜めは義務にしない
    cancelCharge();
    swallowClick.current = true;
    onToggle();
  };

  const onPointerCancel = () => {
    // スクロールに指を取られた。押すつもりの指ではないので、溜めだけ静かに戻す
    cancelCharge();
  };

  return (
    <button
      type="button"
      ref={btn}
      className={`check ${done ? 'is-on' : ''} ${charging ? 'is-charging' : ''} ${burst ? 'is-burst' : ''}`}
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
        onToggle();
      }}
    >
      <Icon name="check" />
      {burst ? (
        <span className="burst" aria-hidden="true">
          <span className="burst-flash" />
          <span className="burst-ring" />
          {Array.from({ length: SHARDS }, (_, i) => (
            <span key={i} className="burst-shard" style={shardStyle(i)} />
          ))}
        </span>
      ) : null}
    </button>
  );
}
