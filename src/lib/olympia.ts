/**
 * 歴代 Mr. Olympia。達成カードの裏面（トレーディングカード）の中身。
 *
 * ## なぜ裏面があるか
 *
 * 達成のカードは事実の披露で、それ自体は集まらない。裏に歴代王者を 1 人ずつ
 * 割り当てると、達成を積むほどコレクションが埋まっていく——記録を伸ばす楽しみに
 * 「集める」楽しみを 1 枚岩で重ねる。
 *
 * ## 実在の人物の扱い
 *
 * 載せるのは**優勝者名と優勝年という事実**と、自作のシルエット画だけ。
 * 本人の写真は使わない（ウェブ上の写真には撮影者の著作権と本人の肖像権があり、
 * 公開リポジトリに同梱できない）。ニックネームは広く知られた通称のみ、
 * それが無い王者には事実の一言を添える。
 *
 * ## 割り当て
 *
 * 通算 n 枚目の達成カードの裏が、初代から数えて n 人目の王者（1965 年の
 * Larry Scott から年代順）。全員そろったら 2 巡目に入る。乱数は使わない——
 * 記録から毎回同じ裏が出るので、過去の日のカードをめくり直しても同じ王者がいる。
 */

/** シルエットのポーズ。絵は components/OlympiaCard.tsx が持つ。 */
export type PoseId = 'doubleBiceps' | 'crab' | 'victory' | 'absThigh';

export type Champion = {
  name: string;
  /** 優勝年の表記。範囲はまとめる（'1970–75 · 80'）。 */
  reign: string;
  /** 優勝回数。 */
  wins: number;
  /** 通称（広く知られたもの）か、無ければ事実の一言。 */
  note: string;
  pose: PoseId;
};

/** 年代順。並びがそのままコレクションの並びになる。2024 年までの 19 人。 */
export const CHAMPIONS: readonly Champion[] = [
  { name: 'Larry Scott', reign: '1965–66', wins: 2, note: '初代王者', pose: 'doubleBiceps' },
  { name: 'Sergio Oliva', reign: '1967–69', wins: 3, note: '“The Myth”', pose: 'victory' },
  { name: 'Arnold Schwarzenegger', reign: '1970–75 · 80', wins: 7, note: '“The Austrian Oak”', pose: 'doubleBiceps' },
  { name: 'Franco Columbu', reign: '1976 · 81', wins: 2, note: '“The Sardinian Strongman”', pose: 'crab' },
  { name: 'Frank Zane', reign: '1977–79', wins: 3, note: '“The Chemist”', pose: 'absThigh' },
  { name: 'Chris Dickerson', reign: '1982', wins: 1, note: '史上最年長の初戴冠', pose: 'victory' },
  { name: 'Samir Bannout', reign: '1983', wins: 1, note: '“The Lion of Lebanon”', pose: 'doubleBiceps' },
  { name: 'Lee Haney', reign: '1984–91', wins: 8, note: '8 連覇（歴代最多タイ）', pose: 'crab' },
  { name: 'Dorian Yates', reign: '1992–97', wins: 6, note: '“The Shadow”', pose: 'absThigh' },
  { name: 'Ronnie Coleman', reign: '1998–2005', wins: 8, note: '“The King”・8 連覇', pose: 'crab' },
  { name: 'Jay Cutler', reign: '2006–07 · 09–10', wins: 4, note: '唯一、王座を奪還した男', pose: 'doubleBiceps' },
  { name: 'Dexter Jackson', reign: '2008', wins: 1, note: '“The Blade”', pose: 'absThigh' },
  { name: 'Phil Heath', reign: '2011–17', wins: 7, note: '“The Gift”・7 連覇', pose: 'victory' },
  { name: 'Shawn Rhoden', reign: '2018', wins: 1, note: '“Flexatron”', pose: 'doubleBiceps' },
  { name: 'Brandon Curry', reign: '2019', wins: 1, note: '“The Prodigy”', pose: 'crab' },
  { name: 'Big Ramy', reign: '2020–21', wins: 2, note: 'Mamdouh Elssbiay', pose: 'crab' },
  { name: 'Hadi Choopan', reign: '2022', wins: 1, note: '“The Persian Wolf”', pose: 'absThigh' },
  { name: 'Derek Lunsford', reign: '2023', wins: 1, note: '史上初、2 階級での王者', pose: 'victory' },
  { name: 'Samson Dauda', reign: '2024', wins: 1, note: '“The Nigerian Lion”', pose: 'doubleBiceps' },
];

export type Draw = {
  champion: Champion;
  /** 0 起点の並び順（No. 表示は +1）。 */
  index: number;
  /** 何巡目か（1 起点）。全員そろったら 2 巡目に入る。 */
  lap: number;
};

/** 通算 n 枚目（1 起点）の達成カードの裏に居る王者。 */
export function championAt(cardNumber: number): Draw {
  const i = Math.max(0, cardNumber - 1);
  const index = i % CHAMPIONS.length;
  return { champion: CHAMPIONS[index]!, index, lap: Math.floor(i / CHAMPIONS.length) + 1 };
}
