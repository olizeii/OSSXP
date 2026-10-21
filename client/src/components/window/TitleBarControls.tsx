/**
 * Die drei XP-Titelleisten-Buttons (Minimieren, Maximieren/Wiederherstellen, Schließen)
 * mit als SVG gezeichneten Glyphen.
 */

interface Props {
  maximized?: boolean;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  /** false = kein Maximieren möglich (Button deaktiviert, wie bei XP-Dialogen). */
  canMaximize?: boolean;
}

const stop = (e: React.PointerEvent) => e.stopPropagation();

export function TitleBarControls({ maximized, onMinimize, onMaximize, onClose, canMaximize = true }: Props) {
  return (
    <div className="title-bar-controls" onPointerDown={stop} onDoubleClick={(e) => e.stopPropagation()}>
      {onMinimize && (
        <button aria-label="Minimieren" title="Minimieren" onClick={onMinimize}>
          <svg width="11" height="11" viewBox="0 0 11 11">
            <rect x="1" y="7" width="6" height="3" fill="#fff" />
          </svg>
        </button>
      )}
      {onMaximize && (
        <button
          aria-label={maximized ? 'Wiederherstellen' : 'Maximieren'}
          title={maximized ? 'Wiederherstellen' : 'Maximieren'}
          onClick={onMaximize}
          disabled={!canMaximize}
        >
          {maximized ? (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="#fff">
              <path d="M3.5 1.5h6v6" strokeWidth="1" />
              <rect x="3" y="1" width="7" height="2" fill="#fff" stroke="none" />
              <rect x="1.5" y="4.5" width="6" height="5.5" strokeWidth="1" />
              <rect x="1" y="4" width="7" height="2" fill="#fff" stroke="none" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <rect x="1" y="1" width="9" height="9" stroke="#fff" strokeWidth="1" />
              <rect x="1" y="1" width="9" height="2.5" fill="#fff" />
            </svg>
          )}
        </button>
      )}
      {onClose && (
        <button className="close" aria-label="Schließen" title="Schließen" onClick={onClose}>
          <svg width="11" height="11" viewBox="0 0 11 11">
            <path d="M2 2l7 7M9 2l-7 7" stroke="#fff" strokeWidth="2" strokeLinecap="square" />
          </svg>
        </button>
      )}
    </div>
  );
}
