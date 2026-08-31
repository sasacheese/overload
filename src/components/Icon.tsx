/**
 * 線画のアイコン。
 *
 * 文字で書くと画面が説明文で埋まる箇所を記号に置き換えるために置いている。
 * 逆に、記号にすると意味が伝わらないもの（記録の数字、コツの文章）は文字のまま残す。
 * どれも 24×24 のストロークで、太さと角の処理を揃えて 1 セットに見えるようにした。
 */

const PATHS = {
  /**
   * 今日。バーベル。
   * 外側のカラーまで棒でつなぐ。プレートだけを離して置くと、22px では
   * 棒が細く見えて「＋＋」に見えてしまう。
   */
  barbell: 'M3 12h18M3 9.5v5M21 9.5v5M8 7v10M16 7v10',
  /** 記録。カレンダー */
  calendar: 'M4 6h16v14H4zM4 10h16M9 3v4M15 3v4',
  /** 体重。折れ線 */
  trend: 'M4 17l5-6 4 3 6-8M4 20h16',
  /** 種目。一覧 */
  list: 'M4 7h16M4 12h16M4 17h10',
  /** 設定。スライダー */
  settings: 'M5 7h14M5 12h14M5 17h14M9 5v4M15 10v4M11 15v4',
  note: 'M5 4h14v16H5zM8 9h8M8 13h8M8 17h4',
  plus: 'M12 6v12M6 12h12',
  minus: 'M6 12h12',
  check: 'M5 13l4.5 4.5L19 7',
  close: 'M6 6l12 12M18 6L6 18',
  left: 'M14 6l-6 6 6 6',
  right: 'M10 6l6 6-6 6',
  down: 'M6 10l6 6 6-6',
  /** 前回。時計 */
  history: 'M12 7v5l3.5 2M3.5 12a8.5 8.5 0 1 0 8.5-8.5A8.5 8.5 0 0 0 4 9M3.5 5v4h4',
  /** サイクル。history の矢印を左右反転して針を抜いたもの（同じ回転の族に見せる） */
  cycle: 'M20.5 12a8.5 8.5 0 1 1-8.5-8.5A8.5 8.5 0 0 1 20 9M20.5 5v4h-4',
  /** バランス。天秤 */
  balance: 'M12 5v14M8 19h8M4 7h16M4 7l-2 5a2.5 2.5 0 0 0 5 0L4 7M20 7l-2 5a2.5 2.5 0 0 0 5 0L20 7',
  /** 記録更新。上向きの矢 */
  rise: 'M5 17L12 8l3 4 4-6M15 6h4v4',
  /** 効く場所 */
  target: 'M12 4v3M12 17v3M4 12h3M17 12h3M12 8.5A3.5 3.5 0 1 0 12 15.5A3.5 3.5 0 0 0 12 8.5',
  /**
   * ダイヤル入力。速度計。
   * 弧と針だけ。目盛りを打つと 14px 前後では潰れて汚れに見える。
   */
  dial: 'M5 15.5A8 8 0 1 1 19 15.5M12 13l4.2-4.2',
  /**
   * 今日を終える。旗。
   * 竿を左に通し、布は 1 本の折れ線で描く。閉じた四角にすると小さいサイズで
   * 潰れて「点」に見えるので、布の内側は抜いたままにしてある。
   */
  flag: 'M6 4v16M6 5.5h11l-2.4 3.5 2.4 3.5H6',
  /** 今日の一枚を渡す。外へ出す矢と受け皿 */
  share: 'M12 4v11M8.5 7.5 12 4l3.5 3.5M5 13v6h14v-6',
} as const;

export type IconName = keyof typeof PATHS;

type Props = {
  name: IconName;
  className?: string;
  /** 装飾なら省略。単独で意味を持つ場合だけ渡す。 */
  label?: string;
};

export function Icon({ name, className, label }: Props) {
  return (
    <svg
      className={`icon ${className ?? ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : 'presentation'}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
