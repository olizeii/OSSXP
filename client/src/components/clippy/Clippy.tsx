/**
 * Clippy – der interaktive Desktop-Assistent (Hommage an die Office-Büroklammer, eigene Zeichnung).
 * Schwebt über dem Desktop, lässt sich verschieben, gibt passende Tipps und ist abschaltbar
 * (Rechtsklick → „Clippy ausblenden“ oder Startmenü). Ein-/Aus und Position merkt sich der Browser.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { launchApp } from '../../core/launcher';
import { usePointerDrag } from '../../core/usePointerDrag';
import { useAuthStore } from '../../store/authStore';
import { useWindowStore } from '../../store/windowStore';
import './clippy.css';

interface ClippyStore {
  enabled: boolean;
  /** Abstand von rechts/unten in px – bleibt bei Fenstergrößenänderung sinnvoll */
  offset: { right: number; bottom: number };
  setEnabled: (v: boolean) => void;
  setOffset: (o: { right: number; bottom: number }) => void;
}

export const useClippyStore = create<ClippyStore>()(
  persist(
    (set) => ({
      enabled: true,
      offset: { right: 24, bottom: 48 },
      setEnabled: (enabled) => set({ enabled }),
      setOffset: (offset) => set({ offset }),
    }),
    { name: 'ossxp-clippy' },
  ),
);

interface Tip {
  text: string;
  action?: { label: string; run: () => void };
}

/** Tipps abhängig davon, was der User gerade tut. */
function useTips(): Tip[] {
  const user = useAuthStore((s) => s.user);
  const openApps = useWindowStore((s) => s.windows.map((w) => w.appId).join(','));

  return useMemo(() => {
    const tips: Tip[] = [];
    if (!user) {
      tips.push({
        text: 'Es sieht so aus, als wärst du noch nicht angemeldet. Mit einem Konto sammelst du Coins, Level und Abzeichen!',
        action: { label: 'Anmelden', run: () => launchApp('account') },
      });
    } else if (!user.untisLinked) {
      tips.push({
        text: 'Verknüpfe dein Konto mit Untis – dann zeigt dir UtisXP deinen Tag, Ausfälle und anstehende Tests.',
        action: { label: 'Jetzt verknüpfen', run: () => launchApp('account', { tab: 'untis' }) },
      });
    }
    if (openApps.includes('sudoxp')) tips.push({ text: 'Schon das tägliche Sudoku gelöst? Im Menü „Spiel“ findest du es – mit Bestenliste für alle!' });
    if (openApps.includes('chatterinoxp')) tips.push({ text: 'Klicke im Chat auf einen Namen, um das Profil dieser Person zu öffnen.' });
    if (openApps.includes('untisxp')) tips.push({ text: 'In UtisXP öffnet Strg+K die Suche nach Lehrkräften, Klassen und Räumen.' });
    if (openApps.includes('mollyxp')) tips.push({ text: 'Tipp für MollyXP: Schwärze deinen Namen auf Tests, bevor du sie hochlädst. Anonym ist Standard.' });

    tips.push(
      { text: 'Mit Coins kannst du im Punkteshop neue Profil-Hintergründe und Rahmen kaufen.', action: { label: 'Zum Shop', run: () => launchApp('shop') } },
      { text: 'Gute Beiträge in redXP bringen Upvotes – und jeder Upvote bringt dir Coins.', action: { label: 'redXP öffnen', run: () => launchApp('redxp') } },
      { text: 'Ein Doppelklick auf die Titelleiste maximiert ein Fenster.' },
      { text: 'Desktop-Symbole kannst du einfach verschieben. Rechtsklick auf den Desktop ordnet sie wieder an.' },
      { text: 'Neuigkeiten der Schule findest du in NewsXP.', action: { label: 'NewsXP öffnen', run: () => launchApp('newsxp') } },
      { text: 'Ich nerve? Rechtsklick auf mich → „Clippy ausblenden“. Über das Startmenü holst du mich zurück.' },
    );
    return tips;
  }, [user, openApps]);
}

export function Clippy() {
  const { enabled, offset, setEnabled, setOffset } = useClippyStore();
  const tips = useTips();
  const [index, setIndex] = useState(0);
  const [bubble, setBubble] = useState(true);
  const [menu, setMenu] = useState(false);
  const [hop, setHop] = useState(0);

  // Begrüßung kurz nach dem Start, danach alle paar Minuten ein neuer Tipp
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => {
      setIndex((i) => i + 1);
      setBubble(true);
    }, 4 * 60_000);
    return () => clearInterval(t);
  }, [enabled]);

  const start = useCallback(() => ({ ...offset }), [offset]);
  const move = useCallback(
    ({ dx, dy }: { dx: number; dy: number }, s: { right: number; bottom: number }) =>
      setOffset({
        right: Math.min(Math.max(s.right - dx, 0), window.innerWidth - 90),
        bottom: Math.min(Math.max(s.bottom - dy, 32), window.innerHeight - 110),
      }),
    [setOffset],
  );
  const onPointerDown = usePointerDrag(start, move, 'grabbing');

  if (!enabled) return null;
  const tip = tips[index % tips.length];
  const greeting = index === 0;

  function nextTip() {
    setIndex((i) => i + 1);
    setBubble(true);
    setHop((h) => h + 1);
  }

  return (
    <div className="clippy" style={{ right: offset.right, bottom: offset.bottom }} onContextMenu={(e) => (e.preventDefault(), setMenu(true))}>
      {bubble && (
        <div className="clippy-bubble" role="status">
          <button className="clippy-close" title="Schließen" onClick={() => setBubble(false)}>
            ×
          </button>
          {greeting && <b>Hallo! Ich bin Clippy.</b>}
          <p>{tip.text}</p>
          <div className="clippy-actions">
            {tip.action && (
              <button className="xp-button" onClick={tip.action.run}>
                {tip.action.label}
              </button>
            )}
            <button className="xp-button" onClick={nextTip}>
              Nächster Tipp
            </button>
          </div>
        </div>
      )}

      {menu && (
        <div className="clippy-menu" onMouseLeave={() => setMenu(false)}>
          <button onClick={() => (setMenu(false), nextTip())}>Nächster Tipp</button>
          <button onClick={() => (setMenu(false), setBubble((b) => !b))}>{bubble ? 'Sprechblase ausblenden' : 'Sprechblase zeigen'}</button>
          <hr />
          <button onClick={() => (setMenu(false), setEnabled(false))}>Clippy ausblenden</button>
        </div>
      )}

      <div
        key={hop}
        className="clippy-body"
        title="Klicken für einen Tipp – ziehen zum Verschieben – Rechtsklick für Optionen"
        onPointerDown={onPointerDown}
        onDoubleClick={nextTip}
        onClick={() => !bubble && setBubble(true)}
      >
        <ClippySvg />
      </div>
    </div>
  );
}

/** Die Büroklammer mit Augen – eigene Vektorzeichnung. */
function ClippySvg() {
  return (
    <svg width="64" height="96" viewBox="0 0 64 96" aria-label="Clippy">
      <defs>
        <linearGradient id="clp-wire" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#6f7782" />
          <stop offset=".45" stopColor="#f4f6fa" />
          <stop offset="1" stopColor="#7d8591" />
        </linearGradient>
      </defs>
      <ellipse cx="32" cy="92" rx="18" ry="3" fill="#000" opacity=".18" />
      {/* Draht der Büroklammer */}
      <path
        d="M22 86V26a10 10 0 0 1 20 0v52a6.5 6.5 0 0 1-13 0V34"
        fill="none"
        stroke="#3d434c"
        strokeWidth="7.5"
        strokeLinecap="round"
      />
      <path d="M22 86V26a10 10 0 0 1 20 0v52a6.5 6.5 0 0 1-13 0V34" fill="none" stroke="url(#clp-wire)" strokeWidth="5" strokeLinecap="round" />
      {/* Augen mit Brauen */}
      <g className="clippy-eyes">
        <ellipse cx="22" cy="36" rx="8" ry="9" fill="#fff" stroke="#333" />
        <ellipse cx="42" cy="36" rx="8" ry="9" fill="#fff" stroke="#333" />
        <circle className="clippy-pupil" cx="24" cy="38" r="3.4" fill="#111" />
        <circle className="clippy-pupil" cx="44" cy="38" r="3.4" fill="#111" />
        <circle cx="25.2" cy="36.6" r="1" fill="#fff" />
        <circle cx="45.2" cy="36.6" r="1" fill="#fff" />
        <rect className="clippy-lid" x="13" y="26" width="38" height="0" fill="#e9eaec" />
      </g>
      <path d="M14 24q8-6 15 0M35 24q8-6 15 0" fill="none" stroke="#333" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
