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
 * ## 銘（カードの下段の一行）
 *
 * 本人の言葉（quote）は、**出典が確かな短い言い回しだけ**に絞ってある。
 * 真偽の怪しい「名言」を実在の人物の発言としてカードに刻むのは捏造になるし、
 * 長い引用は著作権の問題も持つ。載せる言語は**実際に発せられた言語**
 * （Arnold の母語はドイツ語だが、この言葉は英語で残っている）。
 *
 * それ以外の王者には、記録に残る事実（経歴・逸話）を下敷きに**こちらで書いた銘**
 * （credo）を添える。引用符を付けないのは、本人の発言と誤読させないため。
 *
 * ## 割り当て
 *
 * 通算 n 枚目の達成カードの裏が、初代から数えて n 人目の王者（1965 年の
 * Larry Scott から年代順）。全員そろったら 2 巡目に入る。乱数は使わない——
 * 記録から毎回同じ裏が出るので、過去の日のカードをめくり直しても同じ王者がいる。
 */

/** シルエットのポーズ。絵は components/OlympiaCard.tsx が持つ。 */
export type PoseId = 'doubleBiceps' | 'crab' | 'victory' | 'absThigh';

/**
 * カード下段の一行。
 *
 * quote は本人の言葉（原語のまま + 日本語訳）。credo はこちらで書いた銘で、
 * 引用符を付けずに出す——どちらなのかが見た目で分かるようにする。
 */
export type Flavor =
  | { kind: 'quote'; original: string; ja: string }
  | { kind: 'credo'; ja: string };

export type Champion = {
  name: string;
  /** 優勝年の表記。範囲はまとめる（'1970–75 · 80'）。 */
  reign: string;
  /** 優勝回数。 */
  wins: number;
  /** 通称（広く知られたもの）か、無ければ事実の一言。 */
  note: string;
  flavor: Flavor;
  pose: PoseId;
};

const quote = (original: string, ja: string): Flavor => ({ kind: 'quote', original, ja });
const credo = (ja: string): Flavor => ({ kind: 'credo', ja });

/** 年代順。並びがそのままコレクションの並びになる。2024 年までの 19 人。 */
export const CHAMPIONS: readonly Champion[] = [
  {
    name: 'Larry Scott',
    reign: '1965–66',
    wins: 2,
    note: '初代王者',
    flavor: credo('狭い骨格を言い訳にせず、伝説の肩を作った初代。'),
    pose: 'doubleBiceps',
  },
  {
    name: 'Sergio Oliva',
    reign: '1967–69',
    wins: 3,
    note: '“The Myth”',
    flavor: credo('昼は製鉄所で働き、夜に鍛えた。神話はその往復から生まれた。'),
    pose: 'victory',
  },
  {
    name: 'Arnold Schwarzenegger',
    reign: '1970–75 · 80',
    wins: 7,
    note: '“The Austrian Oak”',
    flavor: quote(
      'The last three or four reps is what makes the muscle grow.',
      '最後の 3、4 レップこそが、筋肉を育てる。',
    ),
    pose: 'doubleBiceps',
  },
  {
    name: 'Franco Columbu',
    reign: '1976 · 81',
    wins: 2,
    note: '“The Sardinian Strongman”',
    flavor: credo('165cm の体に、会場でいちばんの力が入っていた。'),
    pose: 'crab',
  },
  {
    name: 'Frank Zane',
    reign: '1977–79',
    wins: 3,
    note: '“The Chemist”',
    flavor: credo('筋量の時代に、線の美しさで 3 度勝った。'),
    pose: 'absThigh',
  },
  {
    name: 'Chris Dickerson',
    reign: '1982',
    wins: 1,
    note: '屈指のポージングの名手',
    flavor: credo('彫刻のようなポージングが、審査員の目を変えた。'),
    pose: 'victory',
  },
  {
    name: 'Samir Bannout',
    reign: '1983',
    wins: 1,
    note: '“The Lion of Lebanon”',
    flavor: credo('腰に浮かぶ“木”の彫りが、背中の基準を変えた。'),
    pose: 'doubleBiceps',
  },
  {
    name: 'Lee Haney',
    reign: '1984–91',
    wins: 8,
    note: '8 連覇（歴代最多タイ）',
    flavor: quote('Stimulate, don’t annihilate.', '破壊するな、刺激せよ。'),
    pose: 'crab',
  },
  {
    name: 'Dorian Yates',
    reign: '1992–97',
    wins: 6,
    note: '“The Shadow”',
    flavor: credo('地下のジムで短く、深く。年に一度だけ影のように現れて勝った。'),
    pose: 'absThigh',
  },
  {
    name: 'Ronnie Coleman',
    reign: '1998–2005',
    wins: 8,
    note: '“The King”・8 連覇',
    flavor: quote('Yeah buddy! Light weight, baby!', 'よっしゃ！ 軽い軽い！'),
    pose: 'crab',
  },
  {
    name: 'Jay Cutler',
    reign: '2006–07 · 09–10',
    wins: 4,
    note: '唯一、王座を奪還した男',
    flavor: credo('王座を失った翌日から、奪還の準備を始めていた。'),
    pose: 'doubleBiceps',
  },
  {
    name: 'Dexter Jackson',
    reign: '2008',
    wins: 1,
    note: '“The Blade”',
    flavor: credo('プロ最多勝。刃は 20 年間、錆びなかった。'),
    pose: 'absThigh',
  },
  {
    name: 'Phil Heath',
    reign: '2011–17',
    wins: 7,
    note: '“The Gift”・7 連覇',
    flavor: credo('「才能」と呼ばれるたび、練習量で答えた 7 年間。'),
    pose: 'victory',
  },
  {
    name: 'Shawn Rhoden',
    reign: '2018',
    wins: 1,
    note: '“Flexatron”',
    flavor: credo('43 歳、史上最年長の戴冠で 7 年の王朝を終わらせた。'),
    pose: 'doubleBiceps',
  },
  {
    name: 'Brandon Curry',
    reign: '2019',
    wins: 1,
    note: '“The Prodigy”',
    flavor: credo('回り道の 10 年が、頂上への最短距離だった。'),
    pose: 'crab',
  },
  {
    name: 'Big Ramy',
    reign: '2020–21',
    wins: 2,
    note: 'Mamdouh Elssbiay',
    flavor: credo('漁師だった手で、世界でいちばん重い称号を掴んだ。'),
    pose: 'crab',
  },
  {
    name: 'Hadi Choopan',
    reign: '2022',
    wins: 1,
    note: '“The Persian Wolf”',
    flavor: credo('ビザは何年も止められた。体は一日も止まらなかった。'),
    pose: 'absThigh',
  },
  {
    name: 'Derek Lunsford',
    reign: '2023',
    wins: 1,
    note: '史上初、2 階級での王者',
    flavor: credo('212 の頂を取り、まだ誰も知らない二つ目の頂へ。'),
    pose: 'victory',
  },
  {
    name: 'Samson Dauda',
    reign: '2024',
    wins: 1,
    note: '“The Nigerian Lion”',
    flavor: credo('ラグビーのピッチから、オリンピアの頂へ。'),
    pose: 'doubleBiceps',
  },
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
