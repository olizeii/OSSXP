import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/xp.css';
import './styles/desktop.css';
import './styles/taskbar.css';
import './styles/startmenu.css';
import './styles/dialogs.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
