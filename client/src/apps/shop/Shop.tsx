/**
 * Punkteshop – Profil-Hintergründe und Rahmen gegen Coins kaufen und direkt anlegen.
 * Coins/Inventar kommen aus dem globalen economyStore, Käufe gehen an POST /api/economy/shop/buy.
 */
import { useEffect, useState } from 'react';
import { api } from '../../core/api';
import { launchApp } from '../../core/launcher';
import type { AppWindowProps } from '../../core/types';
import { CoinIcon, LevelBadge, itemStyle } from '../../components/user/UserBits';
import { useAuthStore } from '../../store/authStore';
import { useEconomyStore, type ShopItem } from '../../store/economyStore';
import { useUiStore } from '../../store/uiStore';
import '../account/account.css';
import './shop.css';

type Category = 'background' | 'frame' | 'earn';

interface Reward {
  xp: number;
  coins: number;
  dailyCap: number;
  label: string;
}

export default function Shop(_props: AppWindowProps) {
  const user = useAuthStore((s) => s.user);
  const { catalog, wallet, inventory, profile, buy, setProfile } = useEconomyStore();
  const [category, setCategory] = useState<Category>('background');
  const [rewards, setRewards] = useState<Record<string, Reward>>({});
  const ui = useUiStore.getState();

  useEffect(() => {
    api<{ rewards: Record<string, Reward> }>('/economy/catalog').then((c) => setRewards(c.rewards)).catch(() => {});
  }, []);

  const items = (catalog?.items ?? []).filter((i) => i.type === category);

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

  async function equip(item: ShopItem) {
    if (!profile) return;
    const next = { ...profile, [item.type]: item.id };
    try {
      await api('/profiles/me', { method: 'PATCH', body: next });
      setProfile(next);
    } catch (e) {
      ui.showMessage({ title: 'Shop', icon: 'error', text: (e as Error).message });
    }
  }

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
            {(
              [
                ['background', 'Profil-Hintergründe'],
                ['frame', 'Avatar-Rahmen'],
                ['earn', 'Coins verdienen'],
              ] as [Category, string][]
            ).map(([c, label]) => (
              <button key={c} className={`cp-task ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {user && (
          <div className="cp-box">
            <div className="cp-box-title">Siehe auch</div>
            <div className="cp-box-body">
              <button className="cp-task" onClick={() => launchApp('profile', { username: user.username })}>
                Mein Profil ansehen
              </button>
            </div>
          </div>
        )}
      </aside>

      <main className="cp-content xp-scroll">
        {category === 'earn' ? (
          <>
            <h1 className="cp-heading">So verdienen Sie Coins und XP</h1>
            <table className="shop-table">
              <thead>
                <tr>
                  <th>Aktivität</th>
                  <th>Coins</th>
                  <th>XP</th>
                  <th>pro Tag</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(rewards).map(([key, r]) => (
                  <tr key={key}>
                    <td>{r.label}</td>
                    <td>{r.coins ? `+${r.coins}` : '–'}</td>
                    <td>+{r.xp}</td>
                    <td>{r.dailyCap === 1 ? 'einmal' : `bis zu ${r.dailyCap}×`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="cp-hint">Jeder Level-Aufstieg bringt zusätzlich 10 Bonus-Coins. Abzeichen gibt es für besondere Leistungen – siehe Profil.</p>
          </>
        ) : (
          <>
            <h1 className="cp-heading">{category === 'background' ? 'Profil-Hintergründe' : 'Avatar-Rahmen'}</h1>
            <div className="shop-grid">
              {items.map((item) => {
                const owned = inventory.includes(item.id);
                const equipped = profile?.[item.type] === item.id;
                const affordable = (wallet?.coins ?? 0) >= item.price;
                return (
                  <div key={item.id} className={`shop-card ${equipped ? 'equipped' : ''}`}>
                    {item.type === 'background' ? (
                      <div className="shop-preview" style={itemStyle(item)} />
                    ) : (
                      <div className="shop-preview frame-bg">
                        <span className="shop-frame" style={itemStyle(item)} />
                      </div>
                    )}
                    <b>{item.name}</b>
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
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
