/**
 * TTL-Cache mit gemeinsamer Nutzung laufender Anfragen (aus UntisDashboard/cache.ts).
 * Jeder verknüpfte User bekommt seinen eigenen Cache (siehe service.js).
 */

const MAX_ENTRIES = 500;

export function createCache() {
  const store = new Map();

  /** Liefert den gecachten Wert oder lädt ihn; gleichzeitige Aufrufer teilen sich eine Anfrage. */
  async function cached(key, ttlMs, load) {
    const now = Date.now();
    const entry = store.get(key);
    if (entry) {
      if (entry.promise) return entry.promise;
      if (entry.expiresAt > now) return entry.value;
    }

    const promise = load().then(
      (value) => {
        store.set(key, { value, expiresAt: Date.now() + ttlMs });
        return value;
      },
      (error) => {
        store.delete(key); // Fehler werden nicht gecached
        throw error;
      },
    );
    store.set(key, { expiresAt: 0, promise });

    if (store.size > MAX_ENTRIES) {
      for (const [k, e] of store) if (!e.promise && e.expiresAt <= now) store.delete(k);
    }
    return promise;
  }

  return { cached, clear: () => store.clear() };
}

/** Führt `fn` für alle `items` aus, höchstens `limit` gleichzeitig (schont den WebUntis-Server). */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i]) };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
