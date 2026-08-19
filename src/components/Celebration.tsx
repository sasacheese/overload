import { useEffect, useRef } from 'react';
import type { Achievement } from '../lib/records.ts';
import { Icon } from './Icon.tsx';

/**
 * 記録を更新したときに出す祝福。
 *
 * 紙吹雪のような賑やかな演出は、このアプリの静かな見た目から浮く。細い線が外へ
 * 走って消えるだけにして、祝いの一瞬と落ち着きを両立させている。
 * 自動で閉じるのは、ジムで画面を閉じる操作を増やしたくないため。
 */

/** 自動で閉じるまで。読み切れて、次のセットの邪魔にならない長さ。 */
const AUTO_CLOSE_MS = 3200;

const RAYS = 12;

export function Celebration({
  achievement,
  exerciseName,
  onClose,
}: {
  achievement: Achievement;
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
  }, [achievement]);

  return (
    <div className="celebrate" onClick={onClose} role="status" aria-live="polite">
      <div className="celebrate-rays" aria-hidden="true">
        {Array.from({ length: RAYS }, (_, i) => (
          <span key={i} style={{ '--angle': `${(360 / RAYS) * i}deg` } as React.CSSProperties} />
        ))}
      </div>
      <div className="celebrate-card">
        <Icon name="rise" className="celebrate-icon" />
        <strong className="celebrate-title">{achievement.title}</strong>
        <span className="celebrate-exercise">{exerciseName}</span>
        <span className="celebrate-detail">{achievement.detail}</span>
        {achievement.previous ? <span className="celebrate-prev">これまで {achievement.previous}</span> : null}
      </div>
    </div>
  );
}
