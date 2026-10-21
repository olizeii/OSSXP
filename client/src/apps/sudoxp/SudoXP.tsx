/**
 * SudoXP – Sudoku als „vorinstalliertes Windows-Spiel“ im Stil von Minesweeper:
 * Menüleiste (Spiel / ?), LED-Zähler (freie Felder, Zeit), Smiley-Button für ein neues Spiel.
 *
 * Tastatur: 1–9 setzen · 0/Entf/Rücktaste löschen · Pfeiltasten bewegen · N = Notizen
 *           Strg+Z = Rückgängig · H = Tipp · F2 = Neues Spiel
 * Der Spielstand wird im Browser gemerkt; die Zeit pausiert, solange das Fenster minimiert ist.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppWindowProps } from '../../core/types';
import { useUiStore } from '../../store/uiStore';
import { useWindowStore } from '../../store/windowStore';
import {
  DIFFICULTIES,
  colOf,
  findConflicts,
  formatTime,
  generate,
  rowOf,
  sameHouse,
  type Difficulty,
  type Grid,
} from './sudoku';
import './sudoxp.css';

interface Game {
  difficulty: Difficulty;
  givens: Grid; // vorgegebene Zahlen (nicht änderbar)
  solution: Grid;
  values: Grid; // aktueller Stand inkl. Vorgaben
  notes: number[]; // Bitmaske der Notizen pro Zelle
  mistakes: number;
  hints: number;
  elapsed: number; // Sekunden
  won: boolean;
}

type Snapshot = Pick<Game, 'values' | 'notes'>;

const SAVE_KEY = 'ossxp-sudoxp-game';
const BEST_KEY = 'ossxp-sudoxp-best';

// ─── localStorage (kann in privaten Fenstern fehlen → immer try/catch) ──────
function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* egal */
  }
}

function newGame(difficulty: Difficulty): Game {
  const { puzzle, solution } = generate(difficulty);
  return {
    difficulty,
    givens: puzzle,
    solution,
    values: puzzle.slice(),
    notes: new Array(81).fill(0),
    mistakes: 0,
    hints: 0,
    elapsed: 0,
    won: false,
  };
}

export default function SudoXP({ windowId }: AppWindowProps) {
  const [game, setGame] = useState<Game>(() => load<Game>(SAVE_KEY) ?? newGame('easy'));
  const [selected, setSelected] = useState<number>(() => game.givens.findIndex((v) => !v));
  const [notesMode, setNotesMode] = useState(false);
  const [menu, setMenu] = useState<'game' | 'help' | null>(null);
  const history = useRef<Snapshot[]>([]);
  const boardRef = useRef<HTMLDivElement>(null);
  const minimized = useWindowStore((s) => s.windows.find((w) => w.id === windowId)?.minimized ?? false);

  // Spielstand merken
  useEffect(() => save(SAVE_KEY, game), [game]);

  // Uhr: läuft nur, solange nicht gewonnen und das Fenster nicht minimiert ist
  useEffect(() => {
    if (game.won || minimized) return;
    const t = setInterval(() => setGame((g) => ({ ...g, elapsed: g.elapsed + 1 })), 1000);
    return () => clearInterval(t);
  }, [game.won, minimized]);

  useEffect(() => boardRef.current?.focus(), []);

  const start = useCallback((difficulty: Difficulty) => {
    const g = newGame(difficulty);
    history.current = [];
    setGame(g);
    setSelected(g.givens.findIndex((v) => !v));
    setMenu(null);
    boardRef.current?.focus();
  }, []);

  // Aktueller Stand für Event-Handler (ohne Seiteneffekte in setState-Updatern)
  const gameRef = useRef(game);
  gameRef.current = game;

  /** Wendet eine Änderung an, merkt den alten Stand fürs Rückgängigmachen und prüft auf Sieg. */
  const apply = useCallback((fn: (g: Game) => Partial<Game>) => {
    const g = gameRef.current;
    if (g.won) return;
    const patch = fn(g);
    if (Object.keys(patch).length === 0) return;
    history.current.push({ values: g.values, notes: g.notes });
    const next = { ...g, ...patch };
    next.won = next.values.every((v, i) => v === next.solution[i]);
    gameRef.current = next;
    setGame(next);
  }, []);

  // Gratulieren, sobald das Rätsel in dieser Sitzung gelöst wurde
  const wasWon = useRef(game.won);
  useEffect(() => {
    if (game.won && !wasWon.current) announceWin(game, () => start(game.difficulty));
    wasWon.current = game.won;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.won]);

  const setDigit = useCallback(
    (digit: number) => {
      if (selected < 0) return;
      apply((g) => {
        if (g.givens[selected]) return {};
        if (notesMode && digit) {
          if (g.values[selected]) return {};
          const notes = g.notes.slice();
          notes[selected] ^= 1 << digit;
          return { notes };
        }
        const values = g.values.slice();
        values[selected] = values[selected] === digit ? 0 : digit;
        // Gesetzte Ziffer aus den Notizen der Nachbarn entfernen (wie bei modernen Sudoku-Apps)
        const notes = g.notes.map((n, i) => (i === selected ? 0 : digit && sameHouse(i, selected) ? n & ~(1 << digit) : n));
        const wrong = values[selected] !== 0 && values[selected] !== g.solution[selected];
        return { values, notes, mistakes: g.mistakes + (wrong ? 1 : 0) };
      });
    },
    [apply, notesMode, selected],
  );

  const hint = useCallback(() => {
    apply((g) => {
      // Ausgewähltes Feld, wenn leer/falsch – sonst das erste offene Feld
      const target =
        selected >= 0 && !g.givens[selected] && g.values[selected] !== g.solution[selected]
          ? selected
          : g.values.findIndex((v, i) => v !== g.solution[i]);
      if (target < 0) return {};
      const values = g.values.slice();
      values[target] = g.solution[target];
      setSelected(target);
      return { values, hints: g.hints + 1 };
    });
  }, [apply, selected]);

  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (prev) setGame((g) => (g.won ? g : { ...g, ...prev }));
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    const key = e.key;
    if (key === 'F2') return (e.preventDefault(), start(game.difficulty));
    if ((e.ctrlKey || e.metaKey) && key.toLowerCase() === 'z') return (e.preventDefault(), undo());
    if (/^[1-9]$/.test(key)) return setDigit(Number(key));
    if (key === '0' || key === 'Backspace' || key === 'Delete') return setDigit(0);
    if (key.toLowerCase() === 'n') return setNotesMode((v) => !v);
    if (key.toLowerCase() === 'h') return hint();
    const move = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[key];
    if (move !== undefined) {
      e.preventDefault();
      setSelected((s) => {
        const cur = s < 0 ? 0 : s;
        if (key === 'ArrowLeft' && colOf(cur) === 0) return cur + 8;
        if (key === 'ArrowRight' && colOf(cur) === 8) return cur - 8;
        return (cur + move + 81) % 81;
      });
    }
  }

  const conflicts = useMemo(() => findConflicts(game.values), [game.values]);
  const remaining = game.values.filter((v, i) => v !== game.solution[i]).length;
  const digitCount = useMemo(() => {
    const c = new Array(10).fill(0);
    game.values.forEach((v, i) => v && v === game.solution[i] && c[v]++);
    return c;
  }, [game.values, game.solution]);
  const selValue = selected >= 0 ? game.values[selected] : 0;

  return (
    <div className="sx" onPointerDown={(e) => !(e.target as HTMLElement).closest('.sx-menubar') && setMenu(null)}>
      {/* ── Menüleiste ── */}
      <nav className="sx-menubar">
        <div className="sx-menu-wrap">
          <button className={menu === 'game' ? 'open' : ''} onClick={() => setMenu(menu === 'game' ? null : 'game')} onMouseEnter={() => menu && setMenu('game')}>
            <u>S</u>piel
          </button>
          {menu === 'game' && (
            <div className="sx-menu" role="menu">
              <MenuItem label="Neu" shortcut="F2" onClick={() => start(game.difficulty)} />
              <hr />
              {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
                <MenuItem key={d} label={DIFFICULTIES[d].label} checked={game.difficulty === d} onClick={() => start(d)} />
              ))}
              <hr />
              <MenuItem label="Tipp" shortcut="H" onClick={() => (setMenu(null), hint())} />
              <MenuItem label="Rückgängig" shortcut="Strg+Z" onClick={() => (setMenu(null), undo())} />
              <MenuItem label="Notizen" shortcut="N" checked={notesMode} onClick={() => (setMenu(null), setNotesMode((v) => !v))} />
              <hr />
              <MenuItem label="Bestzeiten…" onClick={() => (setMenu(null), showBestTimes())} />
              <hr />
              <MenuItem label="Beenden" onClick={() => useWindowStore.getState().close(windowId)} />
            </div>
          )}
        </div>
        <div className="sx-menu-wrap">
          <button className={menu === 'help' ? 'open' : ''} onClick={() => setMenu(menu === 'help' ? null : 'help')} onMouseEnter={() => menu && setMenu('help')}>
            <u>?</u>
          </button>
          {menu === 'help' && (
            <div className="sx-menu" role="menu">
              <MenuItem label="Spielregeln" onClick={() => (setMenu(null), showRules())} />
              <MenuItem label="Info über SudoXP" onClick={() => (setMenu(null), showAbout())} />
            </div>
          )}
        </div>
      </nav>

      <div className="sx-frame">
        {/* ── Anzeige: freie Felder · Smiley · Zeit ── */}
        <div className="sx-panel">
          <Led value={remaining} title="Noch offene Felder" />
          <button className="sx-face" onClick={() => start(game.difficulty)} title="Neues Spiel (F2)">
            <Smiley cool={game.won} />
          </button>
          <Led value={Math.min(game.elapsed, 999)} title={`Zeit: ${formatTime(game.elapsed)}`} />
        </div>

        {/* ── Spielfeld ── */}
        <div
          ref={boardRef}
          className={`sx-board ${game.won ? 'won' : ''}`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          role="grid"
          aria-label="Sudoku-Spielfeld"
        >
          {game.values.map((v, i) => {
            const given = game.givens[i] !== 0;
            const wrong = !given && v !== 0 && v !== game.solution[i];
            const cls = [
              'sx-cell',
              given ? 'given' : 'user',
              i === selected ? 'selected' : selected >= 0 && sameHouse(i, selected) ? 'peer' : '',
              v && v === selValue && i !== selected ? 'same' : '',
              wrong || (conflicts.has(i) && !given) ? 'wrong' : '',
              colOf(i) % 3 === 2 && colOf(i) < 8 ? 'br' : '',
              rowOf(i) % 3 === 2 && rowOf(i) < 8 ? 'bb' : '',
            ].join(' ');
            return (
              <div key={i} className={cls} role="gridcell" onPointerDown={() => setSelected(i)}>
                {v ? (
                  v
                ) : game.notes[i] ? (
                  <span className="sx-notes">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                      <span key={d}>{game.notes[i] & (1 << d) ? d : ''}</span>
                    ))}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* ── Ziffernblock ── */}
        <div className="sx-pad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
            <button
              key={d}
              className="xp-button"
              disabled={digitCount[d] >= 9 || game.won}
              onClick={() => (setDigit(d), boardRef.current?.focus())}
              title={`${9 - digitCount[d]} übrig`}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="sx-tools">
          <button className={`xp-button ${notesMode ? 'sx-active' : ''}`} onClick={() => (setNotesMode((v) => !v), boardRef.current?.focus())}>
            ✎ Notizen {notesMode ? 'an' : 'aus'}
          </button>
          <button className="xp-button" onClick={() => (setDigit(0), boardRef.current?.focus())}>
            Löschen
          </button>
          <button className="xp-button" onClick={() => (undo(), boardRef.current?.focus())}>
            Rückgängig
          </button>
        </div>
      </div>

      <div className="xp-statusbar">
        <span>{DIFFICULTIES[game.difficulty].label}</span>
        <span>Fehler: {game.mistakes}</span>
        <span>Tipps: {game.hints}</span>
      </div>
    </div>
  );
}

// ─── Kleine Bausteine ──────────────────────────────────────────────────────

function MenuItem({ label, shortcut, checked, onClick }: { label: string; shortcut?: string; checked?: boolean; onClick: () => void }) {
  return (
    <button className="sx-menu-item" role="menuitem" onClick={onClick}>
      <span className="sx-check">{checked ? '✓' : ''}</span>
      <span className="sx-menu-label">{label}</span>
      <span className="sx-shortcut">{shortcut}</span>
    </button>
  );
}

/** Rote 3-stellige LED-Anzeige wie bei Minesweeper. */
function Led({ value, title }: { value: number; title: string }) {
  return (
    <div className="sx-led" title={title}>
      <span className="sx-led-ghost">888</span>
      <span className="sx-led-value">{String(value).padStart(3, '0')}</span>
    </div>
  );
}

function Smiley({ cool }: { cool: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
      <defs>
        <radialGradient id="sx-face" cx=".35" cy=".3" r=".8">
          <stop offset="0" stopColor="#fff7a0" />
          <stop offset=".6" stopColor="#ffd800" />
          <stop offset="1" stopColor="#e0a800" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="10.5" fill="url(#sx-face)" stroke="#000" />
      {cool ? (
        <>
          <path d="M4.5 9h15l-1 3.2c-.3.9-1 1.3-2 1.3h-1.6c-1 0-1.6-.6-1.9-1.5L12.5 10h-1L11 12c-.3.9-.9 1.5-1.9 1.5H7.5c-1 0-1.7-.4-2-1.3Z" />
          <path d="M7.5 16c2.5 2.2 6.5 2.2 9 0" fill="none" stroke="#000" strokeWidth="1.4" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="8.5" cy="9.5" r="1.4" />
          <circle cx="15.5" cy="9.5" r="1.4" />
          <path d="M7.5 15c2.5 2.5 6.5 2.5 9 0" fill="none" stroke="#000" strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

// ─── Meldungen & Bestzeiten ────────────────────────────────────────────────

type BestTimes = Partial<Record<Difficulty, number>>;

function announceWin(game: Game, onNewGame: () => void) {
  const best = load<BestTimes>(BEST_KEY) ?? {};
  const previous = best[game.difficulty];
  // Bestzeiten nur ohne Tipps – sonst wäre es geschummelt
  const record = game.hints === 0 && (previous === undefined || game.elapsed < previous);
  if (record) save(BEST_KEY, { ...best, [game.difficulty]: game.elapsed });

  useUiStore.getState().showMessage({
    title: 'SudoXP',
    icon: 'info',
    text:
      `Glückwunsch! Sie haben das Rätsel (${DIFFICULTIES[game.difficulty].label}) in ${formatTime(game.elapsed)} gelöst.` +
      `\nFehler: ${game.mistakes} · Tipps: ${game.hints}` +
      (record ? '\n\nNeue Bestzeit!' : ''),
    buttons: [{ label: 'Neues Spiel', primary: true, action: onNewGame }, { label: 'OK' }],
  });
}

function showBestTimes() {
  const best = load<BestTimes>(BEST_KEY) ?? {};
  const lines = (Object.keys(DIFFICULTIES) as Difficulty[]).map(
    (d) => `${DIFFICULTIES[d].label}:\t${best[d] !== undefined ? formatTime(best[d]!) : '—'}`,
  );
  useUiStore.getState().showMessage({
    title: 'Bestzeiten',
    icon: 'info',
    text: `${lines.join('\n')}\n\n(Gewertet werden nur Spiele ohne Tipps.)`,
    buttons: [
      { label: 'OK', primary: true },
      { label: 'Zurücksetzen', action: () => save(BEST_KEY, {}) },
    ],
  });
}

function showRules() {
  useUiStore.getState().showMessage({
    title: 'Spielregeln',
    icon: 'question',
    text:
      'Füllen Sie das Feld so aus, dass in jeder Zeile, jeder Spalte und jedem 3×3-Block die Ziffern 1 bis 9 genau einmal vorkommen.\n\n' +
      'Tastatur: 1–9 setzen · Entf löschen · Pfeiltasten bewegen\nN = Notizen · H = Tipp · Strg+Z = Rückgängig · F2 = Neues Spiel',
  });
}

function showAbout() {
  useUiStore.getState().showMessage({
    title: 'Info über SudoXP',
    icon: 'info',
    text: 'SudoXP Version 1.0\nEin Zeitvertreib für OSSXP.\n\nJedes Rätsel wird zufällig erzeugt und hat genau eine Lösung.',
  });
}
