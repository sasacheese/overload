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
 * 本人の言葉は、**出典が確かな短い言い回しだけ**に絞ってある（by が null の 3 人）。
 * 真偽の怪しい「名言」を実在の人物の発言としてカードに刻むのは捏造になるし、
 * 長い引用は著作権の問題も持つ。載せる言語は**実際に発せられた言語**
 * （Arnold の母語はドイツ語だが、この言葉は英語で残っている）。
 *
 * 確かな本人の言葉が残っていない王者には、**古典から名言を借りる**。選ぶ基準は
 * 3 つ——出典が確か・短い・パブリックドメイン（著作権が切れた時代のもの）。
 * 借り物には必ず著者名（by）を出し、本人の言葉と混ざらないようにする。
 * どの言葉を誰に貼るかは、王者の逸話に響き合うものを選んである
 * （雨だれ石を穿つ → 彫りの Bannout、舞台の初心 → ポージングの Dickerson など）。
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
 * カード下段の名言。原語のまま + 日本語訳。
 *
 * by が null なら王者本人の言葉（カードの名前がそのまま出典）。
 * それ以外は古典からの借り物で、著者名を必ず添えて出す。
 */
export type Flavor = {
  original: string;
  ja: string;
  by: string | null;
};

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

/** 本人の言葉。 */
const own = (original: string, ja: string): Flavor => ({ original, ja, by: null });
/** 古典からの借り物。著者名を必ず持つ。 */
const borrowed = (by: string, original: string, ja: string): Flavor => ({ original, ja, by });

/** 年代順。並びがそのままコレクションの並びになる。2024 年までの 19 人。 */
export const CHAMPIONS: readonly Champion[] = [
  {
    name: 'Larry Scott',
    reign: '1965–66',
    wins: 2,
    note: '初代王者',
    // 最初に王座へ挑んだ男に、アエネーイスの一句（漕ぎ手たちが奮い立つ場面）
    flavor: borrowed('ウェルギリウス', 'Possunt, quia posse videntur.', 'できると信じる者が、できる。'),
    pose: 'doubleBiceps',
  },
  {
    name: 'Sergio Oliva',
    reign: '1967–69',
    wins: 3,
    note: '“The Myth”',
    // 昼は製鉄所、夜はジム。汗の割合なら誰にも負けない
    flavor: borrowed(
      'エジソン',
      'Genius is one percent inspiration, ninety-nine percent perspiration.',
      '天才とは 1% のひらめきと、99% の汗である。',
    ),
    pose: 'victory',
  },
  {
    name: 'Arnold Schwarzenegger',
    reign: '1970–75 · 80',
    wins: 7,
    note: '“The Austrian Oak”',
    flavor: own(
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
    // 165cm の体で会場一の力。強さは負荷から生まれる
    flavor: borrowed('ニーチェ', 'Was mich nicht umbringt, macht mich stärker.', '私を殺さないものは、私を強くする。'),
    pose: 'crab',
  },
  {
    name: 'Frank Zane',
    reign: '1977–79',
    wins: 3,
    note: '“The Chemist”',
    // 線の美しさは千日万日の稽古から。五輪書・水の巻
    flavor: borrowed('宮本武蔵', '千日の稽古を鍛とし、万日の稽古を錬とす', '千日の稽古で鍛え、万日の稽古で錬る。'),
    pose: 'absThigh',
  },
  {
    name: 'Chris Dickerson',
    reign: '1982',
    wins: 1,
    note: '屈指のポージングの名手',
    // 舞台の芸の言葉を、ポージングの名手に
    flavor: borrowed('世阿弥', '初心忘るべからず', '始めたころの心を、忘れてはならない。'),
    pose: 'victory',
  },
  {
    name: 'Samir Bannout',
    reign: '1983',
    wins: 1,
    note: '“The Lion of Lebanon”',
    // 腰に「木」を彫り込んだ背中に、水が石を彫る一句を
    flavor: borrowed('オウィディウス', 'Gutta cavat lapidem.', '雨だれが、石を穿つ。'),
    pose: 'doubleBiceps',
  },
  {
    name: 'Lee Haney',
    reign: '1984–91',
    wins: 8,
    note: '8 連覇（歴代最多タイ）',
    flavor: own('Stimulate, don’t annihilate.', '破壊するな、刺激せよ。'),
    pose: 'crab',
  },
  {
    name: 'Dorian Yates',
    reign: '1992–97',
    wins: 6,
    note: '“The Shadow”',
    // 地下のジムで短く深く。ストア派の律に一番近い王者
    flavor: borrowed('エピクテトス', 'ἀνέχου καὶ ἀπέχου.', '耐えよ、そして己を律せよ。'),
    pose: 'absThigh',
  },
  {
    name: 'Ronnie Coleman',
    reign: '1998–2005',
    wins: 8,
    note: '“The King”・8 連覇',
    flavor: own('Yeah buddy! Light weight, baby!', 'よっしゃ！ 軽い軽い！'),
    pose: 'crab',
  },
  {
    name: 'Jay Cutler',
    reign: '2006–07 · 09–10',
    wins: 4,
    note: '唯一、王座を奪還した男',
    // 王座奪還は一歩の積み重ねから。勧学篇
    flavor: borrowed('荀子', '不積跬步、無以至千里', '半歩を積まねば、千里には至れない。'),
    pose: 'doubleBiceps',
  },
  {
    name: 'Dexter Jackson',
    reign: '2008',
    wins: 1,
    note: '“The Blade”',
    // 20 年錆びなかった刃に、反復の諺を
    flavor: borrowed('ラテンの諺', 'Repetitio est mater studiorum.', '反復は、学びの母である。'),
    pose: 'absThigh',
  },
  {
    name: 'Phil Heath',
    reign: '2011–17',
    wins: 7,
    note: '“The Gift”・7 連覇',
    // 7 年守り続けられたのは、楽しんでいたから。雍也篇
    flavor: borrowed(
      '孔子',
      '知之者不如好之者、好之者不如樂之者',
      '知る者は好む者に及ばず、好む者は楽しむ者に及ばない。',
    ),
    pose: 'victory',
  },
  {
    name: 'Shawn Rhoden',
    reign: '2018',
    wins: 1,
    note: '“Flexatron”',
    // 43 歳・史上最年長の戴冠。挑んだから難しくなくなった
    flavor: borrowed(
      'セネカ',
      'Non quia difficilia sunt non audemus, sed quia non audemus difficilia sunt.',
      '難しいから挑めないのではない。挑まないから難しくなるのだ。',
    ),
    pose: 'doubleBiceps',
  },
  {
    name: 'Brandon Curry',
    reign: '2019',
    wins: 1,
    note: '“The Prodigy”',
    // 回り道の 10 年も、一歩ずつだった
    flavor: borrowed('老子', '千里之行、始於足下', '千里の道も、足もとの一歩から。'),
    pose: 'crab',
  },
  {
    name: 'Big Ramy',
    reign: '2020–21',
    wins: 2,
    note: 'Mamdouh Elssbiay',
    // 漁師から世界一へ。小さな積み重ねの人に、積小為大を
    flavor: borrowed('二宮尊徳', '積小為大', '小さな積み重ねが、やがて大きなものになる。'),
    pose: 'crab',
  },
  {
    name: 'Hadi Choopan',
    reign: '2022',
    wins: 1,
    note: '“The Persian Wolf”',
    // ペルシャの狼には、ペルシャの詩人の一句を（ゴレスターン）
    flavor: borrowed('サアディー', 'نابرده رنج گنج میسر نمی‌شود', '苦労なくして、宝は手に入らない。'),
    pose: 'absThigh',
  },
  {
    name: 'Derek Lunsford',
    reign: '2023',
    wins: 1,
    note: '史上初、2 階級での王者',
    // 一つ目の頂で満足しなかった男に
    flavor: borrowed('ゲーテ', 'Es ist nicht genug zu wissen, man muß auch anwenden.', '知るだけでは足りない。使わなければ。'),
    pose: 'victory',
  },
  {
    name: 'Samson Dauda',
    reign: '2024',
    wins: 1,
    note: '“The Nigerian Lion”',
    // ラグビーのピッチからオリンピアの頂へ。険しい道を越えて
    flavor: borrowed('ラテンの成句', 'Per aspera ad astra.', '困難を越えて、星々へ。'),
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
