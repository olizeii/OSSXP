/**
 * Punkteshop (an den Steam-Punkteshop angelehnt):
 *   Hintergründe · Rahmen · Avatare (statisch & animiert) · Clippy-Erweiterungen · Workshop
 * Ab Rang „Moderator“ können eigene Artikel hochgeladen werden – Ersteller:innen bekommen 50 % jedes Verkaufs.
 * Coins/Inventar kommen aus dem globalen economyStore, Käufe gehen an POST /api/economy/shop/buy.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../core/api';
import { avatarUrl } from '../../core/avatars';
import { launchApp } from '../../core/launcher';
import type { AppWindowProps } from '../../core/types';
import { ClippyPreview } from '../../components/clippy/Clippy';
import { CoinIcon, FramedAvatar, LevelBadge, itemClass, itemStyle } from '../../components/user/UserBits';
import { useAuthStore, type User } from '../../store/authStore';
import { useEconomyStore, type ItemType, type ShopItem } from '../../store/economyStore';
import { useUiStore } from '../../store/uiStore';
import '../account/account.css';
import './shop.css';

type Category = 'background' | 'frame' | 'avatar' | 'clippy' | 'workshop' | 'submit' | 'earn';

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
  const items =
    category === 'workshop'
      ? all.filter((i) => i.custom)
      : all.filter((i) => TYPES_OF[category]?.includes(i.type) && !i.custom && (!animatedOnly || i.animated));

  function confirmBuy(item: ShopItem) {
    if (!user) return ui.openLogin();
    ui.showMessage({
      title: 'Kauf bestätigen',
      icon: 'question',
      text: `„${item.name}“ für ${item.price} Coins kaufen?\nIhr Guthaben danach: ${(wallet?.coins ?? 0) - item.price} Coins.`,
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
                  <CoinIcon size={22} /> {wallet.coins.toLocaleString('de-DE')}
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
            {user?.isModerator && (
              <button className={`cp-task ${category === 'submit' ? 'active' : ''}`} onClick={() => setCategory('submit')}>
                + Eigenen Artikel einreichen
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
          <SubmitItem onDone={() => (loadCatalog(true), setCategory('workshop'))} />
        ) : (
          <>
            <div className="shop-head">
              <h1 className="cp-heading">{CATEGORIES.find(([c]) => c === category)?.[1]}</h1>
              {category !== 'workshop' && category !== 'clippy' && (
                <label className="shop-filter">
                  <input type="checkbox" checked={animatedOnly} onChange={(e) => setAnimatedOnly(e.target.checked)} /> Nur animierte
                </label>
              )}
            </div>
            {category === 'workshop' && (
              <p className="cp-hint">Von Moderator:innen gestaltete Artikel. Die Ersteller:innen bekommen die Hälfte jedes Kaufpreises.</p>
            )}
            {items.length === 0 ? (
              <p className="ux-muted">Hier gibt es (noch) nichts.</p>
            ) : (
              <div className="shop-grid">
                {items.map((item) => {
                  const owned = inventory.includes(item.id);
                  const equipped = isEquipped(item);
                  const affordable = (wallet?.coins ?? 0) >= item.price;
                  return (
                    <div key={item.id} className={`shop-card ${equipped ? 'equipped' : ''}`}>
                      <ItemPreview item={item} avatar={user?.avatar} />
                      <b>
                        {item.name} {item.animated && <span className="shop-anim">animiert</span>}
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
                      {item.custom && user?.isModerator && (
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
      return <div className={`shop-preview ${itemClass(item)}`} style={itemStyle(item)} />;
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

function SubmitItem({ onDone }: { onDone: () => void }) {
  const [type, setType] = useState<'avatar' | 'background' | 'frame'>('avatar');
  const [name, setName] = useState('');
  const [price, setPrice] = useState(150);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return setError('Bitte eine Bilddatei auswählen.');
    setBusy(true);
    setError('');
    const form = new FormData();
    form.set('file', file);
    form.set('type', type);
    form.set('name', name);
    form.set('price', String(price));
    try {
      await api('/economy/items', { method: 'POST', body: form });
      useUiStore.getState().showMessage({ title: 'Punkteshop', icon: 'info', text: `„${name}“ ist jetzt im Workshop kaufbar.` });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="shop-submit">
      <h1 className="cp-heading">Eigenen Artikel einreichen</h1>
      <p className="cp-hint">
        Nur für Moderator:innen. Erlaubt: PNG, WebP, JPG oder animiertes GIF (max. 4 MB). Rahmen bitte als quadratisches PNG mit
        transparenter Mitte – er wird über das Profilbild gelegt.
      </p>
      <fieldset className="xp-fieldset">
        <legend>Typ</legend>
        {(['avatar', 'background', 'frame'] as const).map((t) => (
          <label key={t} className="shop-radio">
            <input type="radio" checked={type === t} onChange={() => setType(t)} /> {t === 'avatar' ? 'Avatar' : t === 'background' ? 'Hintergrund' : 'Rahmen'}
          </label>
        ))}
      </fieldset>
      <label className="xp-field">
        <span>Name:</span>
        <input className="xp-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
      </label>
      <label className="xp-field">
        <span>Preis (Coins):</span>
        <input className="xp-input" type="number" min={10} max={5000} value={price} onChange={(e) => setPrice(Number(e.target.value))} />
      </label>
      <label className="xp-field">
        <span>Bild:</span>
        <input type="file" accept="image/png,image/webp,image/gif,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
      </label>
      {error && <p className="xp-error-text">{error}</p>}
      <div className="dialog-buttons" style={{ justifyContent: 'flex-end' }}>
        <button className="xp-button default" disabled={busy}>
          {busy ? 'Wird hochgeladen…' : 'Einreichen'}
        </button>
      </div>
    </form>
  );
}
