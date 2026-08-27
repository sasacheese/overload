/**
 * 「今日」の面に、まだ 1 種目も並んでいないときに出すもの。
 *
 * 以前は説明の 1 行だけが左上に置いてあった。中身が無い日はそれ以外に何も無いので、
 * 面のほとんどが空白のまま残り、開いた瞬間に「まだ始まっていない」ではなく
 * 「壊れている」に見えていた。空白そのものを埋めるのではなく、**空であることを
 * 図として言う**ものを 1 つ置く。
 *
 * 置いたのは**プレートを 1 枚も挿していないバー**。空の面に絵を置くとき、器具の絵を
 * 飾りとして並べると意味を持たない飾りが増えるだけだが、素のバーは「まだ何も
 * 積んでいない」という状態そのものなので、この日の中身と 1 対 1 で対応する。
 * 種目を足せば絵は消えるので、消えることにも意味がある。
 *
 * 色は無彩色のまま（`--faint`）。赤は「前進した」の合図に取ってあるので、
 * まだ何もしていない面には渡さない。字を載せない飾りなので `--faint` を使ってよい。
 *
 * 字は 3 段に分けてある。**いま何なのか**（記録がありません）→ **最終履歴** →
 * **どうすれば埋まるか**。1 段目がいちばん強く、絵より上に置く——開いた瞬間に
 * 知りたいのは状態のほうで、操作の説明は 2 度目以降は読まれないから。
 *
 * 2 段目に置いているのは事実だけで、「今日も頑張ろう」のような、何日開いても同じ文に
 * なる呼びかけは置かない（締めの一言と同じ理由。README 1.4）。
 */

import { relativeLabel } from '../lib/calendar.ts';
import { MUSCLE_GROUPS, type IsoDate, type MuscleGroup } from '../lib/types.ts';

/** その日より前で、実際に ✓ が付いた直近の日。 */
export type LastDay = { date: IsoDate; groups: readonly MuscleGroup[] };

type Props = {
  /** いま見ている日。「前回」はこの日から数える（過去の日を開いたときも合う）。 */
  date: IsoDate;
  today: IsoDate;
  last: LastDay | null;
};

export function EmptyDay({ date, today, last }: Props) {
  return (
    <div className="empty-day">
      {/*
        面がいま何なのかを言う 1 行。過ぎた日・先の日を開いていることは普通にあるので、
        そこで「今日」と言い切らない。日付は見出しに出ているので、ここでは
        「今日 / この日」だけ入れ替える。
      */}
      <p className="empty-title">{date === today ? '今日' : 'この日'}の記録がありません</p>
      <BareBar />
      {last ? (
        <p className="empty-last">
          最終履歴：{relativeLabel(last.date, date)}
          {last.groups.length > 0 ? `（${last.groups.map((g) => MUSCLE_GROUPS[g].label).join('・')}）` : ''}
        </p>
      ) : null}
      <p className="empty">
        種目を追加すると、前回と同じ数字が入った状態で並ぶ。あとは実際にやった数に直して ✓ を押す。
      </p>
    </div>
  );
}

/*
 * プレートの挿さっていないバーと、それを受けているスタンド。
 *
 * バーは 3 本に割ってある（左スリーブ・シャフト・右スリーブ）。太さが違うので
 * 1 本の線では描けない。繋がっていて向きも揃えてあるので、1 本の棒として読める。
 *
 * スタンドと床は 1 段落としてある（.rack）。主役はバーのほうで、受けているものが
 * 同じ濃さで並ぶと、何が空なのかが読めない。
 *
 * ローレット（握る位置の刻み）は入れていない。この大きさではカラーやフックと
 * 見分けが付かず、線の多い図になるだけで、バーには見えない。残したのは
 * **スリーブが太くて何も挿さっていない**という、この絵の言いたいこと 1 つだけ。
 */

/** バーの高さ。フックの底（58）に載る位置。 */
const BAR_Y = 56;

function BareBar() {
  return (
    <svg
      className="empty-art"
      viewBox="8 42 192 72"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="プレートの挿さっていないバー"
    >
      <g className="rack" strokeWidth="1.7">
        <path d="M24 106H184" />
        {/* スタンド。受けはバーの下で止める——柱がバーより上へ出ると、線が
            バーを横切って 1 本の棒に見えなくなる */}
        <path d="M56 58h8M60 58v48" />
        <path d="M144 58h8M148 58v48" />
      </g>

      {/* スリーブ（プレートを挿す側）。シャフトより太い */}
      <path d={`M18 ${BAR_Y}H44`} strokeWidth="5" />
      <path d={`M44 ${BAR_Y}H164`} strokeWidth="2.2" />
      <path d={`M164 ${BAR_Y}H190`} strokeWidth="5" />

      {/* カラー。スリーブとシャフトの境。線 1 本のままだとバーに見えない */}
      <path d="M44 48v16M164 48v16" strokeWidth="2.2" />
    </svg>
  );
}
