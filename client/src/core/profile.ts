/**
 * Öffnet das Profilfenster eines Users – aus jeder App (Chat, redXP, Scoreboard, MollyXP …).
 * Pro User gibt es höchstens ein Fenster (instanceKey der Profil-App); ein erneuter Klick holt es nach vorne.
 */
import { launchApp } from './launcher';

export const openProfile = (username: string) => launchApp('profile', { username });
