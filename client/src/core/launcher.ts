/**
 * Launcher: der einzige Weg, eine App zu öffnen.
 * Prüft die `requires`-Angaben der AppDefinition und zeigt sonst eine XP-Meldung
 * mit passender Aktion (Anmelden / Untis verknüpfen).
 */
import { appsById } from '../apps/registry';
import { useAuthStore, type User } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { useWindowStore } from '../store/windowStore';
import type { AppDefinition } from './types';

/** Warum darf der aktuelle User diese App (noch) nicht nutzen? null = alles ok. */
export function missingRequirement(app: AppDefinition, user: User | null): 'auth' | 'untis' | null {
  const needsAuth = app.requires?.auth || app.requires?.untis;
  if (needsAuth && !user) return 'auth';
  if (app.requires?.untis && !user?.untisLinked) return 'untis';
  return null;
}

export function launchApp(appId: string, params?: Record<string, unknown>) {
  const app = appsById[appId];
  const ui = useUiStore.getState();
  ui.closeStartMenu();

  if (!app) {
    ui.showMessage({ title: 'Fehler', icon: 'error', text: `Die Anwendung „${appId}“ wurde nicht gefunden.` });
    return;
  }

  const missing = missingRequirement(app, useAuthStore.getState().user);

  if (missing === 'auth') {
    ui.showMessage({
      title: app.title,
      icon: 'warning',
      text: `Um „${app.title}“ zu verwenden, müssen Sie angemeldet sein.`,
      buttons: [
        // Nach erfolgreichem Login wird die App automatisch erneut gestartet
        { label: 'Anmelden', primary: true, action: () => ui.openLogin({ onSuccess: () => launchApp(appId, params) }) },
        { label: 'Abbrechen' },
      ],
    });
    return;
  }

  if (missing === 'untis') {
    ui.showMessage({
      title: app.title,
      icon: 'info',
      text: `„${app.title}“ benötigt einen mit Untis verknüpften Account.\nSie können die Verknüpfung in den Kontoeinstellungen herstellen.`,
      buttons: [
        { label: 'Jetzt verknüpfen', primary: true, action: () => launchApp('account', { tab: 'untis' }) },
        { label: 'Abbrechen' },
      ],
    });
    return;
  }

  useWindowStore.getState().open(app, params);
}

/**
 * Schließt alle Fenster, deren Voraussetzungen nicht mehr erfüllt sind
 * (z. B. nach dem Abmelden oder Entknüpfen von Untis). Wird in App.tsx abonniert.
 */
export function enforceRequirements(user: User | null) {
  useWindowStore.getState().closeWhere((w) => {
    const app = appsById[w.appId];
    return Boolean(app && missingRequirement(app, user));
  });
}
