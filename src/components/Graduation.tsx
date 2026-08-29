import { useEffect, useRef } from 'react';
import { graduationShift, type Cycle } from '../lib/cycle.ts';
import type { Achievement } from '../lib/records.ts';
import type { Exercise } from '../lib/types.ts';
import { Icon } from './Icon.tsx';
import { Overlay } from './Overlay.tsx';

/**
 * 卒業の祝福。レップ範囲の上限を全セットでやり切った瞬間に、一度だけ出す。
 *
 * 記録更新の祝福（Celebration）と同じカードの器を使い、格は常に金（tier-legend）。
 * 記録更新が「1 セットの前進」を映すのに対し、こちらは**サイクルを 1 つ登り切った**
 * 合図なので、単発の更新より上の格として扱う。
 *
 * ## 絵で先に伝える
 *
 * 文より先に、バーベルの絵で 2 つを伝える。
 *
 * - **達成感**: 金のカード・光線・星は最上位の記録更新と同じ演出
 * - **次に進める**: プレートが 1 枚、上から降りてきてバーに据わる。
 *   重量が増える瞬間そのものを絵にする（アシストは逆で、補助が外れて
 *   プレートが浮き上がって消える。自重のまま卒業したときは、次のプレートを
 *   点線の輪郭で置いて「ここに足せる」ことだけ示す）
 *
 * ## 記録更新と重なったとき
 *
 * 卒業を決める ✓ は、たいてい記録更新（同じ重さでの回数など）も同時に立てる。
 * カードを 2 枚続けて出すと後の 1 枚が前の 1 枚を消すので、卒業のカードに
 * 記録更新を小さく添えて 1 枚にする（呼び分けは SessionView が行う）。
 */

/** 自動で閉じるまで。絵の動き（〜1.5 秒）と文 3 つを読み切れる長さ。 */
const AUTO_CLOSE_MS = 7000;
/** 添える記録更新の上限。祝福（Celebration）と同じ数。 */
const MAX_EXTRA = 3;
const RAYS = 12;
const SPARKLES = 14;

/** 星の置き場所。Celebration と同じ式（乱数を使わず、再描画で飛び直さない）。 */
function sparkleStyle(i: number, count: number): React.CSSProperties {
  const angle = ((i * (360 / count) + (i % 3) * 14) * Math.PI) / 180;
  const dist = 8 + ((i * 37) % 4);
  return {
    '--tx': `${Math.cos(angle) * dist}rem`,
    '--ty': `${Math.sin(angle) * dist * 0.62}rem`,
    '--d': `${(i * 131) % 1100}ms`,
    '--s': `${0.6 + ((i * 29) % 5) / 6}`,
  } as React.CSSProperties;
}

/** プレートの動き方。増える（重量・加重）/ 外れる（アシスト）/ 足せると示すだけ（自重のまま）。 */
type Mode = 'add' | 'remove' | 'suggest';

function modeOf(ex: Exercise, cycle: Cycle): Mode {
  if (cycle.next === null) return 'suggest';
  return ex.loadMode === 'assist' ? 'remove' : 'add';
}

/**
 * バーベルの線画。アイコン（Icon.tsx）と同じストロークの流儀で、色は金。
 *
 * 両端のいちばん外のプレート（.grad-new）だけが動く。据え付けの 2 枚と
 * カラーは止まったまま——動くものが 1 種類だけだと、何が変わったのかが
 * 絵だけで読める。
 */
function BarbellScene() {
  const plate = (x: number, tall: boolean, extra = '') => (
    <rect
      className={extra}
      x={x}
      y={tall ? 20 : 27}
      width={11}
      height={tall ? 56 : 42}
      rx={3.5}
    />
  );
  return (
    <span className="grad-scene" aria-hidden="true">
      <svg viewBox="0 0 240 96" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round">
        <line x1={12} y1={48} x2={228} y2={48} />
        {/* 内側のカラー（プレート止め） */}
        <line x1={80} y1={38} x2={80} y2={58} />
        <line x1={160} y1={38} x2={160} y2={58} />
        {/* 据え付けのプレート */}
        {plate(64, true)}
        {plate(50, false)}
        {plate(165, true)}
        {plate(179, false)}
        {/* 増える（外れる）1 枚 */}
        {plate(36, true, 'grad-new')}
        {plate(193, true, 'grad-new')}
      </svg>
    </span>
  );
}

export function Graduation({
  exercise,
  cycle,
  records,
  autoClose = true,
  onClose,
}: {
  exercise: Exercise;
  cycle: Cycle;
  /** 同じ ✓ で立った記録更新。カードの下に小さく添える（強い順）。 */
  records: readonly Achievement[];
  /** 自分で閉じるか。カードの棚から見返しに来たときは読み終わるまで残す。 */
  autoClose?: boolean;
  onClose: () => void;
}) {
  // Celebration と同じ理由（親の再描画でタイマーを張り直さない）で ref 経由にする
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!autoClose) return;
    const id = setTimeout(() => close.current(), AUTO_CLOSE_MS);
    return () => clearTimeout(id);
  }, [cycle, autoClose]);

  const shift = graduationShift(exercise, cycle);
  const extra = records.slice(0, MAX_EXTRA);

  return (
    <Overlay>
      <div
        className={`celebrate tier-legend graduation graduation-${modeOf(exercise, cycle)}`}
        onClick={onClose}
        role="status"
        aria-live="polite"
      >
        <div className="celebrate-rays" aria-hidden="true">
          {Array.from({ length: RAYS }, (_, i) => (
            <span key={i} style={{ '--angle': `${(360 / RAYS) * i}deg` } as React.CSSProperties} />
          ))}
        </div>
        <div className="celebrate-sparkles" aria-hidden="true">
          {Array.from({ length: SPARKLES }, (_, i) => (
            <span key={i} style={sparkleStyle(i, SPARKLES)} />
          ))}
        </div>
        <div className="celebrate-card">
          <span className="celebrate-shine" aria-hidden="true" />

          <span className="celebrate-crest">
            <Icon name="flag" className="celebrate-icon" />
            <span className="celebrate-title">卒業</span>
          </span>
          <span className="celebrate-exercise">{exercise.name}</span>

          <BarbellScene />

          {/* 主役。何をやり切ったのかを、専門語なしで言う */}
          <strong className="celebrate-plain">
            上限の {exercise.repMax} 回を、全 {cycle.setCount} セットでやり切った
          </strong>

          {/*
            次に進めること。数字で進める種目は「これまで → 次」を横に並べる
            （記録更新の「これまで → 今日」と同じ形。読み方を覚え直させない）。
          */}
          {shift.to !== null ? (
            <span className="celebrate-shift">
              <span className="shift-side">
                <span className="shift-label">これまで</span>
                <span className="shift-value">{shift.from}</span>
              </span>
              <span className="shift-arrow" aria-hidden="true">
                →
              </span>
              <span className="shift-side is-now">
                <span className="shift-label">次</span>
                <span className="shift-value">{shift.to}</span>
              </span>
              {shift.gain ? <span className="celebrate-gain">{shift.gain}</span> : null}
            </span>
          ) : (
            /* 自重のまま卒業。数字が無いので、進み方の選択肢を言葉で置く */
            <span className="grad-next">次は加重するか、難度を上げた種目へ</span>
          )}

          {/* 同じ ✓ で立った記録更新。卒業が主役なので、行で小さく添えるだけ */}
          {extra.length > 0 ? (
            <ul className="celebrate-more">
              {extra.map((a) => (
                <li key={a.kind}>
                  <span className="celebrate-more-plain">{a.plain}</span>
                  <span className="celebrate-more-detail">{a.detail}</span>
                  {a.gain ? <span className="celebrate-more-gain">{a.gain}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}

          {autoClose ? (
            <span
              className="celebrate-timer"
              style={{ '--close-ms': `${AUTO_CLOSE_MS}ms` } as React.CSSProperties}
              aria-hidden="true"
            />
          ) : null}
        </div>
      </div>
    </Overlay>
  );
}
