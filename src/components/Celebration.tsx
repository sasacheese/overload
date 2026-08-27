import { useEffect, useRef } from 'react';
import { recordTier, type Achievement, type RecordTier } from '../lib/records.ts';
import { Icon } from './Icon.tsx';
import { Overlay } from './Overlay.tsx';

/**
 * 記録を更新したときに出す祝福。**引き当てたカードの披露**として作ってある。
 *
 * カードが起き上がりながら現れ、面を光が一度だけ走り、周りに星が瞬く。
 * 派手さは記録の格（recordTier）で 3 段に変わる——最上位（到達点・重量の更新）
 * だけが金で、それ以外は赤のまま。金は祝福のここ以外では使わない。
 * 紙吹雪のような画面全体の賑やかしはやらず、光はカードの周りに集める。
 * 自動で閉じるのは、ジムで画面を閉じる操作を増やしたくないため。
 *
 * ## 何を出すか
 *
 * その ✓ で当たった更新を**全部**受け取り、一番強いものを大きく、残りをその下に
 * 1 行ずつ添える。以前は先頭の 1 つしか出していなかったが、それだと「重量も上がって
 * 同じ重さでのレップも伸びた」日に片方しか映らず、何がどう動いたのかが分からない。
 *
 * どの行にも**増分**（`+2 レップ`）を置く。到達した数字と前の記録の 2 つを出しても、
 * どれだけ進んだかはその場で引き算しないと出てこない。祝う場面で計算をさせない。
 */

/** 自動で閉じるまで。カードの披露（起き上がり・光走り）のぶん、読み切りより少し長め。 */
const AUTO_CLOSE_MS = 3800;
/** 添える行の上限。これ以上並べると、次のセットに戻るまでが長くなる。 */
const MAX_EXTRA = 3;

const RAYS = 12;

/** カードの周りで瞬く星の数。格が上がるほど増える。 */
const SPARKLES: Record<RecordTier, number> = { rare: 6, epic: 10, legend: 14 };

/**
 * 星の置き場所。乱数は使わない（再描画で星が飛び直さないように）。
 * カードを囲む楕円の上に、素数でずらしながら散らす。
 */
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

export function Celebration({
  achievements,
  exerciseName,
  onClose,
}: {
  /** 当たった更新。強い順（先頭が主役）。 */
  achievements: readonly Achievement[];
  exerciseName: string;
  onClose: () => void;
}) {
  /*
   * onClose を ref 経由で呼ぶ。
   *
   * 親から渡されるのはその場で作られる関数なので、依存に入れると親が再描画する
   * たびにタイマーが張り直され、いつまでも閉じない。閉じるまでの時間は
   * 記録が変わったときだけ数え直す。
   */
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const id = setTimeout(() => close.current(), AUTO_CLOSE_MS);
    return () => clearTimeout(id);
  }, [achievements]);

  const [lead, ...rest] = achievements;
  if (!lead) return null;
  const extra = rest.slice(0, MAX_EXTRA);
  // カードの格は主役（一番強い更新）で決まる
  const tier = recordTier(lead.kind);
  const sparkles = SPARKLES[tier];

  return (
    <Overlay>
      <div className={`celebrate tier-${tier}`} onClick={onClose} role="status" aria-live="polite">
        <div className="celebrate-rays" aria-hidden="true">
          {Array.from({ length: RAYS }, (_, i) => (
            <span key={i} style={{ '--angle': `${(360 / RAYS) * i}deg` } as React.CSSProperties} />
          ))}
        </div>
        <div className="celebrate-sparkles" aria-hidden="true">
          {Array.from({ length: sparkles }, (_, i) => (
            <span key={i} style={sparkleStyle(i, sparkles)} />
          ))}
        </div>
        <div className="celebrate-card">
          <span className="celebrate-shine" aria-hidden="true" />
          <Icon name="rise" className="celebrate-icon" />
          <strong className="celebrate-title">{lead.title}</strong>
          <span className="celebrate-exercise">{exerciseName}</span>
          <span className="celebrate-detail">{lead.detail}</span>
          {lead.gain ? <span className="celebrate-gain">{lead.gain}</span> : null}
          {lead.previous ? <span className="celebrate-prev">これまで {lead.previous}</span> : null}

          {/* 同じ ✓ で一緒に動いたもの。主役より小さく、行で並べる */}
          {extra.length > 0 ? (
            <ul className="celebrate-more">
              {extra.map((a) => (
                <li key={a.kind}>
                  <span className="celebrate-more-title">{a.title}</span>
                  <span className="celebrate-more-detail">{a.detail}</span>
                  {a.gain ? <span className="celebrate-more-gain">{a.gain}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </Overlay>
  );
}
