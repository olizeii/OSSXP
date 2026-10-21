import { lazy } from 'react';
import { defineApp } from '../../core/types';
import icon from '../../assets/icons/redxp.svg';

/** redXP – Forum mit Subreddits (z. B. pro Klasse), Up-/Downvotes und Kommentaren. Lesen ohne Login. */
export default defineApp({
  id: 'redxp',
  title: 'redXP',
  description: 'Forum & Diskussionen',
  icon,
  component: lazy(() => import('./RedXP')),
  window: { width: 860, height: 600, minWidth: 560, minHeight: 380 },
  placement: { desktop: true, startMenu: 'pinned' },
});
