/**
 * Kleine, überall wiederverwendete Bausteine rund um User:
 *  - UserName:     klickbarer Name → öffnet das Profil (optional mit dezenten Abzeichen)
 *  - BadgeIcon:    Abzeichen als glänzende XP-Medaille
 *  - LevelBadge:   Level-Kreis wie bei Steam (Ringfarbe je Zehnerstufe)
 *  - FramedAvatar: Profilbild mit gekauftem Rahmen
 *  - itemStyle:    CSS eines Shop-Artikels (Hintergrund/Rahmen)
 */
import type { CSSProperties } from 'react';
import wallpaper from '../../assets/wallpaper.webp';
import { avatarUrl } from '../../core/avatars';
import { openProfile } from '../../core/profile';
import { useEconomyStore, type ShopItem } from '../../store/economyStore';
import './user.css';

export function UserName({
  username,
  color,
  badges,
  className = '',
}: {
  username: string;
  color?: string;
  badges?: string[];
  className?: string;
}) {
  return (
    <span className={`usr-name ${className}`}>
      {badges && badges.length > 0 && (
        <span className="usr-name-badges">
          {badges.map((id) => (
            <BadgeIcon key={id} id={id} size={14} />
          ))}
        </span>
      )}
      <button
        className="usr-link"
        style={color ? { color } : undefined}
        title={`Profil von ${username} öffnen`}
        onClick={(e) => {
          e.stopPropagation();
          openProfile(username);
        }}
      >
        {username}
      </button>
    </span>
  );
}

/** Platzhalter für anonyme Einträge (MollyXP, Sudoku-Bestenliste). */
export const Anonymous = () => <span className="usr-anon">Anonym</span>;

export function BadgeIcon({ id, size = 32, showTitle = true }: { id: string; size?: number; showTitle?: boolean }) {
  const def = useEconomyStore((s) => s.catalog?.badges.find((b) => b.id === id));
  if (!def) return null;
  const gid = `bdg-${id}-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className="usr-badge" role="img" aria-label={def.name}>
      {showTitle && <title>{`${def.name} – ${def.description}`}</title>}
      <defs>
        <radialGradient id={gid} cx=".35" cy=".3" r=".85">
          <stop offset="0" stopColor="#fff" stopOpacity=".95" />
          <stop offset=".35" stopColor={def.color} stopOpacity=".85" />
          <stop offset="1" stopColor={def.color} />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="14.5" fill={`url(#${gid})`} stroke="rgba(0,0,0,.45)" />
      <circle cx="16" cy="16" r="11.5" fill="none" stroke="rgba(255,255,255,.55)" />
      <text x="16" y="21.5" textAnchor="middle" fontFamily="Tahoma, Verdana, sans-serif" fontWeight="bold" fontSize="14" fill="#fff" stroke="rgba(0,0,0,.35)" strokeWidth=".6">
        {def.icon}
      </text>
    </svg>
  );
}

/** Ringfarben je Level-Stufe (1–9 grau, 10–19 rot, 20–29 orange …) wie bei Steam. */
const LEVEL_COLORS = ['#9b9b9b', '#c02942', '#d95b43', '#fecc23', '#467a3c', '#4e8ddb', '#7652c9', '#c252c9', '#542437', '#997c52'];

export function LevelBadge({ level, size = 30 }: { level: number; size?: number }) {
  const color = LEVEL_COLORS[Math.floor(level / 10) % LEVEL_COLORS.length];
  return (
    <span className="usr-level" style={{ width: size, height: size, borderColor: color, fontSize: size * 0.42 }} title={`Level ${level}`}>
      {level}
    </span>
  );
}

export function itemStyle(item: ShopItem | undefined): CSSProperties {
  if (!item) return {};
  if (item.asset === 'wallpaper') return { background: `url("${wallpaper}") center / cover`, imageRendering: 'pixelated' };
  return (item.style ?? {}) as CSSProperties;
}

export function useItem(id: string | undefined) {
  return useEconomyStore((s) => s.catalog?.items.find((i) => i.id === id));
}

export function FramedAvatar({ avatar, frame, size = 96 }: { avatar: string | null | undefined; frame?: string; size?: number }) {
  const item = useItem(frame);
  return <img className="usr-avatar" src={avatarUrl(avatar)} alt="" width={size} height={size} style={itemStyle(item)} />;
}

/** Coin-Symbol (goldene Münze im XP-Stil) */
export function CoinIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="usr-coin">
      <defs>
        <radialGradient id="usr-coin-g" cx=".35" cy=".3" r=".8">
          <stop offset="0" stopColor="#fff7b0" />
          <stop offset=".6" stopColor="#f5c518" />
          <stop offset="1" stopColor="#b8860b" />
        </radialGradient>
      </defs>
      <circle cx="8" cy="8" r="7" fill="url(#usr-coin-g)" stroke="#8a6400" />
      <circle cx="8" cy="8" r="4.6" fill="none" stroke="#b8860b" strokeWidth=".8" />
      <text x="8" y="10.8" textAnchor="middle" fontSize="7" fontWeight="bold" fontFamily="Tahoma" fill="#8a6400">
        C
      </text>
    </svg>
  );
}
