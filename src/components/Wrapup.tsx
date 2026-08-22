/**
 * 1 日の締め。「終える」を押したときに出る、その日ぶんのまとめ。
 *
 * セットごとの祝福（Celebration）は 1 回ぶんの前進を一瞬だけ映すもので、
 * こちらは**その日にやったこと全部**を一度だけ受け取る場所。だから演出も別にしてある——
 * 祝福は勝手に消えるが、こちらは読み終わるまで残る。
 *
 * 出す中身は lib/wrapup.ts が全部決める。ここは並べるだけにしてあるので、
 * 「何をもって讃えるか」を変えたいときに触るのはあちらだけで済む。
 *
 * 数字は 0 から数え上がる。止まった数字がいきなり出るより、積み上げた量として
 * 読める。`prefers-reduced-motion` では最初から最終値を置く。
 */

import { useEffect, useRef, useState } from 'react';
import { cardDateLabel, drawShareCard, shareCard, shareFileName } from '../lib/sharecard.ts';
import { MUSCLE_GROUPS } from '../lib/types.ts';
import { GREETING, type WrapUp } from '../lib/wrapup.ts';
import { Icon } from './Icon.tsx';
import { Mark } from './Mark.tsx';

/** 数え上がりにかける時間。長いと待たされ、短いと数えたことが分からない。 */
const COUNT_MS = 900;
const RAYS = 14;

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 0 から目標値まで数え上がる。
 *
 * 終わりに向かって減速させる（ease-out）。等速だと最後の桁が突然止まって見える。
 * 目標値が変わったら数え直す——同じ画面で別の日を開いたときに、前の数字から
 * 動き出すと差分に見えてしまう。
 */
function useCountUp(target: number): number {
  const [value, setValue] = useState(() => (reducedMotion() ? target : 0));

  useEffect(() => {
    if (reducedMotion()) {
      setValue(target);
      return;
    }
    let raf = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / COUNT_MS);
      const eased = 1 - (1 - t) ** 3;
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    /*
     * 数え上がりが止まっても、最後には必ず最終値を置く。
     *
     * requestAnimationFrame は、タブが背面にある・画面が描画されていないあいだ
     * 呼ばれない。開いた直後に画面を切り替えて戻ってくると、0 のまま止まった
     * 数字が残る（実際にそうなった）。演出が動かないのは構わないが、
     * **数字が違う**のは困るので、時間で最終値を置く保険を掛けておく。
     */
    const settle = setTimeout(() => setValue(target), COUNT_MS + 120);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settle);
    };
  }, [target]);

  return value;
}

function Stat({ value, unit, format }: { value: number; unit: string; format?: (n: number) => string }) {
  const shown = useCountUp(value);
  return (
    <span className="wrap-stat">
      <strong>{format ? format(shown) : shown}</strong>
      <span className="unit">{unit}</span>
    </span>
  );
}

export function Wrapup({
  summary,
  /** 押して締めた直後か。あとから見直したときは光を出さない。 */
  fresh,
  onClose,
}: {
  summary: WrapUp;
  fresh: boolean;
  onClose: () => void;
}) {
  const [saved, setSaved] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onShare = async () => {
    const canvas = drawShareCard({
      date: cardDateLabel(summary.date),
      praise: summary.praise,
      sets: summary.sets,
      exercises: summary.exercises,
      volume: summary.volume,
      reps: summary.reps,
      groups: summary.groups,
      records: summary.records.map((r) => r.achievement.title),
      weekStreak: summary.weekStreak,
    });
    const result = await shareCard(canvas, shareFileName(summary.date), `${cardDateLabel(summary.date)} · ${summary.praise}`);
    setSaved(result === 'saved' ? '画像を保存した' : result === 'failed' ? '書き出せなかった' : null);
  };

  return (
    <div className="wrap" role="dialog" aria-modal="true" aria-label="今日のまとめ">
      {fresh ? (
        <div className="wrap-rays" aria-hidden="true">
          {Array.from({ length: RAYS }, (_, i) => (
            <span key={i} style={{ '--angle': `${(360 / RAYS) * i}deg` } as React.CSSProperties} />
          ))}
        </div>
      ) : null}

      <div className="wrap-card">
        <header className="wrap-head">
          <span className="wrap-eyebrow">
            <Mark className="wrap-mark" />
            {cardDateLabel(summary.date)}
          </span>
          <button type="button" className="icon-btn" aria-label="閉じる" ref={closeRef} onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>

        {/*
          いちばん大きい字は挨拶。事実の言い換えはその下に小さく添える。
          事実を最大の文字に置くと、機械が読み上げているように見えた。
        */}
        <p className="wrap-greeting">{GREETING}</p>
        <p className="wrap-praise">{summary.praise}</p>

        <div className="wrap-stats">
          <Stat value={summary.sets} unit="セット" />
          <Stat value={summary.exercises} unit="種目" />
          {summary.volume > 0 ? (
            <Stat value={Math.round(summary.volume)} unit="kg" format={(n) => n.toLocaleString('ja-JP')} />
          ) : (
            <Stat value={summary.reps} unit="レップ" />
          )}
        </div>

        {summary.groups.length > 0 ? (
          <p className="wrap-groups">{summary.groups.map((g) => MUSCLE_GROUPS[g].label).join(' · ')}</p>
        ) : null}

        {summary.records.length > 0 ? (
          <ul className="wrap-records">
            {summary.records.map((r, i) => (
              <li key={`${r.achievement.kind}-${r.exerciseName ?? ''}-${i}`}>
                <span className="wrap-record-title">{r.achievement.title}</span>
                <span className="wrap-record-detail">{r.achievement.detail}</span>
                <span className="wrap-record-where">{r.exerciseName ?? 'この日ぜんぶ'}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {/*
          続いていることを数字で置く。

          前回比は落ちた日にも出すが、色は付けない——差を出すだけで良し悪しは
          言わない（セット行の前回比と同じ扱い）。比べる相手は「今日と同じ種目を
          やった直近の日」なので、分割して回していても意味のある数字になる。
        */}
        <dl className="wrap-facts">
          <div>
            <dt>今週</dt>
            <dd>{summary.weekCount} 回目</dd>
          </div>
          {summary.weekStreak >= 2 ? (
            <div>
              <dt>連続</dt>
              <dd>{summary.weekStreak} 週</dd>
            </div>
          ) : null}
          <div>
            <dt>通算</dt>
            <dd>{summary.totalDays} 日</dd>
          </div>
          {summary.volumeRatio !== null ? (
            <div>
              <dt>前回比</dt>
              <dd className={summary.volumeRatio > 0 ? 'is-up' : ''}>
                {summary.volumeRatio > 0 ? '+' : summary.volumeRatio < 0 ? '−' : '±'}
                {Math.abs(Math.round(summary.volumeRatio * 100))}%
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="wrap-actions">
          <button type="button" className="solid wide center-icon" onClick={onShare}>
            <Icon name="share" />
            今日の一枚
          </button>
          <button type="button" className="quiet-action wrap-done" onClick={onClose}>
            閉じる
          </button>
        </div>
        {saved ? <p className="wrap-note">{saved}</p> : null}
      </div>
    </div>
  );
}
