import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/xp.css';
import './styles/desktop.css';
import './styles/taskbar.css';
import './styles/startmenu.css';
import './styles/dialogs.css';
import './styles/cosmetics.css';

// Nach einem neuen Build gibt es die alten Chunk-Dateien nicht mehr („Unable to preload CSS …“).
// Dann einfach die Seite neu laden – einmal pro Minute, damit keine Endlosschleife entsteht.
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem('ossxp-reload') ?? 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem('ossxp-reload', String(Date.now()));
  } catch {
    /* ohne sessionStorage trotzdem neu laden */
  }
  event.preventDefault();
  location.reload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
