/**
 * 「推移」タブ。**種目**と**体重**の 2 つの面を切り替える。
 *
 * 元は体重だけのタブだった。種目どうしを重ねた折れ線は記録（カレンダー）の
 * 面の下に置いていたが、あそこは「いつやったか」を見る面で、伸びを眺めに行く
 * 場所ではない。**線を読みに来たときに開くタブ**を 1 つにまとめ、その中で
 * 何の線を見るかを選ぶ形にした。
 *
 * 上に置いた 2 つの札は、下のタブバー（面そのものの切り替え）と役割が違う
 * ——同じ「推移」の中の、どの線を見るかの選択。見た目も帯ではなく札にして、
 * タブバーと取り違えないようにしてある。
 *
 * どちらを見ていたかは覚える。体重を見て閉じた人が次に開いたとき、種目の面から
 * 始まると、毎回 1 手多くなる。
 */

import { useEffect, useState } from 'react';
import type { IsoDate } from '../lib/types.ts';
import { BodyWeightView } from './BodyWeightView.tsx';
import { ExerciseTrends } from './ExerciseTrends.tsx';

type Face = 'exercises' | 'weight';

/** どちらの面を見ていたか。タブを行き来しても保つ。 */
const FACE_KEY = 'overload:trendFace';

function readFace(): Face {
  try {
    return sessionStorage.getItem(FACE_KEY) === 'weight' ? 'weight' : 'exercises';
  } catch {
    return 'exercises';
  }
}

export function TrendsView({ today }: { today: IsoDate }) {
  const [face, setFace] = useState<Face>(readFace);

  useEffect(() => {
    try {
      sessionStorage.setItem(FACE_KEY, face);
    } catch {
      // 覚えられなければ、次に開いたとき種目の面から始まるだけ
    }
  }, [face]);

  return (
    <>
      <div className="face-switch" role="tablist" aria-label="推移の種類">
        <button
          type="button"
          role="tab"
          aria-selected={face === 'exercises'}
          className={face === 'exercises' ? 'is-active' : ''}
          onClick={() => setFace('exercises')}
        >
          種目
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={face === 'weight'}
          className={face === 'weight' ? 'is-active' : ''}
          onClick={() => setFace('weight')}
        >
          体重
        </button>
      </div>

      {face === 'exercises' ? <ExerciseTrends today={today} /> : <BodyWeightView today={today} />}
    </>
  );
}
