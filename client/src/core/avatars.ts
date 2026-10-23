/**
 * Benutzerbilder (wie „Eigenes Bild ändern“ unter Windows XP).
 *
 * Gespeichert wird pro User ein String:
 *   null / undefined        → Standardbild
 *   "preset:<id>"           → eines der mitgelieferten Bilder unten
 *   "data:image/...;base64" → selbst hochgeladenes Bild (clientseitig auf 96×96 verkleinert)
 *
 * Neues mitgeliefertes Bild: Datei nach src/assets/avatars/ legen und hier eintragen.
 */
import ball from '../assets/avatars/ball.svg';
// Standardbild = das Desktop-Hintergrundbild (wie das Bliss-Kontobild unter XP)
import blissPixel from '../assets/wallpaper.webp';
import duck from '../assets/avatars/duck.svg';
import flower from '../assets/avatars/flower.svg';
import { AVATAR_ART } from './cosmetics';

export interface AvatarPreset {
  id: string;
  label: string;
  url: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: 'bliss', label: 'Grüner Hügel', url: blissPixel },
  { id: 'flower', label: 'Blume', url: flower },
  { id: 'duck', label: 'Ente', url: duck },
  { id: 'ball', label: 'Fußball', url: ball },
];

export const DEFAULT_AVATAR = AVATAR_PRESETS[0];

/** Löst den gespeicherten Wert in eine anzeigbare Bild-URL auf (inkl. gekaufter Shop-Avatare „item:<id>“). */
export function avatarUrl(avatar: string | null | undefined): string {
  if (avatar?.startsWith('data:image/')) return avatar;
  if (avatar?.startsWith('item:')) {
    const id = avatar.slice(5);
    // Eigene (hochgeladene) Artikel liegen auf dem Server, die festen haben eine SVG-Grafik
    return id.startsWith('c-') ? `/api/economy/items/${id}/image` : (AVATAR_ART[id] ?? DEFAULT_AVATAR.url);
  }
  if (avatar?.startsWith('preset:')) {
    return AVATAR_PRESETS.find((p) => `preset:${p.id}` === avatar)?.url ?? DEFAULT_AVATAR.url;
  }
  return DEFAULT_AVATAR.url;
}

const SIZE = 96;

/** Liest eine Bilddatei, schneidet sie quadratisch zu und verkleinert sie auf 96×96. */
export async function fileToAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Bitte wählen Sie eine Bilddatei aus.');
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('Das Bild konnte nicht gelesen werden.');
  });

  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();

  const webp = canvas.toDataURL('image/webp', 0.85);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
}
