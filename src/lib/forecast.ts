/**
 * 記録の延長線。「この調子なら、このあたり」を出す。
 *
 * ## 予想は目標ではない
 *
 * このアプリは目標を出さない（達成できなかった日に必ず未達が表示される作りになるため）。
 * 予想はその決めごとを崩さない。**出しているのは過去の記録をそのまま延ばした線**で、
 * 届くべき線ではない。下を向いた線もそのまま出すし、外したことを責める表示は持たない。
 *
 * 見た目でも実測と分けてある。実測は赤の実線、予想は**赤の点線**と薄い帯。
 * 同じものの続きなので色は変えず、線の切れ方だけで「まだ起きていない」と言う。
 *
 * ## 直線では伸ばさない
 *
 * 傾きをそのまま伸ばすと、体重はいつか 0 に届き、種目の重量はいくらでも上がる。
 * どちらも起こらない。伸びは**必ず鈍る**ので、そこを式に入れてある。
 *
 * 効かせる場所は 2 つ。
 *
 * - **速さの上限**（`maxPerDay`）。観測した傾きがこれを超えていたら、予想はこの速さで引く。
 *   3 週間だけ絶好調だったペースを 3 か月続く前提にしない
 * - **落ち着き先**（`limit`）。そこへ近づくほど緩む曲線にする。式は
 *   `v(t) = limit − (limit − v0)·e^(−kt)`。`k` は今日の傾きから決めるので、
 *   **線は実測の傾きちょうどで始まり、先へ行くほど寝る**（継ぎ目に折れが出ない）
 *
 * どちらも呼ぶ側が渡す。体重の落ち着き先は身長から（`profile.ts`）、種目の上限は
 * 体重比から（`presets.ts` の `bodyweightCap`）出している。渡さなければ直線のまま。
 *
 * ## 決めごと
 *
 * - **直近を重く見る。** 半減期つきの加重最小二乗にしてある。減量期のあとに増量期が
 *   来れば線の向きは変わるべきで、3 か月前の点が今の傾きを決めてはいけない
 * - **点で言い切らない。** 予想には必ず幅（`margin`）を付ける。1 つの数字だけ出すと
 *   当たる約束に見えるが、実際は記録のばらつきぶんだけ外れる
 * - **帯は落ち着き先で止めない。** 目安であって壁ではないので、帯がそこを越えることはある。
 *   越えられないと言い切れるものを、このアプリは持っていない
 * - **見た期間の 2 倍より先へは伸ばさない。** 上限つきの線になったので直線のときよりは
 *   伸ばせるが、3 週間の記録から 1 年先を出せるようにはならない
 * - **途切れた記録から先は予想しない。** 最後の記録が古いほど外挿の距離が伸びるので、
 *   伸ばせる長さを使い切ったところで止まる
 * - **足りないときは出さない。** 何が足りないかは言う（`shortfall`）
 *
 * 予想はここと画面（TrendChart）にしか出てこない。締め・祝福・共有画像には
 * 一切載せていない——起きていないことを、その日やったことと同じ場所に置かない。
 */

import { daysBetween, relativeLabel, shiftDays } from './calendar.ts';
import type { IsoDate } from './types.ts';

/** 予想の元にする点。1 日 1 点（同じ日が 2 つ来る前提は持たない）。 */
export type TrendPoint = { date: IsoDate; value: number };

/** 予想を出すのに要る点の数。3 点では 1 点のぶれが傾きをそのまま決めてしまう。 */
export const MIN_POINTS = 4;
/** 予想を出すのに要る観測期間（日）。1 週間の記録から先を言わない。 */
export const MIN_SPAN = 14;
/** 観測期間の何倍まで伸ばしてよいか。上限つきの線なので、直線のときより伸ばせる。 */
const REACH_RATIO = 2;
/** これより短い先は予想しない。数日先は予想ではなく次回の話。 */
const MIN_HORIZON = 7;
/** 直近の重みが 2 倍になる日数。6 週前の点は今日の点の半分の重さで効く。 */
const HALF_LIFE = 42;
/** 帯を描く点の数。多くしても形は変わらないので、読める粗さで止める。 */
const BAND_STEPS = 12;

export type Direction = 'up' | 'flat' | 'down';

/** 予想の帯。`mid` が線、`lo`〜`hi` がぶれの幅。 */
export type Band = { date: IsoDate; mid: number; lo: number; hi: number };

export type Forecast = {
  /** 1 日あたりの変化量。 */
  perDay: number;
  /** 30 日あたりの変化量。言葉にするのはこちら。 */
  per30: number;
  direction: Direction;
  /** 予想する先の日付と、今日からの日数。 */
  date: IsoDate;
  days: number;
  /** その日の予想値と、そのぶれ幅（±）。 */
  value: number;
  margin: number;
  /** 直近の実測からの差。 */
  change: number;
  /** 今日時点の線の値。実測ではなく、線がいまどこを通っているか。 */
  now: number;
  band: readonly Band[];
  /** 元にした点の数。 */
  basis: number;
  /** 効いている落ち着き先。無ければ null（線は直線のまま）。 */
  limit: number | null;
  /** 観測した傾きが速さの上限に引っかかったか。線は実測より緩やかになっている。 */
  capped: boolean;
};

export type Options = {
  /** 何日先を予想するか。観測期間で頭打ちになる。 */
  days: number;
  /** 「横ばい」とみなす 30 日あたりの変化量。単位は値と同じ。 */
  flatPer30: number;
  /** 直近の重みの半減期（日）。既定は 6 週。 */
  halfLife?: number;
  /**
   * 落ち着き先の目安。線はここへ近づくほど緩む。
   *
   * 進む向きの先に無いとき（すでに越えている・逆を向いている）は効かない。
   * 渡さなければ直線のまま伸びる。
   */
  limit?: number | null;
  /**
   * 1 日あたりの変化量の上限（絶対値）。
   *
   * 観測した傾きがこれを超えていたら、予想はこの速さで引く。ひと月だけ出た
   * 速さを、そのまま続く前提にしないため。渡さなければ観測した傾きのまま。
   */
  maxPerDay?: number | null;
};

/** 加重最小二乗の結果。予測区間に要るものを全部持つ。 */
type Fit = {
  slope: number;
  intercept: number;
  /** 重み付きの x の平均。ここから離れるほど予測の幅が広がる。 */
  xMean: number;
  /** 重み付きの x の分散。 */
  xVar: number;
  /** 残差の標準偏差。線からの散らばり。 */
  spread: number;
  /** 実効サンプル数（Kish）。重みが偏るほど小さくなる。 */
  effective: number;
};

function ascending(points: readonly TrendPoint[]): TrendPoint[] {
  return [...points].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 半減期つきの加重最小二乗。
 *
 * 重みは合計 1 に正規化してある。こうすると平均・分散がそのまま出て、
 * 重みが全部同じときに素の最小二乗と一致する（テストで確かめてある）。
 */
function fit(points: readonly TrendPoint[], today: IsoDate, halfLife: number): Fit | null {
  const base = points[0]!.date;
  const xs = points.map((p) => daysBetween(base, p.date));
  const ys = points.map((p) => p.value);
  const raw = points.map((p) => 0.5 ** (Math.max(0, daysBetween(p.date, today)) / halfLife));
  const total = raw.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return null;
  const w = raw.map((r) => r / total);

  const xMean = xs.reduce((a, x, i) => a + w[i]! * x, 0);
  const yMean = ys.reduce((a, y, i) => a + w[i]! * y, 0);
  const xVar = xs.reduce((a, x, i) => a + w[i]! * (x - xMean) ** 2, 0);
  // 同じ日に固まっている（傾きが決まらない）
  if (!(xVar > 0)) return null;
  const xy = xs.reduce((a, x, i) => a + w[i]! * (x - xMean) * (ys[i]! - yMean), 0);

  const slope = xy / xVar;
  const intercept = yMean - slope * xMean;
  const effective = 1 / w.reduce((a, v) => a + v * v, 0);
  const resid = ys.reduce((a, y, i) => a + w[i]! * (y - (intercept + slope * xs[i]!)) ** 2, 0);
  /*
   * 傾きと切片に 2 自由度を使っているので、そのぶん散らばりを大きく見積もる。
   * 実効サンプル数が 2 以下だと補正できないので、そのときは補正しない
   * （点の数の下限があるので通常は起きないが、重みが 1 点に寄ると起きうる）。
   */
  const spread = Math.sqrt(effective > 2 ? (resid * effective) / (effective - 2) : resid);
  return { slope, intercept, xMean, xVar, spread, effective };
}

/**
 * その x での予想の幅（±）。最小二乗の予測区間の形をそのまま使う。
 *
 * 中身は 3 つの足し算で、「記録そのものの散らばり」＋「平均の不確かさ」＋
 * **「平均から離れた距離」**。3 つめがあるので、先へ行くほど帯が広がる。
 */
function marginAt(f: Fit, x: number): number {
  return f.spread * Math.sqrt(1 + 1 / f.effective + (x - f.xMean) ** 2 / (f.effective * f.xVar));
}

/** 予想が出ない理由。出るときは null。 */
export type Shortfall = { kind: 'points' | 'span'; more: number };

export function shortfall(points: readonly TrendPoint[]): Shortfall | null {
  const sorted = ascending(points);
  if (sorted.length < MIN_POINTS) return { kind: 'points', more: MIN_POINTS - sorted.length };
  const span = daysBetween(sorted[0]!.date, sorted.at(-1)!.date);
  if (span < MIN_SPAN) return { kind: 'span', more: MIN_SPAN - span };
  // ここから先（途切れた記録・傾きが出ない）は「あと何回」では言えないので黙る
  return null;
}

/** 足りないものを 1 行にする。数を出すのは、あとどれだけで出るのかが分かるため。 */
export function shortfallLabel(short: Shortfall): string {
  return short.kind === 'points'
    ? `あと ${short.more} 回ぶん記録すると予想が出る`
    : `記録の幅が ${MIN_SPAN} 日ぶんになると予想が出る（あと ${short.more} 日）`;
}

/**
 * 落ち着き先へ近づくほど緩む線。`v(t) = limit − (limit − v0)·e^(−kt)`。
 *
 * `k` は今日の傾きから決める（`k = slope / (limit − v0)`）ので、
 * **t=0 の傾きは実測とちょうど同じ**になる。実測の終わりと予想の始まりに
 * 折れが出ないのはこのため。t が伸びるほど指数で寝て、limit に漸近する。
 *
 * 落ち着き先が進む向きの先に無ければ（越えている・逆を向いている）曲げない。
 * 越えた先にどこで落ち着くのかは、このアプリには言えない。
 */
function curve(v0: number, slope: number, limit: number | null): (t: number) => number {
  const gap = limit === null ? 0 : limit - v0;
  // 向きが合っていて、まだ届いていないときだけ曲げる
  if (limit === null || gap === 0 || Math.sign(gap) !== Math.sign(slope)) {
    return (t) => v0 + slope * t;
  }
  const k = slope / gap;
  return (t) => limit - gap * Math.exp(-k * t);
}

export function forecast(
  points: readonly TrendPoint[],
  today: IsoDate,
  { days, flatPer30, halfLife = HALF_LIFE, limit = null, maxPerDay = null }: Options,
): Forecast | null {
  const sorted = ascending(points);
  if (shortfall(sorted) !== null) return null;

  const first = sorted[0]!;
  const last = sorted.at(-1)!;
  const span = daysBetween(first.date, last.date);

  /*
   * 外挿してよい長さ。観測した期間の 2 倍までで、最後の記録から今日までに
   * 使ったぶんは差し引く。しばらく記録が無い種目で、勝手に先を語らないため。
   */
  const reach = span * REACH_RATIO - Math.max(0, daysBetween(last.date, today));
  const horizon = Math.min(days, reach);
  if (horizon < MIN_HORIZON) return null;

  const f = fit(sorted, today, halfLife);
  if (f === null) return null;

  /*
   * 速さの上限。観測した傾きがこれを超えていたら、予想はこの速さで引く。
   * 実測をなかったことにするのではなく、**その速さが続く前提を置かない**だけ。
   */
  const raw = f.slope;
  const slope = maxPerDay === null ? raw : Math.max(-maxPerDay, Math.min(maxPerDay, raw));

  const x0 = daysBetween(first.date, today);
  const now = f.intercept + raw * x0;
  const at = curve(now, slope, limit);

  const steps = Math.min(BAND_STEPS, horizon);
  const band: Band[] = [];
  for (let i = 0; i <= steps; i++) {
    const day = Math.round((horizon * i) / steps);
    const mid = at(day);
    // 幅は当てはめの不確かさそのものなので、曲げた線の周りにそのまま置く
    const m = marginAt(f, x0 + day);
    band.push({ date: shiftDays(today, day), mid, lo: mid - m, hi: mid + m });
  }

  const end = band.at(-1)!;
  const per30 = slope * 30;
  return {
    perDay: slope,
    per30,
    direction: Math.abs(per30) < flatPer30 ? 'flat' : per30 > 0 ? 'up' : 'down',
    date: end.date,
    days: horizon,
    value: end.mid,
    margin: end.hi - end.mid,
    change: end.mid - last.value,
    now,
    band,
    basis: sorted.length,
    limit: limit !== null && Math.sign(limit - now) === Math.sign(slope) && slope !== 0 ? limit : null,
    capped: slope !== raw,
  };
}

/** 予想を言葉にしたもの。画面はこれを並べるだけにする。 */
export type ForecastWords = {
  /** 「この調子なら」。横ばいのときだけ言い方を変える。 */
  lead: string;
  /** 「90日後」 */
  when: string;
  /** 「68.2 kg」 */
  value: string;
  /** 「直近から −1.4 kg」。差がまるく 0 なら null。 */
  change: string | null;
  /** 「幅 ±0.6 kg」 */
  margin: string;
  /** 「落ち着き先の目安 60.6 kg · BMI 20」。落ち着き先が効いていなければ null。 */
  settle: string | null;
};

/**
 * 予想の言い方。
 *
 * 幅を必ず併記する。予想値だけを置くと当たる約束に見えるが、出しているのは
 * 記録のばらつきを含んだ「このあたり」で、幅はその「このあたり」の広さそのもの。
 */
export function forecastWords(
  f: Forecast,
  today: IsoDate,
  unit: string,
  fmt: (n: number) => string,
  /** 落ち着き先が何なのか（「BMI 20」「体重比 1.5×」）。 */
  settleName?: string,
): ForecastWords {
  const change = fmt(Math.abs(f.change));
  const settle =
    f.limit === null
      ? null
      : `落ち着き先の目安 ${fmt(f.limit)} ${unit}${settleName === undefined ? '' : ` · ${settleName}`}`;
  return {
    lead: f.direction === 'flat' ? '横ばいが続けば' : 'この調子なら',
    when: relativeLabel(f.date, today),
    value: `${fmt(f.value)} ${unit}`,
    change: Number(change) === 0 ? null : `直近から ${f.change > 0 ? '+' : '−'}${change} ${unit}`,
    margin: `幅 ±${fmt(f.margin)} ${unit}`,
    settle,
  };
}
