import { lazy } from 'react';
import { defineApp } from '../../core/types';
import icon from '../../assets/icons/chatterinoxp.svg';

/**
 * chatterinoXP – Echtzeit-Chat der Plattform im Chatterino-Look, mit 7TV- & BTTV-Emotes.
 * Keine `requires`: Gäste dürfen öffnen und mitlesen (Zuschauer-Modus), Schreiben erst nach Login.
 */
export default defineApp({
  id: 'chatterinoxp',
  title: 'chatterinoXP',
  description: 'Chat mit 7TV & BTTV',
  icon,
  component: lazy(() => import('./ChatterinoXP')),
  window: { width: 440, height: 600, minWidth: 320, minHeight: 300 },
  placement: { desktop: true, startMenu: 'pinned' },
});
