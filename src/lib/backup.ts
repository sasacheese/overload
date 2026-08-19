/**
 * バックアップの書き出しと読み込み。
 *
 * 記録はこの端末の IndexedDB にしか無いので、端末を失うと消える。そこを埋めるのが
 * ここ。書き込み権限のあるトークンをブラウザに置く方式は取らない（公開サイトの
 * localStorage に対して権限が強すぎる）。代わりに、ログイン済みの GitHub の
 * Web エディタへ本文ごと飛ばす。編集できるかどうかはリポジトリの権限そのもので決まる。
 */

import { normalizeExercise, normalizeSession } from './migrate.ts';
import { isMuscleGroup, isoDate, type Exercise, type Session } from './types.ts';

export const BACKUP_VERSION = 1;

export type Backup = {
  app: 'overload';
  version: number;
  exportedAt: string;
  exercises: Exercise[];
  sessions: Session[];
};

export function buildBackup(exercises: readonly Exercise[], sessions: readonly Session[], now: Date): Backup {
  return {
    app: 'overload',
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    exercises: [...exercises].sort((a, b) => a.id.localeCompare(b.id)),
    sessions: [...sessions].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

class BackupError extends Error {}

function fail(path: string, what: string): never {
  throw new BackupError(`${path} が${what}`);
}

function obj(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path, 'オブジェクトではない');
  return v as Record<string, unknown>;
}

function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(path, '配列ではない');
  return v;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string') fail(path, '文字列ではない');
  return v;
}

function num(v: unknown, path: string, min = -Infinity): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, '数値ではない');
  if (v < min) fail(path, `${min} 以上ではない`);
  return v;
}

function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') fail(path, '真偽値ではない');
  return v;
}

/**
 * 種目 1 件。必須の項目だけ検査し、残りは normalize に任せる。
 *
 * 検査と既定値埋めを二重に書くと必ず食い違うので、「無いと復元の意味が変わる項目」
 * だけここで拒否し、後から足した項目の穴埋めは normalize 側 1 箇所に寄せる。
 */
function parseExercise(v: unknown, path: string): Exercise {
  const o = obj(v, path);
  str(o['id'], `${path}.id`);
  str(o['name'], `${path}.name`);
  if (!isMuscleGroup(o['group'])) fail(`${path}.group`, '既知の部位ではない');
  num(o['increment'], `${path}.increment`, 0.1);
  num(o['repMin'], `${path}.repMin`, 1);
  num(o['repMax'], `${path}.repMax`, 1);
  return normalizeExercise(o);
}

function parseSession(v: unknown, path: string): Session {
  const o = obj(v, path);
  try {
    isoDate(str(o['date'], `${path}.date`));
  } catch {
    return fail(`${path}.date`, 'YYYY-MM-DD の形ではない');
  }
  const entries = arr(o['entries'], `${path}.entries`);
  entries.forEach((entry, i) => {
    const e = obj(entry, `${path}.entries[${i}]`);
    str(e['exerciseId'], `${path}.entries[${i}].exerciseId`);
    arr(e['sets'], `${path}.entries[${i}].sets`).forEach((set, j) => {
      const at = `${path}.entries[${i}].sets[${j}]`;
      const sv = obj(set, at);
      num(sv['weight'], `${at}.weight`, 0);
      num(sv['reps'], `${at}.reps`, 0);
      bool(sv['done'], `${at}.done`);
    });
  });
  return normalizeSession(o);
}

/**
 * 読み込み。壊れた JSON を黙って部分的に取り込むと、どこまで戻ったのか分からなく
 * なるので、1 箇所でも合わなければ全体を拒否してどこが合わないかを返す。
 */
export function parseBackup(raw: string): Backup {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail('ファイル', 'JSON として読めない');
  }
  const o = obj(json, 'ルート');
  if (o['app'] !== 'overload') fail('app', '"overload" ではない（このアプリのバックアップではない）');
  const version = num(o['version'], 'version', 1);
  if (version > BACKUP_VERSION) {
    fail('version', `新しすぎる（このアプリが読めるのは ${BACKUP_VERSION} まで）`);
  }
  return {
    app: 'overload',
    version,
    exportedAt: str(o['exportedAt'], 'exportedAt'),
    exercises: arr(o['exercises'], 'exercises').map((e, i) => parseExercise(e, `exercises[${i}]`)),
    sessions: arr(o['sessions'], 'sessions').map((s, i) => parseSession(s, `sessions[${i}]`)),
  };
}

export function backupFileName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `overload-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}.json`;
}

/**
 * GitHub の「新しいファイル」エディタを本文入りで開く URL。
 * URL に本文を載せるので、長すぎると GitHub 側で切られる。呼ぶ側で長さを見て、
 * 超えるならクリップボード経由に切り替える。
 */
export function githubNewFileUrl(repo: string, path: string, content: string, branch = 'main'): string {
  const params = new URLSearchParams({ filename: path, value: content });
  return `https://github.com/${repo}/new/${branch}?${params.toString()}`;
}

/** URL 経由で貼れる実用上の上限。これを超えたらクリップボードに回す。 */
export const URL_CONTENT_LIMIT = 6000;

export function isRepoSlug(repo: string): boolean {
  return /^[\w.-]+\/[\w.-]+$/.test(repo);
}
