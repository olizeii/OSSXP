/**
 * Sudoku-Generator für das tägliche Rätsel (Gegenstück zu client/src/apps/sudoxp/sudoku.ts).
 * Läuft auf dem Server, damit die Lösung nie an den Browser geht und Zeiten nicht gefälscht werden können.
 * Mit gleichem Seed (= Datum) entsteht für alle dasselbe Rätsel.
 */

const rowOf = (i) => Math.floor(i / 9);
const colOf = (i) => i % 9;
const boxOf = (i) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);
const ALL = 0b1111111110;

export const DIFFICULTY_CLUES = { easy: 38, medium: 31, hard: 25 };

/** Deterministischer Zufallsgenerator (mulberry32) */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function popcount(n) {
  let c = 0;
  while (n) {
    n &= n - 1;
    c++;
  }
  return c;
}

function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function search(grid, onSolution, rnd) {
  const rows = new Array(9).fill(0);
  const cols = new Array(9).fill(0);
  const boxes = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    const v = grid[i];
    if (!v) continue;
    const bit = 1 << v;
    if (rows[rowOf(i)] & bit || cols[colOf(i)] & bit || boxes[boxOf(i)] & bit) return;
    rows[rowOf(i)] |= bit;
    cols[colOf(i)] |= bit;
    boxes[boxOf(i)] |= bit;
  }

  const step = () => {
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
    for (const d of rnd ? shuffle(digits, rnd) : digits) {
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

function countSolutions(puzzle, limit = 2) {
  let count = 0;
  search(puzzle.slice(), () => ++count >= limit);
  return count;
}

/** Rätsel mit eindeutiger Lösung aus einem Seed. */
export function generate(difficulty, seed) {
  const rnd = seededRandom(seed);
  let solution = [];
  search(new Array(81).fill(0), (g) => ((solution = g.slice()), true), rnd);

  const puzzle = solution.slice();
  let clues = 81;
  for (const i of shuffle([...Array(81).keys()], rnd)) {
    if (clues <= DIFFICULTY_CLUES[difficulty]) break;
    const v = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle) !== 1) puzzle[i] = v;
    else clues--;
  }
  return { puzzle, solution };
}

const dailyCache = new Map();

/** Das Tagesrätsel – für alle gleich, Seed = Datum. */
export function dailyPuzzle(date) {
  if (!dailyCache.has(date)) {
    if (dailyCache.size > 10) dailyCache.clear();
    dailyCache.set(date, { difficulty: 'medium', ...generate('medium', Number(date.replaceAll('-', '')) * 7919) });
  }
  return dailyCache.get(date);
}
