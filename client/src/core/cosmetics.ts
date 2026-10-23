/**
 * Grafiken der Shop-Avatare (eigene SVGs). Animierte Avatare nutzen CSS-Animationen innerhalb des SVG –
 * die laufen auch, wenn das SVG als <img> eingebunden ist. Schlüssel = Artikel-ID aus dem Server-Katalog.
 */

const svg = (body: string, extra = '') =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${extra ? `<style>${extra}</style>` : ''}${body}</svg>`,
  )}`;

const BG = (a: string, b: string) =>
  `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/>`;

const robot = (eyes = '') =>
  `${BG('#9fd0ff', '#3a6fd8')}
  <rect x="30" y="6" width="4" height="10" fill="#555"/><circle class="ant" cx="32" cy="6" r="4" fill="#ff4d4d"/>
  <rect x="12" y="16" width="40" height="34" rx="8" fill="#d8dde6" stroke="#5b6475" stroke-width="2"/>
  <rect x="18" y="24" width="28" height="14" rx="4" fill="#1d2b44"/>
  <g class="eyes ${eyes}"><circle cx="26" cy="31" r="4" fill="#4dffb8"/><circle cx="38" cy="31" r="4" fill="#4dffb8"/></g>
  <rect x="24" y="42" width="16" height="3" rx="1.5" fill="#5b6475"/>
  <rect x="8" y="50" width="48" height="14" rx="6" fill="#b9c1cf" stroke="#5b6475" stroke-width="2"/>`;

const cat = () =>
  `${BG('#ffe6a8', '#f59e42')}
  <path d="M12 26 16 8l12 12M52 26 48 8 36 20" fill="#6b6b6b" stroke="#333" stroke-width="2" stroke-linejoin="round"/>
  <ellipse cx="32" cy="38" rx="22" ry="20" fill="#7d7d7d" stroke="#333" stroke-width="2"/>
  <g class="eyes"><ellipse cx="24" cy="34" rx="4" ry="5" fill="#b6ff6a"/><ellipse cx="40" cy="34" rx="4" ry="5" fill="#b6ff6a"/>
  <ellipse cx="24" cy="34" rx="1.4" ry="4" fill="#111"/><ellipse cx="40" cy="34" rx="1.4" ry="4" fill="#111"/></g>
  <path d="M30 42h4l-2 2Z" fill="#ff8fab"/><path d="M32 44v3M32 47q-4 3-7 0M32 47q4 3 7 0" fill="none" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M8 40h12M8 45l12-2M56 40H44M56 45l-12-2" stroke="#ddd" stroke-width="1.2"/>`;

const frog = () =>
  `${BG('#bde8ff', '#5aa9e6')}
  <ellipse cx="32" cy="44" rx="26" ry="18" fill="#5cb85c" stroke="#2d6a2d" stroke-width="2"/>
  <circle cx="20" cy="24" r="10" fill="#5cb85c" stroke="#2d6a2d" stroke-width="2"/><circle cx="44" cy="24" r="10" fill="#5cb85c" stroke="#2d6a2d" stroke-width="2"/>
  <g class="eyes"><circle cx="20" cy="24" r="6" fill="#fff"/><circle cx="44" cy="24" r="6" fill="#fff"/>
  <circle cx="21" cy="25" r="3" fill="#111"/><circle cx="45" cy="25" r="3" fill="#111"/></g>
  <path d="M16 46q16 10 32 0" fill="none" stroke="#2d6a2d" stroke-width="2.5" stroke-linecap="round"/>
  <ellipse cx="14" cy="42" rx="4" ry="2.5" fill="#ff9aa2" opacity=".7"/><ellipse cx="50" cy="42" rx="4" ry="2.5" fill="#ff9aa2" opacity=".7"/>`;

const BLINK = '.eyes{animation:b 4s infinite;transform-origin:32px 32px}@keyframes b{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}';

export const AVATAR_ART: Record<string, string> = {
  'av-robot': svg(robot()),
  'av-cat': svg(cat()),
  'av-frog': svg(frog()),
  'av-ghost': svg(
    `${BG('#2b2d5c', '#0e0f2b')}<path d="M14 58V30a18 18 0 0 1 36 0v28l-6-5-6 5-6-5-6 5-6-5Z" fill="#f4f6ff" stroke="#9aa3d6" stroke-width="2"/>
    <ellipse cx="25" cy="30" rx="4" ry="6" fill="#1b1d3a"/><ellipse cx="39" cy="30" rx="4" ry="6" fill="#1b1d3a"/><ellipse cx="32" cy="42" rx="4" ry="3" fill="#1b1d3a"/>`,
  ),
  'av-astronaut': svg(
    `${BG('#0b1530', '#273b74')}<circle cx="10" cy="10" r="1" fill="#fff"/><circle cx="54" cy="16" r="1" fill="#fff"/><circle cx="48" cy="54" r="1" fill="#fff"/>
    <circle cx="32" cy="30" r="20" fill="#f2f4f8" stroke="#8892a6" stroke-width="2"/><rect x="18" y="22" width="28" height="18" rx="9" fill="#26324d"/>
    <path d="M22 28q6-4 12 0" stroke="#7fc4ff" stroke-width="3" fill="none" stroke-linecap="round"/><rect x="16" y="48" width="32" height="16" rx="6" fill="#e8ebf2" stroke="#8892a6" stroke-width="2"/>`,
  ),
  // Animiert
  'av-anim-robot': svg(robot(), `${BLINK}.ant{animation:a 1.2s infinite}@keyframes a{50%{fill:#ffe14d}}`),
  'av-anim-cat': svg(cat(), BLINK),
  'av-anim-frog': svg(frog(), `${BLINK}svg{animation:h 1.6s ease-in-out infinite}@keyframes h{50%{transform:translateY(-2px)}}`),
  'av-anim-orb': svg(
    `<defs><radialGradient id="o" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="#5fa8ff"/><stop offset="1" stop-color="#0a2f8a"/></radialGradient></defs>
    <rect width="64" height="64" fill="#06103a"/><circle cx="32" cy="32" r="24" fill="url(#o)"/>
    <g class="spin"><path d="M20 24q6-4 11 0l-1.5 7q-5-3-10.5 0Z" fill="#ff5a2a"/><path d="M33 24q6 4 11 0l-1.5 7q-5 3-10.5 0Z" fill="#3fbf3f"/>
    <path d="M18.5 33q6-4 10.5 0l-1.5 7q-5-3-10.5 0Z" fill="#2f7ff0"/><path d="M31.5 33q6 4 11 0l-1.5 7q-5 3-10.5 0Z" fill="#ffc21a"/></g>
    <ellipse cx="25" cy="18" rx="10" ry="4" fill="#fff" opacity=".5"/>`,
    '.spin{animation:s 6s linear infinite;transform-origin:31px 32px}@keyframes s{to{transform:rotate(360deg)}}circle{animation:p 2s ease-in-out infinite}@keyframes p{50%{opacity:.85}}',
  ),
};
