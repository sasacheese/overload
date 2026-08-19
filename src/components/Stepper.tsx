/**
 * 数値の入力欄。ジムで片手・汗ばんだ指で触るので、的を大きく取る。
 *
 * 触ると空になり、元の数字は影で残る。打たずに離れれば元に戻る。
 *
 * −/+ ボタンは `showSteps` で消せる。重量はマシンごとに刻みがばらばらで、
 * 決まった量ずつ動かすボタンが役に立たないため、重量欄では出していない。
 * レップは必ず 1 ずつなのでボタンが効く。
 */

import { useEffect, useState } from 'react';
import { format, round } from '../lib/progression.ts';

type Props = {
  value: number;
  step: number;
  min: number;
  max?: number | undefined;
  suffix?: string | undefined;
  label: string;
  /** 0 のときに出すプレースホルダ。自重種目の重量欄などで使う。 */
  zeroLabel?: string | undefined;
  /** −/+ ボタンを出すか。既定は出す。 */
  showSteps?: boolean | undefined;
  onChange: (value: number) => void;
};

export function Stepper({ value, step, min, max, suffix, label, zeroLabel, showSteps = true, onChange }: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  // 外から値が変わったら（目標の流し込みなど）編集中の下書きを捨てる
  useEffect(() => {
    setDraft(null);
  }, [value]);

  const clamp = (n: number) => round(Math.min(max ?? Infinity, Math.max(min, n)));
  const shown = draft ?? (value === 0 && zeroLabel ? '' : format(value));

  /** 焦点を当てて空にしただけの状態。まだ何も打っていない。 */
  const cleared = draft !== null && draft.trim() === '';

  /*
   * 空のあいだは元の数字を影で残す。
   *
   * 何を置き換えるのかが分かり、そのまま離れれば戻ることも伝わる。値が無い欄
   * （自重・体重未入力）は 0 ではなく元の字を出す——影が「0」だと入れた値に見える。
   */
  const ghost = value === 0 && zeroLabel !== undefined ? zeroLabel : format(value);

  /**
   * いま画面に出ている値。打ちかけの文字があればそれを読む。
   *
   * −/+ が `value` を直接使うと、打った数字を確定せずにボタンを押したときに
   * 打つ前の値から動いてしまう（12 と打って ＋ を押すと 13 ではなく 7 になっていた）。
   * 画面に見えている数字から動くのが期待どおりの挙動。
   */
  const current = (): number => {
    if (draft === null) return value;
    if (draft.trim() === '') return value;
    const parsed = Number(draft.replace(/[^\d.]/g, ''));
    return Number.isFinite(parsed) ? clamp(parsed) : value;
  };

  /** −/+ を押したときの動き。打ちかけは確定させて捨てる。 */
  const bump = (delta: number) => {
    setDraft(null);
    onChange(clamp(current() + delta));
  };

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
    <div className={`stepper ${showSteps ? '' : 'is-plain'}`}>
      {showSteps ? (
        <button
          type="button"
          className="stepper-btn"
          aria-label={`${label}を減らす`}
          onClick={() => bump(-step)}
        >
          −
        </button>
      ) : null}
      <label className="stepper-field">
        <input
          type="text"
          inputMode="decimal"
          aria-label={label}
          value={shown}
          placeholder={cleared ? ghost : (zeroLabel ?? '')}
          onChange={(e) => setDraft(e.target.value)}
          /*
            触った瞬間に空にする。ジムでは前回の数字を消してから打つことが
            ほとんどなので、選択し直す手間を省く。
          */
          onFocus={() => setDraft('')}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        {suffix ? <span className="stepper-suffix">{suffix}</span> : null}
      </label>
      {showSteps ? (
        <button
          type="button"
          className="stepper-btn"
          aria-label={`${label}を増やす`}
          onClick={() => bump(step)}
        >
          ＋
        </button>
      ) : null}
    </div>
  );
}
