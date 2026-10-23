/**
 * „Coins/XP gutschreiben“ – kleiner XP-Dialog für Admins im Profil (auch für das eigene Konto).
 * Der Server bucht die Gutschrift ins Ledger und meldet Level-Aufstiege und Abzeichen live.
 */
import { useState, type FormEvent } from 'react';
import { api } from '../../core/api';
import { useUiStore } from '../../store/uiStore';

const PRESETS = [
  { label: '+1.000 Coins', coins: 1000, xp: 0 },
  { label: '+1.000 XP', coins: 0, xp: 1000 },
  { label: 'Stammgast (+1.200 XP)', coins: 0, xp: 1200 },
  { label: '+100.000 XP', coins: 0, xp: 100_000 },
];

export function GrantDialog({ username, onClose, onDone }: { username: string; onClose: () => void; onDone: () => void }) {
  const [coins, setCoins] = useState('0');
  const [xp, setXp] = useState('0');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/admin/users/${encodeURIComponent(username)}/grant`, { method: 'POST', body: { coins: Number(coins) || 0, xp: Number(xp) || 0 } });
      useUiStore.getState().notify({ title: 'Gutschrift gebucht', text: `${username}: +${Number(coins) || 0} Coins, +${Number(xp) || 0} XP`, icon: 'info' });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pf-overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="xp-window xp-dialog pf-grant" role="dialog" aria-label="Coins und XP gutschreiben" onSubmit={submit}>
        <header className="title-bar">
          <span className="title-bar-text">Gutschrift für „{username}“</span>
          <div className="title-bar-controls">
            <button type="button" className="close" aria-label="Schließen" onClick={onClose}>
              <svg width="11" height="11" viewBox="0 0 11 11">
                <path d="M2 2l7 7M9 2l-7 7" stroke="#fff" strokeWidth="2" />
              </svg>
            </button>
          </div>
        </header>
        <div className="window-body pf-grant-body">
          <p className="pf-muted">Admins selbst haben unbegrenzt Coins – XP kannst du dir hier wie allen anderen gutschreiben.</p>
          <label className="xp-field">
            <span>Coins:</span>
            <input className="xp-input" type="number" min={0} max={10_000_000} value={coins} onChange={(e) => setCoins(e.target.value)} />
          </label>
          <label className="xp-field">
            <span>XP:</span>
            <input className="xp-input" type="number" min={0} max={10_000_000} value={xp} onChange={(e) => setXp(e.target.value)} />
          </label>
          <div className="pf-grant-presets">
            {PRESETS.map((p) => (
              <button key={p.label} type="button" className="xp-button" onClick={() => (setCoins(String(p.coins)), setXp(String(p.xp)))}>
                {p.label}
              </button>
            ))}
          </div>
          {error && <p className="xp-error-text">{error}</p>}
          <div className="dialog-buttons" style={{ justifyContent: 'flex-end' }}>
            <button className="xp-button default" disabled={busy}>
              Gutschreiben
            </button>
            <button type="button" className="xp-button" onClick={onClose}>
              Abbrechen
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
