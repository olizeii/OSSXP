/**
 * SudoXP – Sudoku als „vorinstalliertes Windows-Spiel“ im Stil von Minesweeper:
 * Menüleiste (Spiel / ?), LED-Zähler (freie Felder, Zeit), Smiley-Button für ein neues Spiel.
 *
 * Zwei Modi:
 *  - Klassisch: zufällige Rätsel in drei Stufen, Tipps, Fehlerprüfung, lokale Bestzeiten.
 *  - Täglich:   ein Rätsel für alle (vom Server, ohne Lösung im Browser). Der Server prüft die
 *               Lösung und misst die Zeit → globale Bestenliste, Coins, Streak-Abzeichen.
 *
 * Tastatur: 1–9 setzen · 0/Entf/Rücktaste löschen · Pfeiltasten bewegen · N = Notizen
 *           Strg+Z = Rückgängig · H = Tipp (nur klassisch) · F2 = Neues Spiel
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../../core/api';
import type { AppWindowProps } from '../../core/types';
import { Anonymous, UserName } from '../../components/user/UserBits';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { useWindowStore } from '../../store/windowStore';
import { DIFFICULTIES, colOf, findConflicts, formatTime, generate, rowOf, sameHouse, type Difficulty, type Grid } from './sudoku';
import './sudoxp.css';

type Mode = 'classic' | 'daily';

interface Game {
  mode: Mode;
  difficulty: Difficulty;
  givens: Grid; // vorgegebene Zahlen (nicht änderbar)
  solution: Grid; // im Tagesmodus leer – die Lösung kennt nur der Server
  values: Grid;
  notes: number[];
  mistakes: number;
  hints: number;
  elapsed: number;
  won: boolean;
  // nur Tagesmodus
  date?: string;
  token?: string;
  startedAt?: number;
  result?: { seconds: number; rank: number; total?: number };
}

type Snapshot = Pick<Game, 'values' | 'notes'>;

const SAVE_KEY = 'ossxp-sudoxp-game';
const DAILY_KEY = 'ossxp-sudoxp-daily';
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
    mode: 'classic',
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

interface DailyResponse {
  date: string;
  difficulty: Difficulty;
  puzzle: Grid;
  token: string;
  startedAt: number;
  solved: { seconds: number; rank: number } | null;
}

/** Tagesrätsel vom Server holen – angefangene Eingaben desselben Tages werden fortgesetzt. */
async function loadDaily(): Promise<Game> {
  const d = await api<DailyResponse>('/sudoku/daily');
  const saved = load<Game>(DAILY_KEY);
  const resume = saved?.date === d.date ? saved : null;
  return {
    mode: 'daily',
    difficulty: d.difficulty,
    givens: d.puzzle,
    solution: [],
    values: resume?.values ?? d.puzzle.slice(),
    notes: resume?.notes ?? new Array(81).fill(0),
    mistakes: 0,
    hints: 0,
    elapsed: d.solved?.seconds ?? Math.floor((Date.now() - (resume?.startedAt ?? d.startedAt)) / 1000),
    won: Boolean(d.solved ?? resume?.won),
    date: d.date,
    // Gäste behalten ihren ersten Token (= erste Startzeit), eingeloggte bekommen sie vom Server
    token: resume && !useAuthStore.getState().user ? resume.token : d.token,
    startedAt: resume && !useAuthStore.getState().user ? resume.startedAt : d.startedAt,
    result: d.solved ?? resume?.result,
  };
}

export default function SudoXP({ windowId }: AppWindowProps) {
  // Ältere Spielstände haben noch kein `mode`-Feld → als klassisch behandeln
  const [game, setGame] = useState<Game>(() => {
    const saved = load<Game>(SAVE_KEY);
    return saved ? { ...saved, mode: 'classic' } : newGame('easy');
  });
  const [selected, setSelected] = useState<number>(() => game.givens.findIndex((v) => !v));
  const [notesMode, setNotesMode] = useState(false);
  const [menu, setMenu] = useState<'game' | 'help' | null>(null);
  const [scoreboard, setScoreboard] = useState(false);
  const [busy, setBusy] = useState(false);
  const history = useRef<Snapshot[]>([]);
  const boardRef = useRef<HTMLDivElement>(null);
  const minimized = useWindowStore((s) => s.windows.find((w) => w.id === windowId)?.minimized ?? false);
  const daily = game.mode === 'daily';

  // Spielstand merken (getrennt nach Modus)
  useEffect(() => save(daily ? DAILY_KEY : SAVE_KEY, game), [game, daily]);

  // Uhr: klassisch pausiert sie bei minimiertem Fenster; im Tagesmodus misst der Server (läuft weiter)
  useEffect(() => {
    if (game.won || (!daily && minimized)) return;
    const t = setInterval(
      () => setGame((g) => ({ ...g, elapsed: g.mode === 'daily' && g.startedAt ? Math.floor((Date.now() - g.startedAt) / 1000) : g.elapsed + 1 })),
      1000,
    );
    return () => clearInterval(t);
  }, [game.won, minimized, daily]);

  useEffect(() => boardRef.current?.focus(), []);

  const begin = useCallback((g: Game) => {
    history.current = [];
    setGame(g);
    setSelected(g.givens.findIndex((v) => !v));
    setMenu(null);
    boardRef.current?.focus();
  }, []);

  const startClassic = useCallback((difficulty: Difficulty) => begin(newGame(difficulty)), [begin]);

  const startDaily = useCallback(async () => {
    setMenu(null);
    setBusy(true);
    try {
      begin(await loadDaily());
    } catch (e) {
      useUiStore.getState().showMessage({ title: 'SudoXP', icon: 'error', text: `Das tägliche Sudoku konnte nicht geladen werden.\n${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }, [begin]);

  const restart = () => (daily ? startDaily() : startClassic(game.difficulty));

  // Aktueller Stand für Event-Handler (ohne Seiteneffekte in setState-Updatern)
  const gameRef = useRef(game);
  gameRef.current = game;

  /** Tagesrätsel einreichen – der Server prüft die Lösung und vergibt den Platz. */
  const submitDaily = useCallback(async (g: Game) => {
    setBusy(true);
    try {
      const res = await api<{ seconds: number; rank: number; total: number }>('/sudoku/daily/submit', {
        method: 'POST',
        body: { token: g.token, values: g.values },
      });
      const result = { seconds: res.seconds, rank: res.rank, total: res.total };
      setGame((cur) => ({ ...cur, won: true, elapsed: res.seconds, result }));
      announceDaily(result, () => setScoreboard(true));
    } catch (e) {
      const text = e instanceof ApiError && e.status === 422 ? 'Das Feld ist voll, aber noch nicht richtig gelöst. Prüfe deine Zahlen!' : (e as Error).message;
      useUiStore.getState().showMessage({ title: 'Tägliches Sudoku', icon: 'warning', text });
    } finally {
      setBusy(false);
    }
  }, []);

  /** Wendet eine Änderung an, merkt den alten Stand fürs Rückgängigmachen und prüft auf Sieg. */
  const apply = useCallback(
    (fn: (g: Game) => Partial<Game>) => {
      const g = gameRef.current;
      if (g.won) return;
      const patch = fn(g);
      if (Object.keys(patch).length === 0) return;
      history.current.push({ values: g.values, notes: g.notes });
      const next = { ...g, ...patch };
      if (next.mode === 'classic') {
        next.won = next.values.every((v, i) => v === next.solution[i]);
      } else if (patch.values && next.values.every(Boolean) && findConflicts(next.values).size === 0) {
        submitDaily(next);
      }
      gameRef.current = next;
      setGame(next);
    },
    [submitDaily],
  );

  // Klassisch: gratulieren, sobald das Rätsel in dieser Sitzung gelöst wurde
  const wasWon = useRef(game.won);
  useEffect(() => {
    if (game.won && !wasWon.current && game.mode === 'classic') announceWin(game, () => startClassic(game.difficulty));
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
        // Gesetzte Ziffer aus den Notizen der Nachbarn entfernen
        const notes = g.notes.map((n, i) => (i === selected ? 0 : digit && sameHouse(i, selected) ? n & ~(1 << digit) : n));
        const wrong = g.mode === 'classic' && values[selected] !== 0 && values[selected] !== g.solution[selected];
        return { values, notes, mistakes: g.mistakes + (wrong ? 1 : 0) };
      });
    },
    [apply, notesMode, selected],
  );

  const hint = useCallback(() => {
    apply((g) => {
      if (g.mode === 'daily') return {}; // im Tagesmodus gibt es keine Tipps
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
    if (key === 'F2') return (e.preventDefault(), restart());
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
  const remaining = daily ? game.values.filter((v) => !v).length : game.values.filter((v, i) => v !== game.solution[i]).length;
  const digitCount = useMemo(() => {
    const c = new Array(10).fill(0);
    game.values.forEach((v, i) => v && (daily || v === game.solution[i]) && c[v]++);
    return c;
  }, [game.values, game.solution, daily]);
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
              <MenuItem label="Neu" shortcut="F2" onClick={restart} />
              <hr />
              {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
                <MenuItem key={d} label={DIFFICULTIES[d].label} checked={!daily && game.difficulty === d} onClick={() => startClassic(d)} />
              ))}
              <MenuItem label="Tägliches Sudoku" checked={daily} onClick={startDaily} />
              <hr />
              <MenuItem label="Tipp" shortcut="H" disabled={daily} onClick={() => (setMenu(null), hint())} />
              <MenuItem label="Rückgängig" shortcut="Strg+Z" onClick={() => (setMenu(null), undo())} />
              <MenuItem label="Notizen" shortcut="N" checked={notesMode} onClick={() => (setMenu(null), setNotesMode((v) => !v))} />
              <hr />
              <MenuItem label="Bestenliste (täglich)…" onClick={() => (setMenu(null), setScoreboard(true))} />
              <MenuItem label="Eigene Bestzeiten…" onClick={() => (setMenu(null), showBestTimes())} />
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
        {/* ── Modus ── */}
        <div className="sx-modes" role="tablist">
          <button role="tab" aria-selected={!daily} className={!daily ? 'active' : ''} onClick={() => daily && startClassic(game.difficulty)}>
            Klassisch
          </button>
          <button role="tab" aria-selected={daily} className={daily ? 'active' : ''} onClick={() => !daily && startDaily()} disabled={busy}>
            Täglich
          </button>
          <button className="sx-board-btn" onClick={() => setScoreboard(true)} title="Bestenliste des täglichen Sudokus">
            Bestenliste
          </button>
        </div>

        {/* ── Anzeige: freie Felder · Smiley · Zeit ── */}
        <div className="sx-panel">
          <Led value={remaining} title="Noch offene Felder" />
          <button className="sx-face" onClick={restart} title={daily ? 'Tagesrätsel neu laden (F2)' : 'Neues Spiel (F2)'}>
            <Smiley cool={game.won} />
          </button>
          <Led value={Math.min(game.elapsed, 999)} title={`Zeit: ${formatTime(game.elapsed)}`} />
        </div>

        {/* ── Spielfeld ── */}
        <div ref={boardRef} className={`sx-board ${game.won ? 'won' : ''}`} tabIndex={0} onKeyDown={onKeyDown} role="grid" aria-label="Sudoku-Spielfeld">
          {game.values.map((v, i) => {
            const given = game.givens[i] !== 0;
            const wrong = !given && v !== 0 && (daily ? conflicts.has(i) : v !== game.solution[i]);
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
        {daily ? (
          <>
            <span>Täglich · {game.date ? new Date(`${game.date}T12:00`).toLocaleDateString('de-DE') : ''}</span>
            <span>{game.result ? `Platz ${game.result.rank}${game.result.total ? ` von ${game.result.total}` : ''}` : busy ? 'Wird geprüft…' : 'Zeit misst der Server'}</span>
          </>
        ) : (
          <>
            <span>{DIFFICULTIES[game.difficulty].label}</span>
            <span>Fehler: {game.mistakes}</span>
            <span>Tipps: {game.hints}</span>
          </>
        )}
      </div>

      {scoreboard && <Scoreboard onClose={() => setScoreboard(false)} />}
    </div>
  );
}

// ─── Bestenliste ───────────────────────────────────────────────────────────

interface ScoreEntry {
  rank: number;
  seconds: number;
  user: { username: string; color: string } | null;
}

/** Globale Bestenliste des täglichen Sudokus – als XP-Dialog innerhalb des Spielfensters. */
function Scoreboard({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<{ date: string; total: number; entries: ScoreEntry[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ date: string; total: number; entries: ScoreEntry[] }>('/sudoku/daily/scoreboard').then(setData, (e: Error) => setError(e.message));
  }, []);

  return (
    <div className="sx-overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="xp-window xp-dialog sx-scoreboard" role="dialog" aria-label="Bestenliste">
        <header className="title-bar">
          <span className="title-bar-text">Bestenliste – Tägliches Sudoku</span>
          <div className="title-bar-controls">
            <button className="close" aria-label="Schließen" onClick={onClose}>
              <svg width="11" height="11" viewBox="0 0 11 11">
                <path d="M2 2l7 7M9 2l-7 7" stroke="#fff" strokeWidth="2" />
              </svg>
            </button>
          </div>
        </header>
        <div className="window-body">
          {error ? (
            <p className="sx-sb-info">{error}</p>
          ) : !data ? (
            <p className="sx-sb-info">Wird geladen…</p>
          ) : (
            <>
              <p className="sx-sb-info">
                {new Date(`${data.date}T12:00`).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
                {data.total} {data.total === 1 ? 'Löser' : 'Löser:innen'}
              </p>
              <div className="sx-sb-list">
                <table>
                  <thead>
                    <tr>
                      <th>Platz</th>
                      <th>Name</th>
                      <th>Zeit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.entries.length === 0 && (
                      <tr>
                        <td colSpan={3} className="sx-sb-empty">
                          Heute hat noch niemand gelöst – sei die/der Erste!
                        </td>
                      </tr>
                    )}
                    {data.entries.map((e) => (
                      <tr key={e.rank} className={e.rank <= 3 ? `top${e.rank}` : ''}>
                        <td>{e.rank}.</td>
                        <td>{e.user ? <UserName username={e.user.username} color={e.user.color} /> : <Anonymous />}</td>
                        <td>{formatTime(e.seconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="dialog-buttons" style={{ justifyContent: 'flex-end' }}>
            <button className="xp-button default" onClick={onClose}>
              OK
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Kleine Bausteine ──────────────────────────────────────────────────────

function MenuItem({ label, shortcut, checked, disabled, onClick }: { label: string; shortcut?: string; checked?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button className="sx-menu-item" role="menuitem" onClick={onClick} disabled={disabled}>
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
      (record ? '\n\nNeue Bestzeit!' : '') +
      '\n\nTipp: Probiere das tägliche Sudoku – mit Bestenliste für alle!',
    buttons: [{ label: 'Neues Spiel', primary: true, action: onNewGame }, { label: 'OK' }],
  });
}

function announceDaily(result: { seconds: number; rank: number; total?: number }, openBoard: () => void) {
  const loggedIn = Boolean(useAuthStore.getState().user);
  useUiStore.getState().showMessage({
    title: 'Tägliches Sudoku gelöst!',
    icon: 'info',
    text:
      `Geschafft in ${formatTime(result.seconds)} – Platz ${result.rank}${result.total ? ` von ${result.total}` : ''}.` +
      (loggedIn ? '' : '\n\nDu bist nicht angemeldet und erscheinst als „Anonym“. Mit Konto bekommst du Coins und Abzeichen.'),
    buttons: [{ label: 'Bestenliste', primary: true, action: openBoard }, { label: 'OK' }],
  });
}

function showBestTimes() {
  const best = load<BestTimes>(BEST_KEY) ?? {};
  const lines = (Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => `${DIFFICULTIES[d].label}:\t${best[d] !== undefined ? formatTime(best[d]!) : '—'}`);
  useUiStore.getState().showMessage({
    title: 'Eigene Bestzeiten',
    icon: 'info',
    text: `${lines.join('\n')}\n\n(Klassischer Modus, nur Spiele ohne Tipps.)`,
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
      'Tägliches Sudoku: ein Rätsel pro Tag für alle. Die Zeit läuft ab dem ersten Öffnen, Tipps gibt es keine.\n\n' +
      'Tastatur: 1–9 setzen · Entf löschen · Pfeiltasten bewegen\nN = Notizen · H = Tipp · Strg+Z = Rückgängig · F2 = Neues Spiel',
  });
}

function showAbout() {
  useUiStore.getState().showMessage({
    title: 'Info über SudoXP',
    icon: 'info',
    text: 'SudoXP Version 2.0\nEin Zeitvertreib für OSSXP.\n\nJedes Rätsel wird zufällig erzeugt und hat genau eine Lösung.',
  });
}
