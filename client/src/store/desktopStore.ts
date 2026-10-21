/**
 * Positionen der Desktop-Icons (Rasterzellen), pro Browser im localStorage gemerkt.
 * Icons ohne gespeicherte Position werden automatisch in die nächste freie Zelle gesetzt
 * (spaltenweise von oben links – wie unter XP).
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Cell {
  col: number;
  row: number;
}

/** Rastergröße eines Desktop-Icons in px (wie „Am Raster ausrichten“). */
export const CELL_W = 88;
export const CELL_H = 86;
export const DESKTOP_PADDING = 6;

interface DesktopStore {
  positions: Record<string, Cell>;
  setPosition: (appId: string, cell: Cell) => void;
  /** „Symbole automatisch anordnen“ */
  resetPositions: () => void;
}

export const useDesktopStore = create<DesktopStore>()(
  persist(
    (set) => ({
      positions: {},
      setPosition: (appId, cell) => set((s) => ({ positions: { ...s.positions, [appId]: cell } })),
      resetPositions: () => set({ positions: {} }),
    }),
    { name: 'ossxp-desktop' },
  ),
);

const key = (c: Cell) => `${c.col}:${c.row}`;

/**
 * Berechnet die Zelle jedes Icons: gespeicherte Positionen (auf das sichtbare Raster begrenzt),
 * alle übrigen Icons in die nächsten freien Zellen.
 */
export function layoutIcons(ids: string[], saved: Record<string, Cell>, cols: number, rows: number) {
  const result: Record<string, Cell> = {};
  const used = new Set<string>();

  for (const id of ids) {
    const s = saved[id];
    if (!s) continue;
    const cell = { col: Math.min(s.col, cols - 1), row: Math.min(s.row, rows - 1) };
    const free = used.has(key(cell)) ? nearestFree(cell, used, cols, rows) : cell;
    result[id] = free;
    used.add(key(free));
  }

  for (const id of ids) {
    if (result[id]) continue;
    const free = nearestFree({ col: 0, row: 0 }, used, cols, rows, true);
    result[id] = free;
    used.add(key(free));
  }
  return result;
}

/**
 * Nächste freie Zelle zu `target`.
 * columnMajor = true: einfach von oben links spaltenweise suchen (für die automatische Anordnung).
 */
export function nearestFree(target: Cell, used: Set<string>, cols: number, rows: number, columnMajor = false): Cell {
  if (columnMajor) {
    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) if (!used.has(key({ col, row }))) return { col, row };
    }
    return { col: cols - 1, row: rows - 1 };
  }
  let best = target;
  let bestDist = Infinity;
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      if (used.has(key({ col, row }))) continue;
      const d = (col - target.col) ** 2 + (row - target.row) ** 2;
      if (d < bestDist) {
        best = { col, row };
        bestDist = d;
      }
    }
  }
  return best;
}
