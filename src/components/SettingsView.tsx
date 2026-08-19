/**
 * 設定。ここに秘密は無い。
 *
 * バックアップは「書き込めるトークンをブラウザに置く」方式を取らない。GitHub の
 * Web エディタへ本文ごと飛ばし、書けるかどうかはリポジトリの権限で決まるようにする。
 * 端末に何も預けずに済み、リポジトリを private にしてもこのままで動く。
 */

import { useEffect, useState } from 'react';
import { URL_CONTENT_LIMIT, backupFileName, buildBackup, githubNewFileUrl, isRepoSlug, parseBackup } from '../lib/backup.ts';
import { clearKey, formatKey, storedKey, vaultId } from '../lib/vault.ts';
import { securityRules } from '../lib/remote.ts';
import { offlineError, offlineReady, updateReady, applyUpdate, subscribeUpdate } from '../lib/updates.ts';
import { useStore } from '../store.tsx';
import { useSync } from '../sync.tsx';

const REPO_KEY = 'overload:repo';

function syncLabel(at: number | null): string {
  if (at === null) return 'まだ同期していない';
  const mins = Math.floor((Date.now() - at) / 60_000);
  if (mins < 1) return 'たった今';
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  return hours < 24 ? `${hours}時間前` : `${Math.floor(hours / 24)}日前`;
}

export function SettingsView() {
  const { exercises, sessions, persistent, durable, restore, wipe } = useStore();
  const sync = useSync();
  const key = storedKey();
  const [showKey, setShowKey] = useState(false);
  /*
   * 同期先 ID（鍵の SHA-256）。Rules に貼るために出す。
   *
   * ID を知っている人は匿名サインインを通せば読み書きできるので、機密の度合いは
   * 鍵そのものと同じ。鍵と同じ「表示する」の内側に置いてある。
   */
  const [vault, setVault] = useState<string | null>(null);
  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    vaultId(key).then((id) => {
      if (!cancelled) setVault(id);
    }, () => undefined);
    return () => {
      cancelled = true;
    };
  }, [key]);
  const [repo, setRepo] = useState(
    () => localStorage.getItem(REPO_KEY) ?? import.meta.env.VITE_BACKUP_REPO ?? '',
  );
  const [message, setMessage] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [confirmLock, setConfirmLock] = useState(false);
  const [, bump] = useState(0);

  useEffect(() => subscribeUpdate(() => bump((n) => n + 1)), []);

  const json = () => JSON.stringify(buildBackup(exercises, sessions, new Date()), null, 2);

  const download = () => {
    const blob = new Blob([json()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFileName(new Date());
    a.click();
    URL.revokeObjectURL(url);
    setMessage('バックアップを書き出した');
  };

  const share = async () => {
    const file = new File([json()], backupFileName(new Date()), { type: 'application/json' });
    if (!navigator.canShare?.({ files: [file] })) return setMessage('この環境では共有できない。ダウンロードを使う');
    try {
      await navigator.share({ files: [file], title: 'OVERLOAD のバックアップ' });
    } catch {
      // 共有シートを閉じただけのときもここに来るので何も言わない
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json());
      setMessage('JSON をクリップボードにコピーした');
    } catch {
      setMessage('クリップボードに書けなかった。ダウンロードを使う');
    }
  };

  const openGithub = async () => {
    if (!isRepoSlug(repo)) return setMessage('owner/repo の形で入れる');
    localStorage.setItem(REPO_KEY, repo);
    const content = json();
    const path = `data/${backupFileName(new Date())}`;
    if (content.length > URL_CONTENT_LIMIT) {
      // URL に載せると GitHub 側で切られる長さなので、本文はクリップボード経由にする
      await navigator.clipboard.writeText(content).catch(() => undefined);
      window.open(githubNewFileUrl(repo, path, ''), '_blank', 'noopener');
      setMessage('記録が長いので本文はクリップボードに入れた。開いたエディタに貼り付けてコミットする');
      return;
    }
    window.open(githubNewFileUrl(repo, path, content), '_blank', 'noopener');
    setMessage('GitHub のエディタを開いた。内容を確認してコミットする');
  };

  const importFile = (file: File) => {
    file
      .text()
      .then((raw) => {
        const backup = parseBackup(raw);
        const ok = window.confirm(
          `${backup.sessions.length} 日ぶんの記録と ${backup.exercises.length} 種目を読み込む。いまの記録はすべて置き換わる。`,
        );
        if (!ok) return;
        return restore(backup).then(() => setMessage('復元した'));
      })
      .catch((e: unknown) => setMessage(e instanceof Error ? `読み込めない: ${e.message}` : '読み込めない'));
  };

  return (
    <>
      <header className="view-head">
        <h1 className="view-title">設定</h1>
      </header>

      <section className="panel">
        <h2>状態</h2>
        <dl className="status">
          <dt>記録の保存</dt>
          <dd className={persistent ? 'ok' : 'warn'}>
            {persistent ? 'この端末に保存されている' : '保存できていない（再読み込みで消える）'}
          </dd>
          <dt>追い出され対策</dt>
          <dd className={durable ? 'ok' : ''}>
            {durable
              ? '永続化が許可されている'
              : 'ブラウザ任せ（ホーム画面に追加すると許可されやすい）'}
          </dd>
          <dt>オフライン</dt>
          <dd className={offlineReady() ? 'ok' : offlineError() ? 'warn' : ''}>
            {offlineReady()
              ? '圏外でも開ける'
              : offlineError()
                ? `使えない: ${offlineError()}`
                : '準備中（一度オンラインで開き直すと有効になる）'}
          </dd>
        </dl>
        {updateReady() ? (
          <button type="button" className="primary wide" onClick={applyUpdate}>
            新しい版がある · 再読み込みして適用
          </button>
        ) : null}
      </section>

      <section className="panel">
        <h2>同期</h2>
        {sync.available ? (
          <>
            <dl className="status">
              <dt>最終同期</dt>
              <dd className={sync.phase === 'error' ? 'warn' : 'ok'}>
                {sync.phase === 'running' ? '同期中…' : syncLabel(sync.lastSyncedAt)}
              </dd>
            </dl>
            {sync.error ? <p className="warn">同期できていない: {sync.error}</p> : null}
            <button type="button" className="ghost wide" onClick={sync.syncNow} disabled={sync.phase === 'running'}>
              いま同期する
            </button>
            <p className="footnote">
              記録はこの端末が正で、同期はその写しを送るだけ。圏外で付けた記録は、
              次にオンラインで開いたときにまとめて送られる。
            </p>
          </>
        ) : (
          <p className="muted">
            Firebase の設定（VITE_FIREBASE_PUBLIC_*）が入っていないので同期は無効。
            記録はこの端末だけに残る。設定手順は README にある。
          </p>
        )}
      </section>

      <section className="panel">
        <h2>鍵</h2>
        <p className="muted">
          この鍵が記録の在り処。他の端末で同じ鍵を入れると同じ記録が開く。
          鍵を知らない人はどの端末からも到達できない。
        </p>
        {key === null ? null : showKey ? (
          <>
            <code className="key-value">{formatKey(key)}</code>
            <div className="btn-row">
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(formatKey(key))
                    .then(() => setMessage('鍵をコピーした'), () => setMessage('コピーできなかった'));
                }}
              >
                鍵をコピー
              </button>
              <button type="button" className="ghost" onClick={() => setShowKey(false)}>
                隠す
              </button>
            </div>

            <dl className="status">
              <dt>同期先 ID</dt>
              <dd>
                <code className="key-value">{vault ?? '計算中…'}</code>
              </dd>
            </dl>
            <p className="footnote">
              Firestore の Security Rules にこの ID を固定すると、他の人が同じプロジェクトに
              自分の領域を作れなくなる。下のボタンで貼り付けられる形になる。
              この ID は鍵と同じくらい秘密にする。
            </p>
            <button
              type="button"
              className="ghost wide"
              disabled={vault === null}
              onClick={() => {
                if (vault === null) return;
                navigator.clipboard
                  ?.writeText(securityRules(vault))
                  .then(
                    () => setMessage('Rules をコピーした。Firestore のルール画面に貼って公開する'),
                    () => setMessage('コピーできなかった'),
                  );
              }}
            >
              Security Rules をコピー
            </button>
          </>
        ) : (
          <button type="button" className="ghost wide" onClick={() => setShowKey(true)}>
            鍵と同期先 ID を表示する
          </button>
        )}
        {/*
          鍵を消すのは「表示する」と並ぶ重さの操作ではない。書き留めていない鍵を
          消すと同期していたぶんに戻れなくなるので、静かな見た目にして一段挟む。
        */}
        {confirmLock ? (
          <>
            <p className="warn">鍵を書き留めたか。消すとこの端末からは開けなくなる。</p>
            <div className="btn-row">
              <button
                type="button"
                className="ghost danger"
                onClick={() => {
                  clearKey();
                  location.reload();
                }}
              >
                消してロックする
              </button>
              <button type="button" className="ghost" onClick={() => setConfirmLock(false)}>
                やめる
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="quiet-action" onClick={() => setConfirmLock(true)}>
            この端末から鍵を消す（ロックする）
          </button>
        )}
      </section>

      <section className="panel">
        <h2>バックアップ</h2>
        <p className="muted">
          {sync.available
            ? '同期していても、Firebase の外に自分で持っておける形が 1 つあると戻せる。'
            : '記録はこの端末にしか無い。端末を失うと消えるので、ときどき書き出す。'}{' '}
          {sessions.length} 日ぶん · {exercises.length} 種目。
        </p>
        <div className="btn-row">
          <button type="button" className="ghost" onClick={download}>
            ファイルに書き出す
          </button>
          <button type="button" className="ghost" onClick={share}>
            共有
          </button>
          <button type="button" className="ghost" onClick={copy}>
            JSON をコピー
          </button>
        </div>

        <label className="field">
          <span>GitHub に置く（owner/repo）</span>
          <input value={repo} placeholder="sasacheese/overload" onChange={(e) => setRepo(e.target.value)} />
        </label>
        <button type="button" className="ghost wide" onClick={openGithub}>
          GitHub のエディタで開く
        </button>
        <p className="footnote">
          書き込み権限はブラウザに置かない。ログイン済みの GitHub で編集できるかどうかがそのまま境界になる。
        </p>

        <label className="field">
          <span>ファイルから復元する</span>
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) importFile(file);
            }}
          />
        </label>
      </section>

      <section className="panel">
        <h2>データ</h2>
        {confirmWipe ? (
          <>
            <p className="warn">すべての記録を消す。取り消せない。先にバックアップを取ったか。</p>
            <div className="btn-row">
              <button
                type="button"
                className="ghost danger"
                onClick={() => {
                  wipe()
                    .then(() => setMessage('消した'))
                    .catch(() => undefined);
                  setConfirmWipe(false);
                }}
              >
                消す
              </button>
              <button type="button" className="ghost" onClick={() => setConfirmWipe(false)}>
                やめる
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="ghost danger wide" onClick={() => setConfirmWipe(true)}>
            すべての記録を消す
          </button>
        )}
      </section>

      {message ? <p className="hint">{message}</p> : null}
      <p className="footnote">OVERLOAD v0.4</p>
    </>
  );
}
