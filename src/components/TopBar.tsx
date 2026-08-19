import { dateParts } from '../lib/calendar.ts';
import { format } from '../lib/progression.ts';
import type { IsoDate } from '../lib/types.ts';
import { Mark } from './Mark.tsx';
import { Stepper } from './Stepper.tsx';
import { Wordmark } from './Wordmark.tsx';

/**
 * 画面上部の帯。左に印と字、右に体重。スクロールしても残る。
 *
 * 体重をここに置いているのは、トレーニングをしない日にも入れるものだから。
 * 種目カードの下にあると、開いて下までスクロールしないと入力に届かない。
 *
 * 「体重」の字は数値欄のすぐ左に、間を詰めて置いてある。離すと右上の数字が
 * 何なのか結びつかない（実際に分からないという指摘を受けて直した）。
 *
 * 直近の値は、今日まだ入れていないときだけ出す。「前回」と日付を必ず添えるので、
 * 素の数字が何なのか迷わない。今日ぶんを入れたあとは、同じ数字が 2 つ並ぶだけに
 * なるので消える。
 */
export function TopBar({
  today,
  todayWeight,
  latest,
  onChange,
}: {
  today: IsoDate;
  /** 今日記録した体重。0 は未記録。 */
  todayWeight: number;
  /** 直近の記録。今日より前のもの。無ければ null。 */
  latest: { date: IsoDate; weight: number } | null;
  onChange: (weight: number) => void;
}) {
  const showLatest = todayWeight === 0 && latest !== null;
  const parts = latest ? dateParts(latest.date) : null;

  return (
    <div className="topbar">
      <span className="brand">
        <Mark className="brand-mark" />
        <Wordmark />
      </span>

      <div className="weigh">
        <div className="weigh-row">
          <span className="weigh-label">体重</span>
          <Stepper
            value={todayWeight}
            step={0.1}
            min={0}
            max={250}
            label={`${today} の体重`}
            suffix="kg"
            zeroLabel="—"
            onChange={onChange}
          />
        </div>
        {showLatest && parts ? (
          <span className="weigh-latest">
            前回 {parts.date} · {format(latest.weight)}kg
          </span>
        ) : null}
      </div>
    </div>
  );
}
