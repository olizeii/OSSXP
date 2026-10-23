/**
 * MollyXP – Tests & Mitschriften teilen, im Look des XP-Explorers:
 * Schule wählen → Klassenordner → Registerkarten „Tests“ und „Mitschriften“.
 *
 * Ansehen geht ohne Login. Hochladen nur mit Untis-Verknüpfung – und zwar automatisch in die eigene
 * Klasse, die der SERVER über Untis bestimmt. Anonym ist voreingestellt.
 * Economy: Der Server bucht „molly.upload“ (Coins/XP) beim Hochladen und meldet sie live –
 * die Antwort enthält zusätzlich `reward`, damit das Formular eine Bestätigung zeigen kann.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../../core/api';
import { launchApp } from '../../core/launcher';
import type { AppWindowProps } from '../../core/types';
import { Anonymous, CoinIcon, UserName } from '../../components/user/UserBits';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { useWindowStore } from '../../store/windowStore';
import '../account/account.css';
import './mollyxp.css';

type Kind = 'test' | 'notes';

interface School {
  id: string;
  name: string;
}

interface ClassInfo {
  name: string;
  longName?: string | null;
  tests: number;
  notes: number;
}

interface Upload {
  id: number;
  kind: Kind;
  title: string;
  subject: string;
  description: string;
  fileName: string;
  mime: string;
  size: number;
  views: number;
  createdAt: number;
  author: { username: string; color: string } | null;
  mine: boolean;
  canDelete: boolean;
}

interface MyClass {
  canUpload: boolean;
  reason?: string;
  school?: string;
  schoolName?: string;
  className?: string;
}

const KIND_LABEL: Record<Kind, string> = { test: 'Tests', notes: 'Mitschriften' };
const formatSize = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default function MollyXP({ windowId }: AppWindowProps) {
  const user = useAuthStore((s) => s.user);
  const [schools, setSchools] = useState<School[]>([]);
  const [school, setSchool] = useState<string>('htl-hl');
  const [classes, setClasses] = useState<ClassInfo[] | null>(null);
  const [className, setClassName] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>('test');
  const [items, setItems] = useState<Upload[] | null>(null);
  const [me, setMe] = useState<MyClass | null>(null);
  const [uploading, setUploading] = useState(false);

  // Schulen laden; mit Untis-Verknüpfung automatisch die eigene Schule wählen
  useEffect(() => {
    api<{ schools: School[]; mySchool: string | null }>('/molly/schools').then((r) => {
      setSchools(r.schools);
      if (r.mySchool) setSchool(r.mySchool);
    });
  }, [user?.id]);

  // Eigene Klasse über Untis prüfen (aktualisiert dabei auch die Klassenliste der Schule)
  useEffect(() => {
    if (!user) return setMe(null);
    api<MyClass>('/molly/me').then(setMe, () => setMe({ canUpload: false, reason: 'Untis-Prüfung fehlgeschlagen.' }));
  }, [user]);

  const loadClasses = useCallback(() => {
    setClasses(null);
    api<{ classes: ClassInfo[] }>(`/molly/classes?school=${encodeURIComponent(school)}`).then((r) => setClasses(r.classes));
  }, [school]);
  useEffect(loadClasses, [loadClasses, me]);

  const loadItems = useCallback(() => {
    if (!className) return;
    setItems(null);
    const q = new URLSearchParams({ school, class: className, kind });
    api<{ items: Upload[] }>(`/molly/uploads?${q}`).then((r) => setItems(r.items));
  }, [school, className, kind]);
  useEffect(loadItems, [loadItems]);

  useEffect(() => {
    useWindowStore.getState().setTitle(windowId, `MollyXP${className ? ` – ${className}` : ''}`);
  }, [windowId, className]);

  const schoolName = schools.find((s) => s.id === school)?.name ?? school;
  const ownClass = me?.canUpload && me.school === school ? me.className : null;

  return (
    <div className="mx">
      {/* ── Symbol- und Adressleiste ── */}
      <div className="mx-toolbar">
        <button className="ux-tool" disabled={!className} onClick={() => setClassName(null)}>
          ◄ Zurück
        </button>
        <span className="mx-sep" />
        <label className="mx-school">
          Schule:
          <select className="xp-select" value={school} onChange={(e) => (setSchool(e.target.value), setClassName(null))}>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <span className="mx-sep" />
        <button className="ux-tool" onClick={() => (user ? setUploading(true) : useUiStore.getState().openLogin())} disabled={Boolean(user) && !me?.canUpload}>
          ⇧ Hochladen
        </button>
      </div>
      <div className="mx-address">
        <span className="ux-muted">Adresse</span>
        <div className="mx-address-field">
          MollyXP › {schoolName}
          {className ? ` › ${className} › ${KIND_LABEL[kind]}` : ''}
        </div>
      </div>

      <div className="mx-main">
        <aside className="cp-taskpane xp-scroll">
          <div className="cp-box">
            <div className="cp-box-title">Datei- und Ordneraufgaben</div>
            <div className="cp-box-body mx-box">
              {!user ? (
                <>
                  <span>Zum Hochladen anmelden und Untis verknüpfen.</span>
                  <button className="cp-task" onClick={() => useUiStore.getState().openLogin()}>
                    Anmelden
                  </button>
                </>
              ) : me === null ? (
                <span>Klasse wird über Untis geprüft…</span>
              ) : me.canUpload ? (
                <>
                  <span>
                    Deine Klasse laut Untis: <b>{me.className}</b>
                  </span>
                  <button className="cp-task" onClick={() => setUploading(true)}>
                    Test oder Mitschrift hochladen
                  </button>
                  {className !== me.className && (
                    <button className="cp-task" onClick={() => (setSchool(me.school!), setClassName(me.className!))}>
                      Zu meiner Klasse
                    </button>
                  )}
                </>
              ) : (
                <>
                  <span>{me.reason}</span>
                  <button className="cp-task" onClick={() => launchApp('account', { tab: 'untis' })}>
                    Untis verknüpfen
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="cp-box">
            <div className="cp-box-title">Hinweise</div>
            <div className="cp-box-body mx-box">
              <span>Uploads sind standardmäßig anonym.</span>
              <span>Bitte nur eigene Mitschriften und Tests teilen – und Namen auf Tests vorher unkenntlich machen.</span>
            </div>
          </div>
        </aside>

        <main className="mx-content xp-scroll">
          {!className ? (
            <ClassFolders classes={classes} ownClass={ownClass} onOpen={setClassName} />
          ) : (
            <>
              <div className="mx-tabs" role="tablist">
                {(['test', 'notes'] as Kind[]).map((k) => (
                  <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
              <div className="mx-tabpanel">
                <FileList items={items} onChanged={() => (loadItems(), loadClasses())} kind={kind} className={className} />
              </div>
            </>
          )}
        </main>
      </div>

      <div className="xp-statusbar">
        <span>{className ? `${items?.length ?? 0} Objekt(e)` : `${classes?.length ?? 0} Klassen`}</span>
        <span style={{ flex: '0 0 220px' }}>{ownClass ? `Hochladen in ${ownClass} möglich` : 'Nur ansehen'}</span>
      </div>

      {uploading && me?.canUpload && (
        <UploadDialog
          me={me}
          defaultKind={kind}
          onClose={() => setUploading(false)}
          onUploaded={(k) => {
            setUploading(false);
            setSchool(me.school!);
            setClassName(me.className!);
            setKind(k);
            loadItems();
            loadClasses();
          }}
        />
      )}
    </div>
  );
}

// ─── Klassenordner ─────────────────────────────────────────────────────────

function ClassFolders({ classes, ownClass, onOpen }: { classes: ClassInfo[] | null; ownClass: string | null | undefined; onOpen: (c: string) => void }) {
  if (!classes) return <p className="ux-muted mx-pad">Wird geladen…</p>;
  if (classes.length === 0) {
    return (
      <div className="mx-empty">
        <b>Noch keine Klassen bekannt.</b>
        <span>Sobald sich jemand dieser Schule mit Untis verknüpft und MollyXP öffnet, erscheinen hier die Klassen.</span>
      </div>
    );
  }
  return (
    <ul className="mx-folders">
      {classes.map((c) => (
        <li key={c.name}>
          <button className={`mx-folder ${c.name === ownClass ? 'own' : ''}`} onDoubleClick={() => onOpen(c.name)} onClick={() => onOpen(c.name)} title={c.longName ?? c.name}>
            <FolderIcon filled={c.tests + c.notes > 0} />
            <span>
              <b>{c.name}</b>
              <span className="ux-muted">
                {c.tests} Tests · {c.notes} Mitschriften
              </span>
              {c.name === ownClass && <span className="mx-own">Meine Klasse</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Gelber XP-Ordner (mit Blättern, wenn etwas drin ist). */
function FolderIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="40" height="40" viewBox="0 0 48 48" aria-hidden>
      <defs>
        <linearGradient id="mx-f-back" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe089" />
          <stop offset="1" stopColor="#e3a90f" />
        </linearGradient>
        <linearGradient id="mx-f-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff2b8" />
          <stop offset=".5" stopColor="#ffd453" />
          <stop offset="1" stopColor="#e8a710" />
        </linearGradient>
      </defs>
      <path d="M4 10.5a2 2 0 0 1 2-2h11l3 3h20a2 2 0 0 1 2 2V39H4Z" fill="url(#mx-f-back)" stroke="#a87300" />
      {filled && <path d="M11 8h24v20H11Z" fill="#fff" stroke="#8a93a6" />}
      <path d="M3 19.5a2 2 0 0 1 2-2h38a2 2 0 0 1 2 2.3L42.5 39.5a2 2 0 0 1-2 1.5h-33a2 2 0 0 1-2-1.6Z" fill="url(#mx-f-front)" stroke="#a87300" />
    </svg>
  );
}

// ─── Dateiliste ────────────────────────────────────────────────────────────

function FileList({ items, onChanged, kind, className }: { items: Upload[] | null; onChanged: () => void; kind: Kind; className: string }) {
  const [selected, setSelected] = useState<number | null>(null);
  const open = (u: Upload) => window.open(`/api/molly/files/${u.id}`, '_blank', 'noopener');

  async function remove(u: Upload) {
    useUiStore.getState().showMessage({
      title: 'Löschen bestätigen',
      icon: 'warning',
      text: `„${u.title}“ wirklich löschen?`,
      buttons: [
        {
          label: 'Löschen',
          primary: true,
          action: () => api(`/molly/uploads/${u.id}`, { method: 'DELETE' }).then(onChanged),
        },
        { label: 'Abbrechen' },
      ],
    });
  }

  if (!items) return <p className="ux-muted mx-pad">Wird geladen…</p>;
  if (items.length === 0) {
    return (
      <div className="mx-empty">
        <b>Noch keine {KIND_LABEL[kind]} für {className}.</b>
        <span>Hilf deinen Mitschüler:innen und teile deine Unterlagen!</span>
      </div>
    );
  }
  return (
    <table className="mx-list">
      <thead>
        <tr>
          <th>Name</th>
          <th>Fach</th>
          <th>Von</th>
          <th>Datum</th>
          <th>Größe</th>
          <th>Aufrufe</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {items.map((u) => (
          <tr key={u.id} className={selected === u.id ? 'selected' : ''} onClick={() => setSelected(u.id)} onDoubleClick={() => open(u)} title={u.description || u.fileName}>
            <td>
              <span className={`mx-file ${u.mime === 'application/pdf' ? 'pdf' : 'img'}`}>{u.mime === 'application/pdf' ? 'PDF' : 'IMG'}</span>
              <b>{u.title}</b>
            </td>
            <td>{u.subject || '–'}</td>
            <td>{u.author ? <UserName username={u.author.username} color={u.author.color} /> : <Anonymous />}</td>
            <td className="ux-nowrap">{new Date(u.createdAt).toLocaleDateString('de-DE')}</td>
            <td className="ux-nowrap">{formatSize(u.size)}</td>
            <td>{u.views}</td>
            <td className="ux-nowrap">
              <button className="ux-link" onClick={() => open(u)}>
                Öffnen
              </button>
              {u.canDelete && (
                <>
                  {' · '}
                  <button className="ux-link" style={{ color: '#b02a2a' }} onClick={() => remove(u)} title={u.mine ? 'Eigenen Upload löschen' : 'Als Moderation entfernen'}>
                    Löschen
                  </button>
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Hochladen ─────────────────────────────────────────────────────────────

function UploadDialog({ me, defaultKind, onClose, onUploaded }: { me: MyClass; defaultKind: Kind; onClose: () => void; onUploaded: (k: Kind) => void }) {
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [anonymous, setAnonymous] = useState(true); // Standard: anonym
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return setError('Bitte eine Datei auswählen.');
    setBusy(true);
    setError('');
    const form = new FormData();
    form.set('file', file);
    form.set('kind', kind);
    form.set('title', title);
    form.set('subject', subject);
    form.set('description', description);
    form.set('anonymous', String(anonymous));
    try {
      const res = await api<{ reward: { coins: number; xp: number } | null }>('/molly/uploads', { method: 'POST', body: form });
      useUiStore.getState().showMessage({
        title: 'MollyXP',
        icon: 'info',
        text:
          `Danke fürs Teilen! „${title}“ ist jetzt in ${me.className} sichtbar${anonymous ? ' (anonym)' : ''}.` +
          (res.reward?.coins ? `\n\nDu hast ${res.reward.coins} Coins und ${res.reward.xp} XP bekommen.` : ''),
      });
      onUploaded(kind);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="xp-window xp-dialog mx-dialog" onSubmit={submit}>
        <header className="title-bar">
          <span className="title-bar-text">Datei hochladen – {me.className}</span>
          <div className="title-bar-controls">
            <button type="button" className="close" aria-label="Schließen" onClick={onClose}>
              <svg width="11" height="11" viewBox="0 0 11 11">
                <path d="M2 2l7 7M9 2l-7 7" stroke="#fff" strokeWidth="2" />
              </svg>
            </button>
          </div>
        </header>
        <div className="window-body mx-dialog-body">
          <fieldset className="xp-fieldset">
            <legend>Art</legend>
            <label className="mx-radio">
              <input type="radio" checked={kind === 'test'} onChange={() => setKind('test')} /> Test / Schularbeit
            </label>
            <label className="mx-radio">
              <input type="radio" checked={kind === 'notes'} onChange={() => setKind('notes')} /> Mitschrift
            </label>
          </fieldset>

          <label className="xp-field">
            <span>Titel:</span>
            <input className="xp-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. AM Schularbeit 1 – Lösungen" maxLength={120} required />
          </label>
          <label className="xp-field">
            <span>Fach:</span>
            <input className="xp-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="z. B. AM" maxLength={40} />
          </label>
          <label className="xp-field">
            <span>Beschreibung:</span>
            <input className="xp-input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
          </label>
          <label className="xp-field">
            <span>Datei (PDF/Bild):</span>
            <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
          </label>

          {kind === 'test' && (
            <div className="mx-warning">
              <b>Wichtig:</b> Achte darauf, dass auf dem Test <b>kein Name</b> (auch keine Unterschrift oder Schülernummer) zu sehen ist –
              vor dem Hochladen schwärzen oder abdecken.
            </div>
          )}

          <label className="mx-check">
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
            <span>
              <b>Anonym hochladen</b> (empfohlen) – dein Name wird nirgends angezeigt.
              <br />
              <span className="ux-muted">Intern wird gespeichert, wer hochgeladen hat, damit eigene Uploads gelöscht und Missbrauch gemeldet werden kann.</span>
            </span>
          </label>

          {error && <p className="xp-error-text">{error}</p>}
          <div className="dialog-buttons" style={{ justifyContent: 'space-between', padding: '8px 0 0' }}>
            <span className="mx-reward">
              <CoinIcon /> Für Uploads gibt es Coins und XP
            </span>
            <span>
              <button type="submit" className="xp-button default" disabled={busy}>
                {busy ? 'Wird hochgeladen…' : 'Hochladen'}
              </button>{' '}
              <button type="button" className="xp-button" onClick={onClose}>
                Abbrechen
              </button>
            </span>
          </div>
        </div>
      </form>
    </div>
  );
}
