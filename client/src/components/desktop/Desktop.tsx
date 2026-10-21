/**
 * Der Desktop: Hintergrundbild + App-Icons (aus der Registry).
 * Einfachklick = auswählen, Doppelklick/Enter = App starten,
 * Ziehen = Icon verschieben (rastet im Raster ein, Position wird gemerkt),
 * Rechtsklick = Kontextmenü („Symbole automatisch anordnen“).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { apps } from '../../apps/registry';
import { launchApp } from '../../core/launcher';
import { CELL_H, CELL_W, DESKTOP_PADDING, layoutIcons, nearestFree, useDesktopStore, type Cell } from '../../store/desktopStore';
import { useUiStore } from '../../store/uiStore';

/** Ab so vielen Pixeln Mausbewegung wird aus einem Klick ein Ziehen. */
const DRAG_THRESHOLD = 4;

interface DragState {
  id: string;
  dx: number;
  dy: number;
}

export function Desktop() {
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const positions = useDesktopStore((s) => s.positions);
  const { cols, rows, ref } = useGridSize();

  const desktopApps = apps.filter((a) => a.placement?.desktop !== false);
  const layout = layoutIcons(
    desktopApps.map((a) => a.id),
    positions,
    cols,
    rows,
  );

  /** Pointer-Logik eines Icons: Klick wählt aus, Bewegung über die Schwelle startet das Ziehen. */
  function onIconPointerDown(e: React.PointerEvent, appId: string) {
    if (e.button !== 0) return;
    setSelected(appId);
    setMenu(null);
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!dragging) {
        dragging = true;
        document.body.classList.add('xp-dragging');
      }
      setDrag({ id: appId, dx, dy });
    };

    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('xp-dragging');
      if (!dragging) return;

      // Zielzelle aus der neuen Position berechnen und in freie Zelle einrasten
      const from = layout[appId];
      const target: Cell = {
        col: clamp(Math.round(from.col + (ev.clientX - startX) / CELL_W), 0, cols - 1),
        row: clamp(Math.round(from.row + (ev.clientY - startY) / CELL_H), 0, rows - 1),
      };
      const used = new Set(
        Object.entries(layout)
          .filter(([id]) => id !== appId)
          .map(([, c]) => `${c.col}:${c.row}`),
      );
      const free = used.has(`${target.col}:${target.row}`) ? nearestFree(target, used, cols, rows) : target;

      // Alle aktuellen Positionen festschreiben, damit nichts „nachrutscht“
      const store = useDesktopStore.getState();
      Object.entries(layout).forEach(([id, c]) => store.setPosition(id, id === appId ? free : c));
      setDrag(null);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!selected) return;
    const i = desktopApps.findIndex((a) => a.id === selected);
    if (e.key === 'Enter') launchApp(selected);
    if (e.key === 'ArrowDown') setSelected(desktopApps[Math.min(i + 1, desktopApps.length - 1)].id);
    if (e.key === 'ArrowUp') setSelected(desktopApps[Math.max(i - 1, 0)].id);
  };

  return (
    <div
      ref={ref}
      className="desktop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          setSelected(null);
          setMenu(null);
          useUiStore.getState().closeStartMenu();
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (e.target === e.currentTarget) setMenu({ x: e.clientX, y: e.clientY });
      }}
      onKeyDown={onKeyDown}
    >
      {desktopApps.map((app) => {
        const cell = layout[app.id];
        const isDragged = drag?.id === app.id;
        return (
          <button
            key={app.id}
            className={`desktop-icon ${selected === app.id ? 'selected' : ''} ${isDragged ? 'dragging' : ''}`}
            style={
              {
                '--icon': `url("${app.icon}")`,
                left: DESKTOP_PADDING + cell.col * CELL_W,
                top: DESKTOP_PADDING + cell.row * CELL_H,
                transform: isDragged ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined,
              } as React.CSSProperties
            }
            onPointerDown={(e) => onIconPointerDown(e, app.id)}
            onDoubleClick={() => launchApp(app.id)}
            title={app.description}
          >
            <span className="desktop-icon-img">
              <img src={app.icon} alt="" draggable={false} />
            </span>
            <span className="desktop-icon-label">{app.title}</span>
          </button>
        );
      })}

      {menu && (
        <DesktopMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onArrange={() => {
            useDesktopStore.getState().resetPositions();
            setMenu(null);
          }}
        />
      )}
    </div>
  );
}

function DesktopMenu({ x, y, onClose, onArrange }: { x: number; y: number; onClose: () => void; onArrange: () => void }) {
  useEffect(() => {
    const close = (e: PointerEvent) => !(e.target as HTMLElement).closest('.xp-context-menu') && onClose();
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [onClose]);

  return (
    <div className="xp-context-menu" style={{ left: x, top: y }} role="menu">
      <button role="menuitem" onClick={onArrange}>
        Symbole automatisch anordnen
      </button>
      <hr />
      <button role="menuitem" onClick={() => location.reload()}>
        Aktualisieren
      </button>
    </div>
  );
}

/** Wie viele Rasterzellen passen gerade auf den Desktop? (reagiert auf Fenstergröße) */
function useGridSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ cols: 10, rows: 6 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setSize({
        cols: Math.max(1, Math.floor((el.clientWidth - DESKTOP_PADDING) / CELL_W)),
        rows: Math.max(1, Math.floor((el.clientHeight - DESKTOP_PADDING) / CELL_H)),
      });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ...size, ref };
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
