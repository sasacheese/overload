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
