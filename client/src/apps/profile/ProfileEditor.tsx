/**
 * „Profil bearbeiten“ als XP-Eigenschaften-Dialog mit Registerkarten (wie die Steam-Profilbearbeitung):
 *   Allgemein  – Status, Über mich, Design, hervorgehobenes Abzeichen
 *   Vitrinen   – welche Vitrinen in welcher Reihenfolge, Info-Box, Abzeichen-Vitrine
 *   Aussehen   – Hintergrund, Rahmen, Avatar (aus dem Inventar), Clippy-Hut und -Brille
 */
import { useState } from 'react';
import { api } from '../../core/api';
import { avatarUrl } from '../../core/avatars';
import { launchApp } from '../../core/launcher';
import { BadgeIcon, FramedAvatar, itemClass, itemStyle } from '../../components/user/UserBits';
import { ClippyPreview } from '../../components/clippy/Clippy';
import { useAuthStore, type User } from '../../store/authStore';
import { useEconomyStore, type ItemType, type Showcase } from '../../store/economyStore';
import type { PublicProfile } from './ProfileView';

type Tab = 'general' | 'showcases' | 'looks';

const THEME_LABEL: Record<string, string> = {
  luna: 'Luna (Blau)',
  olive: 'Olivgrün',
  silver: 'Silber',
  royale: 'Royale (Dunkel)',
  zune: 'Zune (Schwarz/Orange)',
  rose: 'Rosé',
};

const SHOWCASE_LABEL: Record<Showcase, string> = {
  badges: 'Abzeichen-Vitrine',
  info: 'Info-Box',
  stats: 'Statistik',
  posts: 'Neueste redXP-Beiträge',
  sudoku: 'Sudoku-Rekorde',
};

export function ProfileEditor({ profile, onClose, onSaved }: { profile: PublicProfile; onClose: () => void; onSaved: (p: PublicProfile) => void }) {
  const { catalog, inventory, setProfile } = useEconomyStore();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>('general');
  const [form, setForm] = useState({
    bio: profile.bio,
    status: profile.status,
    theme: profile.theme,
    infoTitle: profile.infoTitle,
    infoText: profile.infoText,
    showcase: profile.showcase,
    showcases: profile.showcases,
    featuredBadge: profile.featuredBadge,
    background: profile.background,
    frame: profile.frame,
    clippyHat: profile.clippyHat,
    clippyGlasses: profile.clippyGlasses,
  });
  const [avatar, setAvatar] = useState<string | null>(user?.avatar ?? null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const owned = (type: ItemType) => (catalog?.items ?? []).filter((i) => i.type === type && inventory.includes(i.id));
  const allShowcases = catalog?.showcases ?? (['badges', 'info', 'stats', 'posts', 'sudoku'] as Showcase[]);

  async function save(close: boolean) {
    setBusy(true);
    setError('');
    try {
      const res = await api<{ profile: PublicProfile }>('/profiles/me', { method: 'PATCH', body: form });
      if (avatar !== (user?.avatar ?? null)) {
        const r = await api<{ user: User }>('/auth/me', { method: 'PATCH', body: { avatar } });
        useAuthStore.getState().setUser(r.user);
        res.profile.user.avatar = avatar;
      }
      setProfile(form);
      if (close) onSaved(res.profile);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function toggleShowcase(s: Showcase) {
    set('showcases', form.showcases.includes(s) ? form.showcases.filter((x) => x !== s) : [...form.showcases, s]);
  }
  function moveShowcase(s: Showcase, dir: -1 | 1) {
    const list = [...form.showcases];
    const i = list.indexOf(s);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    set('showcases', list);
  }
  const toggleBadge = (id: string) =>
    set('showcase', form.showcase.includes(id) ? form.showcase.filter((x) => x !== id) : form.showcase.length < 3 ? [...form.showcase, id] : form.showcase);

  const ownedAvatars = owned('avatar');

  return (
    <div className="pf-overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="xp-window xp-dialog pf-editor" role="dialog" aria-label="Profil bearbeiten">
        <header className="title-bar">
          <span className="title-bar-text">Eigenschaften von „{profile.user.username}“</span>
          <div className="title-bar-controls">
            <button className="close" aria-label="Schließen" onClick={onClose}>
              <svg width="11" height="11" viewBox="0 0 11 11">
                <path d="M2 2l7 7M9 2l-7 7" stroke="#fff" strokeWidth="2" />
              </svg>
            </button>
          </div>
        </header>
        <div className="window-body pf-editor-body">
          <div className="pf-tabs" role="tablist">
            {(
              [
                ['general', 'Allgemein'],
                ['showcases', 'Vitrinen'],
                ['looks', 'Aussehen'],
              ] as [Tab, string][]
            ).map(([t, label]) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
                {label}
              </button>
            ))}
          </div>

          <div className="pf-tabpanel xp-scroll">
            {tab === 'general' && (
              <>
                <label className="xp-field">
                  <span>Status:</span>
                  <input className="xp-input" value={form.status} maxLength={80} placeholder="z. B. Lernt für die AM-Schularbeit" onChange={(e) => set('status', e.target.value)} />
                </label>
                <fieldset className="xp-fieldset">
                  <legend>Über mich</legend>
                  <textarea className="xp-input pf-textarea" maxLength={500} value={form.bio} onChange={(e) => set('bio', e.target.value)} />
                </fieldset>
                <fieldset className="xp-fieldset">
                  <legend>Design</legend>
                  <div className="pf-themes">
                    {(catalog?.themes ?? Object.keys(THEME_LABEL)).map((t) => (
                      <button key={t} className={`pf-theme-swatch ${form.theme === t ? 'on' : ''}`} data-theme={t} onClick={() => set('theme', t)}>
                        <span />
                        {THEME_LABEL[t] ?? t}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="xp-fieldset">
                  <legend>Hervorgehobenes Abzeichen (neben dem Level)</legend>
                  <div className="pf-badges">
                    <label className={`pf-badge-small pick ${!form.featuredBadge ? 'on' : ''}`}>
                      <input type="radio" checked={!form.featuredBadge} onChange={() => set('featuredBadge', null)} />
                      <span className="pf-none">–</span>
                    </label>
                    {profile.badges.map((b) => (
                      <label key={b.id} className={`pf-badge-small pick ${form.featuredBadge === b.id ? 'on' : ''}`}>
                        <input type="radio" checked={form.featuredBadge === b.id} onChange={() => set('featuredBadge', b.id)} />
                        <BadgeIcon id={b.id} size={30} />
                      </label>
                    ))}
                  </div>
                </fieldset>
              </>
            )}

            {tab === 'showcases' && (
              <>
                <fieldset className="xp-fieldset">
                  <legend>Angezeigte Vitrinen (Reihenfolge mit ▲ ▼)</legend>
                  <ul className="pf-showcase-list">
                    {[...form.showcases, ...allShowcases.filter((s) => !form.showcases.includes(s))].map((s) => {
                      const on = form.showcases.includes(s);
                      return (
                        <li key={s} className={on ? '' : 'off'}>
                          <label>
                            <input type="checkbox" checked={on} onChange={() => toggleShowcase(s)} /> {SHOWCASE_LABEL[s]}
                          </label>
                          {on && (
                            <span>
                              <button className="xp-button pf-mini" onClick={() => moveShowcase(s, -1)} aria-label="Nach oben">
                                ▲
                              </button>
                              <button className="xp-button pf-mini" onClick={() => moveShowcase(s, 1)} aria-label="Nach unten">
                                ▼
                              </button>
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
                <fieldset className="xp-fieldset">
                  <legend>Info-Box</legend>
                  <label className="xp-field">
                    <span>Titel:</span>
                    <input className="xp-input" maxLength={60} value={form.infoTitle} onChange={(e) => set('infoTitle', e.target.value)} placeholder="z. B. Meine Projekte" />
                  </label>
                  <textarea className="xp-input pf-textarea" maxLength={1000} value={form.infoText} onChange={(e) => set('infoText', e.target.value)} />
                </fieldset>
                <fieldset className="xp-fieldset">
                  <legend>Abzeichen-Vitrine (bis zu 3)</legend>
                  <div className="pf-badges">
                    {profile.badges.map((b) => (
                      <label key={b.id} className={`pf-badge-small pick ${form.showcase.includes(b.id) ? 'on' : ''}`}>
                        <input type="checkbox" checked={form.showcase.includes(b.id)} onChange={() => toggleBadge(b.id)} />
                        <BadgeIcon id={b.id} size={30} />
                      </label>
                    ))}
                  </div>
                </fieldset>
              </>
            )}

            {tab === 'looks' && (
              <>
                <fieldset className="xp-fieldset">
                  <legend>Hintergrund</legend>
                  <div className="pf-items">
                    {owned('background').map((i) => (
                      <button key={i.id} className={`pf-item ${form.background === i.id ? 'on' : ''}`} onClick={() => set('background', i.id)} title={i.name}>
                        <span className={`pf-item-preview ${itemClass(i)}`} style={itemStyle(i)} />
                        <span>{i.name}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="xp-fieldset">
                  <legend>Rahmen</legend>
                  <div className="pf-items">
                    {owned('frame').map((i) => (
                      <button key={i.id} className={`pf-item ${form.frame === i.id ? 'on' : ''}`} onClick={() => set('frame', i.id)} title={i.name}>
                        <FramedAvatar avatar={avatar} frame={i.id} size={40} />
                        <span>{i.name}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="xp-fieldset">
                  <legend>Avatar</legend>
                  <div className="pf-items">
                    <button className={`pf-item ${!avatar?.startsWith('item:') ? 'on' : ''}`} onClick={() => setAvatar(user?.avatar?.startsWith('item:') ? null : (user?.avatar ?? null))}>
                      <img className="pf-item-avatar" src={avatarUrl(user?.avatar?.startsWith('item:') ? null : user?.avatar)} alt="" />
                      <span>Eigenes Bild</span>
                    </button>
                    {ownedAvatars.map((i) => (
                      <button key={i.id} className={`pf-item ${avatar === `item:${i.id}` ? 'on' : ''}`} onClick={() => setAvatar(`item:${i.id}`)} title={i.name}>
                        <img className="pf-item-avatar" src={avatarUrl(`item:${i.id}`)} alt="" />
                        <span>{i.name}</span>
                      </button>
                    ))}
                  </div>
                  <button className="xp-link" onClick={() => launchApp('account', { tab: 'picture' })}>
                    Eigenes Bild hochladen…
                  </button>
                </fieldset>
                <fieldset className="xp-fieldset">
                  <legend>Clippy</legend>
                  <div className="pf-clippy">
                    <ClippyPreview hat={form.clippyHat} glasses={form.clippyGlasses} />
                    <div>
                      <label className="xp-field">
                        <span>Hut:</span>
                        <select className="xp-select" value={form.clippyHat} onChange={(e) => set('clippyHat', e.target.value)}>
                          {owned('clippy-hat').map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="xp-field">
                        <span>Brille:</span>
                        <select className="xp-select" value={form.clippyGlasses} onChange={(e) => set('clippyGlasses', e.target.value)}>
                          {owned('clippy-glasses').map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                </fieldset>
                <button className="xp-link" onClick={() => launchApp('shop')}>
                  Mehr Hintergründe, Rahmen, Avatare und Clippy-Extras im Punkteshop…
                </button>
              </>
            )}
          </div>

          {error && <p className="xp-error-text pf-editor-error">{error}</p>}
          <div className="dialog-buttons" style={{ justifyContent: 'flex-end' }}>
            <button className="xp-button default" disabled={busy} onClick={() => save(true)}>
              OK
            </button>
            <button className="xp-button" onClick={onClose}>
              Abbrechen
            </button>
            <button className="xp-button" disabled={busy} onClick={() => save(false)}>
              Übernehmen
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
