/**
 * セット間の休憩。
 *
 * 目標秒に達したら色が変わるだけで、通知は出さない。バックグラウンドの通知は
 * iOS の PWA では当てにならず、鳴らない前提の機能を鳴るように見せたくない。
 * 経過時間を出すのは、休みすぎ・休まなすぎのどちらも次のセットの質を下げるから。
 */

import { useEffect, useState } from 'react';

type Props = {
  /** 直前のセットに ✓ を付けた時刻（epoch ms）。null なら出さない。 */
  startedAt: number | null;
  targetSec: number;
  onDismiss: () => void;
};

/** これを超えたら休憩ではなく閉じ忘れとみなして出さない。 */
const MAX_SEC = 600;

function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, '0')}`;
}

export function RestTimer({ startedAt, targetSec, onDismiss }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt === null) return;
    const tick = () => {
      setNow(Date.now());
      // 出さなくなったあとも動かし続ける意味はないので、そこで止める
      if (Date.now() - startedAt > MAX_SEC * 1000) clearInterval(id);
    };
    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
  }, [startedAt]);

  if (startedAt === null) return null;

  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  if (elapsed > MAX_SEC) return null;

  const ratio = Math.min(1, elapsed / targetSec);
  const reached = elapsed >= targetSec;

  return (
    <button type="button" className={`rest-timer ${reached ? 'is-ready' : ''}`} onClick={onDismiss}>
      <span className="rest-bar" style={{ width: `${ratio * 100}%` }} aria-hidden="true" />
      <span className="rest-text">
        <strong>{mmss(elapsed)}</strong>
        <span className="rest-target">/ {mmss(targetSec)} 休憩</span>
      </span>
      <span className="rest-state">{reached ? '次のセットへ' : '回復中'}</span>
    </button>
  );
}
