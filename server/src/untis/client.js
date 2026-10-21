/**
 * Schlanker WebUntis-JSON-RPC-Client – portiert aus UntisDashboard (src/lib/untis/client.ts).
 *
 *  - POST https://{server}/WebUntis/jsonrpc.do?school={school}
 *  - Session über JSESSIONID-Cookie + schoolname-Cookie
 *  - Parallele Aufrufe teilen sich einen laufenden Login
 *  - Bei -8520 (Session abgelaufen) wird einmalig neu eingeloggt und wiederholt
 */
import { config } from '../config.js';
import { UNTIS_ERROR_CODES, UntisError, toUntisError } from './errors.js';

let rpcId = 0;

export class UntisClient {
  /**
   * @param {{ server: string, school: string, username: string, password: string }} cfg
   */
  constructor({ server, school, username, password }) {
    this.server = server;
    this.school = school;
    this.username = username;
    this.password = password;

    this.sessionId = null;
    this.person = null; // { id, type, klasseId } aus der Login-Antwort
    this.lastUsed = 0;
    this.loginPromise = null;
  }

  get baseUrl() {
    return `https://${this.server}/WebUntis`;
  }

  #rpcUrl() {
    return `${this.baseUrl}/jsonrpc.do?school=${encodeURIComponent(this.school)}`;
  }

  #cookieHeader() {
    const schoolB64 = Buffer.from(this.school, 'utf8').toString('base64');
    return `JSESSIONID=${this.sessionId}; schoolname="_${schoolB64}"`;
  }

  async #post(method, params, { withSession = true } = {}) {
    let res;
    try {
      res = await fetch(this.#rpcUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(withSession && this.sessionId ? { Cookie: this.#cookieHeader() } : {}),
        },
        body: JSON.stringify({ id: String(++rpcId), method, params, jsonrpc: '2.0' }),
        signal: AbortSignal.timeout(config.untis.timeoutMs),
      });
    } catch (err) {
      throw toUntisError(err);
    }

    let body;
    try {
      body = await res.json();
    } catch {
      if (res.status === 404) {
        throw new UntisError('config', 'WebUntis nicht gefunden (HTTP 404). Bitte Serveradresse prüfen.');
      }
      throw new UntisError('network', `Ungültige Antwort von WebUntis (HTTP ${res.status}).`);
    }

    // RPC-Fehler haben Vorrang (z. B. -8500 kommt teils mit HTTP 404)
    if (body?.error) throw UntisError.fromRpc(body.error);
    if (!res.ok) throw new UntisError('network', `WebUntis antwortete mit HTTP ${res.status}.`);
    return body.result;
  }

  /** Passwort-Login. Liefert Infos zur angemeldeten Person (Schüler, Lehrer, …). */
  async login() {
    const result = await this.#post(
      'authenticate',
      { user: this.username, password: this.password, client: config.untis.clientName },
      { withSession: false },
    );
    if (!result?.sessionId) throw new UntisError('auth', 'WebUntis hat keine Sitzung zurückgegeben.');

    this.sessionId = result.sessionId;
    this.person = { id: result.personId, type: result.personType, klasseId: result.klasseId };
    this.lastUsed = Date.now();
    return this.person;
  }

  async #ensureSession() {
    const fresh = this.sessionId && Date.now() - this.lastUsed < config.untis.sessionIdleMs;
    if (fresh) return;
    this.sessionId = null;
    this.loginPromise ??= this.login().finally(() => {
      this.loginPromise = null;
    });
    await this.loginPromise;
  }

  /** Generischer JSON-RPC-Aufruf mit automatischem (Re-)Login. */
  async call(method, params = {}) {
    await this.#ensureSession();
    try {
      const result = await this.#post(method, params);
      this.lastUsed = Date.now();
      return result;
    } catch (err) {
      if (err instanceof UntisError && err.code === UNTIS_ERROR_CODES.NOT_AUTHENTICATED) {
        this.sessionId = null;
        await this.#ensureSession();
        return this.#post(method, params);
      }
      throw err;
    }
  }

  async logout() {
    if (!this.sessionId) return;
    try {
      await this.#post('logout', {});
    } catch {
      /* Logout-Fehler sind egal */
    }
    this.sessionId = null;
  }
}
