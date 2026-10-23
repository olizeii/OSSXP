/**
 * NewsXP – Neuigkeiten und Poster der Schule im Stil von Outlook Express:
 * oben Ordner (Alle / Neuigkeiten / Poster), links die Liste, rechts das Lesefenster mit Kommentaren.
 *
 * Admins öffnen über „Verwaltung“ ein eigenes XP-Dialogfenster mit drei Registerkarten:
 * Beiträge (bearbeiten, anpinnen, löschen), Verfassen (Text + Bild/Poster) und Kommentare (moderieren).
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../../core/api';
import type { AppWindowProps } from '../../core/types';
import { Anonymous, UserName } from '../../components/user/UserBits';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import './newsxp.css';

type Kind = 'news' | 'poster';

interface NewsItem {
  id: number;
  title: string;
  body: string;
  kind: Kind;
  pinned: boolean;
  hasImage: boolean;
  createdAt: number;
  updatedAt: number | null;
  commentCount: number;
  author: { username: string; color: string } | null;
}

interface NewsComment {
  id: number;
  newsId: number;
  newsTitle?: string;
  body: string;
  createdAt: number;
  author: { username: string; color: string } | null;
  canDelete: boolean;
}

const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
/** Bild-URL mit Zeitstempel, damit ein ersetztes Bild nicht aus dem Cache kommt. */
const imageUrl = (n: NewsItem) => `/api/news/${n.id}/image?v=${n.updatedAt ?? n.createdAt}`;

function confirm(text: string, run: () => void) {
  useUiStore.getState().showMessage({
    title: 'NewsXP',
    icon: 'warning',
    text,
    buttons: [{ label: 'Löschen', primary: true, action: run }, { label: 'Abbrechen' }],
  });
}

const showError = (e: unknown) => useUiStore.getState().showMessage({ title: 'NewsXP', icon: 'error', text: (e as Error).message });

export default function NewsXP(_props: AppWindowProps) {
  const isAdmin = useAuthStore((s) => s.user?.isAdmin ?? false);
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [folder, setFolder] = useState<'all' | Kind>('all');
  const [admin, setAdmin] = useState(false);

  const load = useCallback(
    () =>
      api<{ items: NewsItem[] }>('/news').then((r) => {
        setItems(r.items);
        setSelected((s) => (s && r.items.some((n) => n.id === s) ? s : (r.items[0]?.id ?? null)));
      }),
    [],
  );
  useEffect(() => void load(), [load]);

  const visible = items?.filter((n) => folder === 'all' || n.kind === folder) ?? null;
  const current = items?.find((n) => n.id === selected) ?? null;

  return (
    <div className="nx">
      <div className="nx-toolbar">
        {isAdmin && (
          <button className="ux-tool" onClick={() => setAdmin(true)} title="Beiträge, Poster und Kommentare verwalten">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
              <rect x="3" y="5" width="18" height="14" rx="1.5" fill="#fff" stroke="#4a6aa5" />
              <rect x="3" y="5" width="18" height="4" fill="#2f6fde" />
              <circle cx="17" cy="16" r="5" fill="#f3b33d" stroke="#a66d00" />
              <path d="M17 13.5v5M14.5 16h5" stroke="#fff" strokeWidth="1.8" />
            </svg>
            Verwaltung
          </button>
        )}
        <button className="ux-tool" onClick={load}>
          ↻ Aktualisieren
        </button>
        <div className="nx-folders" role="tablist">
          {(
            [
              ['all', 'Alle'],
              ['news', 'Neuigkeiten'],
              ['poster', 'Poster'],
            ] as const
          ).map(([f, label]) => (
            <button key={f} role="tab" aria-selected={folder === f} className={folder === f ? 'active' : ''} onClick={() => setFolder(f)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {!visible ? (
        <p className="nx-empty">Wird geladen…</p>
      ) : visible.length === 0 ? (
        <div className="nx-empty">
          <svg width="64" height="64" viewBox="0 0 48 48" aria-hidden>
            <rect x="6" y="9" width="36" height="30" rx="2" fill="#fff" stroke="#59657a" />
            <rect x="10" y="13" width="28" height="6" fill="#2f6fde" />
            <path d="M10 24h28M10 28h28M10 32h20" stroke="#aab3c4" strokeWidth="2" />
          </svg>
          <b>{folder === 'poster' ? 'Noch keine Poster.' : 'Noch keine Neuigkeiten.'}</b>
          <span>Hier erscheinen bald News und Poster der HTL Hollabrunn.</span>
          {isAdmin && (
            <button className="xp-button" onClick={() => setAdmin(true)}>
              Ersten Beitrag verfassen…
            </button>
          )}
        </div>
      ) : (
        <div className="nx-split">
          <ul className="nx-list xp-scroll">
            {visible.map((n) => (
              <li key={n.id} className={n.id === selected ? 'selected' : ''} onClick={() => setSelected(n.id)}>
                <b>
                  {n.pinned && <span title="Angepinnt">📌 </span>}
                  {n.kind === 'poster' && <span className="nx-kind">Poster</span>}
                  {n.title}
                </b>
                <span>
                  {fmtDate(n.createdAt)} · {n.commentCount} {n.commentCount === 1 ? 'Kommentar' : 'Kommentare'}
                </span>
              </li>
            ))}
          </ul>
          <article className="nx-reader xp-scroll">{current && <Reader key={current.id} item={current} onCommentsChanged={load} />}</article>
        </div>
      )}

      {admin && <AdminDialog items={items ?? []} onChanged={load} onOpen={(id) => (setSelected(id), setFolder('all'), setAdmin(false))} onClose={() => setAdmin(false)} />}
    </div>
  );
}

// ─── Lesefenster mit Kommentaren ───────────────────────────────────────────

function Reader({ item, onCommentsChanged }: { item: NewsItem; onCommentsChanged: () => void }) {
  const user = useAuthStore((s) => s.user);
  const [comments, setComments] = useState<NewsComment[] | null>(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => api<{ comments: NewsComment[] }>(`/news/${item.id}/comments`).then((r) => setComments(r.comments)), [item.id]);
  useEffect(() => void load().catch(() => setComments([])), [load, user?.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api(`/news/${item.id}/comments`, { method: 'POST', body: { body } });
      setBody('');
      load();
      onCommentsChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <header className="nx-head">
        <div>
          <b>Von:</b> {item.author ? <UserName username={item.author.username} color={item.author.color} /> : 'OSSXP'}
        </div>
        <div>
          <b>Datum:</b> {new Date(item.createdAt).toLocaleString('de-DE')}
          {item.updatedAt && <span className="nx-muted"> (bearbeitet {new Date(item.updatedAt).toLocaleString('de-DE')})</span>}
        </div>
        <div>
          <b>Betreff:</b> {item.title}
        </div>
      </header>
      <div className={`nx-body selectable ${item.kind === 'poster' ? 'poster' : ''}`}>
        <h1>{item.title}</h1>
        {item.hasImage && (
          <a href={imageUrl(item)} target="_blank" rel="noreferrer" title="In voller Größe öffnen">
            <img className="nx-image" src={imageUrl(item)} alt={item.title} />
          </a>
        )}
        {item.body && <p>{item.body}</p>}
      </div>

      <section className="nx-comments">
        <h3>Kommentare ({comments?.length ?? item.commentCount})</h3>
        {comments?.length === 0 && <p className="nx-muted">Noch keine Kommentare.</p>}
        <ul>
          {comments?.map((c) => (
            <li key={c.id}>
              <div className="nx-comment-head">
                {c.author ? <UserName username={c.author.username} color={c.author.color} /> : <Anonymous />}
                <span className="nx-muted">{new Date(c.createdAt).toLocaleString('de-DE')}</span>
                {c.canDelete && (
                  <button
                    className="ux-link nx-delete"
                    onClick={() => confirm('Diesen Kommentar löschen?', () => api(`/news/comments/${c.id}`, { method: 'DELETE' }).then(() => (load(), onCommentsChanged()), showError))}
                  >
                    Löschen
                  </button>
                )}
              </div>
              <p className="selectable">{c.body}</p>
            </li>
          ))}
        </ul>
        {user ? (
          <form className="nx-comment-form" onSubmit={submit}>
            <textarea className="xp-input" placeholder="Kommentar schreiben…" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} />
            {error && <span className="xp-error-text">{error}</span>}
            <button className="xp-button default" disabled={!body.trim()}>
              Kommentieren
            </button>
          </form>
        ) : (
          <p className="nx-muted">
            <button className="ux-link" onClick={() => useUiStore.getState().openLogin()}>
              Anmelden
            </button>
            , um zu kommentieren.
          </p>
        )}
      </section>
    </>
  );
}

// ─── Verwaltung (nur Admins) ───────────────────────────────────────────────

type AdminTab = 'posts' | 'compose' | 'comments';

function AdminDialog({ items, onChanged, onOpen, onClose }: { items: NewsItem[]; onChanged: () => void; onOpen: (id: number) => void; onClose: () => void }) {
  const [tab, setTab] = useState<AdminTab>('posts');
  const [editing, setEditing] = useState<NewsItem | null>(null);

  const edit = (n: NewsItem | null) => (setEditing(n), setTab('compose'));

  async function togglePin(n: NewsItem) {
    const form = new FormData();
    form.set('title', n.title);
    form.set('body', n.body);
    form.set('kind', n.kind);
    form.set('pinned', String(!n.pinned));
    await api(`/news/${n.id}`, { method: 'PATCH', body: form }).then(onChanged, showError);
  }

  return (
    <div className="nx-overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="xp-window xp-dialog nx-admin" role="dialog" aria-label="NewsXP-Verwaltung">
        <header className="title-bar">
          <span className="title-bar-text">NewsXP – Verwaltung</span>
          <div className="title-bar-controls">
            <button className="close" aria-label="Schließen" onClick={onClose}>
              <svg width="11" height="11" viewBox="0 0 11 11">
                <path d="M2 2l7 7M9 2l-7 7" stroke="#fff" strokeWidth="2" />
              </svg>
            </button>
          </div>
        </header>
        <div className="window-body nx-admin-body">
          <div className="nx-tabs" role="tablist">
            {(
              [
                ['posts', 'Beiträge'],
                ['compose', editing ? 'Bearbeiten' : 'Verfassen'],
                ['comments', 'Kommentare'],
              ] as [AdminTab, string][]
            ).map(([t, label]) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => (t === 'compose' && tab !== 'compose' && setEditing(null), setTab(t))}>
                {label}
              </button>
            ))}
          </div>
          <div className="nx-tabpanel xp-scroll">
            {tab === 'posts' && (
              <>
                <div className="nx-admin-actions">
                  <button className="xp-button default" onClick={() => edit(null)}>
                    Neuer Beitrag…
                  </button>
                  <span className="nx-muted">{items.length} Beiträge · angepinnte stehen immer oben</span>
                </div>
                <table className="nx-table">
                  <thead>
                    <tr>
                      <th>Titel</th>
                      <th>Art</th>
                      <th>Datum</th>
                      <th>💬</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((n) => (
                      <tr key={n.id}>
                        <td>
                          {n.pinned && '📌 '}
                          <button className="ux-link" onClick={() => onOpen(n.id)} title="Im Lesefenster öffnen">
                            {n.title}
                          </button>
                        </td>
                        <td>{n.kind === 'poster' ? 'Poster' : 'News'}</td>
                        <td className="ux-nowrap">{fmtDate(n.createdAt)}</td>
                        <td>{n.commentCount}</td>
                        <td className="ux-nowrap">
                          <button className="ux-link" onClick={() => edit(n)}>
                            Bearbeiten
                          </button>
                          {' · '}
                          <button className="ux-link" onClick={() => togglePin(n)}>
                            {n.pinned ? 'Lösen' : 'Anpinnen'}
                          </button>
                          {' · '}
                          <button className="ux-link nx-delete" onClick={() => confirm(`„${n.title}“ samt Kommentaren löschen?`, () => api(`/news/${n.id}`, { method: 'DELETE' }).then(onChanged, showError))}>
                            Löschen
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {items.length === 0 && <p className="nx-muted">Noch nichts veröffentlicht.</p>}
              </>
            )}
            {tab === 'compose' && (
              <Composer
                key={editing?.id ?? 'new'}
                item={editing}
                onDone={(id) => {
                  setEditing(null);
                  setTab('posts');
                  if (id) (onChanged(), onOpen(id));
                }}
              />
            )}
            {tab === 'comments' && <CommentModeration onChanged={onChanged} onOpen={onOpen} />}
          </div>
          <div className="dialog-buttons nx-admin-footer">
            <button className="xp-button" onClick={onClose}>
              Schließen
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Composer({ item, onDone }: { item: NewsItem | null; onDone: (id?: number) => void }) {
  const [title, setTitle] = useState(item?.title ?? '');
  const [body, setBody] = useState(item?.body ?? '');
  const [kind, setKind] = useState<Kind>(item?.kind ?? 'news');
  const [pinned, setPinned] = useState(item?.pinned ?? false);
  const [image, setImage] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Vorschau des gewählten Bildes (oder des bestehenden)
  useEffect(() => {
    if (!image) return setPreview(item?.hasImage && !removeImage ? imageUrl(item) : null);
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image, item, removeImage]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData();
    form.set('title', title);
    form.set('body', body);
    form.set('kind', kind);
    form.set('pinned', String(pinned));
    if (image) form.set('image', image);
    if (removeImage && !image) form.set('removeImage', 'true');
    try {
      if (item) {
        await api(`/news/${item.id}`, { method: 'PATCH', body: form });
        onDone(item.id);
      } else {
        const res = await api<{ id: number }>('/news', { method: 'POST', body: form });
        onDone(res.id);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="nx-compose" onSubmit={submit}>
      <div className="nx-compose-grid">
        <div className="nx-compose-fields">
          <label className="xp-field">
            <span>Betreff:</span>
            <input className="xp-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} required />
          </label>
          <fieldset className="xp-fieldset">
            <legend>Art</legend>
            <label>
              <input type="radio" name="nx-kind" checked={kind === 'news'} onChange={() => setKind('news')} /> Neuigkeit (Text, optional mit Bild)
            </label>
            <label>
              <input type="radio" name="nx-kind" checked={kind === 'poster'} onChange={() => setKind('poster')} /> Poster (Bild im Vordergrund)
            </label>
          </fieldset>
          <label className="nx-check">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Oben anpinnen
          </label>
          <label className="xp-field">
            <span>Bild:</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => (setImage(e.target.files?.[0] ?? null), setRemoveImage(false))} />
          </label>
          {item?.hasImage && !image && (
            <label className="nx-check">
              <input type="checkbox" checked={removeImage} onChange={(e) => setRemoveImage(e.target.checked)} /> Vorhandenes Bild entfernen
            </label>
          )}
        </div>
        <div className="nx-preview" aria-label="Bildvorschau">
          {preview ? <img src={preview} alt="Vorschau" /> : <span>{kind === 'poster' ? 'Poster brauchen ein Bild' : 'Kein Bild'}</span>}
        </div>
      </div>
      <textarea className="xp-input nx-textarea" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Nachricht…" maxLength={20000} />
      {error && <p className="xp-error-text">{error}</p>}
      <div className="dialog-buttons" style={{ justifyContent: 'flex-end' }}>
        <button className="xp-button default" disabled={busy}>
          {item ? 'Speichern' : 'Veröffentlichen'}
        </button>
        <button type="button" className="xp-button" onClick={() => onDone()}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}

function CommentModeration({ onChanged, onOpen }: { onChanged: () => void; onOpen: (id: number) => void }) {
  const [comments, setComments] = useState<NewsComment[] | null>(null);
  const [filter, setFilter] = useState('');
  const load = useCallback(() => api<{ comments: NewsComment[] }>('/news/admin/comments').then((r) => setComments(r.comments), showError), []);
  useEffect(() => void load(), [load]);

  const q = filter.trim().toLowerCase();
  const shown = comments?.filter((c) => !q || c.body.toLowerCase().includes(q) || c.author?.username.toLowerCase().includes(q) || c.newsTitle?.toLowerCase().includes(q));

  if (!shown) return <p className="nx-muted">Wird geladen…</p>;
  return (
    <>
      <div className="nx-admin-actions">
        <input className="xp-input" placeholder="Filtern nach Text, Name oder Beitrag…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <span className="nx-muted">die neuesten 200</span>
      </div>
      {shown.length === 0 ? (
        <p className="nx-muted">Keine Kommentare.</p>
      ) : (
        <ul className="nx-mod-list">
          {shown.map((c) => (
            <li key={c.id}>
              <div className="nx-comment-head">
                {c.author ? <UserName username={c.author.username} color={c.author.color} /> : <Anonymous />}
                <span className="nx-muted">
                  zu{' '}
                  <button className="ux-link" onClick={() => onOpen(c.newsId)}>
                    {c.newsTitle}
                  </button>{' '}
                  · {new Date(c.createdAt).toLocaleString('de-DE')}
                </span>
                <button className="ux-link nx-delete" onClick={() => confirm('Diesen Kommentar löschen?', () => api(`/news/comments/${c.id}`, { method: 'DELETE' }).then(() => (load(), onChanged()), showError))}>
                  Löschen
                </button>
              </div>
              <p className="selectable">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
