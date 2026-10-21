# OSSXP

Eine Web-Desktop-Umgebung im Windows-XP-Design („Luna“) für Schüler:innen – Startpunkt ist die **HTL Hollabrunn**.
Fenster, Taskleiste, Startmenü, Login und ein Steam-ähnliches Ökosystem aus **Profilen, Level, Coins, Abzeichen und Shop**.

| App | Was sie kann |
| --- | --- |
| **UtisXP** | Schüler-Dashboard „Mein Tag“ (nächste Stunden, Ausfälle, Tests), Lehrer-/Klassen-/Raumsuche mit Live-Status, freie Räume, Vertretungen – Lehrerkürzel mit vollem Namen von der HTL-HL-Webseite |
| **chatterinoXP** | Echtzeit-Chat mit 7TV- & BTTV-Emotes, Abzeichen neben Namen |
| **redXP** | Forum mit Subreddits (z. B. pro Klasse), Up-/Downvotes, Kommentarbäume |
| **MollyXP** | Tests & Mitschriften pro Klasse teilen – Upload nur in die von Untis bestätigte eigene Klasse, standardmäßig anonym |
| **NewsXP** | News & Poster der Schule (Veröffentlichen nur für Admins) |
| **SudoXP** | Sudoku: klassisch oder tägliches Rätsel mit globaler Bestenliste |
| **Benutzerkonten / Profil / Punkteshop** | Steam-ähnliches Profil, Abzeichen-Vitrine, Hintergründe & Rahmen kaufen |
| **Clippy** | schwebender Desktop-Assistent mit Tipps (abschaltbar) |

Die Architektur (Datenbankschema, Economy, State-Management) steht in [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md).

- **Frontend:** React 19 + Vite + TypeScript, State mit Zustand
- **Backend:** Node.js + Express 5, Socket.IO, SQLite (better-sqlite3)
- **Auth:** eigene Accounts, JWT im httpOnly-Cookie, bcrypt-Hashes
- **Untis:** eigener WebUntis-JSON-RPC-Client (portiert aus [UntisDashboard](https://github.com/olizeii/UntisDashboard)),
  Passwörter AES-256-GCM-verschlüsselt

---

## Projektstruktur

```
OSSXP/
├─ package.json              # npm-Workspaces + Skripte (dev/build/start)
├─ client/                   # Frontend (Vite + React)
│  ├─ index.html
│  ├─ vite.config.ts         # Proxy /api + /socket.io → Backend
│  └─ src/
│     ├─ main.tsx, App.tsx   # Einstieg & Shell (Boot-Screen, Desktop, Taskleiste …)
│     ├─ core/
│     │  ├─ types.ts         # ⭐ AppDefinition – das App-Interface
│     │  ├─ launcher.ts      # launchApp(): prüft requires (Login/Untis), öffnet Fenster
│     │  ├─ avatars.ts       # Profilbilder: Galerie, Standardbild, Upload-Verkleinerung
│     │  ├─ api.ts           # fetch-Wrapper
│     │  └─ usePointerDrag.ts
│     ├─ store/              # Zustand-Stores
│     │  ├─ windowStore.ts   # Fenster: Position, Größe, z-Index, min/max (persistiert)
│     │  ├─ desktopStore.ts  # Positionen der Desktop-Icons (persistiert)
│     │  ├─ authStore.ts     # eingeloggter User
│     │  ├─ economyStore.ts  # ⭐ Coins, Level, Abzeichen, Inventar – live per Socket synchron
│     │  └─ uiStore.ts       # Startmenü, Dialoge, Meldungen, Tray-Sprechblasen, Power-Zustand
│     ├─ components/
│     │  ├─ desktop/         # Desktop + Icons
│     │  ├─ window/          # Window, WindowManager, Titelleisten-Buttons
│     │  ├─ taskbar/         # Taskleiste, Schnellstart, Tray-Uhr
│     │  ├─ startmenu/       # Startmenü inkl. „Alle Programme“
│     │  ├─ dialogs/         # Login, Meldungsfenster, „Computer ausschalten“
│     │  ├─ user/UserBits.tsx# klickbare Namen, Abzeichen-Medaillen, Level-Ring, Avatar-Rahmen
│     │  ├─ clippy/          # Clippy, der Desktop-Assistent
│     │  └─ xp/Glyphs.tsx    # XP-Logo, Power-/Abmelden-Symbole …
│     ├─ apps/
│     │  ├─ registry.ts      # ⭐ Hier werden alle Apps registriert
│     │  ├─ untisxp/         # UtisXP (Mein Tag, Dashboard, Suche, Vertretungen …)
│     │  ├─ chatterinoxp/    # chatterinoXP
│     │  ├─ redxp/           # redXP (Forum)
│     │  ├─ mollyxp/         # MollyXP (Tests & Mitschriften)
│     │  ├─ newsxp/          # NewsXP
│     │  ├─ sudoxp/          # SudoXP (klassisch + tägliches Sudoku mit Bestenliste)
│     │  ├─ profile/         # Steam-ähnliches Profilfenster (openProfile(username))
│     │  ├─ shop/            # Punkteshop
│     │  ├─ account/         # Benutzerkonten (Mein Profil, Chat-Farbe, Bild, Untis)
│     │  └─ about/           # Über OSSXP
│     ├─ assets/             # XP-Icons (SVG), Avatare, Wallpaper
│     └─ styles/             # xp.css (Luna-Theme), desktop/taskbar/startmenu/dialogs.css
└─ server/                   # Backend (Express + Socket.IO)
   ├─ .env.example
   └─ src/
      ├─ index.js            # HTTP-Server, Routen, liefert in Produktion client/dist aus
      ├─ config.js           # Konfiguration aus .env
      ├─ db.js               # SQLite-Schema + Repositories (users, untis_links, messages)
      ├─ middleware/auth.js  # JWT-Cookie, requireAuth, requireUntis
      ├─ realtime.js         # Live-Updates an einzelne User (Socket-Raum user:<id>)
      ├─ uploads.js          # Datei-Uploads (multer) für MollyXP/NewsXP
      ├─ routes/
      │  ├─ auth.js          # /api/auth  register | login | logout | me
      │  ├─ economy.js       # /api/economy (Wallet, Shop) + /api/profiles
      │  ├─ untis.js         # /api/untis status | link | timetable | master | element | exams …
      │  ├─ red.js           # /api/red   Subreddits, Beiträge, Kommentare, Votes
      │  ├─ molly.js         # /api/molly Schulen, Klassen, Uploads
      │  ├─ news.js          # /api/news
      │  ├─ sudoku.js        # /api/sudoku Tagesrätsel + Bestenliste
      │  └─ emotes.js        # /api/emotes (7TV + BTTV, gecached)
      ├─ economy/            # ⭐ catalog.js (Belohnungen, Abzeichen, Artikel) + service.js (award, Level, Shop)
      ├─ untis/              # WebUntis-Client, Service, Demo-Schule, Lehrernamen-Abgleich (teacher-names.js)
      ├─ games/sudoku.js     # Sudoku-Generator für das Tagesrätsel
      ├─ emotes/providers.js # 7TV-/BTTV-Loader
      └─ chat/socket.js      # Echtzeit-Chat + persönliche Live-Updates
```

## Schnellstart

Voraussetzung: **Node.js 20+** (empfohlen: 22 LTS) und Git.

```bash
npm install
```

```bash
cp server/.env.example server/.env
```

In `server/.env` mindestens `JWT_SECRET` und `UNTIS_SECRET` auf lange Zufallswerte setzen
(z. B. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`).
Zum Ausprobieren ohne echten Untis-Account: `UNTIS_MOCK=true`.

```bash
npm run dev
```

Öffnet Frontend (http://localhost:5173) und Backend (Port 3001) gleichzeitig. Vite leitet `/api` und `/socket.io` an das Backend weiter.

**Produktion / ein einziger Port:**

```bash
npm run build
```

```bash
npm start
```

Danach läuft alles unter http://localhost:3001. Hinter HTTPS zusätzlich `COOKIE_SECURE=true` und `NODE_ENV=production` setzen.

## Bedienung

| Aktion | Wie |
| --- | --- |
| App starten | Doppelklick auf Desktop-Icon, Startmenü, Schnellstart oder „Alle Programme“ |
| Anmelden / Registrieren | Startmenü → Kopfbereich „Anmelden“ (oder Tray-Symbol unten rechts) |
| Untis verknüpfen | Startmenü → „Untis-Verknüpfung“ (App *Benutzerkonten*) |
| Profil ansehen | Auf einen Namen klicken (Chat, redXP, Bestenliste, MollyXP) – eigenes Profil unter *Benutzerkonten → Mein Profil* |
| Coins ausgeben | Punkteshop (oder Klick auf die Coins unten rechts in der Taskleiste) |
| Clippy ein/aus | Rechtsklick auf Clippy oder Startmenü → „Clippy ein-/ausblenden“ |
| Profilbild ändern | Startmenü → auf das eigene Bild klicken → „Eigenes Bild ändern“ (Galerie oder eigenes Bild hochladen) |
| Desktop-Icons verschieben | Icon ziehen – rastet im Raster ein; Rechtsklick auf den Desktop → „Symbole automatisch anordnen“ |
| Seite schließen | Startmenü → „Seite schließen“ → klassischer „Computer ausschalten“-Dialog |

**Zugriffsregeln**

- **UntisXP**: das komplette [UntisDashboard](https://github.com/olizeii/UntisDashboard) im XP-Explorer-Look –
  Dashboard (Vertretungen, Entfälle, Raumauslastung pro Stunde, freie Räume, anstehende Änderungen),
  **Lehrer-/Klassen-/Raumsuche** mit Live-Status („Wo ist … gerade?“, Restzeit-Countdown, Doppelstunden, nächste Stunde, Tagesplan),
  freie Räume, Vertretungsplan (Tag/Woche, Filter, Suche) und der eigene Wochenstundenplan.
  Datum/Uhrzeit lassen sich frei wählen, Strg+K öffnet die Suche, Zurück/Vor funktioniert wie im Explorer.
  Schüler-Accounts ohne Leserechte bekommen automatische Fallbacks (Lehrkräfte aus der Wochenansicht, Vertretungen aus den Stundenplänen).
  Nur eingeloggt **und** mit verknüpftem Untis-Account. Sonst erscheint eine XP-Meldung mit „Anmelden“ bzw. „Jetzt verknüpfen“; nach dem Login startet die App automatisch.
- **chatterinoXP**: für alle offen. Gäste sind im **Zuschauer-Modus** (nur lesen) – das erzwingt der Server, nicht nur die UI. Beim Start ist immer der allgemeine Channel aktiv.
- **redXP / MollyXP / NewsXP**: Lesen ohne Login. Schreiben/Abstimmen mit Login; Hochladen in MollyXP zusätzlich nur mit
  Untis-Verknüpfung (Klasse wird über Untis geprüft); News veröffentlichen nur mit `ADMIN_USERNAMES`.
- **SudoXP**: für alle spielbar. Im täglichen Sudoku erscheint man ohne Login als „Anonym“.
  Coins/Abzeichen gibt es nur mit Konto.
- **Klassisches SudoXP**: Drei Schwierigkeitsgrade, jedes Rätsel ist zufällig und eindeutig lösbar.
  Tasten: 1–9 setzen · Entf löschen · Pfeiltasten · N = Notizen · H = Tipp · Strg+Z = Rückgängig · F2 = Neues Spiel.
  Spielstand und Bestzeiten werden im Browser gespeichert.
- Beim Abmelden werden Fenster geschlossen, deren Voraussetzungen nicht mehr erfüllt sind.

## Eine neue App hinzufügen

1. Ordner `client/src/apps/meine-app/` anlegen.
2. Komponente schreiben:

   ```tsx
   // client/src/apps/meine-app/MeineApp.tsx
   import type { AppWindowProps } from '../../core/types';

   export default function MeineApp({ windowId, params }: AppWindowProps) {
     return <div style={{ padding: 12 }}>Hallo aus Fenster {windowId}!</div>;
   }
   ```

3. Definition anlegen:

   ```ts
   // client/src/apps/meine-app/index.ts
   import { lazy } from 'react';
   import { defineApp } from '../../core/types';
   import icon from '../../assets/icons/meine-app.svg';

   export default defineApp({
     id: 'meine-app',
     title: 'Meine App',
     description: 'Kurzbeschreibung fürs Startmenü',
     icon,
     component: lazy(() => import('./MeineApp')),
     window: { width: 500, height: 400 },
     requires: { auth: true },                      // optional: { auth, untis }
     placement: { desktop: true, startMenu: 'left' } // 'pinned' | 'left' | 'right' | false
   });
   ```

4. In `client/src/apps/registry.ts` importieren und ins `apps`-Array eintragen – fertig.
   Desktop-Icon, Startmenü-Eintrag, Taskleisten-Button, Fenster und Zugriffsschutz entstehen automatisch.

Aus anderem Code heraus öffnen: `launchApp('meine-app', { beliebige: 'parameter' })`.

## Untis-Hinweise

- Das Verknüpfungsformular ist für die HTL Hollabrunn vorausgefüllt (`https://htl-hl.webuntis.com`, Schule `htl-hl`) – änderbar.
- **Lehrernamen:** Untis liefert Schüler-Accounts oft nur Kürzel. Für `htl-hl` gleicht der Server sie automatisch mit dem
  Lehrerverzeichnis der Schulwebseite ab (htl-hl.ac.at/web/team). Falsche Zuordnungen in `server/.env` korrigieren:
  `UNTIS_TEACHER_NAMES="KÜRZEL=Nachname Vorname; …"`. Andere Schulen: `TEACHER_DIRECTORY_<SCHULE>=url`.
- **Server** und **Schule** stehen in der WebUntis-Adresse, z. B. `https://nessa.webuntis.com/WebUntis/?school=abc-schule`.
  Die komplette Adresse kann auch einfach ins Server-Feld kopiert werden.
- Schulen, die **nur** SSO (z. B. Microsoft-Login) erlauben, funktionieren mit Passwort-Login nicht.
- Das Untis-Passwort wird vor dem Speichern live bei WebUntis geprüft und dann verschlüsselt abgelegt.
  Wird `UNTIS_SECRET` geändert, müssen alle Nutzer neu verknüpfen.

## Emotes

chatterinoXP lädt die globalen Emotes von **7TV** und **BetterTTV** (inkl. Zero-Width-/Overlay-Emotes) über `/api/emotes`.
Zusätzliche Channel-Emotes: in `server/.env` bei `EMOTE_TWITCH_IDS` die Twitch-User-IDs eintragen (kommagetrennt).
Im Chat: **Tab** vervollständigt Emotes und Namen, ☺ öffnet den Emote-Picker, Hover zeigt eine Emote-Vorschau.

## Auf GitHub veröffentlichen

Einmalig im Projektordner (`.gitignore` schließt `node_modules`, `dist`, `.env` und die Datenbank bereits aus):

```bash
git init
```

```bash
git add .
```

```bash
git commit -m "OSSXP: initiales Projekt"
```

```bash
git branch -M main
```

```bash
git remote add origin https://github.com/olizeii/OSSXP.git
```

```bash
git push -u origin main
```

Falls das Repo auf GitHub schon eine README/Lizenz enthält, vorher einmal holen:
`git pull origin main --allow-unrelated-histories`, Konflikte lösen, dann pushen.

Spätere Änderungen: `git add .` → `git commit -m "…"` → `git push`.

---

Kein Produkt der Microsoft Corporation. „Windows“ und „Windows XP“ sind Marken von Microsoft.
Alle Icons und Grafiken in diesem Repository sind eigene Vektorgrafiken im XP-Stil.
