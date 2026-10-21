/**
 * Fehlerklassen & WebUntis-Fehlercodes (angelehnt an UntisDashboard/src/lib/untis/errors.ts).
 */

export const UNTIS_ERROR_CODES = {
  INVALID_SCHOOL: -8500,
  BAD_CREDENTIALS: -8504,
  NO_RIGHT: -8509,
  NOT_AUTHENTICATED: -8520,
  NO_ALLOWED_DATE: -7004,
};

const MESSAGES = {
  [UNTIS_ERROR_CODES.INVALID_SCHOOL]: 'Die Schule wurde auf diesem WebUntis-Server nicht gefunden.',
  [UNTIS_ERROR_CODES.BAD_CREDENTIALS]: 'Untis-Benutzername oder -Passwort ist falsch.',
  [UNTIS_ERROR_CODES.NO_RIGHT]: 'Ihr Untis-Konto hat keine Berechtigung für diese Daten.',
  [UNTIS_ERROR_CODES.NOT_AUTHENTICATED]: 'Die Untis-Sitzung ist abgelaufen.',
  [UNTIS_ERROR_CODES.NO_ALLOWED_DATE]: 'Für diesen Zeitraum sind keine Untis-Daten freigegeben.',
};

/**
 * @typedef {'auth' | 'config' | 'network' | 'forbidden' | 'untis'} UntisErrorKind
 */
export class UntisError extends Error {
  /**
   * @param {UntisErrorKind} kind
   * @param {string} message
   * @param {number} [code] Original-Fehlercode von WebUntis
   */
  constructor(kind, message, code) {
    super(message);
    this.name = 'UntisError';
    this.kind = kind;
    this.code = code;
  }

  /** HTTP-Status, mit dem der Fehler an den Browser weitergegeben wird. */
  get httpStatus() {
    return { auth: 401, forbidden: 403, config: 400, network: 502, untis: 502 }[this.kind] ?? 500;
  }

  static fromRpc(error) {
    const code = Number(error?.code);
    const kind =
      code === UNTIS_ERROR_CODES.BAD_CREDENTIALS || code === UNTIS_ERROR_CODES.NOT_AUTHENTICATED
        ? 'auth'
        : code === UNTIS_ERROR_CODES.INVALID_SCHOOL
          ? 'config'
          : code === UNTIS_ERROR_CODES.NO_RIGHT || code === UNTIS_ERROR_CODES.NO_ALLOWED_DATE
            ? 'forbidden'
            : 'untis';
    return new UntisError(kind, MESSAGES[code] ?? `WebUntis-Fehler: ${error?.message ?? code}`, code);
  }
}

/** Normalisiert beliebige Fehler (Timeout, DNS, …) zu einem UntisError. */
export function toUntisError(err) {
  if (err instanceof UntisError) return err;
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
    return new UntisError('network', 'WebUntis antwortet nicht (Zeitüberschreitung).');
  }
  if (err?.cause?.code === 'ENOTFOUND') {
    return new UntisError('config', 'Der WebUntis-Server wurde nicht gefunden. Bitte Serveradresse prüfen.');
  }
  return new UntisError('network', `Verbindung zu WebUntis fehlgeschlagen: ${err?.message ?? err}`);
}
