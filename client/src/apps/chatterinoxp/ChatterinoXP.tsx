/**
 * chatterinoXP – Chat-Client im Stil von Chatterino:
 * Tabs oben, Split-Kopf mit Channelname, kompakte Nachrichtenzeilen mit Zeitstempel,
 * farbigen Namen und 7TV-/BTTV-Emotes, Eingabezeile mit Tab-Vervollständigung.
 */
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { UserName } from '../../components/user/UserBits';
import type { AppWindowProps } from '../../core/types';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { useWindowStore } from '../../store/windowStore';
import { useChatStore, type ChatMessage } from './chatStore';
import { PROVIDER_LABEL, tokenize, useEmotes, type Emote, type EmoteMap } from './emotes';
import './chatterino.css';

const MAX_LENGTH = 500;

export default function ChatterinoXP({ windowId }: AppWindowProps) {
  const username = useAuthStore((s) => s.user?.username ?? null);
  const chat = useChatStore();
  const emotes = useEmotes();
  const [tooltip, setTooltip] = useState<{ emote: Emote; x: number; y: number } | null>(null);

  // Channels betreten beim Öffnen, verlassen beim Schließen des Fensters.
  // (Login/Logout verbindet die gemeinsame Verbindung in App.tsx neu.)
  useEffect(() => {
    useChatStore.getState().connect();
    return () => useChatStore.getState().disconnect();
  }, []);

  // Fenstertitel wie bei Chatterino: „chatterinoXP – <user>“
  useEffect(() => {
    useWindowStore.getState().setTitle(windowId, `chatterinoXP – ${username ?? 'Zuschauer'}`);
  }, [windowId, username]);

  const active = chat.active;
  const messages = active ? (chat.messages[active] ?? []) : [];
  const addable = chat.channels.filter((c) => !chat.tabs.includes(c));

  return (
    <div className="ct" onMouseLeave={() => setTooltip(null)}>
      <TabBar addable={addable} />

      <div className="ct-split">
        <div className="ct-header">
          <span className="ct-header-left" title="Zuschauer im Channel">
            {active ? `${chat.viewers[active] ?? 0} 👁` : ''}
          </span>
          <span className="ct-header-title">
            {active ?? '…'}
            {chat.connected ? '' : ' (getrennt)'}
          </span>
          <span className="ct-header-right">{chat.readOnly ? 'Zuschauer' : ''}</span>
        </div>

        <MessageList
          messages={messages}
          emotes={emotes}
          me={chat.me?.username ?? null}
          onEmoteHover={(emote, el) => {
            if (!emote || !el) return setTooltip(null);
            const r = el.getBoundingClientRect();
            setTooltip({ emote, x: r.left + r.width / 2, y: r.top });
          }}
        />

        {chat.readOnly ? (
          <div className="ct-readonly">
            <span>Zuschauer-Modus – melde dich an, um mitzuschreiben.</span>
            <button className="ct-login" onClick={() => useUiStore.getState().openLogin()}>
              Anmelden
            </button>
          </div>
        ) : (
          <ChatInput emotes={emotes} placeholder={`Nachricht senden als ${chat.me?.username ?? ''}…`} messages={messages} />
        )}
      </div>

      {tooltip && (
        <div className="ct-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          <img src={tooltip.emote.url2x} alt="" />
          <b>{tooltip.emote.name}</b>
          <span>
            {tooltip.emote.scope === 'global' ? 'Globales' : 'Channel-'} {PROVIDER_LABEL[tooltip.emote.provider]}-Emote
            {tooltip.emote.zeroWidth ? ' (Overlay)' : ''}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Tabs ──────────────────────────────────────────────────────────────────

function TabBar({ addable }: { addable: string[] }) {
  const { tabs, active, unread, setActive, closeTab, openTab } = useChatStore();
  const [menu, setMenu] = useState(false);

  return (
    <div className="ct-tabs">
      {tabs.map((t) => (
        <button
          key={t}
          className={`ct-tab ${t === active ? 'active' : ''} ${unread[t] ? 'unread' : ''}`}
          onClick={() => setActive(t)}
          onAuxClick={(e) => e.button === 1 && closeTab(t)}
          title={tabs.length > 1 ? 'Mittlere Maustaste: Tab schließen' : undefined}
        >
          {t}
          {tabs.length > 1 && (
            <span
              className="ct-tab-close"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(t);
              }}
            >
              ×
            </span>
          )}
        </button>
      ))}
      <div className="ct-tab-add-wrap">
        <button className="ct-tab-add" onClick={() => setMenu((v) => !v)} disabled={addable.length === 0} title="Channel hinzufügen">
          +
        </button>
        {menu && addable.length > 0 && (
          <div className="ct-menu" onMouseLeave={() => setMenu(false)}>
            {addable.map((c) => (
              <button
                key={c}
                onClick={() => {
                  openTab(c);
                  setMenu(false);
                }}
              >
                #{c}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Nachrichten ───────────────────────────────────────────────────────────

function MessageList({
  messages,
  emotes,
  me,
  onEmoteHover,
}: {
  messages: ChatMessage[];
  emotes: EmoteMap;
  me: string | null;
  onEmoteHover: (emote: Emote | null, el: HTMLElement | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true); // klebt am unteren Rand?

  // Neue Nachrichten: nur mitscrollen, wenn man unten ist (wie Chatterino)
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && pinned) el.scrollTop = el.scrollHeight;
  }, [messages, pinned, emotes]);

  return (
    <div className="ct-messages-wrap">
      <div
        ref={ref}
        className="ct-messages selectable"
        onScroll={(e) => {
          const el = e.currentTarget;
          setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 30);
        }}
        onMouseOver={(e) => {
          const img = (e.target as HTMLElement).closest<HTMLElement>('[data-emote]');
          onEmoteHover(img ? (emotes.get(img.dataset.emote!) ?? null) : null, img);
        }}
      >
        {messages.map((m) => (
          <MessageLine key={m.id} msg={m} emotes={emotes} me={me} />
        ))}
      </div>
      {!pinned && (
        <button className="ct-more" onClick={() => setPinned(true)}>
          Mehr Nachrichten unten
        </button>
      )}
    </div>
  );
}

const MessageLine = memo(function MessageLine({ msg, emotes, me }: { msg: ChatMessage; emotes: EmoteMap; me: string | null }) {
  const time = new Date(msg.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const tokens = useMemo(() => tokenize(msg.text, emotes), [msg.text, emotes]);

  if (!msg.user) {
    return (
      <div className="ct-msg system">
        <span className="ct-time">{time}</span> {msg.text}
      </div>
    );
  }

  const mentioned = me && msg.user.username !== me && tokens.some((t) => t.type === 'mention' && t.name.toLowerCase() === me.toLowerCase());

  return (
    <div className={`ct-msg ${mentioned ? 'highlight' : ''}`}>
      <span className="ct-time">{time}</span>{' '}
      <UserName className="ct-name" username={msg.user.username} color={msg.user.color} badges={msg.user.badges} />
      <span className="ct-colon">:</span>{' '}
      {tokens.map((t, i) => {
        switch (t.type) {
          case 'text':
            return <span key={i}>{t.text}</span>;
          case 'emote':
            return (
              <span key={i} className="ct-emote-stack">
                <img
                  className="ct-emote"
                  src={t.emote.url}
                  srcSet={`${t.emote.url} 1x, ${t.emote.url2x} 2x`}
                  alt={t.emote.name}
                  data-emote={t.emote.name}
                  loading="lazy"
                />
                {t.overlays.map((o) => (
                  <img key={o.id} className="ct-emote overlay" src={o.url} srcSet={`${o.url} 1x, ${o.url2x} 2x`} alt={o.name} data-emote={o.name} />
                ))}
              </span>
            );
          case 'link':
            return (
              <a key={i} href={t.href} target="_blank" rel="noopener noreferrer nofollow">
                {t.href}
              </a>
            );
          case 'mention':
            return (
              <span key={i} className="ct-mention">
                @{t.name}
              </span>
            );
        }
      })}
    </div>
  );
});

// ─── Eingabe ───────────────────────────────────────────────────────────────

function ChatInput({ emotes, placeholder, messages }: { emotes: EmoteMap; placeholder: string; messages: ChatMessage[] }) {
  const [text, setText] = useState('');
  const [picker, setPicker] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const completion = useRef<{ start: number; prefix: string; index: number } | null>(null);

  async function submit() {
    const value = text.trim();
    if (!value) return;
    setText('');
    const error = await useChatStore.getState().send(value);
    if (error) setText(value); // bei Fehler Text wiederherstellen
  }

  /** Tab-Vervollständigung für Emotes und Namen aus dem Channel (mehrfach Tab = nächster Treffer). */
  function complete() {
    const el = inputRef.current!;
    const cursor = el.selectionStart;
    let state = completion.current;
    if (!state) {
      const before = text.slice(0, cursor);
      const start = before.search(/\S+$/);
      if (start < 0) return;
      state = { start, prefix: before.slice(start), index: -1 };
    }
    const prefix = state.prefix.replace(/^@/, '').toLowerCase();
    const names = [...new Set(messages.filter((m) => m.user).map((m) => m.user!.username))];
    const candidates = [...names.map((n) => (state!.prefix.startsWith('@') ? `@${n}` : n)), ...emotes.keys()].filter((c) =>
      c.replace(/^@/, '').toLowerCase().startsWith(prefix),
    );
    if (candidates.length === 0) return;

    state.index = (state.index + 1) % candidates.length;
    const word = candidates[state.index];
    const afterWord = text.slice(cursor);
    const next = `${text.slice(0, state.start)}${word} ${afterWord.replace(/^\s/, '')}`;
    completion.current = state;
    setText(next.slice(0, MAX_LENGTH));
    requestAnimationFrame(() => el.setSelectionRange(state!.start + word.length + 1, state!.start + word.length + 1));
  }

  function insertEmote(name: string) {
    setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}${name} `.slice(0, MAX_LENGTH));
    inputRef.current?.focus();
  }

  return (
    <div className="ct-input">
      <textarea
        ref={inputRef}
        rows={1}
        value={text}
        maxLength={MAX_LENGTH}
        placeholder={placeholder}
        onChange={(e) => {
          completion.current = null;
          setText(e.target.value.replace(/\n/g, ''));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          } else if (e.key === 'Tab') {
            e.preventDefault();
            complete();
          } else if (e.key !== 'Shift') {
            completion.current = null;
          }
        }}
      />
      <div className="ct-input-bar">
        <span className={text.length > MAX_LENGTH - 50 ? 'warn' : ''}>
          {text.length}/{MAX_LENGTH}
        </span>
        <button className="ct-emote-btn" onClick={() => setPicker((v) => !v)} title="Emotes">
          ☺
        </button>
      </div>
      {picker && <EmotePicker emotes={emotes} onPick={insertEmote} onClose={() => setPicker(false)} />}
    </div>
  );
}

function EmotePicker({ emotes, onPick, onClose }: { emotes: EmoteMap; onPick: (name: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState<Emote['provider']>('7tv');
  const [query, setQuery] = useState('');
  const list = [...emotes.values()].filter((e) => e.provider === tab && e.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="ct-picker" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="ct-picker-tabs">
        {(['7tv', 'bttv'] as const).map((p) => (
          <button key={p} className={tab === p ? 'active' : ''} onClick={() => setTab(p)}>
            {PROVIDER_LABEL[p]}
          </button>
        ))}
        <button className="ct-picker-close" onClick={onClose}>
          ×
        </button>
      </div>
      <input autoFocus className="ct-picker-search" placeholder="Suchen…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="ct-picker-grid">
        {list.length === 0 && <span className="ct-picker-empty">Keine Emotes gefunden.</span>}
        {list.map((e) => (
          <button key={e.id} title={e.name} onClick={() => onPick(e.name)}>
            <img src={e.url} alt={e.name} loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
}
