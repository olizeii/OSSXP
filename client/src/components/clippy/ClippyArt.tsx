/**
 * Clippy als Vektorgrafik im klassischen 3D-Look (eigene Zeichnung, Hommage an die Office-Büroklammer):
 * Draht als schattiertes Metallrohr, große glänzende Augen, dicke Brauen – plus Hüte und Brillen aus dem Shop.
 */

/** Mittellinie des Drahts: innere Schlaufe → obere Schlaufe → äußere Schlaufe (wie eine echte Büroklammer). */
const WIRE = 'M52 118 V165 A15 15 0 0 0 82 165 V62 A27 27 0 0 0 28 62 V190 A34 34 0 0 0 96 190 V122';

export function ClippySvg({ hat = 'clippy-hat-none', glasses = 'clippy-glasses-none', size = 1 }: { hat?: string; glasses?: string; size?: number }) {
  return (
    <svg width={96 * size} height={184 * size} viewBox="0 0 120 230" aria-label="Clippy" className="clippy-svg">
      <defs>
        <radialGradient id="clp-eye" cx=".4" cy=".35" r=".7">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".7" stopColor="#f2f2f6" />
          <stop offset="1" stopColor="#c9cad6" />
        </radialGradient>
        <filter id="clp-shadow" x="-30%" y="-10%" width="160%" height="130%">
          <feDropShadow dx="2" dy="3" stdDeviation="2" floodColor="#000" floodOpacity=".3" />
        </filter>
      </defs>

      <g filter="url(#clp-shadow)">
        {/* Draht als Rohr: dunkle Kontur, Grundfarbe, Schatten- und Glanzlinie */}
        <path d={WIRE} fill="none" stroke="#4f5185" strokeWidth="9.5" strokeLinecap="round" />
        <path d={WIRE} fill="none" stroke="#a6a8db" strokeWidth="7" strokeLinecap="round" />
        <path d={WIRE} fill="none" stroke="#7f81bb" strokeWidth="2.6" strokeLinecap="round" transform="translate(1.8 .6)" opacity=".85" />
        <path d={WIRE} fill="none" stroke="#f4f4ff" strokeWidth="2" strokeLinecap="round" transform="translate(-1.7 -.6)" opacity=".9" />
      </g>

      {/* Augen */}
      <g className="clippy-eyes">
        <ellipse cx="38" cy="86" rx="14" ry="15.5" fill="url(#clp-eye)" stroke="#8a8b98" strokeWidth=".9" />
        <ellipse cx="77" cy="90" rx="14" ry="15.5" fill="url(#clp-eye)" stroke="#8a8b98" strokeWidth=".9" />
        <g className="clippy-pupils">
          <ellipse cx="41" cy="90" rx="6.2" ry="7.2" fill="#111" />
          <ellipse cx="80" cy="94" rx="6.2" ry="7.2" fill="#111" />
          <ellipse cx="38.8" cy="86.8" rx="2.2" ry="1.7" fill="#fff" opacity=".9" />
          <ellipse cx="77.8" cy="90.8" rx="2.2" ry="1.7" fill="#fff" opacity=".9" />
        </g>
        <ellipse className="clippy-lid" cx="38" cy="86" rx="14.4" ry="15.9" fill="#b9bad8" />
        <ellipse className="clippy-lid" cx="77" cy="90" rx="14.4" ry="15.9" fill="#b9bad8" />
      </g>

      {/* Brauen */}
      <g className="clippy-brows" fill="none" stroke="#111" strokeWidth="4.6" strokeLinecap="round">
        <path d="M25 66 Q36 56 50 63" />
        <path d="M65 69 Q78 60 91 70" />
      </g>

      <ClippyGlasses id={glasses} />
      <ClippyHat id={hat} />
    </svg>
  );
}

/** Hüte sitzen auf der oberen Schlaufe (Mitte x≈55, Oberkante y≈32). */
export function ClippyHat({ id }: { id: string }) {
  switch (id) {
    case 'clippy-hat-top':
      return (
        <g>
          <rect x="37" y="4" width="36" height="30" rx="2" fill="#1b1b1f" />
          <rect x="37" y="25" width="36" height="5" fill="#b3122b" />
          <rect x="40" y="6" width="5" height="18" fill="#fff" opacity=".18" />
          <ellipse cx="55" cy="35" rx="30" ry="5.5" fill="#111" />
          <ellipse cx="55" cy="33.5" rx="27" ry="2.5" fill="#333" />
        </g>
      );
    case 'clippy-hat-party':
      return (
        <g>
          <path d="M38 37 L57 2 L74 37 Z" fill="#ff5fa2" stroke="#b02a6b" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M44 26 L68 24 M48 16 L65 15" stroke="#ffe14d" strokeWidth="4" />
          <circle cx="57" cy="3" r="5" fill="#ffe14d" stroke="#c49a00" />
          <ellipse cx="56" cy="37" rx="19" ry="3" fill="#b02a6b" opacity=".5" />
        </g>
      );
    case 'clippy-hat-crown':
      return (
        <g>
          <path d="M32 36 L30 10 L43 22 L55 4 L67 22 L80 10 L78 36 Z" fill="#f5c518" stroke="#9a7400" strokeWidth="1.6" strokeLinejoin="round" />
          <rect x="32" y="30" width="46" height="7" rx="2" fill="#e0a800" stroke="#9a7400" strokeWidth="1.2" />
          <circle cx="55" cy="33.5" r="2.6" fill="#e0245e" />
          <circle cx="42" cy="33.5" r="2" fill="#2f7ff0" />
          <circle cx="68" cy="33.5" r="2" fill="#2fbf3a" />
          <path d="M36 14 L40 30" stroke="#fff" strokeWidth="2" opacity=".5" />
        </g>
      );
    case 'clippy-hat-santa':
      return (
        <g>
          <path d="M33 34 Q40 4 66 6 Q84 8 90 30 L84 30 Q80 16 70 16 Q62 18 74 34 Z" fill="#d42a2a" stroke="#8c1414" strokeWidth="1.4" />
          <circle cx="88" cy="32" r="6" fill="#fff" stroke="#ccc" />
          <rect x="29" y="30" width="50" height="9" rx="4.5" fill="#fff" stroke="#ccc" />
        </g>
      );
    case 'clippy-hat-grad':
      return (
        <g>
          <path d="M40 24 Q55 40 70 24 V34 Q55 42 40 34 Z" fill="#1d1d24" />
          <path d="M55 6 L92 18 L55 30 L18 18 Z" fill="#26262f" stroke="#000" strokeWidth="1.2" strokeLinejoin="round" />
          <circle cx="55" cy="18" r="2.2" fill="#f5c518" />
          <path d="M55 18 L84 26 V40" stroke="#f5c518" strokeWidth="1.8" fill="none" />
          <path d="M81 40 h6 l-1 8 h-4 Z" fill="#f5c518" />
        </g>
      );
    case 'clippy-hat-cap':
      return (
        <g>
          <path d="M30 34 Q30 8 56 8 Q80 8 80 34 Z" fill="#2f6fde" stroke="#173f9a" strokeWidth="1.5" />
          <path d="M76 32 Q96 30 104 36 Q92 40 76 37 Z" fill="#1f56b8" stroke="#173f9a" strokeWidth="1.2" />
          <circle cx="56" cy="9" r="3" fill="#1f56b8" />
          <path d="M38 16 Q46 12 52 12" stroke="#fff" strokeWidth="2" opacity=".4" fill="none" />
          <text x="55" y="27" textAnchor="middle" fontFamily="Tahoma" fontWeight="bold" fontSize="10" fill="#fff">
            XP
          </text>
        </g>
      );
    default:
      return null;
  }
}

/** Brillen sitzen auf den Augen (Mitte links ≈ 38/86, rechts ≈ 77/90). */
export function ClippyGlasses({ id }: { id: string }) {
  switch (id) {
    case 'clippy-glasses-sun':
      return (
        <g>
          <path d="M22 80 Q24 72 38 72 Q52 72 53 82 Q52 98 38 98 Q24 98 22 80 Z" fill="#111" opacity=".92" />
          <path d="M61 84 Q63 76 77 76 Q91 76 93 86 Q91 102 77 102 Q63 102 61 84 Z" fill="#111" opacity=".92" />
          <path d="M53 80 Q57 76 61 82" stroke="#111" strokeWidth="3" fill="none" />
          <path d="M27 77 L35 75" stroke="#fff" strokeWidth="2" opacity=".5" />
          <path d="M66 81 L74 79" stroke="#fff" strokeWidth="2" opacity=".5" />
        </g>
      );
    case 'clippy-glasses-nerd':
      return (
        <g fill="none" stroke="#2a1a10" strokeWidth="4">
          <rect x="22" y="74" width="32" height="24" rx="6" fill="#bfe3ff" fillOpacity=".25" />
          <rect x="61" y="78" width="32" height="24" rx="6" fill="#bfe3ff" fillOpacity=".25" />
          <path d="M54 84 Q58 80 61 86" />
        </g>
      );
    case 'clippy-glasses-3d':
      return (
        <g>
          <rect x="20" y="73" width="76" height="28" rx="4" fill="#fff" stroke="#ccc" transform="rotate(3 58 87)" />
          <rect x="25" y="77" width="28" height="19" rx="2" fill="#e8262b" opacity=".85" transform="rotate(3 58 87)" />
          <rect x="63" y="79" width="28" height="19" rx="2" fill="#1fc4e8" opacity=".85" transform="rotate(3 58 87)" />
        </g>
      );
    case 'clippy-glasses-monocle':
      return (
        <g>
          <circle cx="77" cy="90" r="15" fill="#e8f4ff" fillOpacity=".25" stroke="#d4a017" strokeWidth="3" />
          <path d="M91 96 Q100 120 92 150" stroke="#d4a017" strokeWidth="1.6" fill="none" strokeDasharray="3 2" />
        </g>
      );
    default:
      return null;
  }
}
