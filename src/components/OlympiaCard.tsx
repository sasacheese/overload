/**
 * 達成カードの裏面。歴代 Mr. Olympia のトレーディングカード。
 *
 * 地は常に暗い側で固定（今日の一枚と同じ扱い——金の輝きは暗い地でしか出ない）。
 * 絵は自作のポージング・シルエットで、実在の写真は使わない（lib/olympia.ts の
 * 冒頭に理由を書いた）。載っている名前と優勝年は事実。
 *
 * 表（祝福）から裏へは Celebration / Graduation が 3D の flip で返す。
 * この部品は裏の 1 面を描くだけで、めくる仕掛けは持たない。
 */

import { CHAMPIONS, championAt, type PoseId } from '../lib/olympia.ts';

/**
 * ポージングのシルエット。全部 120×112 の枠で、x=60 に対して左右対称。
 * 体幹と脚は共通で、ポーズの違いは腕だけが持つ——4 種類をそれぞれ丸ごと
 * 描き分けるより、違う部分だけが違う方が同じ手で描いた 1 組に見える。
 */
const TORSO =
  'M 42 28 Q 60 21 78 28 C 82 30 84 32 85 35 C 86 44 82 52 73 60 ' +
  'C 75 66 77 71 78 78 C 79 88 76 96 74 106 L 65 106 C 66 94 65 84 62 76 L 60 73 ' +
  'L 58 76 C 55 84 54 94 55 106 L 46 106 C 44 96 41 88 42 78 C 43 71 45 66 47 60 ' +
  'C 38 52 34 44 35 35 C 36 32 38 30 42 28 Z';

/**
 * 右腕。左腕は scale(-1,1) の鏡で出す。
 *
 * 1 本の腕を複数の塊（上腕・前腕）で持てるようにしてある。同じ色で重ねて塗れば
 * 1 本の腕に見えるので、複雑な輪郭を一筆で書くより関節が破綻しない。
 */
const ARMS: Record<PoseId, readonly string[]> = {
  // ダブルバイセップス。肘を張り、上腕のこぶの上に前腕が立って拳が頭の高さに来る
  doubleBiceps: [
    'M 78 25 C 86 15 98 18 103 27 C 106 32 105 37 101 38 C 93 38 85 36 81 33 Z',
    'M 95 35 C 91 28 89 18 90 10 C 90 6 96 5 97 9 C 98 17 100 26 102 33 Z',
  ],
  // モストマスキュラー。腕を前で絞り、拳が体の前で合わさる
  crab: [
    'M 82 26 C 93 28 101 36 102 45 C 103 51 99 55 93 56 C 84 58 74 58 67 54 ' +
      'C 65 52 66 49 69 50 C 77 52 84 46 86 38 C 85 32 83 29 80 27 Z',
  ],
  // 勝利のポーズ。両腕をまっすぐ上へ
  victory: [
    'M 80 27 C 86 20 90 14 93 7 C 94 3 98 2 100 5 C 102 8 100 12 97 17 ' +
      'C 92 25 88 30 85 33 C 83 31 81 29 80 27 Z',
  ],
  // アブドミナル＆サイ。手を頭の後ろに組み、肘を張る
  absThigh: [
    'M 82 33 C 92 30 100 26 103 20 C 105 16 103 12 99 12 C 90 8 80 6 71 7 ' +
      'C 68 8 68 12 71 13 C 79 13 88 16 95 21 C 92 26 88 30 84 32 Z',
  ],
};

function Pose({ pose }: { pose: PoseId }) {
  return (
    <svg viewBox="0 0 120 112" fill="currentColor" aria-hidden="true">
      <ellipse cx="60" cy="13" rx="7" ry="8" />
      <path d={TORSO} />
      {ARMS[pose].map((d) => (
        <g key={d}>
          <path d={d} />
          <path d={d} transform="scale(-1 1) translate(-120 0)" />
        </g>
      ))}
    </svg>
  );
}

export function OlympiaCard({ number }: { number: number }) {
  const { champion, index, lap } = championAt(number);
  return (
    <div className="olympia-card">
      <header className="olympia-head">
        <span className="olympia-logo">MR. OLYMPIA</span>
        <span className="olympia-no">
          {index + 1} / {CHAMPIONS.length}
        </span>
      </header>

      <div className="olympia-figure">
        <Pose pose={champion.pose} />
      </div>

      <strong className="olympia-name">{champion.name}</strong>
      <span className="olympia-reign">
        {champion.reign} · {champion.wins} 回
      </span>
      <span className="olympia-note">{champion.note}</span>

      {/*
        銘。本人の言葉（quote）は原語 + 引用符 + 日本語訳で、こちらで書いた銘
        （credo）は引用符なしの日本語だけ——どちらなのかが見た目で分かるようにする
        （出典の確かな言葉しか quote にしない。lib/olympia.ts の冒頭に理由）。
      */}
      {champion.flavor.kind === 'quote' ? (
        <p className="olympia-quote">
          <span className="olympia-quote-original">“{champion.flavor.original}”</span>
          <span className="olympia-quote-ja">{champion.flavor.ja}</span>
        </p>
      ) : (
        <p className="olympia-credo">{champion.flavor.ja}</p>
      )}

      <footer className="olympia-foot">
        <span>
          通算 {number} 枚目{lap > 1 ? ` · ${lap} 巡目` : ''}
        </span>
        <span className="olympia-brand">OVERLOAD</span>
      </footer>
    </div>
  );
}
