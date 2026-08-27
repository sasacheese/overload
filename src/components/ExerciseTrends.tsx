/**
 * 「推移」タブの**種目**の面。記録のある種目を 1 枚に重ねて、伸びを見比べる。
 *
 * ## 見返したくなる面にする
 *
 * 記録アプリの一覧は、たいてい「入れるための面」の延長で作られる——数字が並び、
 * 読み解くのは人の仕事になる。ここは**読み解いたあと**を置く面にしてある。
 * 開いた瞬間に「何本が伸びているか」が文で出て、線を選べばその種目の来し方が
 * 数字ではなく物語（初日 → 今日）として出る。数えるのではなく、眺める面。
 *
 * ## 積み上げ
 *
 *  1. **見出しの一文**。何種目が初日を超えているか、いちばん動いたのはどれか
 *  2. **期間**。1か月 / 3か月 / 全期間。切り替えると基準もその期間の初日へ移る
 *  3. **重ねた折れ線**（CompareChart）。縦軸は初日を 100 とした指数
 *  4. **読み取り窓**。絵の直下に貼り付く 1 枚。選ぶ前は読み方、選んだあとは
 *     その種目の来し方が**同じ枠の中で入れ替わる**
 *  5. **凡例**。伸びた順で、押すと読み取り窓の中身が変わる。
 *     一覧そのものが中でスクロールする箱なので、下の方を押しても絵は動かない
 *
 * ## 押しても何も動かない
 *
 * 選んだ種目の明細を「その場に足す」作りにしていたときは、押すたびに凡例が
 * 下へ押し出されて、指の下にあったはずの行が動いた。**選択で高さが変わる**のが
 * 原因なので、読み取り窓は高さを決め打ちして中身だけを差し替える。
 *
 * 凡例のほうも、種目の数だけ縦に伸びる一覧をやめて**中でスクロールする箱**に
 * した。以前は下の行を押すために画面を送ると絵が上へ抜けてしまい、押したのに
 * 何が変わったのか見えなかった。箱の高さを画面に収まる量で止めておけば、
 * 絵も窓も一度も画面から出ない。
 *
 * 選択は**この面が持つ**。絵・窓・凡例の 3 か所が同じ選択を見るので、
 * どれかの中に置くと渡し戻しになる。
 */

import { useMemo, useState } from 'react';
import { dateLabel, shiftDays } from '../lib/calendar.ts';
import { compareSeries, tooShortCount } from '../lib/compare.ts';
import { formatEstimate } from '../lib/progression.ts';
import { exerciseHistory, exerciseTotals } from '../lib/query.ts';
import { MUSCLE_GROUPS, type ExerciseId, type IsoDate } from '../lib/types.ts';
import { useStore } from '../store.tsx';
import { CompareChart, CompareLegend, seriesColor } from './CompareChart.tsx';

type Range = { label: string; days: number | null };

/** 体重の面と同じ刻み。同じタブの中で期間の意味が変わらないようにする。 */
const RANGES: readonly Range[] = [
  { label: '1か月', days: 30 },
  { label: '3か月', days: 90 },
  { label: '全期間', days: null },
];

export function ExerciseTrends({ today }: { today: IsoDate }) {
  const { sessions, exercises } = useStore();
  const [days, setDays] = useState<number | null>(null);
  const [picked, setPicked] = useState<ExerciseId | null>(null);

  const since = days === null ? null : shiftDays(today, -days);
  const series = useMemo(() => compareSeries(sessions, exercises, since), [sessions, exercises, since]);
  const tooShort = useMemo(() => tooShortCount(sessions, exercises, since), [sessions, exercises, since]);

  /** 選んだ種目。期間を変えて消えたときは、選択も落とす（下で判定する） */
  const chosen = series.find((s) => s.id === picked) ?? null;
  const chosenIndex = chosen ? series.indexOf(chosen) : -1;

  /** 選んだ種目の通算。期間で切らない——通算は通算のまま出す。 */
  const totals = useMemo(
    () => (chosen ? exerciseTotals(exerciseHistory(sessions, chosen.id)) : null),
    [sessions, chosen],
  );

  const rising = series.filter((s) => s.growth > 0).length;
  const lead = series[0];
  /*
   * 絵がいつから始まっているか。
   *
   * 並びは伸びた順なので、先頭の種目の初日が一番古いとは限らない——そこを
   * そのまま出すと、絵の下に出ている日付と食い違う（実際に 4 日ずれていた）。
   */
  const from = series.reduce<string | null>(
    (oldest, s) => (oldest === null || s.points[0]!.date < oldest ? s.points[0]!.date : oldest),
    null,
  );

  if (series.length === 0) {
    return (
      <p className="empty">
        同じ種目を 2 日ぶん記録すると、ここに線が出る。
        {tooShort > 0 ? `いまは ${tooShort} 種目が「あと 1 日」の状態。` : ''}
      </p>
    );
  }

  return (
    <div className="trends">
      {/*
        見出しの一文。数字の羅列ではなく、読める文で今の状態を言う。
        面を開いた瞬間に受け取るのはこの 1 行だけでいい。
      */}
      <p className="trends-lede">
        <strong>{rising}</strong> 種目が
        {days === null ? 'はじめた日' : 'この期間のはじめ'}より伸びている
      </p>
      {lead && lead.growth > 0 ? (
        <p className="trends-sub">
          いちばん動いたのは <strong>{lead.name}</strong>
          <span className="trends-lead-gain">+{Math.round(lead.growth * 100)}%</span>
        </p>
      ) : null}

      <div className="segmented" role="group" aria-label="表示する期間">
        {RANGES.map((r) => (
          <button
            type="button"
            key={r.label}
            className={days === r.days ? 'is-active' : ''}
            aria-pressed={days === r.days}
            onClick={() => setDays(r.days)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <CompareChart series={series} picked={chosen ? chosen.id : null} onPick={setPicked} />

      {/*
        読み取り窓。**高さは中身によらず一定**で、絵の直下に貼り付く。
        選択で高さが変わると凡例が動いて、押した行が指の下から逃げる。

        key を付けているのは、切り替わるたびに中の淡い animation を
        引き直すため（同じ要素を使い回すと、差し替わったことが目に見えない）。
      */}
      <div
        className={`trends-readout ${chosen ? 'is-focused' : ''}`}
        style={chosen ? ({ '--series': seriesColor(chosenIndex) } as React.CSSProperties) : undefined}
      >
        {chosen && totals ? (
          <div className="trends-focus" key={chosen.id}>
            <div className="trends-focus-head">
              <span className="trends-focus-group">{MUSCLE_GROUPS[chosen.group].label}</span>
              <strong className="trends-focus-name">{chosen.name}</strong>
              <button type="button" className="trends-clear" onClick={() => setPicked(null)}>
                全部見る
              </button>
            </div>

            {/*
              初日 → 今日。目標ではなく過去の事実なので、外れようがない。
              日付は下の行へ回してある——数字の上に添えると行が 2 段になり、
              窓の高さが読み方の案内とそろわなくなる（そろわないと押すたびに動く）。
            */}
            <div className="trends-journey">
              <span className="trends-then">
                {formatEstimate(chosen.first)}
                {chosen.unit}
              </span>
              <span className="trends-arrow" aria-hidden="true">
                →
              </span>
              <span className="trends-now">
                {formatEstimate(chosen.latest)}
                {chosen.unit}
              </span>
              <span className={`trends-gain ${chosen.growth > 0 ? 'is-up' : ''}`}>
                {chosen.growth > 0 ? '+' : ''}
                {Math.round(chosen.growth * 100)}%
              </span>
            </div>

            {/*
              通算。伸び悩んでも必ず増えている側の数。
              いつからいつまでは絵の下に出ているので、ここでは繰り返さない
              （繰り返すと行が折り返して、窓の高さが読み方の案内とずれる）。
            */}
            <p className="trends-totals">
              通算 <strong>{totals.days}</strong> 日 · <strong>{totals.sets}</strong> セット ·{' '}
              <strong>{totals.reps.toLocaleString('ja-JP')}</strong> 回
            </p>
          </div>
        ) : (
          <div className="trends-howto" key="howto">
            <p>
              縦軸は{days === null ? '初日' : 'この期間のはじめ'}を <strong>100</strong> とした指数。
              重さも回数も同じ物差しに直してある。
            </p>
            <p className="muted">線か凡例を押すと、その種目だけが残って目盛が実際の重さに戻る。</p>
            {/* 窓の高さを埋める 1 行でもある。選んだときの明細と行数をそろえておく */}
            <p className="muted">
              {series.length} 種目 · {from === null ? '' : `${dateLabel(from as IsoDate)} から`}
              {tooShort > 0 ? ` ／ 記録が 1 日だけの種目が ${tooShort} 件` : ''}
            </p>
          </div>
        )}
      </div>

      <CompareLegend series={series} picked={chosen ? chosen.id : null} onPick={setPicked} />
    </div>
  );
}
