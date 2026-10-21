/**
 * Ein frei verschiebbares XP-Dialogfenster außerhalb des Window-Managers
 * (für modale Dinge wie Login und Meldungen). Startet zentriert.
 */
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { usePointerDrag } from '../../core/usePointerDrag';
import { TitleBarControls } from '../window/TitleBarControls';

interface Props {
  title: string;
  icon?: string;
  width: number;
  onClose?: () => void;
  children: ReactNode;
  className?: string;
}

export function XpDialog({ title, icon, width, onClose, children, className = '' }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  // Nach dem ersten Rendern mittig platzieren (Höhe ist erst dann bekannt)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || pos) return;
    const parent = el.offsetParent as HTMLElement | null;
    const pw = parent?.clientWidth ?? window.innerWidth;
    const ph = parent?.clientHeight ?? window.innerHeight;
    setPos({ x: Math.max(0, (pw - el.offsetWidth) / 2), y: Math.max(0, (ph - el.offsetHeight) / 2.4) });
  }, [pos]);

  const start = useCallback(
    (e: React.PointerEvent) => ((e.target as HTMLElement).closest('.title-bar-controls') ? false : (pos ?? { x: 0, y: 0 })),
    [pos],
  );
  const move = useCallback(
    ({ dx, dy }: { dx: number; dy: number }, s: { x: number; y: number }) =>
      setPos({ x: s.x + dx, y: Math.max(0, s.y + dy) }),
    [],
  );
  const onPointerDown = usePointerDrag(start, move);

  return (
    <section
      ref={ref}
      className={`xp-window xp-dialog ${className}`}
      role="dialog"
      aria-label={title}
      style={{ width, left: pos?.x ?? 0, top: pos?.y ?? 0, visibility: pos ? 'visible' : 'hidden' }}
    >
      <header className="title-bar" onPointerDown={onPointerDown}>
        {icon && <img className="title-bar-icon" src={icon} alt="" />}
        <span className="title-bar-text">{title}</span>
        {onClose && <TitleBarControls onClose={onClose} />}
      </header>
      <div className="window-body">{children}</div>
    </section>
  );
}
