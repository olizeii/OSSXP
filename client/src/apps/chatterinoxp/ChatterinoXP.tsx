/**
 * chatterinoXP – Chat-Client im Stil von Chatterino:
 * Tabs oben (Channels und Privatnachrichten „@name“), Split-Kopf mit Channelname, kompakte
 * Nachrichtenzeilen mit Zeitstempel, Rang-Symbol, Abzeichen, farbigen Namen und Emotes
 * (7TV, BTTV, FFZ, OSSXP-Set), Eingabezeile mit Tab-Vervollständigung und Befehlen (/w, /timeout, /help).
 */
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { UserName } from '../../components/user/UserBits';
import { api } from '../../core/api';
import type { AppWindowProps } from '../../core/types';
import { hasRank, useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { useWindowStore } from '../../store/windowStore';
import { isDm, useChatStore, type ChatMessage, type Conversation } from './chatStore';
import { PROVIDER_LABEL, reloadEmotes, tokenize, useEmotes, type Emote, type EmoteMap } from './emotes';
import './chatterino.css';

const MAX_LENGTH = 500;

export default function ChatterinoXP({ windowId, params }: AppWindowProps) {
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

  // Aus dem Profil: „Nachricht senden“ → Privatnachrichten-Tab öffnen
  useEffect(() => {
    const dm = params?.dm as string | undefined;
    if (!dm) return;
    const open = () => useChatStore.getState().openTab(`@${dm}`);
    if (useChatStore.getState().connected) open();
    else return useChatStore.subscribe((s, prev) => s.connected && !prev.connected && open());
  }, [params]);

  // Fenstertitel wie bei Chatterino: „chatterinoXP – <user>“
  useEffect(() => {
    useWindowStore.getState().setTitle(windowId, `chatterinoXP – ${username ?? 'Zuschauer'}`);
  }, [windowId, username]);

  const active = chat.active;
  const messages = active ? (chat.messages[active] ?? []) : [];
  const addable = chat.channels.filter((c) => !chat.tabs.includes(c));
  const dm = active ? isDm(active) : false;

  return (
    <div className="ct" onMouseLeave={() => setTooltip(null)}>
      <TabBar addable={addable} />

      <div className="ct-split">
        <div className="ct-header">
          <span className="ct-header-left" title={dm ? 'Privatnachricht' : 'Zuschauer im Channel'}>
            {active && !dm ? `${chat.viewers[active] ?? 0} Zuschauer` : dm ? 'privat' : ''}
          </span>
          <span className="ct-header-title">
            {dm ? `Privat: ${active!.slice(1)}` : (active ?? '…')}
            {chat.connected ? '' : ' (getrennt)'}
          </span>
          <span className="ct-header-right">
            {chat.readOnly ? 'Zuschauer' : ''}
            {chat.canModerate && active && !dm && active !== chat.channels[0] && (
              <button
                className="ct-header-btn"
                title="Channel löschen (Moderation)"
                onClick={() =>
                  useUiStore.getState().showMessage({
                    title: 'chatterinoXP',
                    icon: 'warning',
                    text: `Channel #${active} für alle löschen?`,
                    buttons: [{ label: 'Löschen', primary: true, action: () => chat.deleteChannel(active) }, { label: 'Abbrechen' }],
                  })
                }
              >
                ✕
              </button>
            )}
          </span>
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
  const { tabs, active, unread, setActive, closeTab, openTab, readOnly, canCreateChannels, createChannel, listConversations } = useChatStore();
  const [menu, setMenu] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [input, setInput] = useState<'dm' | 'channel' | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (menu && !readOnly) listConversations().then(setConversations);
  }, [menu, readOnly, listConversations]);

  async function submit() {
    const name = value.trim().replace(/^[@#]/, '');
    if (!name) return;
    if (input === 'dm') {
      openTab(`@${name}`);
    } else {
      const err = await createChannel(name);
      if (err) return setError(err);
    }
    setInput(null);
    setValue('');
    setError('');
    setMenu(false);
  }

  return (
    <div className="ct-tabs">
      {tabs.map((t) => (
        <button
          key={t}
          className={`ct-tab ${t === active ? 'active' : ''} ${unread[t] ? 'unread' : ''} ${isDm(t) ? 'dm' : ''}`}
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
        <button className="ct-tab-add" onClick={() => setMenu((v) => !v)} title="Channel oder Privatnachricht öffnen">
          +
        </button>
        {menu && (
          <div className="ct-menu" onMouseLeave={() => !input && setMenu(false)}>
            {addable.length > 0 && <span className="ct-menu-head">Channels</span>}
            {addable.map((c) => (
              <button key={c} onClick={() => (openTab(c), setMenu(false))}>
                #{c}
              </button>
            ))}
            {!readOnly && (
              <>
                <span className="ct-menu-head">Privatnachrichten</span>
                {conversations.map((c) => (
                  <button key={c.partner.username} onClick={() => (openTab(`@${c.partner.username}`), setMenu(false))}>
                    <span style={{ color: c.partner.color }}>@{c.partner.username}</span>
                    {c.unread > 0 && <span className="ct-unread">{c.unread}</span>}
                  </button>
                ))}
                <button onClick={() => setInput('dm')}>+ Neue Privatnachricht…</button>
              </>
            )}
            {canCreateChannels && <button onClick={() => setInput('channel')}>+ Neuer Channel… (Moderation)</button>}
            {input && (
              <form className="ct-menu-form" onSubmit={(e) => (e.preventDefault(), submit())}>
                <input autoFocus placeholder={input === 'dm' ? 'Benutzername' : 'channel-name'} value={value} onChange={(e) => setValue(e.target.value)} />
                <button type="submit">OK</button>
                {error && <span className="ct-menu-error">{error}</span>}
              </form>
            )}
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
      <UserName className="ct-name" username={msg.user.username} color={msg.user.color} badges={msg.user.badges} rank={msg.user.rank} />
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

type PickerTab = 'all' | Emote['provider'] | 'search';
const PICKER_TABS: [PickerTab, string][] = [
  ['all', 'Alle'],
  ['7tv', '7TV'],
  ['bttv', 'BTTV'],
  ['ffz', 'FFZ'],
  ['ossxp', 'OSSXP'],
  ['search', '+ 7TV-Suche'],
];
const PICKER_LIMIT = 300;

interface SearchResult {
  id: string;
  name: string;
  animated: boolean;
  owner: string | null;
  url: string;
}

function EmotePicker({ emotes, onPick, onClose }: { emotes: EmoteMap; onPick: (name: string) => void; onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<PickerTab>('all');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [status, setStatus] = useState('');
  const q = query.trim().toLowerCase();

  const list = useMemo(
    () =>
      tab === 'search'
        ? []
        : [...emotes.values()].filter((e) => (tab === 'all' || e.provider === tab) && (!q || e.name.toLowerCase().includes(q))),
    [emotes, tab, q],
  );

  // 7TV-Katalog durchsuchen (kurz verzögert, damit nicht jeder Tastendruck eine Anfrage auslöst)
  useEffect(() => {
    if (tab !== 'search' || q.length < 2) return setResults(null);
    const t = setTimeout(() => {
      setStatus('Suche…');
      api<{ results: SearchResult[] }>(`/emotes/search?q=${encodeURIComponent(query.trim())}`).then(
        (r) => (setResults(r.results), setStatus('')),
        (e: Error) => setStatus(e.message),
      );
    }, 350);
    return () => clearTimeout(t);
  }, [tab, q, query]);

  async function add(r: SearchResult) {
    setStatus('');
    try {
      await api('/emotes/custom', { method: 'POST', body: { id: r.id, name: r.name, animated: r.animated } });
      setStatus(`„${r.name}“ ist jetzt für alle verfügbar.`);
      reloadEmotes();
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  async function remove(name: string) {
    await api(`/emotes/custom/${encodeURIComponent(name)}`, { method: 'DELETE' }).catch(() => {});
    reloadEmotes();
  }

  const canAdd = hasRank(user, 'verified');

  return (
    <div className="ct-picker" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="ct-picker-tabs">
        {PICKER_TABS.map(([p, label]) => (
          <button key={p} className={tab === p ? 'active' : ''} onClick={() => setTab(p)}>
            {label}
          </button>
        ))}
        <button className="ct-picker-close" onClick={onClose}>
          ×
        </button>
      </div>
      <input
        autoFocus
        className="ct-picker-search"
        placeholder={tab === 'search' ? 'Ganz 7TV durchsuchen, z. B. „peepoSad“…' : `In ${emotes.size} Emotes suchen…`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {tab === 'search' ? (
        <div className="ct-picker-grid ct-search-grid">
          {!canAdd && <span className="ct-picker-empty">Emotes hinzufügen können Nutzer:innen ab Rang „Verifiziert“ (Untis verknüpft).</span>}
          {status && <span className="ct-picker-status">{status}</span>}
          {q.length < 2 && <span className="ct-picker-empty">Fehlt ein Emote? Hier findest du jedes 7TV-Emote und kannst es für alle hinzufügen.</span>}
          {results?.length === 0 && <span className="ct-picker-empty">Nichts gefunden.</span>}
          {results?.map((r) => {
            const exists = emotes.has(r.name);
            return (
              <div key={r.id} className="ct-search-item" title={r.owner ? `von ${r.owner}` : r.name}>
                <img src={r.url} alt={r.name} loading="lazy" />
                <span>{r.name}</span>
                <button disabled={!canAdd || exists} onClick={() => add(r)}>
                  {exists ? 'vorhanden' : 'Hinzufügen'}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="ct-picker-grid">
          {list.length === 0 && <span className="ct-picker-empty">Keine Emotes gefunden – probiere die 7TV-Suche.</span>}
          {list.slice(0, PICKER_LIMIT).map((e) => (
            <span key={`${e.provider}-${e.id}`} className="ct-picker-cell">
              <button title={`${e.name} (${PROVIDER_LABEL[e.provider]})`} onClick={() => onPick(e.name)}>
                <img src={e.url} alt={e.name} loading="lazy" />
              </button>
              {tab === 'ossxp' && user?.isModerator && (
                <button className="ct-picker-remove" title="Aus dem OSSXP-Set entfernen" onClick={() => remove(e.name)}>
                  ×
                </button>
              )}
            </span>
          ))}
          {list.length > PICKER_LIMIT && <span className="ct-picker-empty">… und {list.length - PICKER_LIMIT} weitere – Suchbegriff eingeben.</span>}
        </div>
      )}
    </div>
  );
}
