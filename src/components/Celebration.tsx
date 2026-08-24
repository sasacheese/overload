import { useEffect, useRef } from 'react';
import type { Achievement } from '../lib/records.ts';
import { Icon } from './Icon.tsx';
import { Overlay } from './Overlay.tsx';

/**
 * 記録を更新したときに出す祝福。
 *
 * 紙吹雪のような賑やかな演出は、このアプリの静かな見た目から浮く。細い線が外へ
 * 走って消えるだけにして、祝いの一瞬と落ち着きを両立させている。
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

/** 自動で閉じるまで。読み切れて、次のセットの邪魔にならない長さ。 */
const AUTO_CLOSE_MS = 3200;
/** 添える行の上限。これ以上並べると、次のセットに戻るまでが長くなる。 */
const MAX_EXTRA = 3;

const RAYS = 12;

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

  return (
    <Overlay>
      <div className="celebrate" onClick={onClose} role="status" aria-live="polite">
        <div className="celebrate-rays" aria-hidden="true">
          {Array.from({ length: RAYS }, (_, i) => (
            <span key={i} style={{ '--angle': `${(360 / RAYS) * i}deg` } as React.CSSProperties} />
          ))}
        </div>
        <div className="celebrate-card">
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
