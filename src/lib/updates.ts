/**
 * Service Worker の登録と更新通知。
 *
 * 勝手に再読み込みはしない。セットの途中で画面が入れ替わるのが一番困るので、
 * 新しい版が来たことだけ知らせて、押すまで待つ。
 */

const listeners = new Set<() => void>();
let waiting: ServiceWorker | null = null;
let registered = false;
let failure: string | null = null;

function notify(): void {
  for (const fn of listeners) fn();
}

export function registerServiceWorker(base: string): void {
  if (!('serviceWorker' in navigator)) {
    failure = 'このブラウザは Service Worker に対応していない';
    notify();
    return;
  }
  navigator.serviceWorker
    .register(`${base}sw.js`, { scope: base })
    .then((reg) => {
      registered = true;
      notify();
      if (reg.waiting) {
        waiting = reg.waiting;
        notify();
      }
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        installing?.addEventListener('statechange', () => {
          // 既に動いている版があるときだけ「更新あり」。初回インストールは黙って済ませる
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            waiting = installing;
            notify();
          }
        });
      });
    })
    .catch((e: unknown) => {
      // アプリ自体は動くが圏外で開けなくなる。黙って落とすと気づけないので残す
      failure = e instanceof Error ? e.message : String(e);
      console.warn('Service Worker を登録できなかった', e);
      notify();
    });
}

export function subscribeUpdate(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function updateReady(): boolean {
  return waiting !== null;
}

export function offlineReady(): boolean {
  return registered && navigator.serviceWorker.controller !== null;
}

/** 登録に失敗した理由。null なら失敗していない。 */
export function offlineError(): string | null {
  return failure;
}

export function applyUpdate(): void {
  if (!waiting) return;
  waiting.postMessage({ type: 'skip-waiting' });
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
}
