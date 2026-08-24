/**
 * オフラインで開くための Service Worker。
 *
 * プレースホルダはビルド後に vite.config.ts のプラグインが実際のファイル一覧へ
 * 置き換える（ハッシュ付きファイル名はビルド前には分からないため）。
 * dev サーバでは登録しないので、置換前のこのファイルが動くことはない。
 *
 * 更新は自動で適用しない。セットの途中で画面が入れ替わるのが一番困るので、
 * アプリから skip-waiting を受け取るまで待つ。
 */

const VERSION = "__VERSION__";
const BASE = "__BASE__";
const PRECACHE = "__PRECACHE__";

const CACHE = `overload-${VERSION}`;
const FILES = Array.isArray(PRECACHE) ? PRECACHE : [];
const SHELL = `${BASE}index.html`;

/**
 * プリキャッシュは必ずネットワークから取る。
 *
 * `cache.addAll` はブラウザの HTTP キャッシュを使う。GitHub Pages は
 * `max-age=600` を返すので、直前に開いていると**古い index.html** がそのまま
 * 保存される。その index.html が指すハッシュ付きファイルは新しいデプロイで
 * 消えているので、更新を適用した瞬間から本体を読めなくなる（白い画面）。
 *
 * 版ごとに変わる問い合わせを付けて取り、cache には問い合わせ無しの URL で
 * 収める。`cache: 'reload'` だけに頼らないのは、これが効かない実装でも
 * URL が違えば HTTP キャッシュに当たらないため。
 *
 * 1 つでも取れなければ install を失敗させる（addAll と同じ振る舞い）。
 * 中途半端に揃ったキャッシュを有効にすると、同じ白い画面が別の形で出る。
 */
async function precache(cache) {
  const urls = [...new Set([...FILES, SHELL, BASE])];
  await Promise.all(
    urls.map(async (url) => {
      const fresh = `${url}${url.includes('?') ? '&' : '?'}v=${VERSION}`;
      const response = await fetch(fresh, { cache: 'reload' });
      if (!response.ok) throw new Error(`${url} を取得できない (${response.status})`);
      await cache.put(url, response);
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(precache));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('overload-') && n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // 画面遷移はどのパスでもアプリ本体を返す。圏外での再起動もこれで開く。
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cached = await caches.match(SHELL);
        if (cached) return cached;
        try {
          return await fetch(request);
        } catch {
          return new Response('オフラインで、まだアプリを保存できていない', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      // ハッシュ付きでない資産（アイコンなど）を後から拾えるようにする
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE);
        cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});
