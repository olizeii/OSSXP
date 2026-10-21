import { lazy } from 'react';
import { defineApp } from '../../core/types';
import icon from '../../assets/icons/sudoxp.svg';

/** SudoXP – Sudoku als „vorinstalliertes“ OSSXP-Spiel. Für alle spielbar, auch ohne Login. */
export default defineApp({
  id: 'sudoxp',
  title: 'SudoXP',
  description: 'Sudoku-Spiel',
  icon,
  component: lazy(() => import('./SudoXP')),
  // Feste Größe wie bei den XP-Spielen
  window: { width: 372, height: 534, resizable: false },
  placement: { desktop: true, startMenu: 'left' },
});
