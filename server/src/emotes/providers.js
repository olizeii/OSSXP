/**
 * Emote-Provider für chatterinoXP: 7TV und BetterTTV (global + optionale Twitch-Channels).
 *
 * Der Server lädt die Listen, normalisiert sie und cached sie für eine Stunde.
 * Der Browser lädt nur noch die Bilder direkt von den CDNs.
 * Neue Provider (z. B. FrankerFaceZ) = neue Funktion, die Emote[] liefert, und in `loaders` eintragen.
 *
 * @typedef {{ id: string, name: string, provider: '7tv' | 'bttv', scope: 'global' | 'channel',
 *             url: string, url2x: string, zeroWidth: boolean }} Emote
 */
import { config } from '../config.js';

const TIMEOUT = 8_000;
const getJson = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
};

// ─── 7TV ────────────────────────────────────────────────────────────────────

const SEVENTV_ZERO_WIDTH = 1 << 8;

/** @returns {Emote} */
function from7tv(e, scope) {
  const host = e.data?.host?.url ?? `//cdn.7tv.app/emote/${e.id}`;
  const base = host.startsWith('//') ? `https:${host}` : host;
  return {
    id: e.id,
    name: e.name,
    provider: '7tv',
    scope,
    url: `${base}/1x.webp`,
    url2x: `${base}/2x.webp`,
    zeroWidth: Boolean((e.data?.flags ?? 0) & SEVENTV_ZERO_WIDTH),
  };
}

async function load7tvGlobal() {
  const set = await getJson('https://7tv.io/v3/emote-sets/global');
  return (set.emotes ?? []).map((e) => from7tv(e, 'global'));
}

async function load7tvChannel(twitchId) {
  const user = await getJson(`https://7tv.io/v3/users/twitch/${encodeURIComponent(twitchId)}`);
  return (user.emote_set?.emotes ?? []).map((e) => from7tv(e, 'channel'));
}

// ─── BetterTTV ─────────────────────────────────────────────────────────────

/** Globale BTTV-Emotes, die als Overlay über dem vorherigen Emote liegen. */
const BTTV_ZERO_WIDTH = new Set(['SoSnowy', 'IceCold', 'SantaHat', 'TopHat', 'ReinDeer', 'CandyCane', 'cvMask', 'cvHazmat']);

/** @returns {Emote} */
function fromBttv(e, scope) {
  const base = `https://cdn.betterttv.net/emote/${e.id}`;
  return {
    id: e.id,
    name: e.code,
    provider: 'bttv',
    scope,
    url: `${base}/1x`,
    url2x: `${base}/2x`,
    zeroWidth: BTTV_ZERO_WIDTH.has(e.code),
  };
}

async function loadBttvGlobal() {
  const list = await getJson('https://api.betterttv.net/3/cached/emotes/global');
  return list.map((e) => fromBttv(e, 'global'));
}

async function loadBttvChannel(twitchId) {
  const user = await getJson(`https://api.betterttv.net/3/cached/users/twitch/${encodeURIComponent(twitchId)}`);
  return [...(user.channelEmotes ?? []), ...(user.sharedEmotes ?? [])].map((e) => fromBttv(e, 'channel'));
}

// ─── Aggregation & Cache ───────────────────────────────────────────────────

/** Reihenfolge = Priorität: spätere Quellen überschreiben gleichnamige Emotes früherer. */
const loaders = () => [
  ['bttv:global', loadBttvGlobal],
  ['7tv:global', load7tvGlobal],
  ...config.emotes.twitchIds.flatMap((id) => [
    [`bttv:${id}`, () => loadBttvChannel(id)],
    [`7tv:${id}`, () => load7tvChannel(id)],
  ]),
];

let cache = { emotes: [], updatedAt: 0, errors: [] };
let inflight = null;

async function refresh() {
  const sources = loaders();
  const results = await Promise.allSettled(sources.map(([, load]) => load()));
  const byName = new Map();
  const errors = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') r.value.forEach((e) => byName.set(e.name, e));
    else errors.push(`${sources[i][0]}: ${r.reason?.message ?? r.reason}`);
  });
  if (errors.length) console.warn('[emotes] Teilweise fehlgeschlagen:', errors.join(' | '));

  // Bei Totalausfall alten Cache behalten
  if (byName.size > 0 || cache.emotes.length === 0) {
    cache = { emotes: [...byName.values()], updatedAt: Date.now(), errors };
  }
  return cache;
}

export async function getEmotes() {
  const stale = Date.now() - cache.updatedAt > config.emotes.cacheTtlMs;
  if (stale) {
    inflight ??= refresh().finally(() => {
      inflight = null;
    });
    // Beim allerersten Laden warten, danach sofort den (alten) Cache liefern
    if (cache.emotes.length === 0) await inflight;
  }
  return cache;
}
