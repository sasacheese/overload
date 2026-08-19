/**
 * Firestore との読み書き。
 *
 * 認可は「推測できない鍵を知っているか」で行う。鍵から導いた ID をパスに使い、
 * Security Rules は匿名サインイン済みであることだけを求める。`vaults` そのものの
 * 一覧は許可しないので、鍵を知らないと自分の領域に到達できない。
 *
 * Google サインインをやめた理由は、ホーム画面に追加した PWA では別ウィンドウを
 * 開けないことがあり、リダイレクト方式も Safari のストレージ分離で詰まるため。
 * 鍵方式なら対話的なログインが 1 度も要らず、どの環境でも同じように動く。
 * 引き換えに、鍵が漏れればその鍵の領域は読めてしまう（鍵の強さが守りの強さ）。
 *
 * Firebase SDK は動的 import。オフラインで開けることを SDK の読み込みに
 * 依存させたくないので、ローカルの IndexedDB が常に正で、ここはその写しを
 * 送る/取る役だけを持つ（SDK 側の永続キャッシュは使わない = firestore/lite）。
 *
 * apiKey などはアクセス制御に使われない公開値。制御は Security Rules 側。
 */

import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore/lite';
import { normalizeExercise, normalizeSession } from './migrate.ts';
import type { Exercise, ExerciseId, Session } from './types.ts';

/**
 * ビルド時に埋め込まれる設定。
 *
 * モジュールの先頭で読まず、呼ばれたときに読む。`import.meta.env` はバンドラが
 * 差し込む値で、素の Node（単体テスト）には存在しない。先頭で触ると、この
 * モジュールを import しただけで落ちて、純粋な関数まで一緒にテストできなくなる。
 */
function config() {
  const env: Record<string, string | undefined> = import.meta.env ?? {};
  return {
    apiKey: env['VITE_FIREBASE_PUBLIC_API_KEY'] ?? '',
    projectId: env['VITE_FIREBASE_PUBLIC_PROJECT_ID'] ?? '',
    appId: env['VITE_FIREBASE_PUBLIC_APP_ID'] ?? '',
  };
}

/** 設定が無ければ同期機能そのものを出さない。未設定でもアプリは動く。 */
export function remoteConfigured(): boolean {
  const { apiKey, projectId } = config();
  return apiKey !== '' && projectId !== '';
}

/** 記録を置くコレクション。Rules の文面と同じ場所を指す必要がある。 */
const ROOT = 'vaults';

/**
 * Firestore に貼る Security Rules。同期先 ID を固定した形で組み立てる。
 *
 * ID を固定しないと、匿名サインインは誰でも通せるので、公開サイトを開いた人が
 * 自分の領域を作ってこのプロジェクトに書き込める。他人の記録は読めないが、
 * 容量と無料枠は消費される。固定すれば領域そのものを作れなくなる。
 *
 * この文面をここに置いているのは、パスの定義（ROOT）と 1 箇所にまとめるため。
 * 置き場所を変えたら Rules も一緒に変わる。
 */
export function securityRules(vault: string): string {
  return [
    "rules_version = '2';",
    'service cloud.firestore {',
    '  match /databases/{database}/documents {',
    `    match /${ROOT}/{vault}/{document=**} {`,
    `      allow read, write: if request.auth != null && vault == '${vault}';`,
    '    }',
    '  }',
    '}',
  ].join('\n');
}

type Loaded = { app: FirebaseApp; auth: Auth; db: Firestore };

let loaded: Promise<Loaded> | null = null;

function load(): Promise<Loaded> {
  loaded ??= (async () => {
    const [{ initializeApp }, authMod, storeMod] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore/lite'),
    ]);
    const { apiKey, projectId, appId } = config();
    const app = initializeApp({
      apiKey,
      projectId,
      appId,
      authDomain: `${projectId}.firebaseapp.com`,
    });
    return { app, auth: authMod.getAuth(app), db: storeMod.getFirestore(app) };
  })();
  return loaded;
}

/**
 * 匿名でサインインする。対話は一切ない。
 *
 * これ自体は誰でも通せるので守りにはならない。Rules で「サインイン済み」を
 * 求めているのは、鍵を知らない相手が素の HTTP で叩けないようにするためで、
 * 実際の境界は鍵から導いたパスのほう。
 */
async function ready(): Promise<Loaded> {
  const l = await load();
  if (!l.auth.currentUser) {
    const { signInAnonymously } = await import('firebase/auth');
    await signInAnonymously(l.auth);
  }
  return l;
}

export async function fetchAll(vault: string): Promise<{ sessions: Session[]; exercises: Exercise[] }> {
  const { db } = await ready();
  const { collection, getDocs } = await import('firebase/firestore/lite');
  const [sessions, exercises] = await Promise.all([
    getDocs(collection(db, ROOT, vault, 'sessions')),
    getDocs(collection(db, ROOT, vault, 'exercises')),
  ]);
  return {
    sessions: sessions.docs.map((d) => normalizeSession({ ...d.data(), date: d.id })),
    exercises: exercises.docs.map((d) => normalizeExercise({ ...d.data(), id: d.id })),
  };
}

/** writeBatch の上限は 500 操作なので、それを超えないように割る。 */
function chunk<T>(items: readonly T[], size = 400): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function pushSessions(vault: string, sessions: readonly Session[]): Promise<void> {
  if (sessions.length === 0) return;
  const { db } = await ready();
  const { doc, writeBatch } = await import('firebase/firestore/lite');
  for (const group of chunk(sessions)) {
    const batch = writeBatch(db);
    for (const session of group) {
      // date は doc の id で持つので本文からは外す
      const { date, ...body } = session;
      batch.set(doc(db, ROOT, vault, 'sessions', date), body);
    }
    await batch.commit();
  }
}

export async function pushExercises(vault: string, exercises: readonly Exercise[]): Promise<void> {
  if (exercises.length === 0) return;
  const { db } = await ready();
  const { doc, writeBatch } = await import('firebase/firestore/lite');
  for (const group of chunk(exercises)) {
    const batch = writeBatch(db);
    for (const exercise of group) {
      const { id, ...body } = exercise;
      batch.set(doc(db, ROOT, vault, 'exercises', id), body);
    }
    await batch.commit();
  }
}

export async function removeExerciseDoc(vault: string, id: ExerciseId): Promise<void> {
  const { db } = await ready();
  const { deleteDoc, doc } = await import('firebase/firestore/lite');
  await deleteDoc(doc(db, ROOT, vault, 'exercises', id));
}
