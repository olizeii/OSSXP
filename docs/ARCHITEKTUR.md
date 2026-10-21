# OSSXP – Architektur des Ökosystems

Dieses Dokument beschreibt, wie Profile, Level, Coins, Abzeichen und die Apps zusammenhängen.
Startpunkt des Projekts ist die **HTL Hollabrunn (HTL-HL)** – die Architektur ist aber schulunabhängig.

---

## 1. Überblick

```
┌──────────────────────────── Browser (React + Zustand) ────────────────────────────┐
│ Shell: Desktop · Fenster · Taskleiste (Coins/Balloons) · Startmenü · Clippy        │
│ Apps:  UtisXP · chatterinoXP · redXP · MollyXP · NewsXP · SudoXP · Profil · Shop   │
│                                                                                    │
│ authStore ──► economyStore ◄── socket `economy:update` (gemeinsame Verbindung)     │
└───────────────┬────────────────────────────────┬───────────────────────────────────┘
          REST (/api/*)                  Socket.IO (Chat + Live-Updates)
┌───────────────┴────────────────────────────────┴───────────────────────────────────┐
│ Express-Server                                                                     │
│  routes/*  ──►  economy/service.js  award(userId, action, ref)                      │
│                       │  Tageslimit · Level · Bonus · Abzeichen · emitToUser()     │
│                       ▼                                                            │
│                 SQLite (better-sqlite3)                                            │
│  untis/*  (WebUntis-Client, pro User eigener Cache, Lehrernamen von htl-hl.ac.at)  │
└────────────────────────────────────────────────────────────────────────────────────┘
```

**Grundregel:** Apps verwalten **nie** selbst Coins oder XP. Sie lösen nur Aktionen beim Server aus
(Beitrag, Upload, gelöstes Rätsel …). Der Server entscheidet über die Belohnung und schickt den neuen
Stand live an alle offenen Tabs des Users.

---

## 2. Datenbankschema

OSSXP nutzt **SQLite** (eine Datei, kein extra Datenbankserver – ideal für lokalen Betrieb).
Jedes Modul legt seine Tabellen beim Start selbst an (`CREATE TABLE IF NOT EXISTS`).

### Kern & Economy

| Tabelle | Zweck | Schlüssel |
| --- | --- | --- |
| `users` | Konto: Name, Passwort-Hash, Chat-Farbe, Profilbild | `id` |
| `untis_links` | Verknüpfung mit WebUntis (Passwort AES-256-GCM-verschlüsselt) | `user_id` (1:1) |
| `profiles` | Bio, Vitrine (bis 3 Abzeichen, JSON), ausgerüsteter Hintergrund & Rahmen | `user_id` (1:1) |
| `wallets` | Coins und Gesamt-XP (Level wird berechnet) | `user_id` (1:1) |
| `ledger` | **Jede** Belohnung/Ausgabe als Buchung | `UNIQUE(user_id, action, ref)` |
| `user_badges` | Verdiente Abzeichen | `(user_id, badge_id)` |
| `inventory` | Gekaufte Shop-Artikel | `(user_id, item_id)` |

Kataloge (Belohnungen, Abzeichen, Shop-Artikel) stehen **im Code** (`server/src/economy/catalog.js`)
und werden über `GET /api/economy/catalog` an den Client ausgeliefert – eine einzige Quelle.

### Apps

| Tabelle | App |
| --- | --- |
| `messages` | chatterinoXP |
| `red_subs`, `red_posts`, `red_comments`, `red_votes` | redXP |
| `molly_classes`, `molly_uploads` (+ Dateien unter `UPLOAD_DIR/molly`) | MollyXP |
| `sudoku_daily_starts`, `sudoku_daily_results` | SudoXP (Tagesrätsel) |
| `news` (+ Bilder unter `UPLOAD_DIR/news`) | NewsXP |

### Warum ein Ledger?

- **Keine Doppelzahlungen:** `UNIQUE(user_id, action, ref)` – z. B. „Upvote für Post 7 von User 3“ zählt nur einmal,
  auch wenn jemand hoch-/runter-/hochvotet.
- **Tageslimits:** pro Aktion wird gezählt, wie oft sie heute belohnt wurde (`dailyCap`).
  Über dem Limit wird die Aktion trotzdem gebucht (mit 0 Coins) – so bleiben Statistiken und Abzeichen korrekt.
- **Nachvollziehbarkeit:** Coins = Summe der Buchungen; `wallets` ist nur ein schneller Zwischenstand.

### Level

`XP für Level n = 25 · n · (n − 1)` → Level 2 bei 50 XP, Level 3 bei 150, Level 5 bei 500, Level 10 bei 2 250.
Jeder Aufstieg bringt `LEVEL_UP_COINS` (10) Bonus-Coins.

### Anonymität (MollyXP)

Anonyme Uploads zeigen nirgends einen Namen. Intern wird der Uploader gespeichert (Löschen eigener Uploads,
Missbrauch). Das öffentliche Profil zählt **nur** nicht-anonyme Uploads (`molly.public_upload`), und Abzeichen
wie „Mitschreiber“ hängen ebenfalls nur daran – so lassen sich anonyme Uploads nicht über das Profil zuordnen.

### Migrationspfad: Prisma + PostgreSQL

Falls OSSXP später für viele Schulen auf einem Server läuft, lässt sich dasselbe Modell 1:1 nach Postgres übertragen:

```prisma
model User {
  id           Int           @id @default(autoincrement())
  username     String        @unique
  passwordHash String
  color        String
  avatar       String?
  createdAt    DateTime      @default(now())
  profile      Profile?
  wallet       Wallet?
  untisLink    UntisLink?
  ledger       LedgerEntry[]
  badges       UserBadge[]
  inventory    InventoryItem[]
}

model Profile {
  userId     Int      @id
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  bio        String   @default("")
  showcase   String[] // bis zu 3 Abzeichen-IDs
  background String   @default("bg-luna")
  frame      String   @default("frame-none")
  updatedAt  DateTime @updatedAt
}

model Wallet {
  userId Int  @id
  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)
  coins  Int  @default(0)
  xp     Int  @default(0)
}

model LedgerEntry {
  id        Int      @id @default(autoincrement())
  userId    Int
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  action    String   // z. B. "red.upvote_received"
  ref       String   // eindeutige Referenz, z. B. "post:7:3"
  day       String   // Schultag (Zeitzone der Schule) für Tageslimits
  coins     Int
  xp        Int
  createdAt DateTime @default(now())

  @@unique([userId, action, ref])
  @@index([userId, action, day])
}

model UserBadge {
  userId   Int
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  badgeId  String
  earnedAt DateTime @default(now())
  @@id([userId, badgeId])
}

model InventoryItem {
  userId     Int
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  itemId     String
  acquiredAt DateTime @default(now())
  @@id([userId, itemId])
}
```

`award()` würde dann in einer `prisma.$transaction` laufen; die Logik in `economy/service.js` bleibt gleich.

---

## 3. State-Management (Client)

Alle globalen Zustände liegen in **Zustand**-Stores (`client/src/store/`):

| Store | Inhalt | Quelle der Wahrheit |
| --- | --- | --- |
| `authStore` | eingeloggter User (Name, Farbe, Admin, Untis-Status) | `/api/auth/me` |
| `economyStore` | Wallet (Coins, Level, XP), Abzeichen, Inventar, Profil-Ausrüstung, Kataloge | `/api/economy/me` + Socket |
| `windowStore` | Fenster (Position, Z-Index, min/max) | lokal (Bounds im localStorage) |
| `uiStore` | Startmenü, Dialoge, Meldungen, **Tray-Sprechblasen** | lokal |
| `desktopStore` | Positionen der Desktop-Icons | lokal (localStorage) |
| Clippy | an/aus, Position | lokal (localStorage) |

### Synchronisation von Coins & Level über alle Apps

```
App (z. B. redXP)                Server                              alle Tabs des Users
─────────────────                ──────                              ───────────────────
POST /api/red/vote ───────────►  applyVote()
                                 award(autor, 'red.upvote_received')
                                   ├─ ledger + wallet (Transaktion)
                                   ├─ Level-Aufstieg? Abzeichen?
                                   └─ emitToUser(autor, 'economy:update') ──► economyStore.applyUpdate()
                                                                              ├─ Taskleiste: Coins
                                                                              ├─ Startmenü: Level
                                                                              ├─ Profil/Shop: neu rendern
                                                                              └─ Sprechblase „+1 Coins“
```

- Es gibt **eine** Socket.IO-Verbindung für die ganze Shell (`core/socket.ts`). Eingeloggte Sockets treten dem
  Raum `user:<id>` bei; so erreicht ein Update alle Tabs/Geräte gleichzeitig.
- Bei Login/Logout verbindet `App.tsx` den Socket neu (neues Cookie) und lädt den `economyStore` bzw. leert ihn.
- Komponenten lesen nur aus dem Store (`useEconomyStore((s) => s.wallet)`), niemand muss Coins „weiterreichen“.

### Profile aus jeder App öffnen

`openProfile(username)` (`core/profile.ts`) öffnet das Profilfenster – bzw. holt es nach vorne, falls schon offen.
Die Komponente `<UserName username color badges />` (`components/user/UserBits.tsx`) macht jeden Namen klickbar
und zeigt optional dezent bis zu 2 Abzeichen (z. B. im Chat).

---

## 4. Erweitern

**Neue Belohnung:** In `catalog.js` unter `REWARDS` eintragen und in der Route `award(userId, 'meine.aktion', ref)` aufrufen.

**Neues Abzeichen:** In `BADGES` eintragen; Bedingung entweder in `LEDGER_BADGES` (Anzahl einer Aktion) oder per
`grantBadge(userId, id)` direkt aus einem Modul (wie „Schnellster Löser“).

**Neuer Shop-Artikel:** In `SHOP_ITEMS` eintragen (`style` = CSS, das der Client direkt anwendet).

**Neue App:** siehe README („Eine neue App hinzufügen“) – ein Eintrag im Array `apps` in `client/src/apps/registry.ts`.

---

## 5. Sicherheit & Fairness

- Belohnungen vergibt ausschließlich der Server; Tageslimits und eindeutige Referenzen verhindern Farming.
- Das tägliche Sudoku wird **auf dem Server** erzeugt; die Lösung verlässt den Server nie, die Zeit misst der Server.
- MollyXP: Schule und Klasse beim Upload bestimmt der Server über Untis – der Browser kann keine fremde Klasse wählen.
- NewsXP-Veröffentlichung nur für `ADMIN_USERNAMES`.
- Lehrernamen kommen aus dem öffentlichen Lehrerverzeichnis der Schule (24 h gecached, heuristischer Abgleich,
  korrigierbar mit `UNTIS_TEACHER_NAMES`).
