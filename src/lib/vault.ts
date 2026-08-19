/**
 * 入口の鍵。同期先の住所であり、他の端末から同じ記録を開くための合わせ札。
 *
 * ## 鍵を作らずに使える
 *
 * 鍵が要るのは同期先を決めるためなので、**同期しないなら鍵は要らない**。
 * 鍵なしで始めた場合、記録はこの端末の IndexedDB だけに残る。あとから鍵を
 * 作れば、それまでの記録ごと同期が始まる（最初の同期がすべてを送る）。
 *
 * 「決めていない」と「鍵なしで使うと決めた」は区別する必要がある。同じに
 * 扱うと、鍵を作らないと決めた人に毎回入口を出すことになる。
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
/** 鍵を作らずにこの端末だけで使う、と決めた印。 */
const LOCAL_ONLY_KEY = 'overload:local-only';

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

/** 鍵を持つと決めた。鍵なしの印は落とす——両方立っていると入り方が決まらない。 */
export function storeKey(key: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, normalizeKey(key));
    localStorage.removeItem(LOCAL_ONLY_KEY);
  } catch {
    // 保存できなくてもこのタブでは開ける
  }
}

/** 鍵を作らずにこの端末だけで使うと決めた。 */
export function storeLocalOnly(): void {
  try {
    localStorage.setItem(LOCAL_ONLY_KEY, '1');
  } catch {
    // 保存できなくてもこのタブでは開ける
  }
}

/**
 * 入り方の印を落として入口に戻す。鍵と鍵なしの印の両方を消す。
 *
 * 片方だけ残すと、鍵を消したのに入口が出ない（鍵なしの印で素通りする）。
 * 記録そのものは IndexedDB に残るので、これで消えるのは入り方だけ。
 */
export function clearEntry(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LOCAL_ONLY_KEY);
  } catch {
    // 消せなければ何もしない
  }
}

/** この端末の入り方。null は「まだ決めていない」。 */
export type Entry = { kind: 'key'; key: string } | { kind: 'local' };

/**
 * 2 つの印から入り方を決める。localStorage から切り離してあるのはここを試験するため。
 *
 * **鍵が勝つ。** 両方立つことは無いようにしてあるが（`storeKey` が印を落とす）、
 * もし立っていたら同期できる方を採る。鍵なしを採ると、同期していた記録に
 * 手が届かないまま使い続けることになる。
 */
export function entryFrom(key: string | null, localOnly: boolean): Entry | null {
  if (key !== null && key !== '') return { kind: 'key', key };
  return localOnly ? { kind: 'local' } : null;
}

export function storedEntry(): Entry | null {
  let localOnly = false;
  try {
    localOnly = localStorage.getItem(LOCAL_ONLY_KEY) === '1';
  } catch {
    // 読めなければ「決めていない」として扱う
  }
  return entryFrom(storedKey(), localOnly);
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
