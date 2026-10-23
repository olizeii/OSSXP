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
| `users` | Konto: Name, Passwort-Hash, Chat-Farbe, Profilbild, **`role`** (`admin`/`moderator`/`user`) | `id` |
| `untis_links` | Verknüpfung mit WebUntis (Passwort AES-256-GCM-verschlüsselt) | `user_id` (1:1) |
| `profiles` | Bio, Status, Theme, Info-Box, Vitrinen-Reihenfolge, Lieblingsabzeichen, Hintergrund, Rahmen, Clippy-Hut/-Brille | `user_id` (1:1) |
| `wallets` | Coins und Gesamt-XP (Level wird berechnet) | `user_id` (1:1) |
| `ledger` | **Jede** Belohnung/Ausgabe als Buchung (auch gedeckelte mit 0) | `UNIQUE(user_id, action, ref)` |
| `user_badges` | Verdiente Abzeichen | `(user_id, badge_id)` |
| `inventory` | Gekaufte Shop-Artikel | `(user_id, item_id)` |
| `shop_custom_items` | Von Moderator:innen hochgeladene Workshop-Artikel (Bild unter `UPLOAD_DIR/shop`) | `id` → Artikel-ID `c-<id>` |

Kataloge (Belohnungen, Abzeichen, Shop-Artikel, Profil-Themes) stehen **im Code** (`server/src/economy/catalog.js`)
und werden über `GET /api/economy/catalog` an den Client ausgeliefert – eine einzige Quelle. Workshop-Artikel kommen
aus der Datenbank dazu.

### Apps

| Tabelle | App |
| --- | --- |
| `messages`, `chat_channels`, `direct_messages`, `chat_timeouts`, `custom_emotes` | chatterinoXP |
| `red_subs` (`listed`, `official`), `red_members`, `red_posts`, `red_comments`, `red_votes` | redXP |
| `molly_classes`, `molly_uploads` (+ Dateien unter `UPLOAD_DIR/molly`) | MollyXP |
| `sudoku_daily_starts`, `sudoku_daily_results` | SudoXP (Tagesrätsel) |
| `news` (`kind`, `pinned`), `news_comments` (+ Bilder unter `UPLOAD_DIR/news`) | NewsXP |

### Ränge & Rechte

Gespeichert werden nur **Admin** und **Moderator** (`users.role`); die übrigen Ränge berechnet der Server bei jeder Anfrage
(`server/src/roles.js`), sie können also nicht „hängen bleiben“.

| # | Rang | Wie man ihn bekommt |
| --- | --- | --- |
| 1 | **Admin** ♦ | `users.role = 'admin'` (Seed-Konto) oder Name in `ADMIN_USERNAMES` |
| 2 | **Moderator** ⚔ | vom Admin ernannt (Profil → „Zum Moderator ernennen“, `PATCH /api/admin/users/:name/role`) |
| 3 | **Stammgast** ♛ | automatisch ab Level 8 – gibt zusätzlich das Abzeichen „Stammgast“ |
| 4 | **Verifiziert** ✓ | Untis verknüpft |
| 5 | **Neu** | alle anderen – Spam-Schutz: keine Links, 3 s Slow-Mode im Chat |

| Recht (`PERMISSIONS`) | ab Rang |
| --- | --- |
| Links posten (Chat, redXP) | Verifiziert |
| 7TV-Emotes zum OSSXP-Set hinzufügen | Verifiziert |
| Subreddit gründen (startet privat, öffentlich ab 10 Mitgliedern) | Stammgast |
| Chat-Channels anlegen/löschen, Timeouts, fremde Beiträge/Uploads/Kommentare löschen, Emotes entfernen | Moderator |
| Workshop-Artikel in den Shop hochladen (50 % der Verkäufe gehen an die Ersteller:in) | Moderator |
| News/Poster veröffentlichen, Moderator:innen ernennen | Admin |

**Test-Admin:** Gibt es beim Start keinen Admin, legt `server/src/seed.js` im Entwicklungsmodus `admin` / `admin1234` an.
In Produktion nur mit `SEED_ADMIN_PASSWORD` (optional `SEED_ADMIN_USERNAME`). Bestehende Konten werden nie befördert;
Namen wie „admin“, „moderator“, „system“ oder „clippy“ sind bei der Registrierung gesperrt.

### Warum ein Ledger?

- **Keine Doppelzahlungen:** `UNIQUE(user_id, action, ref)` – z. B. „Upvote für Post 7 von User 3“ zählt nur einmal,
  auch wenn jemand hoch-/runter-/hochvotet.
- **Limits & Cooldowns:** pro Aktion wird gezählt, wann und wie oft sie belohnt wurde (siehe Anti-Spam).
  Über dem Limit wird die Aktion trotzdem gebucht (mit 0 Coins/XP) – so bleiben Statistiken und Abzeichen korrekt.
- **Nachvollziehbarkeit:** Coins = Summe der Buchungen; `wallets` ist nur ein schneller Zwischenstand.

### Anti-Spam: Cooldowns statt Fleißkärtchen

Belohnt wird **Qualität und Regelmäßigkeit**, nicht Masse. Jede Regel in `REWARDS` kann folgende Bremsen haben:

| Feld | Wirkung | Beispiel |
| --- | --- | --- |
| `cooldownSec` | Mindestabstand zwischen zwei belohnten Aktionen | Chat: höchstens 1× pro Minute XP |
| `hourlyCap` / `dailyCap` | Obergrenze pro Stunde/Tag | Chat: 8/h, 25/Tag |
| `decay` | 1. Aktion 100 %, 2. 75 %, 3. 50 %, danach 25 % | redXP-Beiträge, MollyXP-Uploads |
| `lucky` | Wahrscheinlichkeit für doppelte Coins („Glückstreffer!“) | MollyXP-Upload 15 % |

Zusätzlich:

- Chat-XP nur für Nachrichten mit ≥ 2 Wörtern und ≥ 8 Zeichen, die keine Wiederholung sind.
- **Automatische Timeouts:** mehr als 5 Nachrichten in 10 s oder 3× derselbe Text in 60 s → Timeout von
  30 s · 2^(Verstöße − 1), höchstens 1 h. Moderator:innen können mit `/timeout name [s] [grund]` auch manuell sperren.
- Abzeichen hängen an **Vielfalt statt Menge**: „Plaudertasche“ gibt es für Chatten an 7 verschiedenen Tagen,
  „Beliebt“ für 25 Upvotes von mindestens 5 verschiedenen Personen – nicht für 100 Nachrichten.
- Coins für erhaltene Upvotes nur einmal pro Stimme und Person (Ledger-Referenz), eigene Stimmen zählen nicht.
- Tägliche Login-Serie: +2 Coins pro Tag in Folge (max. +20).

### Level (ohne Obergrenze)

`XP von Level n auf n + 1 = round(100 · 1,15^(n − 1))` → 100, 115, 132, 152 … – jedes Level wird 15 % teurer.
Level 8 (Stammgast) bei ≈ 1 100 XP, Level 20 bei ≈ 8 800 XP, Level 50 bei ≈ 630 000 XP.
Jeder Aufstieg bringt `10 + 2 · Level` Bonus-Coins. Ab Level 100 wird das Level-Abzeichen sechseckig.

### Anonymität (MollyXP)

Anonyme Uploads zeigen nirgends einen Namen. Intern wird der Uploader gespeichert (Löschen eigener Uploads,
Missbrauch). Das öffentliche Profil zählt **nur** nicht-anonyme Uploads (`molly.public_upload`), und Abzeichen
wie „Mitschreiber“ hängen ebenfalls nur daran – so lassen sich anonyme Uploads nicht über das Profil zuordnen.

### Migrationspfad: Prisma + PostgreSQL

Falls OSSXP später für viele Schulen auf einem Server läuft, lässt sich dasselbe Modell 1:1 nach Postgres übertragen:

```prisma
enum Role {
  user
  moderator
  admin
}

model User {
  id           Int             @id @default(autoincrement())
  username     String          @unique
  passwordHash String
  color        String
  avatar       String?         // Galerie-ID, Upload oder "item:<shop-id>"
  role         Role            @default(user) // Stammgast/Verifiziert/Neu werden berechnet
  createdAt    DateTime        @default(now())
  profile      Profile?
  wallet       Wallet?
  untisLink    UntisLink?
  ledger       LedgerEntry[]
  badges       UserBadge[]
  inventory    InventoryItem[]
  shopItems    ShopCustomItem[]
  dmsSent      DirectMessage[] @relation("dmFrom")
  dmsReceived  DirectMessage[] @relation("dmTo")
  timeout      ChatTimeout?
  subs         RedMember[]
  newsComments NewsComment[]
}

model Profile {
  userId        Int      @id
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  bio           String   @default("")
  status        String   @default("")
  theme         String   @default("luna")      // luna | olive | silver | royale | zune | rose
  infoTitle     String   @default("")
  infoText      String   @default("")
  showcases     String[] // Reihenfolge der Vitrinen: badges, info, stats, posts, sudoku
  showcase      String[] // bis zu 3 Abzeichen-IDs
  featuredBadge String?
  background    String   @default("bg-luna")   // auch animiert: bg-anim-*
  frame         String   @default("frame-none") // auch animiert: frame-anim-*
  clippyHat     String   @default("clippy-hat-none")
  clippyGlasses String   @default("clippy-glasses-none")
  updatedAt     DateTime @updatedAt
}

model Wallet {
  userId Int  @id
  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)
  coins  Int  @default(0)
  xp     Int  @default(0) // Level ohne Obergrenze, aus xp berechnet
}

model LedgerEntry {
  id        Int      @id @default(autoincrement())
  userId    Int
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  action    String   // z. B. "red.upvote_received"
  ref       String   // eindeutige Referenz, z. B. "post:7:3"
  day       String   // Schultag (Zeitzone der Schule) für Tageslimits
  coins     Int      // 0, wenn Cooldown/Limit gegriffen hat
  xp        Int
  createdAt DateTime @default(now())

  @@unique([userId, action, ref])
  @@index([userId, action, day])
  @@index([userId, action, createdAt]) // Cooldown & Stundenlimit
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
  itemId     String   // Katalog-ID oder "c-<ShopCustomItem.id>"
  acquiredAt DateTime @default(now())
  @@id([userId, itemId])
}

model ShopCustomItem {
  id        Int      @id @default(autoincrement())
  type      String   // background | frame | avatar
  name      String
  price     Int
  imagePath String
  imageMime String
  animated  Boolean  @default(false) // GIF/animiertes WebP
  creatorId Int?
  creator   User?    @relation(fields: [creatorId], references: [id], onDelete: SetNull)
  createdAt DateTime @default(now())
}

model CustomEmote {
  name    String   @id
  emoteId String   // 7TV-ID
  url     String
  addedBy Int?
  addedAt DateTime @default(now())
}

model ChatChannel {
  name      String   @id
  createdBy Int?
  createdAt DateTime @default(now())
}

model DirectMessage {
  id        Int      @id @default(autoincrement())
  fromId    Int
  from      User     @relation("dmFrom", fields: [fromId], references: [id], onDelete: Cascade)
  toId      Int
  to        User     @relation("dmTo", fields: [toId], references: [id], onDelete: Cascade)
  text      String
  createdAt DateTime @default(now())
  @@index([fromId, toId, createdAt])
}

model ChatTimeout {
  userId  Int      @id
  user    User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  until   DateTime
  strikes Int      @default(0) // verdoppelt die nächste automatische Sperre
  reason  String?
  byId    Int?     // null = automatisch (Spam-Erkennung)
}

model RedSub {
  name        String      @id
  title       String
  description String      @default("")
  listed      Boolean     @default(false) // privat bis 10 Mitglieder, dann öffentlich
  official    Boolean     @default(false) // Standard-Subreddits
  creatorId   Int?
  createdAt   DateTime    @default(now())
  members     RedMember[]
}

model RedMember {
  subName  String
  sub      RedSub   @relation(fields: [subName], references: [name], onDelete: Cascade)
  userId   Int
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  joinedAt DateTime @default(now())
  @@id([subName, userId])
}

model News {
  id        Int           @id @default(autoincrement())
  title     String
  body      String        @default("")
  kind      String        @default("news") // news | poster
  pinned    Boolean       @default(false)
  imagePath String?
  imageMime String?
  authorId  Int?
  createdAt DateTime      @default(now())
  updatedAt DateTime?
  comments  NewsComment[]
}

model NewsComment {
  id        Int      @id @default(autoincrement())
  newsId    Int
  news      News     @relation(fields: [newsId], references: [id], onDelete: Cascade)
  userId    Int?
  user      User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  body      String
  createdAt DateTime @default(now())
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

**Neues Abzeichen:** In `BADGES` eintragen; Bedingung in `BADGE_RULES` (`economy/service.js`) oder per
`grantBadge(userId, id)` direkt aus einem Modul (wie „Schnellster Löser“). Lieber Vielfalt/Regelmäßigkeit belohnen als Menge.

**Neues Recht:** In `PERMISSIONS` (`roles.js`) mit Mindestrang eintragen und in der Route `requireRank('meinRecht')` bzw. `can(user, 'meinRecht')` nutzen.

**Neuer Shop-Artikel:** In `SHOP_ITEMS` eintragen (`style` = CSS, das der Client direkt anwendet, oder `className`
für animierte `cos-*`-Klassen aus `client/src/styles/cosmetics.css`). Moderator:innen können zusätzlich Bilder direkt im Shop hochladen.

**Neue App:** siehe README („Eine neue App hinzufügen“) – ein Eintrag im Array `apps` in `client/src/apps/registry.ts`.

---

## 5. Sicherheit & Fairness

- Belohnungen vergibt ausschließlich der Server; Cooldowns, Limits, abnehmende Belohnungen und eindeutige Referenzen verhindern Farming.
- Ränge prüft immer der Server (`requireRank`); die UI blendet Knöpfe nur zusätzlich aus.
- Das tägliche Sudoku wird **auf dem Server** erzeugt; die Lösung verlässt den Server nie, die Zeit misst der Server.
- MollyXP: Schule und Klasse beim Upload bestimmt der Server über Untis – der Browser kann keine fremde Klasse wählen.
- NewsXP-Verwaltung (Beiträge, Poster, Kommentare) nur für Admins.
- Lehrernamen kommen aus dem öffentlichen Lehrerverzeichnis der Schule (24 h gecached, heuristischer Abgleich,
  korrigierbar mit `UNTIS_TEACHER_NAMES`).
