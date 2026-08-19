/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** バックアップの保存先に使うリポジトリ。'owner/repo' 形式。 */
  readonly VITE_BACKUP_REPO?: string;
  /**
   * Firebase の設定。名前のとおり公開情報で、ビルド済み JS に入る前提の値。
   * アクセス制御は apiKey ではなく Firestore Security Rules が担う。
   * 未設定なら同期機能そのものが無効になる（アプリはローカルだけで動く）。
   */
  readonly VITE_FIREBASE_PUBLIC_API_KEY?: string;
  readonly VITE_FIREBASE_PUBLIC_PROJECT_ID?: string;
  readonly VITE_FIREBASE_PUBLIC_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
