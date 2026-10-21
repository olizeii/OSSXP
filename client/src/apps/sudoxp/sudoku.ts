/**
 * Sudoku-Logik für SudoXP: Generator mit eindeutiger Lösung, Lösungszähler, Hilfsfunktionen.
 * Ein Gitter ist ein Array mit 81 Zahlen (0 = leer), Zeile für Zeile.
 * Kandidaten werden als Bitmasken gespeichert (Bit 1–9 = Ziffer möglich).
 */

export type Grid = number[];
export type Difficulty = 'easy' | 'medium' | 'hard';

export const DIFFICULTIES: Record<Difficulty, { label: string; clues: number }> = {
  easy: { label: 'Leicht', clues: 38 },
  medium: { label: 'Mittel', clues: 31 },
  hard: { label: 'Schwer', clues: 25 },
};

export const rowOf = (i: number) => Math.floor(i / 9);
export const colOf = (i: number) => i % 9;
export const boxOf = (i: number) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

const ALL = 0b1111111110; // Bits 1–9

function popcount(n: number) {
  let c = 0;
  while (n) {
    n &= n - 1;
    c++;
  }
  return c;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Backtracking-Suche mit „wenigste Kandidaten zuerst“.
 * onSolution wird bei jeder gefundenen Lösung aufgerufen; gibt sie true zurück, wird abgebrochen.
 */
function search(grid: Grid, onSolution: (g: Grid) => boolean, randomize = false) {
  const rows = new Array(9).fill(0);
  const cols = new Array(9).fill(0);
  const boxes = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    const v = grid[i];
    if (!v) continue;
    const bit = 1 << v;
    if (rows[rowOf(i)] & bit || cols[colOf(i)] & bit || boxes[boxOf(i)] & bit) return; // widersprüchlich
    rows[rowOf(i)] |= bit;
    cols[colOf(i)] |= bit;
    boxes[boxOf(i)] |= bit;
  }

  const step = (): boolean => {
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (grid[i]) continue;
      const mask = ALL & ~(rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)]);
      const count = popcount(mask);
      if (count === 0) return false;
      if (count < bestCount) {
        best = i;
        bestMask = mask;
        bestCount = count;
        if (count === 1) break;
      }
    }
    if (best === -1) return onSolution(grid);

    const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => bestMask & (1 << d));
    for (const d of randomize ? shuffle(digits) : digits) {
      const bit = 1 << d;
      const r = rowOf(best), c = colOf(best), b = boxOf(best);
      grid[best] = d;
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[b] |= bit;
      if (step()) return true;
      grid[best] = 0;
      rows[r] &= ~bit;
      cols[c] &= ~bit;
      boxes[b] &= ~bit;
    }
    return false;
  };

  step();
}

/** Zählt Lösungen (bricht bei `limit` ab – für die Eindeutigkeitsprüfung reicht 2). */
export function countSolutions(puzzle: Grid, limit = 2): number {
  let count = 0;
  search(puzzle.slice(), () => ++count >= limit);
  return count;
}

/** Erzeugt ein Rätsel mit genau einer Lösung. */
export function generate(difficulty: Difficulty): { puzzle: Grid; solution: Grid } {
  // 1. Zufälliges, vollständig gelöstes Gitter
  let solution: Grid = [];
  search(new Array(81).fill(0), (g) => {
    solution = g.slice();
    return true;
  }, true);

  // 2. Zahlen entfernen, solange die Lösung eindeutig bleibt
  const puzzle = solution.slice();
  let clues = 81;
  const target = DIFFICULTIES[difficulty].clues;
  for (const i of shuffle([...Array(81).keys()])) {
    if (clues <= target) break;
    const v = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle) !== 1) puzzle[i] = v;
    else clues--;
  }
  return { puzzle, solution };
}

/** Indizes aller Zellen, die mit einer anderen Zelle in Zeile/Spalte/Block kollidieren. */
export function findConflicts(values: Grid): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < 81; i++) {
    if (!values[i]) continue;
    for (let j = i + 1; j < 81; j++) {
      if (values[i] !== values[j]) continue;
      if (rowOf(i) === rowOf(j) || colOf(i) === colOf(j) || boxOf(i) === boxOf(j)) {
        out.add(i);
        out.add(j);
      }
    }
  }
  return out;
}

/** Sind zwei Zellen „Nachbarn“ (gleiche Zeile, Spalte oder Block)? */
export const sameHouse = (a: number, b: number) =>
  rowOf(a) === rowOf(b) || colOf(a) === colOf(b) || boxOf(a) === boxOf(b);

export const formatTime = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
