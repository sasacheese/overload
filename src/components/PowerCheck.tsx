/**
 * セット完了の ✓。**押しつづけて溜め切ると**弾けて入る。
 *
 * 長押しすると面が下から赤く満ちていき、満ちるほど震えと光が強くなり、満タンで
 * 破片が飛び散って ✓ が入る。**途中で離すと力が抜けて何も起きない**（塗りが下へ
 * 引いていく）——やり切ったセットを押し切って刻む、を操作そのものにしてある。
 * 溜めの長さは 1 秒未満なので、記録のたびの負担にはならない。
 *
 * ## 演出は、押している指の外へ出す
 *
 * ボタンは 44px しかないので、**押している指がその上を完全に覆う**。ボタンの中だけで
 * 溜まりや破裂を描いても、当人には何も見えない（実際にそうなっていた）。そこで
 * 溜まり具合を**セット行そのもの**に持たせている——行の下端を走る線が右（ボタン側）
 * から左へ伸び、行がわずかに色づく。指が乗っているのは行の右端だけなので、
 * 残りは全部見える。弾けた瞬間は、その線が行いっぱいに開いて消える（`--release`）
 * ——溜めていた線がそのまま解き放たれる形にしてあり、見ていた場所から目を移さずに
 * 「入った」が分かる。
 *
 * 行への受け渡しはカスタムプロパティ（`--charge` と `--release`）だけで行う。
 * クラスを足すと、✓ が入った瞬間の再描画で React が className ごと書き戻して消える。
 *
 *  - スクロールに指を取られたら（pointercancel）静かに力が抜けるだけ
 *  - ✓ を外す側は溜めない。取り消しは記録ではないので、タップで静かに外れる
 *  - キーボード（Enter/Space）は溜めずに入る。長押しは指のための操作で、
 *    キーに同じ負担を課さない
 *
 * 記録更新と同時に入ったときは、破裂が更新の格に応じて派手になる。どの格かは
 * onToggle の戻り値で受け取る（lib/records.ts の recordTier）——破裂を描き始める
 * 瞬間に判定が要るので、あとから prop で降ってくるのを待たず、その場で返してもらう。
 *
 * ## 画面ごと砕く
 *
 * ボタンの中の破裂は、押している指と行の幅に閉じ込められている。1 秒近く溜めた
 * ことに見合う手応えにはならないので、弾けた先を画面そのものへ出す（`Smash`）。
 * 押した場所を中心に粉塵と瓦礫が飛び、画面が一瞬ぶれる。
 * ボタンの中の破裂は、その中心で起きている小さいほうとして残してある。
 */

import { useEffect, useRef, useState } from 'react';
import { smashFeedback, tickFeedback } from '../lib/haptics.ts';
import type { RecordTier } from '../lib/records.ts';
import { Icon } from './Icon.tsx';
import { Smash, useSmashAllowed } from './Smash.tsx';

/** 破裂の格。plain は更新なしの通常の破裂。 */
type BurstTier = RecordTier | 'plain';

/**
 * 殴られたレンガの割れ目。ボタンの中（44px）に引く。
 *
 * 中心から縁へ、途中で 1 度折れる線を 6 本。まっすぐ引くと星印になってしまい、
 * 割れ目に見えない——ひびは必ずどこかで向きを変える。左右非対称にしてあるのも
 * 同じ理由で、対称なひびは模様として読まれる。
 *
 * 24 の枠で描いて、ボタンの大きさへ伸ばす（viewBox に任せる）。
 */
const CRACKS = [
  'M12 12 15 7 14 2',
  'M12 12 18 10 23 6',
  'M12 12 19 15 24 14',
  'M12 12 15 18 13 23',
  'M12 12 6 16 2 21',
  'M12 12 4 11 0 8',
] as const;

/**
 * 満タンまでの長さ。
 *
 * 短いと「溜めた」実感が出る前に弾け、1 秒を超えると毎セットの負担になる。
 * 溜め切らないと入らない作りなので、ここは演出と記録の速さの両方に効く。
 */
const HOLD_MS = 800;

/** 途中で離したときに、力が抜けきるまで。 */
const DRAIN_MS = 180;

/** 弾けた線が行いっぱいに開いて消えるまで。 */
const RELEASE_MS = 460;

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
  /**
   * 溜まり具合を映すセット行。指の外に出せる面はここしかない。
   *
   * ボタンから毎回たぐらず自分で持つ。外れるときの片付けは useEffect の戻りで
   * 走るが、その時点で React は ref を外し終えていて `btn.current` は null——
   * たぐる作りにすると、**片付けたい場面でだけ行が見つからない**ことになる。
   */
  const row = useRef<HTMLElement | null>(null);
  const [charging, setCharging] = useState(false);
  const [burst, setBurst] = useState<BurstTier | null>(null);
  /** 画面が砕けている最中。中心は押したボタンの位置（画面に対する %）。 */
  const [smash, setSmash] = useState<{ x: number; y: number; tier: BurstTier } | null>(null);
  const smashAllowed = useSmashAllowed();
  const raf = useRef(0);
  /** 解き放った線の減衰。溜めとは別に持つ——溜め側を止めても線は走り切らせる */
  const releaseRaf = useRef(0);
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
    // 0 は書かずに消す。見た目は同じだが、行に溜めの跡が残らない
    const write = (el: HTMLElement | null) => {
      if (el === null) return;
      if (v <= 0) el.style.removeProperty('--charge');
      else el.style.setProperty('--charge', String(v));
    };
    write(btn.current);
    // 行にも同じ値を渡す。ボタンの上は指で埋まっているので、見えるのはこちら
    write(row.current);
  };

  /**
   * 弾けた合図を行に流す。溜めの線が行いっぱいに開いて消える。
   *
   * 破裂の輪と閃光はボタンの真上——押している指の下——で起きるので、当人には
   * ほとんど見えない。指の外に出るのはこの線だけなので、破裂と同じ拍で走らせる。
   */
  const release = () => {
    const el = row.current;
    if (el === null) return;
    const t0 = performance.now();
    const fade = () => {
      const q = Math.min(1, (performance.now() - t0) / RELEASE_MS);
      el.style.setProperty('--release', String(1 - q));
      if (q < 1) releaseRaf.current = requestAnimationFrame(fade);
      else el.style.removeProperty('--release');
    };
    releaseRaf.current = requestAnimationFrame(fade);
  };

  useEffect(() => {
    row.current = btn.current?.closest<HTMLElement>('.set-item') ?? null;
    return () => {
      cancelAnimationFrame(raf.current);
      cancelAnimationFrame(releaseRaf.current);
      // 溜めかけ・弾けかけのまま外れたら、行に残した塗りも一緒に持っていく
      row.current?.style.removeProperty('--charge');
      row.current?.style.removeProperty('--release');
    };
  }, []);

  useEffect(() => {
    if (burst === null) return;
    const id = setTimeout(() => setBurst(null), BURST_MS);
    return () => clearTimeout(id);
  }, [burst]);

  /**
   * 画面を砕く。中心は押したボタンの真ん中。
   *
   * 位置は弾けた瞬間に測る。行はスクロールで動くので、あとから測ると砕けた
   * 中心が押した場所からずれる。
   */
  const smashFrom = (tier: BurstTier) => {
    if (!smashAllowed) return;
    const el = btn.current;
    if (el === null) return;
    const r = el.getBoundingClientRect();
    setSmash({
      x: ((r.left + r.width / 2) / window.innerWidth) * 100,
      y: ((r.top + r.height / 2) / window.innerHeight) * 100,
      tier,
    });
  };

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
      release();
      const tier = onToggle() ?? 'plain';
      setBurst(tier);
      smashFrom(tier);
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
        if (!done) {
          setBurst(tier ?? 'plain');
          smashFrom(tier ?? 'plain');
        }
      }}
    >
      <Icon name="check" />
      {burst ? (
        <span className={`burst burst-${burst}`} aria-hidden="true">
          {/*
            殴られた跡。面が凹んで（内側の影）、そこからひびが縁まで走る。
            破片が飛んだあとに残るのはこれだけなので、閃光より長く置いてある。
          */}
          <svg className="burst-crater" viewBox="0 0 24 24" preserveAspectRatio="none">
            {CRACKS.map((d) => (
              <path key={d} d={d} />
            ))}
          </svg>
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
      {smash ? <Smash origin={smash} tier={smash.tier} onDone={() => setSmash(null)} /> : null}
    </button>
  );
}
