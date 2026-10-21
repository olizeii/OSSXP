/**
 * ════════════════════════════════════════════════════════════════════════════
 *  APP-REGISTRY – hier werden alle Apps von OSSXP registriert.
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Neue App hinzufügen:
 *    1. Ordner src/apps/<meine-app>/ anlegen
 *    2. Komponente schreiben:   export default function MeineApp(props: AppWindowProps) { … }
 *    3. index.ts mit defineApp({ id, title, icon, component: lazy(() => import('./MeineApp')) })
 *    4. Hier unten importieren und ins Array eintragen – fertig.
 *
 *  Desktop-Icons, Startmenü, „Alle Programme“, Taskleiste, Fenster und
 *  Zugriffsschutz (requires: { auth, untis }) ergeben sich automatisch.
 *  Die Reihenfolge im Array = Reihenfolge auf dem Desktop und im Startmenü.
 */
import type { AppDefinition } from '../core/types';
import about from './about';
import account from './account';
import chatterinoxp from './chatterinoxp';
import untisxp from './untisxp';

export const apps: AppDefinition[] = [untisxp, chatterinoxp, account, about];

export const appsById: Record<string, AppDefinition> = Object.fromEntries(apps.map((a) => [a.id, a]));
