/**
 * 弧のダイヤル。数字を打つ代わりに、速度計のような弧をなぞって合わせる。
 *
 * 数字の直打ち（Stepper）はそのまま残してあり、これは**もう 1 つの入れかた**。
 * ジムでは片手がバーに掛かっていることがあり、キーボードを出して桁を打つより、
 * 親指 1 本でなぞるほうが速い場面がある。開いた瞬間から下半分（親指の届く範囲）に
 * 全部の操作が収まるよう、下から出るシートに載せている。
 *
 * 値はなぞった先で**即保存**する（このアプリに保存ボタンは無い——触った時点で
 * IndexedDB に入る、という方針のまま）。「完了」はただ閉じるだけ。
 *
 * 弧の右端（上限）は開くときに呼び出し側が決める。絶対の上限（例: 300kg）まで
 * 弧に割り当てると 1 目盛りが粗くなりすぎるので、いまの値の少し先まで、で切ってある。
 * それ以上へはシート内の ＋ か、閉じて直打ちで行ける。
 */

import { useEffect, useRef } from 'react';
import { tickFeedback } from '../lib/haptics.ts';
import { format, round } from '../lib/progression.ts';
import { Icon } from './Icon.tsx';
import { Overlay } from './Overlay.tsx';

const VIEW_W = 220;
const VIEW_H = 176;
const CX = 110;
const CY = 96;
const R = 84;
/**
 * 弧の始まり（画面座標の角度）と長さ。左下から時計回りに 270° 描くと、
 * 下の切れ目が左右対称になり、速度計として読める。切れ目の 90° は不感帯で、
 * なぞった指が通ったら近いほうの端に寄せる。
 */
const START = 135;
const SWEEP = 270;
const ARC_LEN = 2 * Math.PI * R * (SWEEP / 360);

function polar(deg: number, r: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

const A0 = polar(START, R);
const A1 = polar(START + SWEEP, R);
const TRACK = `M ${A0.x} ${A0.y} A ${R} ${R} 0 1 1 ${A1.x} ${A1.y}`;

/** 目盛り。弧の内側に置く（外に出すと一番上で描画領域からはみ出す）。 */
const TICKS = Array.from({ length: 25 }, (_, i) => {
  const deg = START + (SWEEP / 24) * i;
  const major = i % 6 === 0;
  return { a: polar(deg, 74), b: polar(deg, major ? 66 : 69), major };
});

type Props = {
  value: number;
  step: number;
  min: number;
  /** 弧の右端。ゲージの縮尺であって値の上限ではない（＋で越えられる）。 */
  max: number;
  label: string;
  suffix?: string | undefined;
  /** 0 のときに出す字。自重種目の「自重」など。 */
  zeroLabel?: string | undefined;
  onChange: (value: number) => void;
  onClose: () => void;
};

export function ArcDial({ value, step, min, max, label, suffix, zeroLabel, onChange, onClose }: Props) {
  const svg = useRef<SVGSVGElement | null>(null);
  const dragging = useRef(false);
  /**
   * 最後に送った値。prop の value は再描画まで古いままなので、なぞっている最中に
   * これと比べないと、同じ値を何度も送って目盛りの振動が鳴り続ける。
   */
  const sent = useRef(value);
  useEffect(() => {
    sent.current = value;
  }, [value]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ratio = max <= min ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)));
  const thumb = polar(START + SWEEP * ratio, R);

  /** 刻みに吸い付ける。0.1 刻みの浮動小数のゴミは round で払う。 */
  const snap = (raw: number): number =>
    round(Math.min(max, Math.max(min, Math.round((raw - min) / step) * step + min)));

  const send = (next: number) => {
    if (next === sent.current) return;
    sent.current = next;
    // 一段ごとに指へ返す。目盛りを「感じられる」ことがダイヤルの気持ちよさの芯
    tickFeedback();
    onChange(next);
  };

  const apply = (e: React.PointerEvent<SVGSVGElement>) => {
    const el = svg.current;
    if (el === null) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const y = ((e.clientY - rect.top) / rect.height) * VIEW_H;
    const deg = (Math.atan2(y - CY, x - CX) * 180) / Math.PI;
    let t = (deg - START + 360) % 360;
    if (t > SWEEP) t = t - SWEEP < (360 - SWEEP) / 2 ? SWEEP : 0;
    send(snap(min + (t / SWEEP) * (max - min)));
  };

  /** ±1 刻み。ゲージの右端は縮尺でしかないので、＋はそれを越えてよい。 */
  const nudge = (delta: number) => send(round(Math.max(min, value + delta)));

  return (
    <Overlay>
      <div className="sheet-backdrop" onClick={onClose}>
        <div
          className="sheet dial-sheet"
          role="dialog"
          aria-modal="true"
          aria-label={`${label}をダイヤルで合わせる`}
          onClick={(e) => e.stopPropagation()}
        >
          <header className="sheet-head">
            <strong>{label}</strong>
            <button type="button" className="icon-btn" aria-label="閉じる" onClick={onClose}>
              <Icon name="close" />
            </button>
          </header>

          <div className="dial-stage">
            <svg
              ref={svg}
              className="dial-gauge"
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              role="slider"
              aria-label={label}
              aria-valuemin={min}
              aria-valuemax={max}
              aria-valuenow={value}
              aria-valuetext={`${format(value)}${suffix ?? ''}`}
              onPointerDown={(e) => {
                dragging.current = true;
                try {
                  // 指が弧の外へ滑っても離すまで追う
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch {
                  // 捕まえられない環境でも、なぞり自体は move で動く
                }
                apply(e);
              }}
              onPointerMove={(e) => {
                if (dragging.current) apply(e);
              }}
              onPointerUp={() => {
                dragging.current = false;
              }}
              onPointerCancel={() => {
                dragging.current = false;
              }}
            >
              {TICKS.map((t, i) => (
                <line
                  key={i}
                  className={`dial-tick ${t.major ? 'is-major' : ''}`}
                  x1={t.a.x}
                  y1={t.a.y}
                  x2={t.b.x}
                  y2={t.b.y}
                />
              ))}
              <path className="dial-track" d={TRACK} />
              <path
                className="dial-fill"
                d={TRACK}
                strokeDasharray={ARC_LEN}
                strokeDashoffset={ARC_LEN * (1 - ratio)}
              />
              <circle className="dial-thumb" cx={thumb.x} cy={thumb.y} r={10} />
            </svg>

            <div className="dial-readout" aria-hidden="true">
              <strong>{value === 0 && zeroLabel ? zeroLabel : format(value)}</strong>
              {suffix ? <span>{suffix}</span> : null}
            </div>
            <span className="dial-bound is-min" aria-hidden="true">
              {format(min)}
            </span>
            <span className="dial-bound is-max" aria-hidden="true">
              {format(max)}
            </span>
          </div>

          <div className="sheet-actions">
            <button type="button" className="ghost" aria-label={`${label}を減らす`} onClick={() => nudge(-step)}>
              −
            </button>
            <button type="button" className="solid" onClick={onClose}>
              完了
            </button>
            <button type="button" className="ghost" aria-label={`${label}を増やす`} onClick={() => nudge(step)}>
              ＋
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}
