/**
 * Emotes (7TV, BTTV, FFZ und das OSSXP-Set): Laden, Live-Aktualisieren und Zerlegen von Nachrichten in Tokens.
 */
import { useEffect, useState } from 'react';
import { api } from '../../core/api';
import { getSocket } from '../../core/socket';

export interface Emote {
  id: string;
  name: string;
  provider: '7tv' | 'bttv' | 'ffz' | 'ossxp';
  scope: 'global' | 'channel';
  url: string;
  url2x: string;
  zeroWidth: boolean;
  animated?: boolean;
}

export type EmoteMap = Map<string, Emote>;

export type Token =
  | { type: 'text'; text: string }
  | { type: 'emote'; emote: Emote; overlays: Emote[] }
  | { type: 'link'; href: string }
  | { type: 'mention'; name: string };

export const PROVIDER_LABEL: Record<Emote['provider'], string> = { '7tv': '7TV', bttv: 'BetterTTV', ffz: 'FrankerFaceZ', ossxp: 'OSSXP' };

let emotePromise: Promise<EmoteMap> | null = null;
const listeners = new Set<(m: EmoteMap) => void>();

function loadEmotes(force = false): Promise<EmoteMap> {
  if (force) emotePromise = null;
  emotePromise ??= api<{ emotes: Emote[] }>('/emotes')
    .then(({ emotes }) => {
      const map = new Map(emotes.map((e) => [e.name, e]));
      // Leere Liste (z. B. Anbieter kurz nicht erreichbar) nicht dauerhaft merken
      if (map.size === 0) emotePromise = null;
      listeners.forEach((l) => l(map));
      return map;
    })
    .catch((err) => {
      console.warn('[chatterinoXP] Emotes konnten nicht geladen werden:', err);
      emotePromise = null;
      return new Map();
    });
  return emotePromise;
}

/** Wird ein Emote für alle hinzugefügt/entfernt, meldet der Server das – dann neu laden. */
let socketBound = false;
function bindSocket() {
  if (socketBound) return;
  socketBound = true;
  getSocket().on('emotes:update', () => loadEmotes(true));
}

export function useEmotes() {
  const [emotes, setEmotes] = useState<EmoteMap>(new Map());
  useEffect(() => {
    bindSocket();
    listeners.add(setEmotes);
    loadEmotes().then((m) => {
      setEmotes(m);
      // Nichts geladen? In 15 s noch einmal versuchen
      if (m.size === 0) setTimeout(() => loadEmotes(true), 15_000);
    });
    return () => {
      listeners.delete(setEmotes);
    };
  }, []);
  return emotes;
}

export const reloadEmotes = () => loadEmotes(true);

const URL_RE = /^https?:\/\/[^\s]+$/i;
const MENTION_RE = /^@\w{2,}$/;

/**
 * Zerlegt einen Nachrichtentext in Text, Emotes, Links und @Erwähnungen.
 * Zero-Width-Emotes (z. B. 7TV-Overlays) werden über das vorherige Emote gelegt.
 */
export function tokenize(text: string, emotes: EmoteMap): Token[] {
  const tokens: Token[] = [];
  const pushText = (t: string) => {
    const last = tokens[tokens.length - 1];
    if (last?.type === 'text') last.text += t;
    else tokens.push({ type: 'text', text: t });
  };

  for (const part of text.split(/(\s+)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      pushText(part);
      continue;
    }

    const emote = emotes.get(part);
    if (emote) {
      if (emote.zeroWidth) {
        const prev = tokens[tokens.length - 1];
        const beforePrev = tokens[tokens.length - 2];
        if (prev?.type === 'emote') {
          prev.overlays.push(emote);
          continue;
        }
        if (prev?.type === 'text' && !prev.text.trim() && beforePrev?.type === 'emote') {
          tokens.pop();
          beforePrev.overlays.push(emote);
          continue;
        }
      }
      tokens.push({ type: 'emote', emote, overlays: [] });
    } else if (URL_RE.test(part)) {
      tokens.push({ type: 'link', href: part });
    } else if (MENTION_RE.test(part)) {
      tokens.push({ type: 'mention', name: part.slice(1) });
    } else {
      pushText(part);
    }
  }
  return tokens;
}
