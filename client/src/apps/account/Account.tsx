/**
 * Benutzerkonten (wie die XP-Systemsteuerung): Profil/Chat-Farbe und Untis-Verknüpfung.
 * Öffnen mit launchApp('account', { tab: 'untis' }) springt direkt zur Verknüpfung.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../../core/api';
import { AVATAR_PRESETS, avatarUrl, fileToAvatar } from '../../core/avatars';
import { launchApp } from '../../core/launcher';
import type { AppWindowProps } from '../../core/types';
import { useAuthStore, type User } from '../../store/authStore';
import iconLink from '../../assets/icons/untis-link.svg';
import iconUntis from '../../assets/icons/untisxp.svg';
import './account.css';

type Tab = 'profile' | 'picture' | 'untis';

const COLORS = ['#FF0000', '#FF7F50', '#DAA520', '#9ACD32', '#00FF7F', '#2E8B57', '#5F9EA0', '#1E90FF', '#8A2BE2', '#FF69B4', '#D2691E', '#B22222'];

export default function Account({ params }: AppWindowProps) {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>((params?.tab as Tab) ?? 'profile');

  // Wird die (Single-Instance-)App erneut mit anderem Tab geöffnet → umschalten
  useEffect(() => {
    if (params?.tab) setTab(params.tab as Tab);
  }, [params]);

  if (!user) return null; // durch requires.auth eigentlich nie der Fall

  return (
    <div className="cp">
      <aside className="cp-taskpane xp-scroll">
        <div className="cp-box">
          <div className="cp-box-title">Benutzeraufgaben</div>
          <div className="cp-box-body">
            <button className={`cp-task ${tab === 'profile' ? 'active' : ''}`} onClick={() => setTab('profile')}>
              <img src={avatarUrl(user.avatar)} alt="" /> Konto &amp; Chat-Farbe
            </button>
            <button className={`cp-task ${tab === 'picture' ? 'active' : ''}`} onClick={() => setTab('picture')}>
              <img src={AVATAR_PRESETS[1].url} alt="" /> Eigenes Bild ändern
            </button>
            <button className={`cp-task ${tab === 'untis' ? 'active' : ''}`} onClick={() => setTab('untis')}>
              <img src={iconLink} alt="" /> Untis-Verknüpfung
            </button>
          </div>
        </div>
        <div className="cp-box">
          <div className="cp-box-title">Siehe auch</div>
          <div className="cp-box-body">
            <button className="cp-task" onClick={() => launchApp('untisxp')}>
              <img src={iconUntis} alt="" /> UntisXP öffnen
            </button>
          </div>
        </div>
      </aside>

      <main className="cp-content xp-scroll">
        {tab === 'profile' && <ProfileTab user={user} onChangePicture={() => setTab('picture')} />}
        {tab === 'picture' && <PictureTab user={user} onDone={() => setTab('profile')} />}
        {tab === 'untis' && <UntisTab user={user} />}
      </main>
    </div>
  );
}

function ProfileTab({ user, onChangePicture }: { user: User; onChangePicture: () => void }) {
  const setUser = useAuthStore((s) => s.setUser);
  const [error, setError] = useState('');

  async function pickColor(color: string) {
    setError('');
    try {
      const res = await api<{ user: User }>('/auth/me', { method: 'PATCH', body: { color } });
      setUser(res.user);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <h1 className="cp-heading">Ihr Konto</h1>
      <div className="cp-user-card">
        <button className="cp-avatar-btn" onClick={onChangePicture} title="Eigenes Bild ändern">
          <img src={avatarUrl(user.avatar)} alt="Benutzerbild" />
        </button>
        <div>
          <div className="cp-user-name" style={{ color: user.color }}>
            {user.username}
          </div>
          <div>Mitglied seit {new Date(user.createdAt).toLocaleDateString('de-DE')}</div>
          <div>Untis: {user.untisLinked ? `verknüpft (${user.untis?.username})` : 'nicht verknüpft'}</div>
        </div>
      </div>

      <fieldset className="xp-fieldset">
        <legend>Namensfarbe im chatterinoXP</legend>
        <div className="cp-colors">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`cp-color ${user.color.toUpperCase() === c ? 'active' : ''}`}
              style={{ background: c }}
              title={c}
              onClick={() => pickColor(c)}
            />
          ))}
        </div>
        {error && <p className="xp-error-text">{error}</p>}
      </fieldset>

      <button className="xp-button" onClick={() => useAuthStore.getState().logout()}>
        Abmelden
      </button>
    </>
  );
}

/**
 * „Eigenes Bild ändern“ wie unter Windows XP: Bildergalerie + „Nach weiteren Bildern suchen…“ (Upload).
 * Die Auswahl wird erst mit „Bild ändern“ gespeichert.
 */
function PictureTab({ user, onDone }: { user: User; onDone: () => void }) {
  const setUser = useAuthStore((s) => s.setUser);
  const [choice, setChoice] = useState<string | null>(user.avatar ?? `preset:${AVATAR_PRESETS[0].id}`);
  const [upload, setUpload] = useState<string | null>(user.avatar?.startsWith('data:') ? user.avatar : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      const dataUrl = await fileToAvatar(file);
      setUpload(dataUrl);
      setChoice(dataUrl);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      const res = await api<{ user: User }>('/auth/me', { method: 'PATCH', body: { avatar: choice } });
      setUser(res.user);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const options = [
    ...AVATAR_PRESETS.map((p) => ({ value: `preset:${p.id}`, url: p.url, label: p.label })),
    ...(upload ? [{ value: upload, url: upload, label: 'Eigenes Bild' }] : []),
  ];

  return (
    <>
      <h1 className="cp-heading">Wählen Sie ein neues Bild für Ihr Konto aus</h1>
      <div className="cp-picture">
        <div className="cp-picture-current">
          <img src={avatarUrl(choice)} alt="Ausgewähltes Bild" />
          <b>{user.username}</b>
        </div>
        <div>
          <p>Das ausgewählte Bild wird im Startmenü angezeigt.</p>
          <div className="cp-picture-grid xp-scroll" role="listbox" aria-label="Bilder">
            {options.map((o) => (
              <button
                key={o.value}
                role="option"
                aria-selected={choice === o.value}
                className={choice === o.value ? 'selected' : ''}
                title={o.label}
                onClick={() => setChoice(o.value)}
                onDoubleClick={save}
              >
                <img src={o.url} alt={o.label} />
              </button>
            ))}
          </div>
          <button className="xp-link cp-browse" onClick={() => fileRef.current?.click()}>
            Nach weiteren Bildern suchen…
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={onFile} />
          {error && <p className="xp-error-text">{error}</p>}
          <div className="dialog-buttons" style={{ justifyContent: 'flex-end', padding: '12px 0 0' }}>
            <button className="xp-button default" onClick={save} disabled={busy}>
              Bild ändern
            </button>
            <button className="xp-button" onClick={onDone}>
              Abbrechen
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function UntisTab({ user }: { user: User }) {
  const setUser = useAuthStore((s) => s.setUser);
  const [form, setForm] = useState({ server: '', school: '', username: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'live' | 'demo'>('live');

  useEffect(() => {
    api<{ mode: 'live' | 'demo' }>('/untis/status').then((s) => setMode(s.mode)).catch(() => {});
  }, []);

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function link(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api<{ user: User }>('/untis/link', { method: 'POST', body: form });
      setUser(res.user);
      setForm({ server: '', school: '', username: '', password: '' });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    const res = await api<{ user: User }>('/untis/link', { method: 'DELETE' });
    setUser(res.user);
  }

  return (
    <>
      <h1 className="cp-heading">Untis-Verknüpfung</h1>
      <p>
        Verknüpfen Sie Ihr OSSXP-Konto mit Ihrem WebUntis-Zugang, um <b>UntisXP</b> zu verwenden. Ihr Untis-Passwort wird
        geprüft und anschließend verschlüsselt auf dem Server gespeichert.
      </p>
      {mode === 'demo' && (
        <p className="cp-hint">
          Der Server läuft im <b>Demo-Modus</b>: Beliebige Zugangsdaten werden akzeptiert und ein Beispiel-Stundenplan
          angezeigt.
        </p>
      )}

      {user.untisLinked && user.untis ? (
        <fieldset className="xp-fieldset">
          <legend>Aktuelle Verknüpfung</legend>
          <div className="cp-linked">
            <img src={iconLink} alt="" />
            <div>
              <div>
                <b>{user.untis.username}</b> @ {user.untis.school}
              </div>
              <div style={{ color: '#555' }}>{user.untis.server}</div>
            </div>
          </div>
          <div className="dialog-buttons" style={{ justifyContent: 'flex-start', padding: '8px 0' }}>
            <button className="xp-button default" onClick={() => launchApp('untisxp')}>
              UntisXP öffnen
            </button>
            <button className="xp-button" onClick={unlink}>
              Verknüpfung aufheben
            </button>
          </div>
        </fieldset>
      ) : (
        <form className="xp-fieldset" onSubmit={link}>
          <legend>Neue Verknüpfung</legend>
          <label className="xp-field">
            <span>WebUntis-Server:</span>
            <input className="xp-input" placeholder="z. B. nessa.webuntis.com" value={form.server} onChange={update('server')} required />
          </label>
          <label className="xp-field">
            <span>Schule:</span>
            <input className="xp-input" placeholder="Schulname aus der WebUntis-URL" value={form.school} onChange={update('school')} />
          </label>
          <label className="xp-field">
            <span>Benutzername:</span>
            <input className="xp-input" value={form.username} onChange={update('username')} autoComplete="off" required />
          </label>
          <label className="xp-field">
            <span>Passwort:</span>
            <input className="xp-input" type="password" value={form.password} onChange={update('password')} autoComplete="off" required />
          </label>
          <p className="cp-hint">
            Tipp: Sie können auch die komplette WebUntis-Adresse aus der Browserzeile einfügen – Server und Schule werden
            dann automatisch erkannt.
          </p>
          {error && <p className="xp-error-text">{error}</p>}
          <div style={{ textAlign: 'right', paddingBottom: 6 }}>
            <button className="xp-button default" disabled={busy}>
              {busy ? 'Wird geprüft…' : 'Verknüpfen'}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
