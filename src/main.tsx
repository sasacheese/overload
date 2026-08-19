import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { registerServiceWorker } from './lib/updates.ts';
import { StoreProvider } from './store.tsx';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root が無い');

createRoot(root).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);

// dev では public/sw.js が置換前のままなので登録しない
if (import.meta.env.PROD) registerServiceWorker(import.meta.env.BASE_URL);

/*
 * つまむ操作での拡大を止める。
 *
 * viewport の user-scalable=no は Android では効くが、iOS Safari は
 * アクセシビリティのため無視することがある。Safari 独自の gesture イベントを
 * 潰すのが確実な手当てで、ホーム画面に追加した状態でも効く。
 * 二度叩きの拡大は CSS の touch-action: manipulation 側で止めている。
 */
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
