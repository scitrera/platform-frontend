import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';

/**
 * Wait for Office.onReady before mounting React. This ensures the Office.js
 * runtime is fully initialised and Office.context is available.
 *
 * Fallback: if Office.onReady never fires within 2 s (e.g. opened in a plain
 * browser during development), mount anyway with a notice banner.
 */
function mount(officeReady: boolean) {
  const el = document.getElementById('root');
  if (!el) throw new Error('Root element #root not found');
  createRoot(el).render(
    <React.StrictMode>
      <App officeReady={officeReady} />
    </React.StrictMode>,
  );
}

let mounted = false;

// Attempt Office.onReady first.
if (typeof Office !== 'undefined' && typeof Office.onReady === 'function') {
  Office.onReady(() => {
    if (!mounted) {
      mounted = true;
      mount(true);
    }
  });
}

// Fallback timeout — ensures the add-in renders even without Office context.
setTimeout(() => {
  if (!mounted) {
    mounted = true;
    mount(false);
  }
}, 2000);
