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
 *
 * ## 何を、どの順で読ませるか
 *
 * 出す順は **何がすごいか → その数字 → どこから動いたか** で固定してある。
 *
 * 以前は数字（`推定 1RM 103.3kg`）が主役だった。だがこれは「その語を知っている人
 * だけが読める祝福」で、実際に**何を褒められたのか分からない**という状態になっていた
 * ——1RM もレップも、普段づかいの言葉ではない。いまは平たい 1 行（`plain`）を
 * 一番大きく置き、数字はその根拠として下に添える。前提知識が要る数字には
 * その場で言い換え（`gloss`）を付ける。
 *
 * 変化そのものも**横に並べて**出す（`これまで 97.5kg → 103.3kg`）。数字が 1 つだけ
 * 置いてあっても、それが上がった結果なのかどうかは読み取れない。
 *
 * ## 何を出すか
 *
 * その ✓ で当たった更新を**全部**受け取り、一番強いものを大きく、残りをその下に
 * 1 行ずつ添える。以前は先頭の 1 つしか出していなかったが、それだと「重量も上がって
 * 同じ重さでの回数も伸びた」日に片方しか映らず、何がどう動いたのかが分からない。
 */

/**
 * 自動で閉じるまで。
 *
 * 以前は 3.2 秒で、**読み終わる前に消える**という状態だった。祝福には読ませたい
 * 文が 3 つ（何がすごいか・数字・どこから動いたか）あるので、それを追える長さにする。
 * 残り時間はカードの下端の線で見えるようにしてあり、待ちたくなければ触れば閉じる。
 */
const AUTO_CLOSE_MS = 6200;
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

          <span className="celebrate-crest">
            <Icon name="rise" className="celebrate-icon" />
            <span className="celebrate-title">{lead.title}</span>
          </span>
          <span className="celebrate-exercise">{exerciseName}</span>

          {/* 主役。専門語を使わずに「何がすごいのか」だけを言う */}
          <strong className="celebrate-plain">{lead.plain}</strong>

          {/* その根拠になる数字。読めなくても上の 1 行で意味は通る */}
          <span className="celebrate-detail">{lead.detail}</span>

          {/*
            どこから動いたか。前と今を横に並べて、間に矢印と増分を置く。
            初めて到達した記録（previous が無い）には比べる相手が居ないので出さない。
          */}
          {lead.previous ? (
            <span className="celebrate-shift">
              <span className="shift-side">
                <span className="shift-label">これまで</span>
                <span className="shift-value">{lead.previous}</span>
              </span>
              <span className="shift-arrow" aria-hidden="true">
                →
              </span>
              <span className="shift-side is-now">
                <span className="shift-label">今日</span>
                <span className="shift-value">{lead.now}</span>
              </span>
              {lead.gain ? <span className="celebrate-gain">{lead.gain}</span> : null}
            </span>
          ) : (
            <span className="celebrate-first">はじめての記録</span>
          )}

          {/* 前提知識が要る数字にだけ添える言い換え */}
          {lead.gloss ? <span className="celebrate-gloss">{lead.gloss}</span> : null}

          {/* 同じ ✓ で一緒に動いたもの。主役より小さく、行で並べる */}
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

          {/*
            自分で消えるまでの残り。黙って消えるより、線が尽きるのが見えるほうが
            「読み切れなかった」にならない。待たずに触れば閉じる。
          */}
          {/*
            長さは CSS に書かず、ここから渡す。同じ秒数を 2 か所に書くと、片方だけ
            直したときに線と実際の消える時刻がずれる（実際にずれた）。
          */}
          <span
            className="celebrate-timer"
            style={{ '--close-ms': `${AUTO_CLOSE_MS}ms` } as React.CSSProperties}
            aria-hidden="true"
          />
        </div>
      </div>
    </Overlay>
  );
}
