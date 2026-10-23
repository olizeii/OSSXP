/**
 * Steam-ähnliche Profilseite im XP-Look:
 * Kopf mit (animiertem) Hintergrund, Profilbild mit Rahmen, Rang, Status, Level-Ring + hervorgehobenes
 * Abzeichen, darunter frei wählbare und sortierbare Vitrinen. Eigenes Profil: „Profil bearbeiten“
 * öffnet einen XP-Eigenschaften-Dialog. Admins können hier Moderator:innen ernennen.
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../core/api';
import { launchApp } from '../../core/launcher';
import { BackgroundMedia, BadgeIcon, CoinIcon, FramedAvatar, LevelBadge, RankIcon, itemClass, itemStyle, useItem } from '../../components/user/UserBits';
import { useAuthStore, type Rank } from '../../store/authStore';
import { formatCoins, useEconomyStore, type Showcase } from '../../store/economyStore';
import { GrantDialog } from './GrantDialog';
import { useUiStore } from '../../store/uiStore';
import { ProfileEditor } from './ProfileEditor';
import './profile.css';

export interface PublicProfile {
  user: {
    id: number;
    username: string;
    color: string;
    avatar: string | null;
    createdAt: number;
    rank: Rank;
    rankLabel: string;
    isAdmin: boolean;
    isModerator: boolean;
    untisLinked: boolean;
  };
  level: { level: number; xp: number; levelXp: number; levelSpan: number };
  badges: { id: string; earnedAt: number }[];
  bio: string;
  status: string;
  theme: string;
  infoTitle: string;
  infoText: string;
  showcase: string[];
  showcases: Showcase[];
  featuredBadge: string | null;
  background: string;
  frame: string;
  clippyHat: string;
  clippyGlasses: string;
  stats: { chatDays: number; posts: number; comments: number; upvotes: number; uploads: number; dailySudokus: number; loginStreak: number };
  recentPosts: { id: number; title: string; sub: string; score: number; comments: number; createdAt: number }[];
  sudoku: { solved: number; best: number | null };
}

export function useProfile(username: string) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState('');
  const reload = useCallback(() => {
    setError('');
    api<{ profile: PublicProfile }>(`/profiles/${encodeURIComponent(username)}`)
      .then((r) => setProfile(r.profile))
      .catch((e: Error) => setError(e.message));
  }, [username]);
  useEffect(reload, [reload]);
  return { profile, error, reload, setProfile };
}

const RANK_CHIP: Record<Rank, string> = { admin: 'admin', moderator: 'mod', regular: 'regular', verified: 'untis', new: '' };
const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function ProfileView({ username }: { username: string }) {
  const { profile, error, reload, setProfile } = useProfile(username);
  const me = useAuthStore((s) => s.user);
  const wallet = useEconomyStore((s) => s.wallet);
  const [editing, setEditing] = useState(false);
  const [granting, setGranting] = useState(false);
  const isMe = Boolean(me && profile && me.id === profile.user.id);

  // Eigenes Profil: bei Level-/Abzeichen-Änderungen (Live-Update) neu laden
  const level = useEconomyStore((s) => s.wallet?.level);
  const badgeCount = useEconomyStore((s) => s.badges.length);
  useEffect(() => {
    if (isMe) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMe, level, badgeCount]);

  const background = useItem(profile?.background);

  if (error) return <div className="pf-state">{error}</div>;
  if (!profile) return <div className="pf-state">Profil wird geladen…</div>;

  const { user, level: lvl } = profile;

  async function setModerator(on: boolean) {
    try {
      await api(`/admin/users/${encodeURIComponent(user.username)}/role`, { method: 'PATCH', body: { role: on ? 'moderator' : 'user' } });
      reload();
    } catch (e) {
      useUiStore.getState().showMessage({ title: 'Verwaltung', icon: 'error', text: (e as Error).message });
    }
  }

  return (
    <div className="pf xp-scroll" data-theme={profile.theme}>
      {/* ── Kopf ── */}
      <header className={`pf-hero ${itemClass(background)}`} style={itemStyle(background)}>
        <BackgroundMedia item={background} />
        <div className="pf-hero-panel">
          <FramedAvatar avatar={user.avatar} frame={profile.frame} size={96} />
          <div className="pf-hero-main">
            <h1 style={{ color: user.color }}>
              <RankIcon rank={user.rank} size={18} /> {user.username}
            </h1>
            <div className="pf-chips">
              {user.rank !== 'new' ? <span className={`pf-chip ${RANK_CHIP[user.rank]}`}>{user.rankLabel}</span> : <span className="pf-chip">Neuer Nutzer</span>}
              {user.untisLinked && user.rank !== 'verified' && <span className="pf-chip untis">Untis-verifiziert</span>}
              <span className="pf-chip">Mitglied seit {new Date(user.createdAt).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</span>
              {profile.stats.loginStreak >= 3 && <span className="pf-chip streak">{profile.stats.loginStreak} Tage in Folge da</span>}
            </div>
            {profile.status && <p className="pf-status">„{profile.status}“</p>}
            <p className="pf-bio">{profile.bio || (isMe ? 'Noch keine Beschreibung – klicke auf „Profil bearbeiten“.' : '')}</p>
          </div>
          <div className="pf-level">
            <div className="pf-level-row">
              <span>Level</span>
              <LevelBadge level={lvl.level} size={44} />
              {profile.featuredBadge && <BadgeIcon id={profile.featuredBadge} size={40} />}
            </div>
            <div className="pf-xpbar" title={`${lvl.levelXp} / ${lvl.levelSpan} XP bis Level ${lvl.level + 1}`}>
              <div style={{ width: `${(lvl.levelXp / lvl.levelSpan) * 100}%` }} />
            </div>
            <small>
              {lvl.levelXp} / {lvl.levelSpan} XP
            </small>
            <div className="pf-actions">
              {isMe ? (
                <>
                  <button className="xp-button" onClick={() => setEditing(true)}>
                    Profil bearbeiten
                  </button>
                  <button className="xp-button" onClick={() => launchApp('shop')}>
                    <CoinIcon /> {formatCoins(wallet)} – Shop
                  </button>
                </>
              ) : (
                me && (
                  <button className="xp-button" onClick={() => launchApp('chatterinoxp', { dm: user.username })}>
                    Nachricht senden
                  </button>
                )
              )}
              {me?.isAdmin && (
                <button className="xp-button" onClick={() => setGranting(true)} title="Coins und XP gutschreiben (nur Admins)">
                  Coins/XP gutschreiben…
                </button>
              )}
              {me?.isAdmin && !isMe && !user.isAdmin && (
                <button className="xp-button" onClick={() => setModerator(!user.isModerator)}>
                  {user.isModerator ? 'Moderator entfernen' : 'Zum Moderator ernennen'}
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="pf-body">
        <div className="pf-col">
          {profile.showcases.length === 0 && <p className="pf-muted">Keine Vitrinen ausgewählt.</p>}
          {profile.showcases.map((s) => (
            <ShowcaseBox key={s} kind={s} profile={profile} />
          ))}
        </div>

        <aside className="pf-col pf-side">
          <section className="pf-box">
            <h2>
              Abzeichen <span className="pf-muted">({profile.badges.length})</span>
            </h2>
            <div className="pf-badge-row">
              {profile.badges.map((b) => (
                <BadgeIcon key={b.id} id={b.id} size={30} />
              ))}
            </div>
          </section>
          <section className="pf-box">
            <h2>Gesamt-XP</h2>
            <p className="pf-big">{lvl.xp.toLocaleString('de-DE')} XP</p>
            <p className="pf-muted">Noch {lvl.levelSpan - lvl.levelXp} XP bis Level {lvl.level + 1}</p>
          </section>
          {isMe && <AllBadges earned={profile.badges.map((b) => b.id)} />}
        </aside>
      </div>

      {granting && <GrantDialog username={user.username} onClose={() => setGranting(false)} onDone={() => (setGranting(false), reload())} />}

      {editing && (
        <ProfileEditor
          profile={profile}
          onClose={() => setEditing(false)}
          onSaved={(p) => {
            setProfile(p);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function ShowcaseBox({ kind, profile }: { kind: Showcase; profile: PublicProfile }) {
  const s = profile.stats;
  switch (kind) {
    case 'badges': {
      const ids = profile.showcase.length ? profile.showcase : profile.badges.slice(-3).map((b) => b.id);
      return (
        <section className="pf-box">
          <h2>Abzeichen-Vitrine</h2>
          {ids.length === 0 ? (
            <p className="pf-muted">Noch keine Abzeichen.</p>
          ) : (
            <div className="pf-showcase">
              {ids.map((id) => (
                <BadgeTile key={id} id={id} earnedAt={profile.badges.find((b) => b.id === id)?.earnedAt} />
              ))}
            </div>
          )}
        </section>
      );
    }
    case 'info':
      return (
        <section className="pf-box">
          <h2>{profile.infoTitle || 'Info-Box'}</h2>
          <p className="pf-info selectable">{profile.infoText || '…'}</p>
        </section>
      );
    case 'stats':
      return (
        <section className="pf-box">
          <h2>Statistik</h2>
          <dl className="pf-stats">
            <dt>Tage im Chat aktiv</dt>
            <dd>{s.chatDays}</dd>
            <dt>redXP-Beiträge</dt>
            <dd>{s.posts}</dd>
            <dt>redXP-Kommentare</dt>
            <dd>{s.comments}</dd>
            <dt>Erhaltene Upvotes</dt>
            <dd>{s.upvotes}</dd>
            <dt>Öffentliche Uploads</dt>
            <dd>{s.uploads}</dd>
            <dt>Login-Serie</dt>
            <dd>{s.loginStreak} Tage</dd>
          </dl>
        </section>
      );
    case 'posts':
      return (
        <section className="pf-box">
          <h2>Neueste Beiträge in redXP</h2>
          {profile.recentPosts.length === 0 ? (
            <p className="pf-muted">Noch keine öffentlichen Beiträge.</p>
          ) : (
            <ul className="pf-posts">
              {profile.recentPosts.map((p) => (
                <li key={p.id}>
                  <span className="pf-post-score">▲ {p.score}</span>
                  <button className="ux-link" onClick={() => launchApp('redxp', { post: p.id })}>
                    {p.title}
                  </button>
                  <span className="pf-muted">
                    r/{p.sub} · {p.comments} Kommentare
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      );
    case 'sudoku':
      return (
        <section className="pf-box pf-sudoku">
          <h2>Sudoku-Rekorde</h2>
          <div className="pf-sudoku-row">
            <div>
              <b>{profile.sudoku.solved}</b>
              <span>Tagesrätsel gelöst</span>
            </div>
            <div>
              <b>{profile.sudoku.best !== null ? formatTime(profile.sudoku.best) : '–'}</b>
              <span>Bestzeit</span>
            </div>
            <button className="xp-button" onClick={() => launchApp('sudoxp')}>
              Spielen
            </button>
          </div>
        </section>
      );
  }
}

function BadgeTile({ id, earnedAt }: { id: string; earnedAt?: number }) {
  const def = useEconomyStore((s) => s.catalog?.badges.find((b) => b.id === id));
  if (!def) return null;
  return (
    <div className="pf-badge-tile">
      <BadgeIcon id={id} size={56} />
      <b>{def.name}</b>
      <span className="pf-muted">{def.description}</span>
      {earnedAt && <small className="pf-muted">seit {new Date(earnedAt).toLocaleDateString('de-DE')}</small>}
    </div>
  );
}

/** Alle Abzeichen inkl. noch gesperrter (nur auf dem eigenen Profil – zeigt, was es zu holen gibt). */
function AllBadges({ earned }: { earned: string[] }) {
  const catalog = useEconomyStore((s) => s.catalog);
  const owned = new Set(earned);
  const locked = (catalog?.badges ?? []).filter((b) => !owned.has(b.id));
  if (locked.length === 0) return null;
  return (
    <section className="pf-box">
      <h2>Noch zu holen</h2>
      <div className="pf-badges">
        {locked.map((b) => (
          <div key={b.id} className="pf-badge-small locked" title={`${b.name} – ${b.description}`}>
            <BadgeIcon id={b.id} size={30} showTitle={false} />
            <span>{b.name}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
