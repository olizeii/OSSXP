/**
 * Rendert alle offenen Fenster. Die Reihenfolge im DOM bleibt stabil (Öffnungsreihenfolge),
 * die Stapelung regelt der z-index – so werden Apps beim Fokuswechsel nicht neu gemountet.
 */
import { useWindowStore } from '../../store/windowStore';
import { Window } from './Window';

export function WindowManager() {
  const windows = useWindowStore((s) => s.windows);
  const activeId = useWindowStore((s) => s.activeId);

  return (
    <div className="window-layer">
      {windows.map((w) => (
        <Window key={w.id} win={w} active={w.id === activeId} />
      ))}
    </div>
  );
}
