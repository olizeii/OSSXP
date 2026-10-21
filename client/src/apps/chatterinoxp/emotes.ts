/**
 * 7TV-/BTTV-Emotes: Laden (einmal pro Seitenaufruf) und Zerlegen von Nachrichten in Tokens.
 */
import { useEffect, useState } from 'react';
import { api } from '../../core/api';

export interface Emote {
  id: string;
  name: string;
  provider: '7tv' | 'bttv';
  scope: 'global' | 'channel';
  url: string;
  url2x: string;
  zeroWidth: boolean;
}

export type EmoteMap = Map<string, Emote>;

export type Token =
  | { type: 'text'; text: string }
  | { type: 'emote'; emote: Emote; overlays: Emote[] }
  | { type: 'link'; href: string }
  | { type: 'mention'; name: string };

export const PROVIDER_LABEL: Record<Emote['provider'], string> = { '7tv': '7TV', bttv: 'BetterTTV' };

let emotePromise: Promise<EmoteMap> | null = null;

function loadEmotes(): Promise<EmoteMap> {
  emotePromise ??= api<{ emotes: Emote[] }>('/emotes')
    .then(({ emotes }) => new Map(emotes.map((e) => [e.name, e])))
    .catch((err) => {
      console.warn('[chatterinoXP] Emotes konnten nicht geladen werden:', err);
      emotePromise = null; // beim nächsten Mal erneut versuchen
      return new Map();
    });
  return emotePromise;
}

export function useEmotes() {
  const [emotes, setEmotes] = useState<EmoteMap>(new Map());
  useEffect(() => {
    let alive = true;
    loadEmotes().then((m) => alive && setEmotes(m));
    return () => {
      alive = false;
    };
  }, []);
  return emotes;
}

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
        // Vorheriges Emote suchen (nur Leerraum dazwischen erlaubt)
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
