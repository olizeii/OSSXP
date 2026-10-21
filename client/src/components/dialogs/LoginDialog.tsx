/**
 * Login-/Registrierungsdialog im Stil von „Bei Windows anmelden“ (Windows XP).
 * Wird über das Startmenü (Kopfbereich) oder aus dem Launcher geöffnet.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { WinFlag } from '../xp/Glyphs';
import { XpDialog } from './XpDialog';
import keyIcon from '../../assets/icons/key.svg';

export function LoginDialog() {
  const { open, mode: initialMode, onSuccess } = useUiStore((s) => s.login);
  const closeLogin = useUiStore((s) => s.closeLogin);
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const userRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setError('');
      setPassword('');
      setConfirm('');
      setTimeout(() => userRef.current?.focus(), 0);
    }
  }, [open, initialMode]);

  if (!open) return null;

  const isRegister = mode === 'register';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (isRegister && password !== confirm) {
      setError('Die Kennwörter stimmen nicht überein.');
      return;
    }
    setBusy(true);
    try {
      const auth = useAuthStore.getState();
      await (isRegister ? auth.register(username, password) : auth.login(username, password));
      closeLogin();
      onSuccess?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-layer dim" onKeyDown={(e) => e.key === 'Escape' && closeLogin()}>
      <XpDialog
        title={isRegister ? 'Neues OSSXP-Konto erstellen' : 'Bei OSSXP anmelden'}
        icon={keyIcon}
        width={400}
        onClose={closeLogin}
      >
        <div className="login-banner">
          <div className="login-banner-brand">
            <WinFlag size={34} />
            <div>
              <div className="login-banner-title">
                OSSXP<sup>®</sup>
              </div>
              <div className="login-banner-sub">Web Edition</div>
            </div>
          </div>
          <div className="login-banner-stripe" />
        </div>

        <form className="login-form" onSubmit={submit}>
          <label className="xp-field">
            <span>
              <u>B</u>enutzername:
            </span>
            <input
              ref={userRef}
              className="xp-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              maxLength={20}
              required
            />
          </label>
          <label className="xp-field">
            <span>
              <u>K</u>ennwort:
            </span>
            <input
              className="xp-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              required
            />
          </label>
          {isRegister && (
            <label className="xp-field">
              <span>Kennwort bestätigen:</span>
              <input
                className="xp-input"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
          )}

          {error && <p className="xp-error-text">{error}</p>}

          <div className="login-actions">
            <button
              type="button"
              className="xp-link"
              onClick={() => {
                setMode(isRegister ? 'login' : 'register');
                setError('');
              }}
            >
              {isRegister ? 'Ich habe bereits ein Konto' : 'Neues Konto erstellen…'}
            </button>
            <span style={{ flex: 1 }} />
            <button type="submit" className="xp-button default" disabled={busy}>
              {busy ? 'Bitte warten…' : 'OK'}
            </button>
            <button type="button" className="xp-button" onClick={closeLogin}>
              Abbrechen
            </button>
          </div>
        </form>
      </XpDialog>
    </div>
  );
}
