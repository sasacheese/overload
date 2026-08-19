import { useState } from 'react';
import { formatKey, generateKey, isStrongKey, normalizeKey, STRONG_LENGTH } from '../lib/vault.ts';
import { Mark } from './Mark.tsx';

/**
 * 鍵の入力・発行。
 *
 * この鍵は「画面を開く」ことと「同期先を決める」ことの両方を担う。守りの強さは
 * 鍵の強さそのものなので、既定では 20 文字を発行する。短い語を入れることも
 * できるが、そのときは同期先が総当たりで見つかりうることを画面に出す。
 */
export function Gate({ onUnlocked }: { onUnlocked: (key: string) => void }) {
  const [mode, setMode] = useState<'enter' | 'create'>('enter');
  const [input, setInput] = useState('');
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const normalized = normalizeKey(input);
  const weak = normalized !== '' && !isStrongKey(normalized);

  const create = () => {
    setCreated(generateKey());
    setCopied(false);
    setMode('create');
  };

  const copy = (key: string) => {
    navigator.clipboard?.writeText(formatKey(key)).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  return (
    <div className="gate">
      {mode === 'create' && created !== null ? (
        <div className="gate-form">
          <Mark className="gate-mark" lineColor="var(--fg-dim)" />
          <h1>OVERLOAD</h1>
          <p className="gate-tagline">あなたの鍵</p>
          <code className="key-value">{formatKey(created)}</code>
          <p className="muted">
            この鍵が記録の在り処。書き留めてから先に進む。他の端末で同じ鍵を入れると同じ記録が開く。
            失くしてもこの端末の記録は消えないが、同期していたぶんには戻れなくなる。
          </p>
          <div className="btn-row">
            <button type="button" className="ghost" onClick={() => copy(created)}>
              {copied ? '✓ コピーした' : '鍵をコピー'}
            </button>
            <button type="button" className="primary" onClick={() => onUnlocked(created)}>
              この鍵で開く
            </button>
          </div>
          <button type="button" className="tips-empty" onClick={() => setMode('enter')}>
            すでに鍵がある
          </button>
        </div>
      ) : (
        <form
          className="gate-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (normalized !== '') onUnlocked(normalized);
          }}
        >
          <Mark className="gate-mark" lineColor="var(--fg-dim)" />
          <h1>OVERLOAD</h1>
          <p className="gate-tagline">上質な肉体をプロデュースする</p>
          <input
            type="password"
            autoComplete="current-password"
            inputMode="text"
            autoCapitalize="characters"
            placeholder="鍵"
            value={input}
            autoFocus
            onChange={(e) => setInput(e.target.value)}
          />
          {weak ? (
            <p className="gate-error">
              {STRONG_LENGTH} 文字未満の鍵は総当たりで見つかりうる。同期を使うなら発行した鍵を推奨。
            </p>
          ) : null}
          <button type="submit" className="primary" disabled={normalized === ''}>
            開く
          </button>
          <hr className="gate-rule" />
          <button type="button" className="tips-empty" onClick={create}>
            はじめて使う — 鍵を作る
          </button>
        </form>
      )}
    </div>
  );
}
