/**
 * redXP – Reddit-artiges Forum im XP-Look.
 * Links die Subreddits, oben globale Suche und Einstellungen, rechts Beiträge mit Up-/Downvotes,
 * Detailansicht mit Kommentarbaum. Namen zeigen Rang und (abschaltbar) Abzeichen wie im Chat.
 *
 * Rechte: Beiträge/Kommentare/Stimmen mit Login; eigene Subreddits ab „Stammgast“ – sie starten
 * privat (nur per Link) und werden ab 10 Mitgliedern automatisch öffentlich. Löschen: Autor:in oder Moderation.
 * Economy: Coins/XP vergibt der Server und meldet sie live – hier ist dafür kein Code nötig.
 */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '../../core/api';
import type { AppWindowProps } from '../../core/types';
import { Anonymous, UserName } from '../../components/user/UserBits';
import { hasRank, useAuthStore, type Rank } from '../../store/authStore';
import { useEconomyStore } from '../../store/economyStore';
import { useUiStore } from '../../store/uiStore';
import { useWindowStore } from '../../store/windowStore';
import '../account/account.css';
import './redxp.css';

interface Sub {
  name: string;
  title: string;
  description: string;
  postCount: number;
  members: number;
  isMember: boolean;
  listed: boolean;
  official: boolean;
}

interface Author {
  username: string;
  color: string;
  rank?: Rank;
  badges?: string[];
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
  canDelete: boolean;
}

interface Comment {
  id: number;
  parentId: number | null;
  body: string;
  score: number;
  createdAt: number;
  author: Author | null;
  myVote: number;
  canDelete: boolean;
}

type Sort = 'hot' | 'new' | 'top';

// ─── Einstellungen (pro Browser) ───────────────────────────────────────────

const SETTINGS_KEY = 'ossxp-redxp-settings';
function loadSettings(): { showBadges: boolean } {
  try {
    return { showBadges: true, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return { showBadges: true };
  }
}

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

const confirmDelete = (what: string, run: () => void) =>
  useUiStore.getState().showMessage({
    title: 'redXP',
    icon: 'warning',
    text: `${what} wirklich löschen?`,
    buttons: [{ label: 'Löschen', primary: true, action: run }, { label: 'Abbrechen' }],
  });

export default function RedXP({ windowId, params }: AppWindowProps) {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [publicAt, setPublicAt] = useState(10);
  const [sub, setSub] = useState<string | null>(null); // null = Startseite (alle)
  const [linkedSub, setLinkedSub] = useState<Sub | null>(null); // per Link geöffnetes (privates) Subreddit
  const [sort, setSort] = useState<Sort>('hot');
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [openPost, setOpenPost] = useState<number | null>(null);
  const [view, setView] = useState<'list' | 'newPost' | 'newSub' | 'search' | 'settings'>('list');
  const [query, setQuery] = useState('');
  const [settings, setSettings] = useState(loadSettings);
  const [error, setError] = useState('');
  const userId = useAuthStore((s) => s.user?.id);

  const loadSubs = useCallback(
    () =>
      api<{ subs: Sub[]; publicAt: number }>('/red/subs').then((r) => {
        setSubs(r.subs);
        setPublicAt(r.publicAt);
      }),
    [],
  );
  const loadPosts = useCallback(() => {
    setError('');
    const q = new URLSearchParams({ sort, ...(sub ? { sub } : {}) });
    api<{ posts: Post[] }>(`/red/posts?${q}`).then((r) => setPosts(r.posts), (e: Error) => setError(e.message));
  }, [sort, sub]);

  useEffect(() => {
    loadSubs().catch(() => {});
  }, [loadSubs, userId]);
  useEffect(loadPosts, [loadPosts, userId]);

  // Deep-Link / Profil: { sub } oder { post }
  useEffect(() => {
    if (params?.sub) openSub(String(params.sub));
    if (params?.post) setOpenPost(Number(params.post));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  /** Subreddit öffnen – auch private, die nicht in der Liste stehen (Zugang per Link). */
  function openSub(name: string) {
    setOpenPost(null);
    setView('list');
    setSub(name);
    api<{ sub: Sub }>(`/red/subs/${encodeURIComponent(name)}`).then(
      (r) => setLinkedSub(r.sub),
      () => setLinkedSub(null),
    );
  }

  const current = subs.find((s) => s.name.toLowerCase() === sub?.toLowerCase()) ?? (linkedSub?.name.toLowerCase() === sub?.toLowerCase() ? linkedSub : null);

  useEffect(() => {
    useWindowStore.getState().setTitle(windowId, `redXP – ${sub ? `r/${sub}` : 'Startseite'}`);
  }, [windowId, sub]);

  function saveSettings(next: typeof settings) {
    setSettings(next);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      /* egal */
    }
  }

  async function membership(join: boolean) {
    if (!current) return;
    try {
      const r = await api<{ sub: Sub }>(`/red/subs/${current.name}/${join ? 'join' : 'leave'}`, { method: 'POST' });
      setLinkedSub(r.sub);
      loadSubs();
    } catch (e) {
      useUiStore.getState().showMessage({ title: 'redXP', icon: 'error', text: (e as Error).message });
    }
  }

  function copyLink() {
    if (!current) return;
    const url = `${location.origin}/?app=redxp&sub=${encodeURIComponent(current.name)}`;
    navigator.clipboard
      ?.writeText(url)
      .then(() => useUiStore.getState().notify({ title: 'Link kopiert', text: url, icon: 'info' }))
      .catch(() => useUiStore.getState().showMessage({ title: 'Link zum Teilen', icon: 'info', text: url }));
  }

  return (
    <div className="cp rx">
      <aside className="cp-taskpane xp-scroll">
        <div className="cp-box">
          <div className="cp-box-title">Feeds</div>
          <div className="cp-box-body">
            <button className={`cp-task ${sub === null && view === 'list' ? 'active' : ''}`} onClick={() => (setSub(null), setOpenPost(null), setView('list'))}>
              Startseite (alle)
            </button>
          </div>
        </div>
        <div className="cp-box">
          <div className="cp-box-title">Subreddits</div>
          <div className="cp-box-body">
            {subs.map((s) => (
              <button key={s.name} className={`cp-task ${sub === s.name ? 'active' : ''}`} onClick={() => openSub(s.name)} title={s.description}>
                r/{s.name} {!s.listed && <span className="rx-lock" title="Privat">🔒</span>}
                <span className="rx-count">{s.postCount}</span>
              </button>
            ))}
            <button className="cp-task rx-new-sub" onClick={() => requireLogin(() => setView('newSub'))}>
              + Neues Subreddit…
            </button>
          </div>
        </div>
        <div className="cp-box">
          <div className="cp-box-title">Weitere Aufgaben</div>
          <div className="cp-box-body">
            <button className="cp-task" onClick={() => setView('settings')}>
              Einstellungen
            </button>
          </div>
        </div>
      </aside>

      <main className="cp-content xp-scroll rx-main">
        <form
          className="rx-searchbar"
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim().length >= 2) (setOpenPost(null), setView('search'));
          }}
        >
          <input className="xp-input" placeholder="redXP durchsuchen – Subreddits und Beiträge…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="xp-button">Suchen</button>
        </form>

        {view === 'settings' ? (
          <Settings settings={settings} onChange={saveSettings} onClose={() => setView('list')} />
        ) : view === 'search' ? (
          <SearchResults query={query} showBadges={settings.showBadges} onOpenSub={openSub} onOpenPost={(id) => (setView('list'), setOpenPost(id))} />
        ) : view === 'newSub' ? (
          <SubForm publicAt={publicAt} onDone={(name) => (setView('list'), name && (loadSubs(), openSub(name)))} />
        ) : view === 'newPost' ? (
          <PostForm subs={current && !subs.includes(current) ? [...subs, current] : subs} defaultSub={sub ?? subs[0]?.name ?? ''} onDone={(id) => (setView('list'), id && (loadPosts(), setOpenPost(id)))} />
        ) : openPost ? (
          <PostDetail id={openPost} showBadges={settings.showBadges} onBack={() => (setOpenPost(null), loadPosts())} />
        ) : (
          <>
            <div className="rx-header">
              <div>
                <h1>
                  {current ? `r/${current.name}` : sub ? `r/${sub}` : 'redXP'}{' '}
                  {current && !current.listed && <span className="rx-private">privat</span>}
                </h1>
                <span className="rx-muted">
                  {current ? `${current.description || current.title} · ${current.members} Mitglieder` : 'Beiträge aus allen Subreddits der Schule'}
                </span>
              </div>
              <div className="rx-header-actions">
                {current && userId && !current.official && (
                  <button className="xp-button" onClick={() => membership(!current.isMember)}>
                    {current.isMember ? 'Austreten' : 'Beitreten'}
                  </button>
                )}
                {current && !current.listed && (
                  <button className="xp-button" onClick={copyLink} title="Private Subreddits sind nur per Link erreichbar">
                    Link kopieren
                  </button>
                )}
                <button className="xp-button default" onClick={() => requireLogin(() => setView('newPost'))}>
                  Neuer Beitrag
                </button>
              </div>
            </div>
            {current && !current.listed && (
              <p className="cp-hint">
                Dieses Subreddit ist noch privat und nur per Link erreichbar. Ab {publicAt} Mitgliedern wird es automatisch öffentlich
                ({current.members}/{publicAt}).
              </p>
            )}
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
              <PostList posts={posts} showBadges={settings.showBadges} onOpen={setOpenPost} onOpenSub={openSub} onDeleted={loadPosts} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ─── Listen & Namen ────────────────────────────────────────────────────────

function AuthorName({ author, showBadges }: { author: Author | null; showBadges: boolean }) {
  if (!author) return <Anonymous />;
  return <UserName username={author.username} color={author.color} rank={showBadges ? author.rank : undefined} badges={showBadges ? author.badges : undefined} />;
}

function PostList({
  posts,
  showBadges,
  onOpen,
  onOpenSub,
  onDeleted,
}: {
  posts: Post[];
  showBadges: boolean;
  onOpen: (id: number) => void;
  onOpenSub: (name: string) => void;
  onDeleted?: () => void;
}) {
  return (
    <ul className="rx-posts">
      {posts.map((p) => (
        <li key={p.id} className="rx-post">
          <Votes type="post" id={p.id} score={p.score} myVote={p.myVote} />
          <div className="rx-post-main" onClick={() => onOpen(p.id)}>
            <span className="rx-meta">
              <button
                className="rx-sub-link"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenSub(p.sub);
                }}
              >
                r/{p.sub}
              </button>{' '}
              · von <AuthorName author={p.author} showBadges={showBadges} /> · {timeAgo(p.createdAt)}
            </span>
            <h2>{p.title}</h2>
            {p.body && <p className="rx-preview">{p.body.length > 220 ? `${p.body.slice(0, 220)}…` : p.body}</p>}
            <span className="rx-meta">
              {p.commentCount} {p.commentCount === 1 ? 'Kommentar' : 'Kommentare'}
              {p.canDelete && onDeleted && (
                <>
                  {' · '}
                  <button
                    className="ux-link rx-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      confirmDelete('Diesen Beitrag', () => api(`/red/posts/${p.id}`, { method: 'DELETE' }).then(onDeleted));
                    }}
                  >
                    Löschen
                  </button>
                </>
              )}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function SearchResults({ query, showBadges, onOpenSub, onOpenPost }: { query: string; showBadges: boolean; onOpenSub: (n: string) => void; onOpenPost: (id: number) => void }) {
  const [data, setData] = useState<{ subs: Pick<Sub, 'name' | 'title' | 'description'>[]; posts: Post[] } | null>(null);
  useEffect(() => {
    setData(null);
    api<{ subs: Sub[]; posts: Post[] }>(`/red/search?q=${encodeURIComponent(query.trim())}`).then(setData, () => setData({ subs: [], posts: [] }));
  }, [query]);

  if (!data) return <p className="rx-muted">Suche…</p>;
  return (
    <div className="rx-search">
      <h1 className="cp-heading">Suchergebnisse für „{query.trim()}“</h1>
      <h3>Subreddits</h3>
      {data.subs.length === 0 ? (
        <p className="rx-muted">Keine passenden Subreddits.</p>
      ) : (
        <ul className="rx-search-subs">
          {data.subs.map((s) => (
            <li key={s.name}>
              <button className="ux-link" onClick={() => onOpenSub(s.name)}>
                r/{s.name}
              </button>{' '}
              <span className="rx-muted">{s.description || s.title}</span>
            </li>
          ))}
        </ul>
      )}
      <h3>Beiträge</h3>
      {data.posts.length === 0 ? <p className="rx-muted">Keine passenden Beiträge.</p> : <PostList posts={data.posts} showBadges={showBadges} onOpen={onOpenPost} onOpenSub={onOpenSub} />}
    </div>
  );
}

function Settings({ settings, onChange, onClose }: { settings: { showBadges: boolean }; onChange: (s: { showBadges: boolean }) => void; onClose: () => void }) {
  return (
    <div className="rx-form">
      <h1 className="cp-heading">Einstellungen</h1>
      <fieldset className="xp-fieldset">
        <legend>Anzeige</legend>
        <label className="rx-check">
          <input type="checkbox" checked={settings.showBadges} onChange={(e) => onChange({ ...settings, showBadges: e.target.checked })} />
          Rang-Symbole und Abzeichen neben Namen anzeigen (wie im chatterinoXP)
        </label>
      </fieldset>
      <p className="rx-muted">Einstellungen gelten für diesen Browser.</p>
      <button className="xp-button default" onClick={onClose}>
        OK
      </button>
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

function PostDetail({ id, showBadges, onBack }: { id: number; showBadges: boolean; onBack: () => void }) {
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
            r/{post.sub} · von <AuthorName author={post.author} showBadges={showBadges} /> · {timeAgo(post.createdAt)}
            {post.canDelete && (
              <>
                {' · '}
                <button className="ux-link rx-delete" onClick={() => confirmDelete('Diesen Beitrag', () => api(`/red/posts/${post.id}`, { method: 'DELETE' }).then(onBack))}>
                  Löschen
                </button>
              </>
            )}
          </span>
          <h2>{post.title}</h2>
          {post.body && <p className="rx-body selectable">{post.body}</p>}
        </div>
      </article>

      <CommentForm postId={post.id} onPosted={reload} />

      <h3 className="rx-comments-title">
        {data.comments.length} {data.comments.length === 1 ? 'Kommentar' : 'Kommentare'}
      </h3>
      <CommentList parentId={null} tree={tree} postId={post.id} showBadges={showBadges} onChanged={reload} />
    </div>
  );
}

interface CommentListProps {
  tree: Map<number | null, Comment[]>;
  postId: number;
  showBadges: boolean;
  onChanged: () => void;
}

function CommentList({ parentId, ...rest }: CommentListProps & { parentId: number | null }) {
  const items = rest.tree.get(parentId) ?? [];
  if (items.length === 0) return null;
  return (
    <ul className={`rx-comments ${parentId ? 'nested' : ''}`}>
      {items.map((c) => (
        <CommentItem key={c.id} comment={c} {...rest} />
      ))}
    </ul>
  );
}

function CommentItem({ comment: c, ...rest }: CommentListProps & { comment: Comment }) {
  const [replying, setReplying] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  return (
    <li className="rx-comment">
      <div className="rx-comment-head">
        <button className="rx-collapse" onClick={() => setCollapsed((v) => !v)} title={collapsed ? 'Aufklappen' : 'Zuklappen'}>
          {collapsed ? '[+]' : '[–]'}
        </button>
        <AuthorName author={c.author} showBadges={rest.showBadges} />
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
            {c.canDelete && (
              <button className="ux-link rx-reply rx-delete" onClick={() => confirmDelete('Diesen Kommentar', () => api(`/red/comments/${c.id}`, { method: 'DELETE' }).then(rest.onChanged))}>
                Löschen
              </button>
            )}
          </div>
          {replying && <CommentForm postId={rest.postId} parentId={c.id} onPosted={() => (setReplying(false), rest.onChanged())} compact />}
          <CommentList parentId={c.id} {...rest} />
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

function SubForm({ publicAt, onDone }: { publicAt: number; onDone: (name?: string) => void }) {
  const user = useAuthStore((s) => s.user);
  const stammgastLevel = useEconomyStore((s) => s.catalog?.stammgastLevel ?? 8);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  if (!hasRank(user, 'regular')) {
    return (
      <div className="rx-form">
        <h1 className="cp-heading">Neues Subreddit</h1>
        <p className="cp-hint">
          Eigene Subreddits können ab dem Rang <b>Stammgast</b> gegründet werden (automatisch ab Level {stammgastLevel}). Du bist aktuell{' '}
          <b>{user?.rankLabel}</b>. Sammle XP durch tägliche Besuche, hilfreiche Uploads und gute Beiträge!
        </p>
        <button className="xp-button" onClick={() => onDone()}>
          Zurück
        </button>
      </div>
    );
  }

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
      <p className="cp-hint">
        Neue Subreddits sind zuerst <b>privat</b> – teile den Link mit deiner Klasse. Ab {publicAt} Mitgliedern werden sie automatisch für alle sichtbar.
        Name: Buchstaben, Ziffern und _ (z. B. 3AHIT).
      </p>
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
