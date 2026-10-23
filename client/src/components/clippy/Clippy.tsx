/**
 * Clippy – der interaktive Desktop-Assistent (Hommage an die Office-Büroklammer, eigene Zeichnung).
 * Schwebt über dem Desktop, lässt sich verschieben, gibt passende Tipps und ist abschaltbar
 * (Rechtsklick → „Clippy ausblenden“ oder Startmenü). Hut und Brille kommen aus dem Punkteshop
 * (Profil → Aussehen). Ein-/Aus und Position merkt sich der Browser.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { launchApp } from '../../core/launcher';
import { usePointerDrag } from '../../core/usePointerDrag';
import { useAuthStore } from '../../store/authStore';
import { useEconomyStore } from '../../store/economyStore';
import { useWindowStore } from '../../store/windowStore';
import { ClippySvg } from './ClippyArt';

/** Maßstab der Büroklammer – etwa so groß wie im Original-Office (≈ 100 px hoch). */
const CLIPPY_SIZE = 0.55;
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

/** Vorschau (z. B. im Profil-Editor und im Shop) */
export function ClippyPreview({ hat, glasses, size = 0.55 }: { hat?: string; glasses?: string; size?: number }) {
  return (
    <span className="clippy-preview">
      <ClippySvg hat={hat} glasses={glasses} size={size} />
    </span>
  );
}

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
        text: 'Verknüpfe dein Konto mit Untis – dann bist du „Verifiziert“ und UtisXP zeigt dir deinen Tag, Ausfälle und Tests.',
        action: { label: 'Jetzt verknüpfen', run: () => launchApp('account', { tab: 'untis' }) },
      });
    }
    if (openApps.includes('sudoxp')) tips.push({ text: 'Schon das tägliche Sudoku gelöst? Im Menü „Spiel“ findest du es – mit Bestenliste für alle!' });
    if (openApps.includes('chatterinoxp')) tips.push({ text: 'Fehlt dir ein Emote? Im Emote-Menü (☺) kannst du ganz 7TV durchsuchen und es für alle hinzufügen.' });
    if (openApps.includes('untisxp')) tips.push({ text: 'In UtisXP öffnet Strg+K die Suche nach Lehrkräften, Klassen und Räumen.' });
    if (openApps.includes('mollyxp')) tips.push({ text: 'Tipp für MollyXP: Schwärze deinen Namen auf Tests, bevor du sie hochlädst. Anonym ist Standard.' });

    tips.push(
      { text: 'Mir fehlt ein Hut! Im Punkteshop gibt es Hüte und Brillen für mich.', action: { label: 'Zum Shop', run: () => launchApp('shop') } },
      { text: 'Qualität zählt: Upvotes, hilfreiche Uploads und tägliche Besuche bringen mehr als viele kurze Nachrichten.' },
      { text: 'Ab Level 8 wirst du „Stammgast“ und darfst eigene Subreddits gründen.' },
      { text: 'Dein Profil kannst du wie bei Steam gestalten: Design, Vitrinen, Info-Box und animierte Hintergründe.', action: { label: 'Profil öffnen', run: () => launchApp('profile') } },
      { text: 'Ein Doppelklick auf die Titelleiste maximiert ein Fenster.' },
      { text: 'Ich nerve? Rechtsklick auf mich → „Clippy ausblenden“. Über das Startmenü holst du mich zurück.' },
    );
    return tips;
  }, [user, openApps]);
}

export function Clippy() {
  const { enabled, offset, setEnabled, setOffset } = useClippyStore();
  const profile = useEconomyStore((s) => s.profile);
  const tips = useTips();
  const [index, setIndex] = useState(0);
  const [bubble, setBubble] = useState(true);
  const [menu, setMenu] = useState(false);
  const [hop, setHop] = useState(0);

  // Alle paar Minuten ein neuer Tipp
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
        right: Math.min(Math.max(s.right - dx, 0), window.innerWidth - CLIPPY_SIZE * 100),
        bottom: Math.min(Math.max(s.bottom - dy, 32), window.innerHeight - CLIPPY_SIZE * 190),
      }),
    [setOffset],
  );
  const onPointerDown = usePointerDrag(start, move, 'grabbing');

  if (!enabled) return null;
  const tip = tips[index % tips.length];

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
          {index === 0 && <b>Hallo! Ich bin Clippy.</b>}
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
          <button onClick={() => (setMenu(false), launchApp('shop', { category: 'clippy' }))}>Hüte & Brillen…</button>
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
        <ClippySvg hat={profile?.clippyHat} glasses={profile?.clippyGlasses} size={CLIPPY_SIZE} />
      </div>
    </div>
  );
}
