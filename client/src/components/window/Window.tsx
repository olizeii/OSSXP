/**
 * Ein App-Fenster: Titelleiste (verschieben, Doppelklick = maximieren), Resize-Griffe,
 * Minimieren/Maximieren/Schließen und der App-Inhalt (lazy geladen, mit Error-Boundary).
 */
import { Component, Suspense, useCallback, type ErrorInfo, type ReactNode } from 'react';
import { appsById } from '../../apps/registry';
import { usePointerDrag } from '../../core/usePointerDrag';
import { TASKBAR_HEIGHT, useWindowStore, type Bounds, type WindowState } from '../../store/windowStore';
import { TitleBarControls } from './TitleBarControls';

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const EDGES: Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

/** Mindestens so viel der Titelleiste muss sichtbar bleiben. */
const KEEP_VISIBLE = 80;

export function Window({ win, active }: { win: WindowState; active: boolean }) {
  const { focus, close, minimize, toggleMaximize, setBounds } = useWindowStore.getState();
  const app = appsById[win.appId];
  const AppComponent = app?.component;

  // ── Verschieben über die Titelleiste ──
  const startMove = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('.title-bar-controls')) return false;
      focus(win.id);
      if (win.maximized) return false;
      return { x: win.x, y: win.y };
    },
    [focus, win.id, win.maximized, win.x, win.y],
  );
  const onMove = useCallback(
    ({ dx, dy }: { dx: number; dy: number }, start: { x: number; y: number }) => {
      const maxX = window.innerWidth - KEEP_VISIBLE;
      const maxY = window.innerHeight - TASKBAR_HEIGHT - 29;
      setBounds(win.id, {
        x: Math.min(Math.max(start.x + dx, KEEP_VISIBLE - win.width), maxX),
        y: Math.min(Math.max(start.y + dy, 0), maxY),
      });
    },
    [setBounds, win.id, win.width],
  );
  const onTitlePointerDown = usePointerDrag(startMove, onMove);

  // ── Größe ändern ──
  const startResize = useCallback(
    (e: React.PointerEvent) => {
      focus(win.id);
      return { edge: (e.currentTarget as HTMLElement).dataset.edge as Edge, start: { ...win } as Bounds };
    },
    [focus, win],
  );
  const onResize = useCallback(
    ({ dx, dy }: { dx: number; dy: number }, { edge, start }: { edge: Edge; start: Bounds }) => {
      const b = { ...start };
      if (edge.includes('e')) b.width = Math.max(win.minWidth, start.width + dx);
      if (edge.includes('s')) b.height = Math.max(win.minHeight, start.height + dy);
      if (edge.includes('w')) {
        b.width = Math.max(win.minWidth, start.width - dx);
        b.x = start.x + start.width - b.width;
      }
      if (edge.includes('n')) {
        b.height = Math.max(win.minHeight, start.height - dy);
        b.y = Math.max(0, start.y + start.height - b.height);
      }
      setBounds(win.id, b);
    },
    [setBounds, win.id, win.minWidth, win.minHeight],
  );
  const onResizePointerDown = usePointerDrag(startResize, onResize);

  const className = [
    'xp-window',
    active ? '' : 'inactive',
    win.maximized ? 'maximized' : '',
    win.minimized ? 'minimized' : '',
  ].join(' ');

  const style: React.CSSProperties = win.maximized
    ? { left: 0, top: 0, width: '100%', height: `calc(100% - ${TASKBAR_HEIGHT}px)`, zIndex: win.z }
    : { left: win.x, top: win.y, width: win.width, height: win.height, zIndex: win.z };

  return (
    <section
      className={className}
      style={style}
      role="dialog"
      aria-label={win.title}
      aria-hidden={win.minimized}
      onPointerDownCapture={() => focus(win.id)}
    >
      <header
        className="title-bar"
        onPointerDown={onTitlePointerDown}
        onDoubleClick={() => win.resizable && toggleMaximize(win.id)}
      >
        <img className="title-bar-icon" src={win.icon} alt="" />
        <span className="title-bar-text">{win.title}</span>
        <TitleBarControls
          maximized={win.maximized}
          canMaximize={win.resizable}
          onMinimize={() => minimize(win.id)}
          onMaximize={() => toggleMaximize(win.id)}
          onClose={() => close(win.id)}
        />
      </header>

      <div className="window-body">
        <AppErrorBoundary appTitle={win.title}>
          <Suspense fallback={<div className="xp-loading">Wird geladen…</div>}>
            {AppComponent ? <AppComponent windowId={win.id} params={win.params} /> : null}
          </Suspense>
        </AppErrorBoundary>
      </div>

      {win.resizable &&
        !win.maximized &&
        EDGES.map((edge) => (
          <div key={edge} className={`resize-handle ${edge}`} data-edge={edge} onPointerDown={onResizePointerDown} />
        ))}
    </section>
  );
}

/** Fängt Fehler einer App ab, damit nicht der ganze Desktop abstürzt. */
class AppErrorBoundary extends Component<{ appTitle: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.appTitle}]`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="xp-loading" style={{ padding: 20, textAlign: 'center' }}>
        <div>
          <b>{this.props.appTitle}</b> hat ein Problem festgestellt und muss beendet werden.
          <p style={{ color: '#666' }}>{this.state.error.message}</p>
          <button className="xp-button" onClick={() => this.setState({ error: null })}>
            Neu starten
          </button>
        </div>
      </div>
    );
  }
}
