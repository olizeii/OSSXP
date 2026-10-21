/**
 * Dünner fetch-Wrapper für die OSSXP-API.
 * Cookies (Login) werden automatisch mitgeschickt, Fehler kommen als ApiError mit deutscher Meldung.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public kind?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export async function api<T>(path: string, options: { method?: Method; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError('Der Server ist nicht erreichbar.', 0);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Fehler ${res.status}`, res.status, data.kind);
  return data as T;
}
