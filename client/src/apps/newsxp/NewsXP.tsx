/**
 * NewsXP – Neuigkeiten und Poster der Schule im Stil von Outlook Express:
 * links die Liste, rechts das Lesefenster. Admins (ADMIN_USERNAMES) können News mit Bild veröffentlichen.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../../core/api';
import type { AppWindowProps } from '../../core/types';
import { UserName } from '../../components/user/UserBits';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import './newsxp.css';

interface NewsItem {
  id: number;
  title: string;
  body: string;
  hasImage: boolean;
  createdAt: number;
  author: { username: string; color: string } | null;
}

export default function NewsXP(_props: AppWindowProps) {
  const isAdmin = useAuthStore((s) => s.user?.isAdmin ?? false);
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [composing, setComposing] = useState(false);

  const load = useCallback(
    () =>
      api<{ items: NewsItem[] }>('/news').then((r) => {
        setItems(r.items);
        setSelected((s) => s ?? r.items[0]?.id ?? null);
      }),
    [],
  );
  useEffect(() => void load(), [load]);

  const current = items?.find((n) => n.id === selected) ?? null;

  function remove(n: NewsItem) {
    useUiStore.getState().showMessage({
      title: 'NewsXP',
      icon: 'warning',
      text: `„${n.title}“ löschen?`,
      buttons: [
        { label: 'Löschen', primary: true, action: () => api(`/news/${n.id}`, { method: 'DELETE' }).then(() => (setSelected(null), load())) },
        { label: 'Abbrechen' },
      ],
    });
  }

  return (
    <div className="nx">
      <div className="nx-toolbar">
        {isAdmin && (
          <button className="ux-tool" onClick={() => setComposing(true)}>
            ✉ Neue Nachricht
          </button>
        )}
        <button className="ux-tool" onClick={load}>
          ↻ Aktualisieren
        </button>
        {isAdmin && current && (
          <button className="ux-tool" onClick={() => remove(current)}>
            ✕ Löschen
          </button>
        )}
      </div>

      {composing ? (
        <Composer onDone={(id) => (setComposing(false), id && (setSelected(id), load()))} />
      ) : !items ? (
        <p className="nx-empty">Wird geladen…</p>
      ) : items.length === 0 ? (
        <div className="nx-empty">
          <svg width="64" height="64" viewBox="0 0 48 48" aria-hidden>
            <rect x="6" y="9" width="36" height="30" rx="2" fill="#fff" stroke="#59657a" />
            <rect x="10" y="13" width="28" height="6" fill="#2f6fde" />
            <path d="M10 24h28M10 28h28M10 32h20" stroke="#aab3c4" strokeWidth="2" />
          </svg>
          <b>Noch keine Neuigkeiten.</b>
          <span>Hier erscheinen bald News und Poster der HTL Hollabrunn.</span>
        </div>
      ) : (
        <div className="nx-split">
          <ul className="nx-list xp-scroll">
            {items.map((n) => (
              <li key={n.id} className={n.id === selected ? 'selected' : ''} onClick={() => setSelected(n.id)}>
                <b>{n.title}</b>
                <span>{new Date(n.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
              </li>
            ))}
          </ul>
          <article className="nx-reader xp-scroll">
            {current && (
              <>
                <header className="nx-head">
                  <div>
                    <b>Von:</b> {current.author ? <UserName username={current.author.username} color={current.author.color} /> : 'OSSXP'}
                  </div>
                  <div>
                    <b>Datum:</b> {new Date(current.createdAt).toLocaleString('de-DE')}
                  </div>
                  <div>
                    <b>Betreff:</b> {current.title}
                  </div>
                </header>
                <div className="nx-body selectable">
                  <h1>{current.title}</h1>
                  {current.hasImage && <img className="nx-image" src={`/api/news/${current.id}/image`} alt={current.title} />}
                  <p>{current.body}</p>
                </div>
              </>
            )}
          </article>
        </div>
      )}
    </div>
  );
}

function Composer({ onDone }: { onDone: (id?: number) => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData();
    form.set('title', title);
    form.set('body', body);
    if (image) form.set('image', image);
    try {
      const res = await api<{ id: number }>('/news', { method: 'POST', body: form });
      onDone(res.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="nx-compose" onSubmit={submit}>
      <label className="xp-field">
        <span>Betreff:</span>
        <input className="xp-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} required />
      </label>
      <label className="xp-field">
        <span>Bild / Poster:</span>
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
      </label>
      <textarea className="xp-input nx-textarea" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Nachricht…" />
      {error && <p className="xp-error-text">{error}</p>}
      <div className="dialog-buttons" style={{ justifyContent: 'flex-end' }}>
        <button className="xp-button default" disabled={busy}>
          Veröffentlichen
        </button>
        <button type="button" className="xp-button" onClick={() => onDone()}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}
