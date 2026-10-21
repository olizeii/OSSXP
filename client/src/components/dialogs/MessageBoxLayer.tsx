/**
 * Zeigt Meldungsfenster aus dem uiStore an (z. B. „Sie müssen angemeldet sein“).
 * Mehrere Meldungen werden gestapelt; die oberste hat den Fokus.
 */
import { useEffect, useRef } from 'react';
import { useUiStore, type MessageBox } from '../../store/uiStore';
import { MessageGlyph } from '../xp/Glyphs';
import { XpDialog } from './XpDialog';

export function MessageBoxLayer() {
  const messages = useUiStore((s) => s.messages);
  if (messages.length === 0) return null;
  return (
    <div className="modal-layer">
      {messages.map((m) => (
        <MessageBoxDialog key={m.id} msg={m} />
      ))}
    </div>
  );
}

function MessageBoxDialog({ msg }: { msg: MessageBox }) {
  const dismiss = useUiStore((s) => s.dismissMessage);
  const primaryRef = useRef<HTMLButtonElement>(null);
  useEffect(() => primaryRef.current?.focus(), []);

  return (
    <XpDialog title={msg.title} width={370} onClose={() => dismiss(msg.id)}>
      <div className="msgbox-body selectable">
        <MessageGlyph type={msg.icon} />
        <div>{msg.text}</div>
      </div>
      <div className="dialog-buttons">
        {msg.buttons.map((b) => (
          <button
            key={b.label}
            ref={b.primary ? primaryRef : undefined}
            className={`xp-button ${b.primary ? 'default' : ''}`}
            onClick={() => {
              dismiss(msg.id);
              b.action?.();
            }}
          >
            {b.label}
          </button>
        ))}
      </div>
    </XpDialog>
  );
}
