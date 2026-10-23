/**
 * Punkteshop (an den Steam-Punkteshop angelehnt):
 *   Hintergründe · Rahmen · Avatare (statisch & animiert) · Clippy-Erweiterungen · Workshop
 * Eigene Artikel (auch echte Animationen: GIF/WebP/APNG, Hintergründe als WebM/MP4-Video) laden Moderation und Admins
 * direkt hoch; Stammgäste ab Level 15 reichen sie ein, die Moderation gibt sie frei. Ersteller:innen bekommen 50 % jedes Verkaufs.
 * Coins/Inventar kommen aus dem globalen economyStore, Käufe gehen an POST /api/economy/shop/buy.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../core/api';
import { avatarUrl } from '../../core/avatars';
import { launchApp } from '../../core/launcher';
import type { AppWindowProps } from '../../core/types';
import { ClippyPreview } from '../../components/clippy/Clippy';
import { BackgroundMedia, CoinIcon, FramedAvatar, LevelBadge, itemClass, itemStyle } from '../../components/user/UserBits';
import { hasRank, useAuthStore, type User } from '../../store/authStore';
import { formatCoins, useEconomyStore, type ItemType, type ShopItem } from '../../store/economyStore';
import { useUiStore } from '../../store/uiStore';
import '../account/account.css';
import './shop.css';

type Category = 'background' | 'frame' | 'avatar' | 'clippy' | 'workshop' | 'submit' | 'review' | 'earn';

interface Reward {
  xp: number;
  coins: number;
  dailyCap?: number;
  hourlyCap?: number;
  cooldownSec?: number;
  decay?: boolean;
  lucky?: number;
  label: string;
}

const CATEGORIES: [Category, string][] = [
  ['background', 'Profil-Hintergründe'],
  ['frame', 'Avatar-Rahmen'],
  ['avatar', 'Avatare'],
  ['clippy', 'Clippy-Erweiterungen'],
  ['workshop', 'Workshop (Community)'],
  ['earn', 'Coins verdienen'],
];

const TYPES_OF: Partial<Record<Category, ItemType[]>> = {
  background: ['background'],
  frame: ['frame'],
  avatar: ['avatar'],
  clippy: ['clippy-hat', 'clippy-glasses'],
};

export default function Shop({ params }: AppWindowProps) {
  const user = useAuthStore((s) => s.user);
  const { catalog, wallet, inventory, profile, buy, setProfile, loadCatalog } = useEconomyStore();
  const [category, setCategory] = useState<Category>((params?.category as Category) ?? 'background');
  const [animatedOnly, setAnimatedOnly] = useState(false);
  const [rewards, setRewards] = useState<Record<string, Reward>>({});
  const ui = useUiStore.getState();

  useEffect(() => {
    if (params?.category) setCategory(params.category as Category);
  }, [params]);

  useEffect(() => {
    loadCatalog(true).catch(() => {}); // neue Workshop-Artikel sehen
    api<{ rewards: Record<string, Reward> }>('/economy/catalog').then((c) => setRewards(c.rewards)).catch(() => {});
  }, [loadCatalog]);

  const all = catalog?.items ?? [];
  // Community-Artikel erscheinen zusätzlich in ihrer Kategorie – der Workshop zeigt nur sie
  const items = all.filter(
    (i) => (category === 'workshop' ? i.custom : TYPES_OF[category]?.includes(i.type)) && (!animatedOnly || i.animated),
  );
  const isMod = hasRank(user, 'moderator');
  const uploadLevel = catalog?.shopUploadLevel ?? 15;
  const canUpload = isMod || (hasRank(user, 'regular') && (wallet?.level ?? 0) >= uploadLevel);

  function confirmBuy(item: ShopItem) {
    if (!user) return ui.openLogin();
    ui.showMessage({
      title: 'Kauf bestätigen',
      icon: 'question',
      text: wallet?.unlimited
        ? `„${item.name}“ kaufen? Als Admin kostet es Sie nichts.`
        : `„${item.name}“ für ${item.price} Coins kaufen?\nIhr Guthaben danach: ${(wallet?.coins ?? 0) - item.price} Coins.`,
      buttons: [
        {
          label: 'Kaufen',
          primary: true,
          action: () =>
            buy(item.id)
              .then(() => equip(item))
              .catch((e: Error) => ui.showMessage({ title: 'Shop', icon: 'error', text: e.message })),
        },
        { label: 'Abbrechen' },
      ],
    });
  }

  /** Artikel anlegen: Avatare über das Konto, alles andere über das Profil. */
  async function equip(item: ShopItem) {
    try {
      if (item.type === 'avatar') {
        const r = await api<{ user: User }>('/auth/me', { method: 'PATCH', body: { avatar: `item:${item.id}` } });
        useAuthStore.getState().setUser(r.user);
        return;
      }
      if (!profile) return;
      const key = { background: 'background', frame: 'frame', 'clippy-hat': 'clippyHat', 'clippy-glasses': 'clippyGlasses' }[item.type] as keyof typeof profile;
      const next = { ...profile, [key]: item.id };
      await api('/profiles/me', { method: 'PATCH', body: next });
      setProfile(next);
    } catch (e) {
      ui.showMessage({ title: 'Shop', icon: 'error', text: (e as Error).message });
    }
  }

  const isEquipped = (item: ShopItem) =>
    item.type === 'avatar'
      ? user?.avatar === `item:${item.id}`
      : profile?.[({ background: 'background', frame: 'frame', 'clippy-hat': 'clippyHat', 'clippy-glasses': 'clippyGlasses' } as const)[item.type]] === item.id;

  return (
    <div className="cp shop">
      <aside className="cp-taskpane xp-scroll">
        <div className="cp-box">
          <div className="cp-box-title">Ihr Konto</div>
          <div className="cp-box-body shop-wallet">
            {wallet ? (
              <>
                <div className="shop-coins">
                  <CoinIcon size={22} /> {formatCoins(wallet)}
                </div>
                <div className="shop-level">
                  <LevelBadge level={wallet.level} size={24} /> {wallet.levelXp}/{wallet.levelSpan} XP
                </div>
              </>
            ) : (
              <button className="cp-task" onClick={() => ui.openLogin()}>
                Anmelden, um einzukaufen
              </button>
            )}
          </div>
        </div>
        <div className="cp-box">
          <div className="cp-box-title">Kategorien</div>
          <div className="cp-box-body">
            {CATEGORIES.map(([c, label]) => (
              <button key={c} className={`cp-task ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)}>
                {label}
              </button>
            ))}
            {canUpload && (
              <button className={`cp-task ${category === 'submit' ? 'active' : ''}`} onClick={() => setCategory('submit')}>
                + Eigenen Artikel {isMod ? 'hochladen' : 'einreichen'}
              </button>
            )}
            {isMod && (
              <button className={`cp-task ${category === 'review' ? 'active' : ''}`} onClick={() => setCategory('review')}>
                Einreichungen prüfen
              </button>
            )}
          </div>
        </div>
        {user && (
          <div className="cp-box">
            <div className="cp-box-title">Siehe auch</div>
            <div className="cp-box-body">
              <button className="cp-task" onClick={() => launchApp('profile')}>
                Mein Profil gestalten
              </button>
            </div>
          </div>
        )}
      </aside>

      <main className="cp-content xp-scroll">
        {category === 'earn' ? (
          <EarnInfo rewards={rewards} />
        ) : category === 'submit' ? (
          <SubmitItem direct={isMod} onDone={(live) => (loadCatalog(true), live && setCategory('workshop'))} />
        ) : category === 'review' ? (
          <ReviewQueue avatar={user?.avatar} onChanged={() => loadCatalog(true)} />
        ) : (
          <>
            <div className="shop-head">
              <h1 className="cp-heading">{CATEGORIES.find(([c]) => c === category)?.[1]}</h1>
              {category !== 'clippy' && (
                <label className="shop-filter">
                  <input type="checkbox" checked={animatedOnly} onChange={(e) => setAnimatedOnly(e.target.checked)} /> Nur animierte
                </label>
              )}
            </div>
            {category === 'workshop' && (
              <p className="cp-hint">
                Von der Community gestaltete Artikel – mit echten Animationen und Video-Hintergründen. Die Ersteller:innen bekommen die
                Hälfte jedes Kaufpreises. {canUpload ? '' : `Eigene Artikel: ab Moderator oder als Stammgast ab Level ${uploadLevel}.`}
              </p>
            )}
            {items.length === 0 ? (
              <p className="ux-muted">Hier gibt es (noch) nichts.</p>
            ) : (
              <div className={`shop-grid ${category === 'background' || category === 'workshop' ? 'wide' : ''}`}>
                {items.map((item) => {
                  const owned = inventory.includes(item.id);
                  const equipped = isEquipped(item);
                  const affordable = Boolean(wallet?.unlimited) || (wallet?.coins ?? 0) >= item.price;
                  return (
                    <div key={item.id} className={`shop-card ${equipped ? 'equipped' : ''}`}>
                      <ItemPreview item={item} avatar={user?.avatar} />
                      <b>
                        {item.name} {item.video ? <span className="shop-anim">Video</span> : item.animated && <span className="shop-anim">animiert</span>}
                      </b>
                      {item.creator && <span className="ux-muted">von {item.creator}</span>}
                      <span className="shop-price">
                        {item.price === 0 ? (
                          'Kostenlos'
                        ) : (
                          <>
                            <CoinIcon /> {item.price}
                          </>
                        )}
                      </span>
                      {equipped ? (
                        <button className="xp-button" disabled>
                          Angelegt
                        </button>
                      ) : owned ? (
                        <button className="xp-button" disabled={!user} onClick={() => equip(item)}>
                          Anlegen
                        </button>
                      ) : (
                        <button className="xp-button default" disabled={Boolean(user) && !affordable} onClick={() => confirmBuy(item)}>
                          {user && !affordable ? 'Zu wenig Coins' : 'Kaufen'}
                        </button>
                      )}
                      {item.custom && isMod && (
                        <button
                          className="ux-link"
                          onClick={() => api(`/economy/items/${item.id}`, { method: 'DELETE' }).then(() => loadCatalog(true))}
                        >
                          Aus dem Shop nehmen
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/** Vorschau eines Artikels passend zum Typ. */
function ItemPreview({ item, avatar }: { item: ShopItem; avatar?: string | null }) {
  switch (item.type) {
    case 'background':
      return (
        <div className={`shop-preview ${item.video ? 'video' : ''} ${itemClass(item)}`} style={itemStyle(item)} title={item.video ? 'Maus darüber = abspielen' : undefined}>
          <BackgroundMedia item={item} hover />
        </div>
      );
    case 'frame':
      return (
        <div className="shop-preview frame-bg">
          <FramedAvatar avatar={avatar} frame={item.id} size={46} />
        </div>
      );
    case 'avatar':
      return (
        <div className="shop-preview avatar-bg">
          <img src={item.image ?? avatarUrl(`item:${item.id}`)} alt="" />
        </div>
      );
    default:
      return (
        <div className="shop-preview clippy-bg">
          <ClippyPreview hat={item.type === 'clippy-hat' ? item.id : undefined} glasses={item.type === 'clippy-glasses' ? item.id : undefined} size={0.42} />
        </div>
      );
  }
}

function EarnInfo({ rewards }: { rewards: Record<string, Reward> }) {
  const limits = (r: Reward) =>
    [
      r.dailyCap === 1 ? 'einmal täglich' : r.dailyCap ? `max. ${r.dailyCap}×/Tag` : '',
      r.hourlyCap ? `max. ${r.hourlyCap}×/Std.` : '',
      r.cooldownSec ? `alle ${r.cooldownSec >= 60 ? `${Math.round(r.cooldownSec / 60)} Min.` : `${r.cooldownSec} s`}` : '',
      r.decay ? 'abnehmend' : '',
      r.lucky ? `${Math.round(r.lucky * 100)} % Glücksbonus` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  return (
    <>
      <h1 className="cp-heading">So verdienen Sie Coins und XP</h1>
      <table className="shop-table">
        <thead>
          <tr>
            <th>Aktivität</th>
            <th>Coins</th>
            <th>XP</th>
            <th>Regeln</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(rewards).map(([key, r]) => (
            <tr key={key}>
              <td>{r.label}</td>
              <td>{r.coins ? `+${r.coins}` : '–'}</td>
              <td>+{r.xp}</td>
              <td className="ux-muted">{limits(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="cp-hint">
        Spam lohnt sich nicht: Viele Aktivitäten haben eine Abklingzeit, ein Stunden-/Tageslimit oder bringen mit jeder Wiederholung weniger.
        Qualität zählt – Upvotes, oft angesehene Uploads und tägliche Besuche (mit Serien-Bonus) bringen am meisten. Jeder Level-Aufstieg
        bringt Bonus-Coins; es gibt keine Level-Obergrenze, aber jedes Level braucht 15 % mehr XP als das vorige.
      </p>
    </>
  );
}

const FORMATS = {
  avatar: { accept: 'image/png,image/jpeg,image/webp,image/gif', hint: 'PNG, JPG, WebP oder GIF (animiert erlaubt), quadratisch, max. 6 MB' },
  frame: { accept: 'image/png,image/webp,image/gif', hint: 'quadratisches PNG/WebP/GIF mit transparenter Mitte – wird über das Profilbild gelegt, max. 6 MB' },
  background: { accept: 'image/png,image/jpeg,image/webp,image/gif,video/webm,video/mp4', hint: 'Bild (PNG, JPG, WebP, GIF, max. 6 MB) oder Video wie bei Steam (WebM/MP4, max. 20 MB, ohne Ton), am besten 16:9' },
} as const;

function SubmitItem({ direct, onDone }: { direct: boolean; onDone: (live: boolean) => void }) {
  const [type, setType] = useState<'avatar' | 'background' | 'frame'>('background');
  const [name, setName] = useState('');
  const [price, setPrice] = useState(500);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [mine, setMine] = useState<ShopItem[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadMine = () => api<{ items: ShopItem[] }>('/economy/items/pending').then((r) => setMine(r.items), () => {});
  useEffect(() => void (!direct && loadMine()), [direct]);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return setError('Bitte eine Datei auswählen.');
    setBusy(true);
    setError('');
    const form = new FormData();
    form.set('file', file);
    form.set('type', type);
    form.set('name', name);
    form.set('price', String(price));
    try {
      const r = await api<{ pending: boolean }>('/economy/items', { method: 'POST', body: form });
      useUiStore.getState().showMessage({
        title: 'Punkteshop',
        icon: 'info',
        text: r.pending ? `„${name}“ wurde eingereicht. Sobald die Moderation es freigibt, ist es im Workshop kaufbar.` : `„${name}“ ist jetzt im Workshop kaufbar.`,
      });
      setName('');
      setFile(null);
      if (r.pending) loadMine();
      onDone(!r.pending);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const isVideo = file?.type.startsWith('video/');

  return (
    <form onSubmit={submit} className="shop-submit">
      <h1 className="cp-heading">Eigenen Artikel {direct ? 'hochladen' : 'einreichen'}</h1>
      <p className="cp-hint">
        Lade echte Animationen hoch – animierte Avatare, Rahmen und Hintergründe wie im Steam-Punkteshop. Nur eigene Werke oder
        Material, das du verwenden darfst; nichts Anstößiges.{' '}
        {direct ? 'Als Moderator:in ist dein Artikel sofort kaufbar.' : 'Die Moderation prüft deine Einreichung vor der Freigabe.'}
      </p>
      <fieldset className="xp-fieldset">
        <legend>Typ</legend>
        {(['background', 'avatar', 'frame'] as const).map((t) => (
          <label key={t} className="shop-radio">
            <input type="radio" checked={type === t} onChange={() => (setType(t), setFile(null))} /> {t === 'avatar' ? 'Avatar' : t === 'background' ? 'Profil-Hintergrund' : 'Avatar-Rahmen'}
          </label>
        ))}
      </fieldset>
      <div className="shop-submit-grid">
        <div className="shop-submit-fields">
          <label className="xp-field">
            <span>Name:</span>
            <input className="xp-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
          </label>
          <label className="xp-field">
            <span>Preis (Coins):</span>
            <input className="xp-input" type="number" min={10} max={5000} value={price} onChange={(e) => setPrice(Number(e.target.value))} />
          </label>
          <label className="xp-field">
            <span>Datei:</span>
            <input key={type} type="file" accept={FORMATS[type].accept} onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
          </label>
          <span className="ux-muted">{FORMATS[type].hint}</span>
        </div>
        <div className={`shop-submit-preview ${type}`}>
          {!preview ? (
            <span>Vorschau</span>
          ) : isVideo ? (
            <video src={preview} autoPlay muted loop playsInline />
          ) : (
            <img src={preview} alt="Vorschau" />
          )}
        </div>
      </div>
      {error && <p className="xp-error-text">{error}</p>}
      <div className="dialog-buttons" style={{ justifyContent: 'flex-end' }}>
        <button className="xp-button default" disabled={busy}>
          {busy ? 'Wird hochgeladen…' : direct ? 'Hochladen' : 'Einreichen'}
        </button>
      </div>

      {mine.length > 0 && (
        <fieldset className="xp-fieldset">
          <legend>Warten auf Freigabe</legend>
          <ul className="shop-mine">
            {mine.map((i) => (
              <li key={i.id}>
                {i.name} <span className="ux-muted">({i.type === 'background' ? 'Hintergrund' : i.type === 'frame' ? 'Rahmen' : 'Avatar'}, {i.price} Coins)</span>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
    </form>
  );
}

/** Moderation: eingereichte Artikel von Stammgästen freigeben oder ablehnen. */
function ReviewQueue({ avatar, onChanged }: { avatar?: string | null; onChanged: () => void }) {
  const [items, setItems] = useState<ShopItem[] | null>(null);
  const load = () => api<{ items: ShopItem[] }>('/economy/items/pending').then((r) => setItems(r.items), () => setItems([]));
  useEffect(() => void load(), []);

  async function decide(item: ShopItem, approve: boolean) {
    try {
      await api(`/economy/items/${item.id}${approve ? '/approve' : ''}`, { method: approve ? 'POST' : 'DELETE' });
      load();
      onChanged();
    } catch (e) {
      useUiStore.getState().showMessage({ title: 'Punkteshop', icon: 'error', text: (e as Error).message });
    }
  }

  return (
    <>
      <h1 className="cp-heading">Einreichungen prüfen</h1>
      <p className="cp-hint">Freigegebene Artikel sind sofort im Workshop kaufbar. Abgelehnte Dateien werden gelöscht; die Ersteller:innen werden benachrichtigt.</p>
      {!items ? (
        <p className="ux-muted">Wird geladen…</p>
      ) : items.length === 0 ? (
        <p className="ux-muted">Keine offenen Einreichungen.</p>
      ) : (
        <div className="shop-grid wide">
          {items.map((item) => (
            <div key={item.id} className="shop-card">
              {/* Wartende Artikel stehen noch nicht im Katalog – Vorschau direkt aus dem Datensatz */}
              {item.type === 'avatar' ? (
                <div className="shop-preview avatar-bg">
                  <img src={item.image} alt="" />
                </div>
              ) : item.type === 'frame' ? (
                <div className="shop-preview frame-bg">
                  <span className="usr-frame" style={{ width: 46, height: 46 }}>
                    <img className="usr-avatar" src={avatarUrl(avatar)} alt="" width={46} height={46} />
                    <img className="usr-frame-overlay" src={item.image} alt="" />
                  </span>
                </div>
              ) : (
                <ItemPreview item={item} />
              )}
              <b>
                {item.name} {item.video ? <span className="shop-anim">Video</span> : item.animated && <span className="shop-anim">animiert</span>}
              </b>
              <span className="ux-muted">
                von {item.creator ?? 'Unbekannt'} · {item.price} Coins
              </span>
              <div className="shop-review-actions">
                <button className="xp-button default" onClick={() => decide(item, true)}>
                  Freigeben
                </button>
                <button className="xp-button" onClick={() => decide(item, false)}>
                  Ablehnen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
