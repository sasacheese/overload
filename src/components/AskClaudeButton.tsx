import { useEffect, useMemo, useRef, useState } from 'react';
import { PERIODS, buildAskPrompt, claudeNewChatUrl, type AskInput } from '../lib/askClaude.ts';

/**
 * 記録を積んだ Claude の会話を開くボタン。
 *
 * `<a target="_blank">` にしているのは、window.open だとポップアップブロックに
 * かかることがあるのと、モバイルで Universal Link がアプリに渡るのは素の
 * ナビゲーションだけだから。
 *
 * 押したときにプロンプトをクリップボードにも入れている。claude.ai のリンクは
 * デスクトップアプリでは開けず Web 版になるので、アプリで続けたい場合に貼れる先を
 * 残す必要がある。URL 長で節を落とした場合も、こちらには全文が入る。
 */
export function AskClaudeButton({ sessions, exercises, today }: Omit<AskInput, 'weeks'>) {
  const [weeks, setWeeks] = useState<number | null>(PERIODS[0]!.weeks);
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const input = useMemo(() => ({ sessions, exercises, today, weeks }), [sessions, exercises, today, weeks]);
  const prompt = useMemo(() => buildAskPrompt(input), [input]);
  const fullPrompt = useMemo(() => buildAskPrompt(input, Infinity), [input]);

  const copy = () => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(fullPrompt).then(
      () => {
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 2500);
      },
      () => setCopied(false),
    );
  };

  return (
    <div className="ask">
      <p className="ask-head">Claude に相談する</p>
      <div className="ask-periods" role="group" aria-label="Claude に渡す期間">
        {PERIODS.map((p) => (
          <button
            type="button"
            key={p.label}
            className={weeks === p.weeks ? 'is-active' : ''}
            aria-pressed={weeks === p.weeks}
            onClick={() => setWeeks(p.weeks)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <a
        className="ghost accent wide ask-link"
        href={claudeNewChatUrl(prompt)}
        target="_blank"
        rel="noreferrer noopener"
        title={
          '記録と設定・メモを渡した状態で Claude の会話を開きます。' +
          'アプリが入っていればアプリで開きます。' +
          '同じ内容をクリップボードにも入れるので、デスクトップアプリに貼っても使えます。'
        }
        onClick={copy}
      >
        {copied ? '✓ コピーもした · Claude を開いた' : '記録を渡して相談する'}
      </a>
      <p className="footnote">
        直近の記録・種目の設定・メモと、ボディメイクを目的にした依頼文が入った状態で開く。
        デスクトップアプリで続けたいときは、同時にコピーされた全文を貼る。
      </p>
    </div>
  );
}
