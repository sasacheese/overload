import { useState } from 'react';
import { formatKey, generateKey, isStrongKey, normalizeKey, STRONG_LENGTH } from '../lib/vault.ts';
import { Mark } from './Mark.tsx';

/**
 * 入口。鍵を入れる・作る・作らない。
 *
 * 鍵は同期先を決めるものなので、守りの強さは鍵の強さそのもの。既定では
 * 20 文字を発行する。短い語を入れることもできるが、そのときは同期先が
 * 総当たりで見つかりうることを画面に出す。
 *
 * **鍵を作らない道を塞がない。** 鍵が要るのは同期のためで、この端末だけで
 * 使うなら要らない。あとから鍵を作れば記録ごと同期が始まるので、ここでの
 * 選択は取り返しがつく。それを画面に書いてあるので、確認は挟まない。
 */
export function Gate({
  onKey,
  onLocalOnly,
}: {
  onKey: (key: string) => void;
  onLocalOnly: () => void;
}) {
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
          <Mark className="gate-mark" />
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
            <button type="button" className="primary" onClick={() => onKey(created)}>
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
            if (normalized !== '') onKey(normalized);
          }}
        >
          <Mark className="gate-mark" />
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
          <button type="button" className="tips-empty" onClick={onLocalOnly}>
            鍵を使わずにこの端末だけで使う
          </button>
          <p className="footnote">
            鍵なしでも機能は何も減らない。同期だけが無効になり、記録はこの端末の中に残る。
            あとから鍵を作れば、それまでの記録ごと同期が始まる。
          </p>
        </form>
      )}
    </div>
  );
}
