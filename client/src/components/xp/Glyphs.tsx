/**
 * Kleine XP-Grafiken als Inline-SVG (Flaggen-Logo, Abmelden-/Ausschalten-Symbole, Meldungs-Icons).
 * Alles eigene Vektorgrafiken im Stil von Windows XP.
 */
import type { MessageIcon } from '../../store/uiStore';

/** Das vierfarbige, „wehende“ Fenster-Logo. */
export function WinFlag({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="wf-r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff8a5c" /><stop offset="1" stopColor="#e3330c" /></linearGradient>
        <linearGradient id="wf-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#b5e86a" /><stop offset="1" stopColor="#3b9c14" /></linearGradient>
        <linearGradient id="wf-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7fc4ff" /><stop offset="1" stopColor="#1462d8" /></linearGradient>
        <linearGradient id="wf-y" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffe774" /><stop offset="1" stopColor="#f2a600" /></linearGradient>
      </defs>
      <path d="M3 6.5c3.5-2 7-2 11 .2l-1.6 7.8c-3.8-2.1-7.3-2.1-11 0Z" fill="url(#wf-r)" />
      <path d="M15.2 7.3c3.8 2.2 7.3 2.2 11.3 0l-1.6 7.8c-3.9 2.2-7.4 2.2-11.3 0Z" fill="url(#wf-g)" />
      <path d="M1.2 16.3c3.6-2.1 7.1-2.1 11 0l-1.6 7.8c-3.8-2.1-7.3-2.1-11 0Z" fill="url(#wf-b)" />
      <path d="M13.4 17.1c3.9 2.2 7.4 2.2 11.3 0l-1.6 7.8c-3.9 2.2-7.4 2.2-11.3 0Z" fill="url(#wf-y)" />
    </svg>
  );
}

/** Oranges Schlüssel-Symbol (Abmelden). */
export function LogoffIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id="lo-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffc76b" /><stop offset="1" stopColor="#e57b05" /></linearGradient>
      </defs>
      <rect x="1" y="1" width="22" height="22" rx="3" fill="url(#lo-bg)" stroke="#fff" strokeWidth="1.2" />
      <circle cx="9" cy="9" r="4" fill="none" stroke="#fff" strokeWidth="2.2" />
      <path d="M11.6 11.6l7 7M15.5 15.5l2-2M17.5 17.5l1.8-1.8" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** Rotes Ein/Aus-Symbol (Ausschalten / Seite schließen). */
export function PowerIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id="pw-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff8c5c" /><stop offset="1" stopColor="#d5330b" /></linearGradient>
      </defs>
      <rect x="1" y="1" width="22" height="22" rx="3" fill="url(#pw-bg)" stroke="#fff" strokeWidth="1.2" />
      <path d="M8.2 7.4a6.2 6.2 0 1 0 7.6 0" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M12 5v6.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** Icons für Meldungsfenster (Info, Warnung, Fehler, Frage). */
export function MessageGlyph({ type }: { type: MessageIcon }) {
  if (type === 'warning') {
    return (
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
        <defs><linearGradient id="mg-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff38a" /><stop offset="1" stopColor="#f5b800" /></linearGradient></defs>
        <path d="M16 2.5 30.5 28.5h-29Z" fill="url(#mg-w)" stroke="#a87b00" strokeLinejoin="round" />
        <rect x="14.3" y="10" width="3.4" height="10" rx="1.2" />
        <circle cx="16" cy="24" r="1.9" />
      </svg>
    );
  }
  const color = { info: ['#7ab8ff', '#1556c4'], error: ['#ff8a7a', '#c4170b'], question: ['#7ab8ff', '#1556c4'] }[type];
  const glyph = { info: 'i', error: '×', question: '?' }[type];
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
      <defs>
        <radialGradient id={`mg-${type}`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fff" /><stop offset="0.35" stopColor={color[0]} /><stop offset="1" stopColor={color[1]} />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="14" fill={`url(#mg-${type})`} stroke={color[1]} />
      <text x="16" y={type === 'error' ? 23 : 22.5} textAnchor="middle" fontFamily="Georgia, serif" fontWeight="bold" fontSize={type === 'error' ? 24 : 19} fill="#fff">
        {glyph}
      </text>
    </svg>
  );
}
