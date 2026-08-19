/**
 * 入口の鍵。この 1 つで「画面を開く」と「同期先を決める」の両方を担う。
 *
 * ## なぜ短い合言葉ではないのか
 *
 * 同期先を鍵で決める方式（推測できない ID を鍵にする）では、鍵の強さがそのまま
 * データの守りの強さになる。辞書に載っているような短い語は候補が数千通りしかなく、
 * Firestore に順番に問い合わせれば見つかってしまう。
 *
 * また、鍵をビルド時に埋め込むことはできない。GitHub Pages が配信するバンドルは
 * 誰でも読めるので、埋め込んだ時点で鍵ではなくなる。だから鍵は**端末ごとに 1 回
 * 入力して localStorage に置く**しかない。入力は 1 回だけなので、長くても困らない。
 *
 * ## 形
 *
 * 20 文字（100 ビット）。紛らわしい I L O U を除いた 32 文字の英数字で、
 * 4 文字ずつ区切って表示する。総当たりは現実的でない一方、貼り付けるのは一瞬。
 */

const STORAGE_KEY = 'overload:vault-key';

/** 見間違いと打ち間違いを避けるため I L O U を除いてある。 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const KEY_LENGTH = 20;

/** これ以上短い鍵は総当たりの的になる。拒否はしないが警告を出す。 */
export const STRONG_LENGTH = 16;

export function generateKey(): string {
  const bytes = new Uint8Array(KEY_LENGTH);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** 区切りと大小の違いを吸収する。人が写して入れる前提なので受け口は広く取る。 */
export function normalizeKey(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

/** 4 文字ずつ区切った表示用の形。 */
export function formatKey(key: string): string {
  return (key.match(/.{1,4}/g) ?? []).join('-');
}

export function isStrongKey(key: string): boolean {
  return normalizeKey(key).length >= STRONG_LENGTH;
}

export function storedKey(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null || raw === '' ? null : raw;
  } catch {
    return null;
  }
}

export function storeKey(key: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, normalizeKey(key));
  } catch {
    // 保存できなくてもこのタブでは開ける
  }
}

export function clearKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 消せなければ何もしない
  }
}

/**
 * 同期先のパスに使う ID。鍵そのものではなく SHA-256 を使う。
 *
 * 機能上はどちらでも動くが、鍵の生値をネットワークとサーバー側のログに
 * 出さずに済む。鍵を知らずにこの ID を得る方法は無いので、守りは変わらない。
 */
export async function vaultId(key: string): Promise<string> {
  const bytes = new TextEncoder().encode(`overload-vault:${normalizeKey(key)}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
