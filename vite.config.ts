import { readdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// GitHub Pages のプロジェクトサイト配下に置くため。別の場所に置くなら BASE_PATH を渡す。
const BASE = process.env.BASE_PATH ?? '/overload/';

async function walk(dir: string, root = dir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, root)));
    else out.push(relative(root, full));
  }
  return out;
}

/** 内容が変われば必ず変わる短い文字列。ビルド時刻を使わないので CI で再現する。 */
function fingerprint(parts: readonly string[]): string {
  let h = 0x811c9dc5;
  for (const s of parts.join('\n')) {
    h ^= s.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/**
 * public/sw.js のプレースホルダを、実際にビルドされたファイル一覧で置き換える。
 *
 * Workbox を入れないのは、やることが「dist の中身を全部プリキャッシュする」だけで、
 * 生成された sw.js をそのまま読んで理解できる状態を保ちたいから。ハッシュ付き
 * ファイル名を SW から参照する必要があるので、置換はビルド後にしかできない。
 */
function swPrecache(base: string): Plugin {
  return {
    name: 'overload-sw-precache',
    async closeBundle() {
      const dist = resolve(import.meta.dirname, 'dist');
      const swPath = resolve(dist, 'sw.js');
      let src: string;
      try {
        src = await readFile(swPath, 'utf8');
      } catch {
        return; // preview 用の部分ビルドなど、sw.js が無いときは何もしない
      }
      const urls = (await walk(dist))
        .map((f) => f.split('\\').join('/'))
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map'))
        .sort()
        .map((f) => base + f);
      await writeFile(
        swPath,
        src
          .replace('"__PRECACHE__"', JSON.stringify(urls, null, 2))
          .replace('"__VERSION__"', JSON.stringify(fingerprint(urls)))
          .replace('"__BASE__"', JSON.stringify(base)),
        'utf8',
      );
    },
  };
}

export default defineConfig({
  base: BASE,
  plugins: [react(), swPrecache(BASE)],
  server: { port: Number(process.env.PORT) || 5180 },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
});
