/**
 * Emote-Provider für chatterinoXP: 7TV, BetterTTV, FrankerFaceZ + das eigene OSSXP-Set.
 *
 *  - Globale Sets aller drei Anbieter
 *  - Channel-Sets großer Twitch-Kanäle (viele Pepe-/Community-Emotes) – EMOTE_TWITCH_IDS
 *  - OSSXP-Set: Emotes, die User über die 7TV-Suche für alle hinzugefügt haben (Tabelle custom_emotes)
 *
 * Der Server lädt die Listen, normalisiert sie und cached sie (1 h). Der Browser lädt nur die Bilder.
 * Twitch-eigene Emotes (z. B. Abo-Emotes) sind ohne Twitch-Anmeldung nicht abrufbar.
 *
 * @typedef {{ id: string, name: string, provider: '7tv'|'bttv'|'ffz'|'ossxp', scope: 'global'|'channel',
 *             url: string, url2x: string, zeroWidth: boolean, animated?: boolean }} Emote
 */
import { config } from '../config.js';
import { db } from '../db.js';

const TIMEOUT = 20_000;
const getJson = async (url, init) => {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
};

db.exec(`
  CREATE TABLE IF NOT EXISTS custom_emotes (
    id         TEXT PRIMARY KEY,         -- 7TV-Emote-ID
    name       TEXT NOT NULL UNIQUE,
    animated   INTEGER NOT NULL DEFAULT 0,
    added_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );
`);
const customStmt = {
  all: db.prepare('SELECT * FROM custom_emotes ORDER BY name'),
  byName: db.prepare('SELECT * FROM custom_emotes WHERE name = ?'),
  insert: db.prepare('INSERT INTO custom_emotes (id, name, animated, added_by, created_at) VALUES (?, ?, ?, ?, ?)'),
  remove: db.prepare('DELETE FROM custom_emotes WHERE name = ?'),
};

// ─── 7TV ────────────────────────────────────────────────────────────────────

const SEVENTV_ZERO_WIDTH = 1 << 8;
const seventvUrls = (id) => ({ url: `https://cdn.7tv.app/emote/${id}/1x.webp`, url2x: `https://cdn.7tv.app/emote/${id}/2x.webp` });

/** @returns {Emote} */
function from7tv(e, scope) {
  return {
    id: e.id,
    name: e.name,
    provider: '7tv',
    scope,
    ...seventvUrls(e.id),
    zeroWidth: Boolean((e.data?.flags ?? 0) & SEVENTV_ZERO_WIDTH),
    animated: Boolean(e.data?.animated),
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

/** Suche im gesamten 7TV-Katalog (öffentliche GraphQL-API, nach Beliebtheit sortiert). */
export async function search7tv(query) {
  const body = {
    query:
      'query($q:String!,$sort:Sort){emotes(query:$q,limit:40,page:1,sort:$sort){items{id name animated flags owner{username}}}}',
    variables: { q: query, sort: { value: 'popularity', order: 'DESCENDING' } },
  };
  const res = await getJson('https://7tv.io/v3/gql', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return (res.data?.emotes?.items ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    animated: Boolean(e.animated),
    owner: e.owner?.username ?? null,
    ...seventvUrls(e.id),
  }));
}

// ─── BetterTTV ─────────────────────────────────────────────────────────────

const BTTV_ZERO_WIDTH = new Set(['SoSnowy', 'IceCold', 'SantaHat', 'TopHat', 'ReinDeer', 'CandyCane', 'cvMask', 'cvHazmat']);

/** @returns {Emote} */
function fromBttv(e, scope) {
  const base = `https://cdn.betterttv.net/emote/${e.id}`;
  return { id: e.id, name: e.code, provider: 'bttv', scope, url: `${base}/1x`, url2x: `${base}/2x`, zeroWidth: BTTV_ZERO_WIDTH.has(e.code), animated: Boolean(e.animated) };
}

const loadBttvGlobal = async () => (await getJson('https://api.betterttv.net/3/cached/emotes/global')).map((e) => fromBttv(e, 'global'));

async function loadBttvChannel(twitchId) {
  const user = await getJson(`https://api.betterttv.net/3/cached/users/twitch/${encodeURIComponent(twitchId)}`);
  return [...(user.channelEmotes ?? []), ...(user.sharedEmotes ?? [])].map((e) => fromBttv(e, 'channel'));
}

// ─── FrankerFaceZ ──────────────────────────────────────────────────────────

/** @returns {Emote[]} */
function fromFfzSets(sets, scope) {
  return Object.values(sets ?? {}).flatMap((s) =>
    (s.emoticons ?? []).map((e) => {
      const u1 = e.animated?.['1'] ?? e.urls?.['1'];
      const u2 = e.animated?.['2'] ?? e.urls?.['2'] ?? u1;
      const abs = (u) => (u?.startsWith('//') ? `https:${u}` : u);
      return { id: String(e.id), name: e.name, provider: 'ffz', scope, url: abs(u1), url2x: abs(u2), zeroWidth: false, animated: Boolean(e.animated) };
    }),
  );
}

async function loadFfzGlobal() {
  const res = await getJson('https://api.frankerfacez.com/v1/set/global');
  const globalSets = Object.fromEntries((res.default_sets ?? []).map((id) => [id, res.sets?.[id]]).filter(([, s]) => s));
  return fromFfzSets(globalSets, 'global');
}

async function loadFfzChannel(twitchId) {
  return fromFfzSets((await getJson(`https://api.frankerfacez.com/v1/room/id/${encodeURIComponent(twitchId)}`)).sets, 'channel');
}

// ─── OSSXP-Set ─────────────────────────────────────────────────────────────

const loadCustom = async () =>
  customStmt.all.all().map((e) => ({ id: e.id, name: e.name, provider: 'ossxp', scope: 'global', ...seventvUrls(e.id), zeroWidth: false, animated: Boolean(e.animated) }));

export function addCustomEmote({ id, name, animated, userId }) {
  if (customStmt.byName.get(name)) throw new Error(`„${name}“ ist schon im OSSXP-Set.`);
  customStmt.insert.run(id, name, animated ? 1 : 0, userId, Date.now());
  invalidate();
}

export function removeCustomEmote(name) {
  customStmt.remove.run(name);
  invalidate();
}

// ─── Aggregation & Cache ───────────────────────────────────────────────────

/** Reihenfolge = Priorität: spätere Quellen überschreiben gleichnamige Emotes früherer. */
const loaders = () => [
  ['ffz:global', loadFfzGlobal],
  ['bttv:global', loadBttvGlobal],
  ['7tv:global', load7tvGlobal],
  ...config.emotes.twitchIds.flatMap((id) => [
    [`ffz:${id}`, () => loadFfzChannel(id)],
    [`bttv:${id}`, () => loadBttvChannel(id)],
    [`7tv:${id}`, () => load7tvChannel(id)],
  ]),
  ['ossxp', loadCustom],
];

let cache = { emotes: [], updatedAt: 0 };
let inflight = null;
let onChange = () => {};

/** Wird vom Chat-Modul gesetzt, um alle Clients über neue Emotes zu informieren. */
export const setEmoteChangeListener = (fn) => {
  onChange = fn;
};

async function refresh() {
  const sources = loaders();
  const results = await Promise.allSettled(sources.map(([, load]) => load()));
  const byName = new Map();
  const errors = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') r.value.forEach((e) => e.name && e.url && byName.set(e.name, e));
    else errors.push(`${sources[i][0]}: ${r.reason?.message ?? r.reason}`);
  });
  if (errors.length) console.warn('[emotes] Teilweise fehlgeschlagen:', errors.join(' | '));

  // Nur übernehmen, wenn wirklich etwas geladen wurde – sonst beim nächsten Aufruf erneut versuchen
  if (byName.size > cache.emotes.length * 0.5 || cache.emotes.length === 0) {
    cache = { emotes: [...byName.values()], updatedAt: byName.size > 0 ? Date.now() : 0 };
  }
  return cache;
}

function invalidate() {
  cache.updatedAt = 0;
  getEmotes().then(() => onChange());
}

export async function getEmotes() {
  const stale = Date.now() - cache.updatedAt > config.emotes.cacheTtlMs;
  if (stale) {
    inflight ??= refresh().finally(() => {
      inflight = null;
    });
    // Ohne Cache auf das Laden warten, sonst sofort den alten Stand liefern
    if (cache.emotes.length === 0 || cache.updatedAt === 0) await inflight;
  }
  return cache;
}
