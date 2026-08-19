/**
 * 数値の入力欄。ジムで片手・汗ばんだ指で触るので、的を大きく取る。
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

  const commit = () => {
    if (draft === null) return;
    const parsed = Number(draft.replace(/[^\d.]/g, ''));
    setDraft(null);
    if (draft.trim() === '') return onChange(min);
    if (Number.isFinite(parsed)) onChange(clamp(parsed));
  };

  return (
    <div className={`stepper ${showSteps ? '' : 'is-plain'}`}>
      {showSteps ? (
        <button
          type="button"
          className="stepper-btn"
          aria-label={`${label}を減らす`}
          onClick={() => onChange(clamp(value - step))}
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
          placeholder={zeroLabel ?? ''}
          onChange={(e) => setDraft(e.target.value)}
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
          onClick={() => onChange(clamp(value + step))}
        >
          ＋
        </button>
      ) : null}
    </div>
  );
}
