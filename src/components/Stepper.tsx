/**
 * 数値の入力欄。ジムで片手・汗ばんだ指で触るので、的を大きく取る。
 *
 * 触ると空になり、元の数字は影で残る。打たずに離れれば元に戻る。
 *
 * **0 は影にも残さない。** 0 のまま置いてある欄（初めてやる種目の重量、まだ入れて
 * いない体重）は「まだ入っていない」という意味しか持たないので、消す価値のある
 * 数字ではない。それを影として残すと、消したはずの 0 がまだ居るように見えて、
 * 実際に「毎回 0 を消してから打っている」という使われ方になっていた。いまは 0 の欄は
 * 触る前から `—` で、触れば完全に空になる。打たずに離れれば 0 のまま戻る。
 *
 * −/+ ボタンは持たない。以前は出していたが使われず、狭い画面では数字の幅を
 * 食い潰して「15」が「1」に見切れる——読み違いの実害の方が大きかった。
 * 入れかたは直打ちとダイヤルの 2 本立てで足りている。
 *
 * `dial` を渡すと左端に小さな速度計が出て、弧をなぞって合わせる入れかた（ArcDial）が
 * 開く。直打ちの置き換えではなく並走——どちらで入れても同じ値に落ちる。
 */

import { useEffect, useState } from 'react';
import { format, round } from '../lib/progression.ts';
import { ArcDial } from './ArcDial.tsx';
import { Icon } from './Icon.tsx';

/** 値が入っていない欄に出す字。0 という数字を置かないための代役。 */
const NOTHING = '—';

type Props = {
  value: number;
  step: number;
  min: number;
  max?: number | undefined;
  suffix?: string | undefined;
  label: string;
  /** 0 のときに出す字。省くと `—`。自重種目の重量欄などで差し替える。 */
  zeroLabel?: string | undefined;
  /** 弧のダイヤル（ArcDial）で合わせる入り口を出すか。既定は出さない。 */
  dial?: boolean | undefined;
  /**
   * 打ち終えて次へ送るときの行き先。
   *
   * 端末のキーボードの確定キーを「次へ」にして、押されたらここを呼ぶ。
   * セットの重量 → レップ → 次のセットの重量、と欄を渡り歩けるので、
   * 1 セットぶんを入れるあいだ画面に指を戻さなくて済む。
   */
  onNext?: (() => void) | undefined;
  onChange: (value: number) => void;
};

export function Stepper({
  value,
  step,
  min,
  max,
  suffix,
  label,
  zeroLabel,
  dial = false,
  onNext,
  onChange,
}: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  /**
   * ダイヤルの弧の右端。null なら閉じている。
   *
   * 開く瞬間に決めて、開いているあいだは固定する。値に追随させると、なぞって
   * 値が動くたびに縮尺が変わり、指の下で目盛りが滑る。
   */
  const [dialMax, setDialMax] = useState<number | null>(null);

  /**
   * 弧に割り当てる範囲。いまの値の 1.5 倍か、20 刻みぶんの広いほう。
   *
   * 絶対の上限まで割り当てると 1 目盛りが粗くなりすぎ、狭すぎると
   * 「今日は上げたい」の行き先が弧の外になる。きりのいい数字（5 か 10 の倍数）へ
   * 丸め上げ、さらに刻みで割り切れる位置に載せて、右端まで目盛りが吸い付くようにする。
   */
  const dialCeiling = (): number => {
    const grid = step >= 2 ? 10 : 5;
    const base = Math.max(value * 1.5, min + step * 20, grid);
    const nice = Math.ceil(base / grid) * grid;
    const ceiling = round(Math.ceil(nice / step) * step);
    return max === undefined ? ceiling : Math.min(max, ceiling);
  };

  // 外から値が変わったら（前回の流し込みなど）編集中の下書きを捨てる
  useEffect(() => {
    setDraft(null);
  }, [value]);

  const clamp = (n: number) => round(Math.min(max ?? Infinity, Math.max(min, n)));
  /** 値が無い欄。0 は「まだ入れていない」であって、消すべき数字ではない。 */
  const blank = value === 0;
  const shown = draft ?? (blank ? '' : format(value));

  /** 焦点を当てて空にしただけの状態。まだ何も打っていない。 */
  const cleared = draft !== null && draft.trim() === '';

  /*
   * 空のあいだに出す影。
   *
   * 何を置き換えるのかが分かり、そのまま離れれば戻ることも伝わる。ただし 0 の欄には
   * 戻すべき数字が無いので、影も出さない（0 を影で出すと、消したのに残っているように
   * 見える）。触っていないあいだは `—` を出して、空欄と区別が付くようにする。
   */
  const ghost = blank ? '' : format(value);
  const resting = blank ? (zeroLabel ?? NOTHING) : '';

  /**
   * 離れたときに確定する。
   *
   * **空のまま離れたら元の値に戻す。** 焦点を当てた時点で空にしているので、
   * ここで最小値に落とすと、隣を触るつもりの一撫でや変換の取り消しで
   * 記録が消える。打っていないなら何も変えないのが期待どおりの挙動。
   * 0 にしたいときは 0 と打つ。
   */
  const commit = () => {
    if (draft === null) return;
    const parsed = Number(draft.replace(/[^\d.]/g, ''));
    setDraft(null);
    if (draft.trim() === '') return;
    if (Number.isFinite(parsed)) onChange(clamp(parsed));
  };

  return (
    <div className={`stepper ${dial ? 'has-dial' : ''} ${blank ? 'is-blank' : ''}`}>
      {dial ? (
        <button
          type="button"
          className="stepper-dial"
          aria-label={`${label}をダイヤルで合わせる`}
          onClick={() => setDialMax(dialCeiling())}
        >
          <Icon name="dial" />
        </button>
      ) : null}
      <label className="stepper-field">
        <input
          type="text"
          inputMode="decimal"
          enterKeyHint={onNext ? 'next' : 'done'}
          aria-label={label}
          value={shown}
          placeholder={cleared ? ghost : resting}
          onChange={(e) => setDraft(e.target.value)}
          /*
            触った瞬間に空にする。ジムでは前回の数字を消してから打つことが
            ほとんどなので、選び直す手間を省く。

            select() を続けて呼んでいるのは保険。焦点が当たった時点での値の
            差し替えを無視して元の字を戻す端末があり、そのとき選択済みになって
            いれば最初の 1 打で丸ごと置き換わる（消す手間は変わらず 0 になる）。
          */
          onFocus={(e) => {
            setDraft('');
            e.currentTarget.select();
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            // 確定してから送る。送り先で描き直されても打った値が残る
            commit();
            if (onNext) onNext();
            else e.currentTarget.blur();
          }}
        />
        {suffix ? <span className="stepper-suffix">{suffix}</span> : null}
      </label>

      {dialMax !== null ? (
        <ArcDial
          value={value}
          step={step}
          min={min}
          max={dialMax}
          label={label}
          suffix={suffix}
          zeroLabel={zeroLabel}
          onChange={onChange}
          onClose={() => setDialMax(null)}
        />
      ) : null}
    </div>
  );
}
