/**
 * Kleiner Hook für Drag-Operationen mit Pointer Events (Maus, Touch, Stift).
 * Wird für Fenster verschieben, Fenstergröße ändern und Dialoge verschieben benutzt.
 */
import { useCallback } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export interface DragDelta {
  dx: number;
  dy: number;
}

/**
 * @param onStart wird beim Drücken aufgerufen; Rückgabe = Kontext, der an onMove geht (oder false = abbrechen)
 * @param onMove  bekommt die Verschiebung relativ zum Startpunkt
 */
export function usePointerDrag<T>(
  onStart: (e: ReactPointerEvent) => T | false,
  onMove: (delta: DragDelta, ctx: T) => void,
  cursor = 'default',
) {
  return useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      const ctx = onStart(e);
      if (ctx === false) return;

      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      document.body.classList.add('xp-dragging');
      document.body.style.cursor = cursor;

      let frame = 0;
      const move = (ev: PointerEvent) => {
        cancelAnimationFrame(frame);
        // Max. ein State-Update pro Frame → flüssig auch bei vielen Fenstern
        frame = requestAnimationFrame(() => onMove({ dx: ev.clientX - startX, dy: ev.clientY - startY }, ctx));
      };
      const up = () => {
        cancelAnimationFrame(frame);
        document.body.classList.remove('xp-dragging');
        document.body.style.cursor = '';
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
    [onStart, onMove, cursor],
  );
}
