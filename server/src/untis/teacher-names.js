/**
 * Ordnet Untis-Lehrerkürzel (z. B. „KALA“) den vollen Namen aus dem Lehrerverzeichnis der Schulwebseite zu.
 * Portiert aus UntisDashboard (teacher-names.ts + teacher-directory.ts).
 *
 * HTL Hollabrunn: https://www.htl-hl.ac.at/web/team lädt die Liste von
 * /services/teachers/teachers.php im Format `<b>Nachname Vorname</b>&nbsp;Titel</div>` – ohne Kürzel.
 * Deshalb wird heuristisch gematcht (Nachname, Nachname-Anfang, Nachname+Vorname-Anfang …),
 * starke Treffer zuerst. Korrekturen sind über UNTIS_TEACHER_NAMES möglich.
 */

/** Kleinbuchstaben-ASCII: Ä → ae, ß → ss, alles außer a–z entfernt. */
export function normalize(value) {
  return value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[^a-z]/g, '');
}

function isSubsequence(needle, haystack) {
  let i = 0;
  for (const ch of haystack) if (ch === needle[i]) i++;
  return i === needle.length;
}

/** Wie gut passt ein Kürzel zu einer Person? (0 = gar nicht) */
export function scoreMatch(abbreviation, entry) {
  const a = normalize(abbreviation);
  const surname = normalize(entry.surname);
  const parts = entry.surname.split(/[-\s]+/).map(normalize).filter(Boolean);
  const first = normalize(entry.firstName);
  if (a.length < 2 || !surname) return 0;

  if (a === surname || parts.includes(a)) return 100;
  if (surname.startsWith(a) || parts.some((p) => p.startsWith(a))) return 80;
  // Nachname-Anfang + Vorname-Anfang, z. B. „EDR“ = Ed(er) R(alf)
  for (let i = 2; i < a.length; i++) {
    if (surname.startsWith(a.slice(0, i)) && first.startsWith(a.slice(i))) return 60;
  }
  if (a[0] === surname[0] && isSubsequence(a, surname)) return 40;
  if (a[0] === surname[0] && isSubsequence(a, surname + first)) return 20;
  return 0;
}

const CONFIDENCE = { 100: 'exact', 80: 'high', 60: 'high', 40: 'medium', 20: 'low' };
export const fullName = (e) => `${e.surname} ${e.firstName}`.trim();

/**
 * Ordnet Verzeichniseinträge den Kürzeln zu. Starke Treffer werden zuerst vergeben und
 * aus dem Pool entfernt – das löst oft die restlichen Mehrdeutigkeiten.
 * @returns {Map<string, { longName: string, confidence: string, partial?: boolean }>}
 */
export function matchTeacherNames(abbreviations, directory, overrides = {}) {
  const result = new Map();
  const taken = new Set();
  const overrideKeys = new Map(Object.entries(overrides).map(([k, v]) => [k.toUpperCase(), v]));

  for (const abbr of abbreviations) {
    const override = overrideKeys.get(abbr.toUpperCase());
    if (!override) continue;
    result.set(abbr, { longName: override, confidence: 'override' });
    const entry = directory.find((e) => normalize(fullName(e)) === normalize(override));
    if (entry) taken.add(entry);
  }

  const candidates = abbreviations
    .filter((a) => !result.has(a))
    .map((abbr) => ({
      abbr,
      scored: directory.map((entry) => ({ entry, score: scoreMatch(abbr, entry) })).filter((c) => c.score > 0),
    }));

  for (const tier of [100, 80, 60, 40, 20]) {
    let changed = true;
    while (changed) {
      changed = false;
      // Längere Kürzel sind spezifischer – zuerst auflösen
      const open = candidates.filter((c) => !result.has(c.abbr)).sort((x, y) => y.abbr.length - x.abbr.length);
      for (const c of open) {
        const free = c.scored.filter((s) => !taken.has(s.entry));
        const best = Math.max(0, ...free.map((s) => s.score));
        if (best < tier) continue;
        const top = free.filter((s) => s.score === best);
        if (top.length === 1) {
          taken.add(top[0].entry);
          result.set(c.abbr, { longName: fullName(top[0].entry), confidence: CONFIDENCE[best] });
          changed = true;
        }
      }
    }
  }

  // Immer noch mehrdeutig: wenigstens den Nachnamen zeigen, wenn alle besten Kandidaten ihn teilen
  for (const c of candidates) {
    if (result.has(c.abbr)) continue;
    const free = c.scored.filter((s) => !taken.has(s.entry));
    const best = Math.max(0, ...free.map((s) => s.score));
    if (best < 80) continue;
    const surnames = new Set(free.filter((s) => s.score === best).map((s) => s.entry.surname));
    if (surnames.size === 1) result.set(c.abbr, { longName: [...surnames][0], confidence: CONFIDENCE[best], partial: true });
  }
  return result;
}

/** „KÜRZEL=Nachname Vorname; KÜRZEL2=…“ */
export function parseOverrides(value) {
  const result = {};
  for (const pair of (value ?? '').split(';')) {
    const [abbr, ...name] = pair.split('=');
    if (abbr?.trim() && name.join('=').trim()) result[abbr.trim()] = name.join('=').trim();
  }
  return result;
}

// ─── Lehrerverzeichnis laden ───────────────────────────────────────────────

const NAMED_ENTITIES = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
  eacute: 'é', egrave: 'è', aacute: 'á', oacute: 'ó', iacute: 'í', ccedil: 'ç',
};

const decodeEntities = (value) =>
  value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return NAMED_ENTITIES[code] ?? match;
  });

/** Parst `<b>Nachname Vorname</b>&nbsp;Titel</div>` (Format der HTL-Hollabrunn-Webseite). */
export function parseTeacherDirectory(html) {
  const entries = [];
  for (const m of html.matchAll(/<b>([\s\S]*?)<\/b>([\s\S]*?)<\/div>/g)) {
    const name = decodeEntities(m[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    const [surname, ...first] = name.split(' ');
    if (!surname || first.length === 0) continue;
    const title = decodeEntities(m[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    entries.push({ surname, firstName: first.join(' '), title: title || undefined });
  }
  return entries;
}

const DAY = 24 * 60 * 60_000;
const directoryCache = new Map(); // url → { entries, expiresAt, promise }

/** Lädt und cached (24 h) das Lehrerverzeichnis einer URL. Fehler → leere Liste + Warnung. */
export async function loadTeacherDirectory(url) {
  if (!url) return [];
  const hit = directoryCache.get(url);
  if (hit?.promise) return hit.promise;
  if (hit && hit.expiresAt > Date.now()) return hit.entries;

  const promise = (async () => {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'text/html', 'User-Agent': 'OSSXP (Lehrerverzeichnis)' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const entries = parseTeacherDirectory(await res.text());
      if (entries.length === 0) throw new Error('keine Einträge gefunden – hat sich das Seitenformat geändert?');
      directoryCache.set(url, { entries, expiresAt: Date.now() + DAY });
      return entries;
    } catch (err) {
      console.warn(`[untis] Lehrerverzeichnis ${url} nicht ladbar: ${err.message}`);
      directoryCache.set(url, { entries: [], expiresAt: Date.now() + 10 * 60_000 }); // in 10 min erneut versuchen
      return [];
    }
  })();
  directoryCache.set(url, { promise, expiresAt: 0 });
  return promise;
}
