/**
 * Steam-ähnliche Profilseite im XP-Look:
 * Kopfbereich mit gekauftem Hintergrund, Profilbild mit Rahmen, Level-Ring und XP-Balken,
 * Abzeichen-Vitrine, alle Abzeichen und Statistiken. Beim eigenen Profil: „Profil bearbeiten“.
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../core/api';
import { launchApp } from '../../core/launcher';
import { BadgeIcon, CoinIcon, FramedAvatar, LevelBadge, itemStyle, useItem } from '../../components/user/UserBits';
import { useAuthStore } from '../../store/authStore';
import { useEconomyStore } from '../../store/economyStore';
import './profile.css';

export interface PublicProfile {
  user: { id: number; username: string; color: string; avatar: string | null; createdAt: number; isAdmin: boolean; untisLinked: boolean };
  level: { level: number; xp: number; levelXp: number; levelSpan: number };
  badges: { id: string; earnedAt: number }[];
  bio: string;
  showcase: string[];
  background: string;
  frame: string;
  stats: { chatMessages: number; posts: number; comments: number; upvotes: number; uploads: number; dailySudokus: number };
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

export function ProfileView({ username }: { username: string }) {
  const { profile, error, reload, setProfile } = useProfile(username);
  const me = useAuthStore((s) => s.user);
  const wallet = useEconomyStore((s) => s.wallet);
  const [editing, setEditing] = useState(false);
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

  const { user, level: lvl, stats } = profile;
  const showcase = profile.showcase.length ? profile.showcase : profile.badges.slice(-3).map((b) => b.id);

  return (
    <div className="pf xp-scroll">
      {/* ── Kopf ── */}
      <header className="pf-hero" style={itemStyle(background)}>
        <div className="pf-hero-panel">
          <FramedAvatar avatar={user.avatar} frame={profile.frame} size={96} />
          <div className="pf-hero-main">
            <h1 style={{ color: user.color }}>{user.username}</h1>
            <div className="pf-chips">
              {user.isAdmin && <span className="pf-chip admin">Administrator</span>}
              {user.untisLinked && <span className="pf-chip untis">Untis-verifiziert</span>}
              <span className="pf-chip">Mitglied seit {new Date(user.createdAt).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</span>
            </div>
            <p className="pf-bio">{profile.bio || (isMe ? 'Noch keine Beschreibung – klicke auf „Profil bearbeiten“.' : 'Keine Beschreibung.')}</p>
          </div>
          <div className="pf-level">
            <div className="pf-level-row">
              <span>Level</span>
              <LevelBadge level={lvl.level} size={44} />
            </div>
            <div className="pf-xpbar" title={`${lvl.levelXp} / ${lvl.levelSpan} XP bis Level ${lvl.level + 1}`}>
              <div style={{ width: `${(lvl.levelXp / lvl.levelSpan) * 100}%` }} />
            </div>
            <small>
              {lvl.levelXp} / {lvl.levelSpan} XP
            </small>
            {isMe && (
              <div className="pf-actions">
                <button className="xp-button" onClick={() => setEditing((v) => !v)}>
                  {editing ? 'Fertig' : 'Profil bearbeiten'}
                </button>
                <button className="xp-button" onClick={() => launchApp('shop')}>
                  <CoinIcon /> {wallet?.coins ?? 0} – Shop
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {isMe && editing && <ProfileEditor profile={profile} onSaved={(p) => (setProfile(p), setEditing(false))} />}

      <div className="pf-body">
        <div className="pf-col">
          <section className="pf-box">
            <h2>Abzeichen-Vitrine</h2>
            {showcase.length === 0 ? (
              <p className="pf-muted">Noch keine Abzeichen.</p>
            ) : (
              <div className="pf-showcase">
                {showcase.map((id) => (
                  <BadgeTile key={id} id={id} earnedAt={profile.badges.find((b) => b.id === id)?.earnedAt} />
                ))}
              </div>
            )}
          </section>

          <section className="pf-box">
            <h2>
              Abzeichen <span className="pf-muted">({profile.badges.length})</span>
            </h2>
            <AllBadges earned={profile.badges.map((b) => b.id)} showLocked={isMe} />
          </section>
        </div>

        <aside className="pf-col pf-side">
          <section className="pf-box">
            <h2>Statistik</h2>
            <dl className="pf-stats">
              <dt>Chat-Nachrichten</dt>
              <dd>{stats.chatMessages}</dd>
              <dt>redXP-Beiträge</dt>
              <dd>{stats.posts}</dd>
              <dt>redXP-Kommentare</dt>
              <dd>{stats.comments}</dd>
              <dt>Erhaltene Upvotes</dt>
              <dd>{stats.upvotes}</dd>
              <dt>Öffentliche Uploads</dt>
              <dd>{stats.uploads}</dd>
              <dt>Tägliche Sudokus</dt>
              <dd>{stats.dailySudokus}</dd>
            </dl>
          </section>
          <section className="pf-box">
            <h2>Gesamt-XP</h2>
            <p className="pf-big">{lvl.xp.toLocaleString('de-DE')} XP</p>
          </section>
        </aside>
      </div>
    </div>
  );
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

function AllBadges({ earned, showLocked }: { earned: string[]; showLocked: boolean }) {
  const catalog = useEconomyStore((s) => s.catalog);
  const owned = new Set(earned);
  const list = (catalog?.badges ?? []).filter((b) => showLocked || owned.has(b.id));
  if (list.length === 0) return <p className="pf-muted">Noch keine Abzeichen.</p>;
  return (
    <div className="pf-badges">
      {list.map((b) => (
        <div key={b.id} className={`pf-badge-small ${owned.has(b.id) ? '' : 'locked'}`} title={`${b.name} – ${b.description}`}>
          <BadgeIcon id={b.id} size={36} showTitle={false} />
          <span>{b.name}</span>
        </div>
      ))}
    </div>
  );
}

/** Bearbeiten: Beschreibung, Vitrine (max. 3), Hintergrund und Rahmen aus dem Inventar. */
function ProfileEditor({ profile, onSaved }: { profile: PublicProfile; onSaved: (p: PublicProfile) => void }) {
  const { catalog, inventory, setProfile } = useEconomyStore();
  const [bio, setBio] = useState(profile.bio);
  const [showcase, setShowcase] = useState(profile.showcase);
  const [background, setBackground] = useState(profile.background);
  const [frame, setFrame] = useState(profile.frame);
  const [error, setError] = useState('');
  const owned = (type: 'background' | 'frame') => (catalog?.items ?? []).filter((i) => i.type === type && inventory.includes(i.id));

  async function save() {
    setError('');
    try {
      const res = await api<{ profile: PublicProfile }>('/profiles/me', { method: 'PATCH', body: { bio, showcase, background, frame } });
      setProfile({ bio, showcase, background, frame });
      onSaved(res.profile);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const toggle = (id: string) =>
    setShowcase((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 3 ? [...s, id] : s));

  return (
    <section className="pf-editor">
      <fieldset className="xp-fieldset">
        <legend>Über mich</legend>
        <textarea className="xp-input pf-textarea" maxLength={500} value={bio} onChange={(e) => setBio(e.target.value)} />
      </fieldset>

      <fieldset className="xp-fieldset">
        <legend>Vitrine (bis zu 3 Abzeichen)</legend>
        <div className="pf-badges">
          {profile.badges.map((b) => (
            <label key={b.id} className={`pf-badge-small pick ${showcase.includes(b.id) ? 'on' : ''}`}>
              <input type="checkbox" checked={showcase.includes(b.id)} onChange={() => toggle(b.id)} />
              <BadgeIcon id={b.id} size={30} />
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="xp-fieldset">
        <legend>Hintergrund</legend>
        <div className="pf-items">
          {owned('background').map((i) => (
            <button key={i.id} className={`pf-item ${background === i.id ? 'on' : ''}`} onClick={() => setBackground(i.id)} title={i.name}>
              <span className="pf-item-preview" style={itemStyle(i)} />
              <span>{i.name}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="xp-fieldset">
        <legend>Rahmen</legend>
        <div className="pf-items">
          {owned('frame').map((i) => (
            <button key={i.id} className={`pf-item ${frame === i.id ? 'on' : ''}`} onClick={() => setFrame(i.id)} title={i.name}>
              <span className="pf-item-frame" style={itemStyle(i)} />
              <span>{i.name}</span>
            </button>
          ))}
        </div>
        <button className="xp-link" onClick={() => launchApp('shop')}>
          Weitere Hintergründe und Rahmen im Shop…
        </button>
      </fieldset>

      {error && <p className="xp-error-text">{error}</p>}
      <div className="dialog-buttons" style={{ justifyContent: 'flex-end' }}>
        <button className="xp-button default" onClick={save}>
          Speichern
        </button>
      </div>
    </section>
  );
}
