/**
 * redXP – Reddit-artiges Forum im XP-Look.
 * Links die Subreddits, rechts Beiträge mit Up-/Downvotes, Detailansicht mit Kommentarbaum.
 *
 * Economy: Der Client meldet nur Aktionen (Beitrag, Kommentar, Stimme) an /api/red/*.
 * Coins/XP vergibt der Server (red.post, red.comment, red.upvote_received für den Autor)
 * und schickt sie live per `economy:update` an den economyStore – hier ist dafür kein Code nötig.
 */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '../../core/api';
import type { AppWindowProps } from '../../core/types';
import { Anonymous, UserName } from '../../components/user/UserBits';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { useWindowStore } from '../../store/windowStore';
import '../account/account.css';
import './redxp.css';

interface Sub {
  name: string;
  title: string;
  description: string;
  postCount: number;
}

interface Author {
  username: string;
  color: string;
}

interface Post {
  id: number;
  sub: string;
  title: string;
  body: string;
  score: number;
  commentCount: number;
  createdAt: number;
  author: Author | null;
  myVote: number;
}

interface Comment {
  id: number;
  parentId: number | null;
  body: string;
  score: number;
  createdAt: number;
  author: Author | null;
  myVote: number;
}

type Sort = 'hot' | 'new' | 'top';

/** „vor 5 Min.“, „vor 3 Std.“, „vor 2 Tagen“ */
export function timeAgo(ts: number) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'gerade eben';
  if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`;
  const d = Math.floor(s / 86400);
  return d < 30 ? `vor ${d} ${d === 1 ? 'Tag' : 'Tagen'}` : new Date(ts).toLocaleDateString('de-DE');
}

/** Ohne Login → Login-Dialog statt Aktion. */
function requireLogin(action: () => void) {
  if (useAuthStore.getState().user) action();
  else useUiStore.getState().openLogin();
}

export default function RedXP({ windowId }: AppWindowProps) {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [sub, setSub] = useState<string | null>(null); // null = Startseite (alle)
  const [sort, setSort] = useState<Sort>('hot');
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [openPost, setOpenPost] = useState<number | null>(null);
  const [composer, setComposer] = useState<'post' | 'sub' | null>(null);
  const [error, setError] = useState('');
  const userId = useAuthStore((s) => s.user?.id);

  const loadSubs = useCallback(() => api<{ subs: Sub[] }>('/red/subs').then((r) => setSubs(r.subs)), []);
  const loadPosts = useCallback(() => {
    setError('');
    const q = new URLSearchParams({ sort, ...(sub ? { sub } : {}) });
    api<{ posts: Post[] }>(`/red/posts?${q}`).then((r) => setPosts(r.posts), (e: Error) => setError(e.message));
  }, [sort, sub]);

  useEffect(() => {
    loadSubs().catch(() => {});
  }, [loadSubs]);
  useEffect(loadPosts, [loadPosts, userId]);

  const current = subs.find((s) => s.name === sub);
  useEffect(() => {
    useWindowStore.getState().setTitle(windowId, `redXP – ${sub ? `r/${sub}` : 'Startseite'}`);
  }, [windowId, sub]);

  return (
    <div className="cp rx">
      <aside className="cp-taskpane xp-scroll">
        <div className="cp-box">
          <div className="cp-box-title">Feeds</div>
          <div className="cp-box-body">
            <button className={`cp-task ${sub === null ? 'active' : ''}`} onClick={() => (setSub(null), setOpenPost(null))}>
              Startseite (alle)
            </button>
          </div>
        </div>
        <div className="cp-box">
          <div className="cp-box-title">Subreddits</div>
          <div className="cp-box-body">
            {subs.map((s) => (
              <button key={s.name} className={`cp-task ${sub === s.name ? 'active' : ''}`} onClick={() => (setSub(s.name), setOpenPost(null))} title={s.description}>
                r/{s.name} <span className="rx-count">{s.postCount}</span>
              </button>
            ))}
            <button className="cp-task rx-new-sub" onClick={() => requireLogin(() => setComposer('sub'))}>
              + Neues Subreddit…
            </button>
          </div>
        </div>
      </aside>

      <main className="cp-content xp-scroll rx-main">
        {composer === 'sub' ? (
          <SubForm onDone={(name) => (setComposer(null), name && (loadSubs(), setSub(name)))} />
        ) : composer === 'post' ? (
          <PostForm subs={subs} defaultSub={sub ?? subs[0]?.name ?? ''} onDone={(id) => (setComposer(null), id && (loadPosts(), setOpenPost(id)))} />
        ) : openPost ? (
          <PostDetail id={openPost} onBack={() => (setOpenPost(null), loadPosts())} />
        ) : (
          <>
            <div className="rx-header">
              <div>
                <h1>{current ? `r/${current.name}` : 'redXP'}</h1>
                <span className="rx-muted">{current ? current.description : 'Beiträge aus allen Subreddits der Schule'}</span>
              </div>
              <button className="xp-button default" onClick={() => requireLogin(() => setComposer('post'))}>
                Neuer Beitrag
              </button>
            </div>
            <div className="rx-sort" role="tablist">
              {(
                [
                  ['hot', 'Beliebt'],
                  ['new', 'Neu'],
                  ['top', 'Top'],
                ] as [Sort, string][]
              ).map(([s, label]) => (
                <button key={s} role="tab" aria-selected={sort === s} className={sort === s ? 'active' : ''} onClick={() => setSort(s)}>
                  {label}
                </button>
              ))}
            </div>
            {error ? (
              <p className="xp-error-text">{error}</p>
            ) : !posts ? (
              <p className="rx-muted">Wird geladen…</p>
            ) : posts.length === 0 ? (
              <div className="rx-empty">
                <b>Noch keine Beiträge.</b>
                <span>Starte die erste Diskussion!</span>
              </div>
            ) : (
              <ul className="rx-posts">
                {posts.map((p) => (
                  <li key={p.id} className="rx-post">
                    <Votes type="post" id={p.id} score={p.score} myVote={p.myVote} />
                    <div className="rx-post-main" onClick={() => setOpenPost(p.id)}>
                      <span className="rx-meta">
                        <button
                          className="rx-sub-link"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSub(p.sub);
                          }}
                        >
                          r/{p.sub}
                        </button>{' '}
                        · von {p.author ? <UserName username={p.author.username} color={p.author.color} /> : <Anonymous />} · {timeAgo(p.createdAt)}
                      </span>
                      <h2>{p.title}</h2>
                      {p.body && <p className="rx-preview">{p.body.length > 220 ? `${p.body.slice(0, 220)}…` : p.body}</p>}
                      <span className="rx-meta rx-comments-count">
                        {p.commentCount} {p.commentCount === 1 ? 'Kommentar' : 'Kommentare'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ─── Abstimmen ─────────────────────────────────────────────────────────────

function Votes({ type, id, score: initialScore, myVote: initialVote, horizontal }: { type: 'post' | 'comment'; id: number; score: number; myVote: number; horizontal?: boolean }) {
  const [score, setScore] = useState(initialScore);
  const [myVote, setMyVote] = useState(initialVote);
  useEffect(() => (setScore(initialScore), setMyVote(initialVote)), [initialScore, initialVote]);

  function vote(value: 1 | -1) {
    requireLogin(async () => {
      const next = myVote === value ? 0 : value;
      // Optimistisch anzeigen, dann mit Serverantwort abgleichen
      setScore((s) => s + next - myVote);
      setMyVote(next);
      try {
        const res = await api<{ score: number; myVote: number }>('/red/vote', { method: 'POST', body: { type, id, value: next } });
        setScore(res.score);
        setMyVote(res.myVote);
      } catch (e) {
        setScore(initialScore);
        setMyVote(initialVote);
        useUiStore.getState().showMessage({ title: 'redXP', icon: 'error', text: (e as Error).message });
      }
    });
  }

  return (
    <div className={`rx-votes ${horizontal ? 'horizontal' : ''}`} onClick={(e) => e.stopPropagation()}>
      <button className={`rx-up ${myVote === 1 ? 'on' : ''}`} onClick={() => vote(1)} aria-label="Upvote" title="Upvote">
        ▲
      </button>
      <span className={`rx-score ${myVote === 1 ? 'up' : myVote === -1 ? 'down' : ''}`}>{score}</span>
      <button className={`rx-down ${myVote === -1 ? 'on' : ''}`} onClick={() => vote(-1)} aria-label="Downvote" title="Downvote">
        ▼
      </button>
    </div>
  );
}

// ─── Beitrag mit Kommentaren ───────────────────────────────────────────────

function PostDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const [data, setData] = useState<{ post: Post; comments: Comment[] } | null>(null);
  const [error, setError] = useState('');
  const reload = useCallback(() => api<{ post: Post; comments: Comment[] }>(`/red/posts/${id}`).then(setData, (e: Error) => setError(e.message)), [id]);
  useEffect(() => void reload(), [reload]);

  const tree = useMemo(() => {
    const byParent = new Map<number | null, Comment[]>();
    for (const c of data?.comments ?? []) byParent.set(c.parentId, [...(byParent.get(c.parentId) ?? []), c]);
    return byParent;
  }, [data]);

  if (error) return <p className="xp-error-text">{error}</p>;
  if (!data) return <p className="rx-muted">Wird geladen…</p>;
  const { post } = data;

  return (
    <div className="rx-detail">
      <button className="xp-button" onClick={onBack}>
        ◄ Zurück
      </button>
      <article className="rx-post rx-post-full">
        <Votes type="post" id={post.id} score={post.score} myVote={post.myVote} />
        <div className="rx-post-main">
          <span className="rx-meta">
            r/{post.sub} · von {post.author ? <UserName username={post.author.username} color={post.author.color} /> : <Anonymous />} · {timeAgo(post.createdAt)}
          </span>
          <h2>{post.title}</h2>
          {post.body && <p className="rx-body selectable">{post.body}</p>}
        </div>
      </article>

      <CommentForm postId={post.id} onPosted={reload} />

      <h3 className="rx-comments-title">
        {data.comments.length} {data.comments.length === 1 ? 'Kommentar' : 'Kommentare'}
      </h3>
      <CommentList parentId={null} tree={tree} postId={post.id} onPosted={reload} />
    </div>
  );
}

function CommentList({ parentId, tree, postId, onPosted }: { parentId: number | null; tree: Map<number | null, Comment[]>; postId: number; onPosted: () => void }) {
  const items = tree.get(parentId) ?? [];
  if (items.length === 0) return null;
  return (
    <ul className={`rx-comments ${parentId ? 'nested' : ''}`}>
      {items.map((c) => (
        <CommentItem key={c.id} comment={c} tree={tree} postId={postId} onPosted={onPosted} />
      ))}
    </ul>
  );
}

function CommentItem({ comment: c, tree, postId, onPosted }: { comment: Comment; tree: Map<number | null, Comment[]>; postId: number; onPosted: () => void }) {
  const [replying, setReplying] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  return (
    <li className="rx-comment">
      <div className="rx-comment-head">
        <button className="rx-collapse" onClick={() => setCollapsed((v) => !v)} title={collapsed ? 'Aufklappen' : 'Zuklappen'}>
          {collapsed ? '[+]' : '[–]'}
        </button>
        {c.author ? <UserName username={c.author.username} color={c.author.color} /> : <Anonymous />}
        <span className="rx-muted">· {timeAgo(c.createdAt)}</span>
      </div>
      {!collapsed && (
        <>
          <p className="rx-body selectable">{c.body}</p>
          <div className="rx-comment-actions">
            <Votes type="comment" id={c.id} score={c.score} myVote={c.myVote} horizontal />
            <button className="ux-link rx-reply" onClick={() => requireLogin(() => setReplying((v) => !v))}>
              Antworten
            </button>
          </div>
          {replying && <CommentForm postId={postId} parentId={c.id} onPosted={() => (setReplying(false), onPosted())} compact />}
          <CommentList parentId={c.id} tree={tree} postId={postId} onPosted={onPosted} />
        </>
      )}
    </li>
  );
}

function CommentForm({ postId, parentId, onPosted, compact }: { postId: number; parentId?: number; onPosted: () => void; compact?: boolean }) {
  const user = useAuthStore((s) => s.user);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!user) {
    return (
      <p className="rx-login-hint">
        <button className="ux-link" onClick={() => useUiStore.getState().openLogin()}>
          Anmelden
        </button>
        , um mitzudiskutieren.
      </p>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/red/posts/${postId}/comments`, { method: 'POST', body: { body, parentId } });
      setBody('');
      onPosted();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`rx-comment-form ${compact ? 'compact' : ''}`} onSubmit={submit}>
      <textarea className="xp-input" placeholder={parentId ? 'Antwort schreiben…' : 'Was denkst du?'} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} />
      {error && <span className="xp-error-text">{error}</span>}
      <button className="xp-button default" disabled={busy || !body.trim()}>
        {parentId ? 'Antworten' : 'Kommentieren'}
      </button>
    </form>
  );
}

// ─── Neuer Beitrag / neues Subreddit ───────────────────────────────────────

function PostForm({ subs, defaultSub, onDone }: { subs: Sub[]; defaultSub: string; onDone: (id?: number) => void }) {
  const [sub, setSub] = useState(defaultSub);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const res = await api<{ post: Post }>('/red/posts', { method: 'POST', body: { sub, title, body } });
      onDone(res.post.id);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form className="rx-form" onSubmit={submit}>
      <h1 className="cp-heading">Neuer Beitrag</h1>
      <label className="xp-field">
        <span>Subreddit:</span>
        <select className="xp-select" value={sub} onChange={(e) => setSub(e.target.value)}>
          {subs.map((s) => (
            <option key={s.name} value={s.name}>
              r/{s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="xp-field">
        <span>Titel:</span>
        <input className="xp-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
      </label>
      <label className="xp-field rx-field-top">
        <span>Text (optional):</span>
        <textarea className="xp-input rx-textarea" value={body} onChange={(e) => setBody(e.target.value)} maxLength={10000} />
      </label>
      {error && <p className="xp-error-text">{error}</p>}
      <div className="dialog-buttons" style={{ justifyContent: 'flex-end' }}>
        <button type="submit" className="xp-button default">
          Veröffentlichen
        </button>
        <button type="button" className="xp-button" onClick={() => onDone()}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}

function SubForm({ onDone }: { onDone: (name?: string) => void }) {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/red/subs', { method: 'POST', body: { name, title, description } });
      onDone(name);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form className="rx-form" onSubmit={submit}>
      <h1 className="cp-heading">Neues Subreddit</h1>
      <p className="cp-hint">Zum Beispiel eines für deine Klasse: r/3AHIT. Erlaubt sind Buchstaben, Ziffern und _.</p>
      <label className="xp-field">
        <span>Name: r/</span>
        <input className="xp-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} required />
      </label>
      <label className="xp-field">
        <span>Titel:</span>
        <input className="xp-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
      </label>
      <label className="xp-field">
        <span>Beschreibung:</span>
        <input className="xp-input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
      </label>
      {error && <p className="xp-error-text">{error}</p>}
      <div className="dialog-buttons" style={{ justifyContent: 'flex-end' }}>
        <button type="submit" className="xp-button default">
          Erstellen
        </button>
        <button type="button" className="xp-button" onClick={() => onDone()}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}
