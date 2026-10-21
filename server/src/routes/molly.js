/**
 * MollyXP – Tests & Mitschriften teilen, nach Schule und Klasse sortiert.
 *
 *   GET    /api/molly/schools                     bekannte Schulen (+ eigene, falls Untis verknüpft)
 *   GET    /api/molly/me                          Darf ich hochladen? In welche Klasse?   (Login)
 *   GET    /api/molly/classes?school=             Klassen mit Anzahl Tests/Mitschriften
 *   GET    /api/molly/uploads?school=&class=&kind=test|notes
 *   GET    /api/molly/files/:id                   Datei ansehen
 *   POST   /api/molly/uploads                     multipart: file, kind, title, subject, description, anonymous
 *   DELETE /api/molly/uploads/:id                 eigener Upload oder Admin
 *
 * Ansehen ist ohne Login möglich. Hochladen nur mit Untis-Verknüpfung – und nur in die eigene Klasse:
 * Schule und Klasse bestimmt der SERVER über Untis, nicht der Browser.
 * Anonym ist Standard: dann wird der Name nirgends angezeigt (intern bleibt der Uploader
 * für Löschungen/Missbrauch gespeichert).
 */
import path from 'node:path';
import { Router } from 'express';
import { db, untisLinks } from '../db.js';
import { award } from '../economy/service.js';
import { isAdmin, requireAuth } from '../middleware/auth.js';
import { UntisError } from '../untis/errors.js';
import { untisFor } from '../untis/service.js';
import { createUpload, handleUpload, removeFile, uploadRoot } from '../uploads.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS molly_classes (
    school     TEXT NOT NULL,
    name       TEXT NOT NULL,
    long_name  TEXT,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (school, name)
  );
  CREATE TABLE IF NOT EXISTS molly_uploads (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    school      TEXT    NOT NULL,
    class_name  TEXT    NOT NULL,
    kind        TEXT    NOT NULL CHECK (kind IN ('test', 'notes')),
    title       TEXT    NOT NULL,
    subject     TEXT    NOT NULL DEFAULT '',
    description TEXT    NOT NULL DEFAULT '',
    file_name   TEXT    NOT NULL,      -- Originalname (für den Download)
    file_path   TEXT    NOT NULL,      -- Name auf der Festplatte
    mime        TEXT    NOT NULL,
    size        INTEGER NOT NULL,
    uploader_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    anonymous   INTEGER NOT NULL DEFAULT 1,
    views       INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_molly_uploads_class ON molly_uploads(school, class_name, kind);
`);

/** Anzeigenamen bekannter Schulen (Untis-Schulname → Klartext) */
const SCHOOL_NAMES = { 'htl-hl': 'HTL Hollabrunn' };
const DEFAULT_SCHOOL = 'htl-hl';

const stmt = {
  upsertClass: db.prepare(`
    INSERT INTO molly_classes (school, name, long_name, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (school, name) DO UPDATE SET long_name = excluded.long_name, updated_at = excluded.updated_at`),
  schools: db.prepare('SELECT DISTINCT school FROM molly_classes UNION SELECT DISTINCT school FROM molly_uploads'),
  classes: db.prepare(`
    SELECT c.name, MAX(c.long_name) AS long_name,
      (SELECT COUNT(*) FROM molly_uploads u WHERE u.school = @school AND u.class_name = c.name AND u.kind = 'test') AS tests,
      (SELECT COUNT(*) FROM molly_uploads u WHERE u.school = @school AND u.class_name = c.name AND u.kind = 'notes') AS notes
    FROM (
      SELECT name, long_name FROM molly_classes WHERE school = @school
      UNION SELECT DISTINCT class_name, NULL FROM molly_uploads WHERE school = @school
    ) c GROUP BY c.name`),
  uploads: db.prepare(`
    SELECT m.*, u.username, u.color FROM molly_uploads m LEFT JOIN users u ON u.id = m.uploader_id
    WHERE m.school = ? AND m.class_name = ? AND m.kind = ? ORDER BY m.created_at DESC`),
  upload: db.prepare('SELECT * FROM molly_uploads WHERE id = ?'),
  insert: db.prepare(`
    INSERT INTO molly_uploads (school, class_name, kind, title, subject, description, file_name, file_path, mime, size, uploader_id, anonymous, created_at)
    VALUES (@school, @className, @kind, @title, @subject, @description, @fileName, @filePath, @mime, @size, @uploaderId, @anonymous, @now)`),
  view: db.prepare('UPDATE molly_uploads SET views = views + 1 WHERE id = ?'),
  remove: db.prepare('DELETE FROM molly_uploads WHERE id = ?'),
};

export const mollyRouter = Router();

const upload = createUpload('molly', 15, ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);
const schoolName = (id) => SCHOOL_NAMES[id] ?? id;

/** Klasse des Users über Untis bestimmen – und dabei die Klassenliste seiner Schule auffrischen. */
async function verifiedClass(user) {
  const link = untisLinks.findByUser(user.id);
  if (!link) return { canUpload: false, reason: 'Zum Hochladen muss dein Konto mit Untis verknüpft sein.' };
  const untis = untisFor(link);
  try {
    const own = await untis.ownClass();
    const master = await untis.masterData();
    const school = link.school.toLowerCase();
    const now = Date.now();
    for (const c of master.classes) stmt.upsertClass.run(school, c.name, c.longName ?? null, now);
    return { canUpload: true, school, schoolName: schoolName(school), className: own.name, classLongName: own.longName };
  } catch (err) {
    if (err instanceof UntisError) return { canUpload: false, reason: err.message };
    throw err;
  }
}

mollyRouter.get('/schools', (req, res) => {
  const link = req.user ? untisLinks.findByUser(req.user.id) : null;
  const ids = new Set([DEFAULT_SCHOOL, ...stmt.schools.all().map((r) => r.school)]);
  if (link) ids.add(link.school.toLowerCase());
  res.json({
    schools: [...ids].map((id) => ({ id, name: schoolName(id) })),
    mySchool: link ? link.school.toLowerCase() : null,
  });
});

mollyRouter.get('/me', requireAuth, async (req, res) => {
  res.json(await verifiedClass(req.user));
});

mollyRouter.get('/classes', (req, res) => {
  const school = String(req.query.school || DEFAULT_SCHOOL).toLowerCase();
  const classes = stmt.classes
    .all({ school })
    .map((c) => ({ name: c.name, longName: c.long_name, tests: c.tests, notes: c.notes }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
  res.json({ school, schoolName: schoolName(school), classes });
});

mollyRouter.get('/uploads', (req, res) => {
  const school = String(req.query.school || DEFAULT_SCHOOL).toLowerCase();
  const className = String(req.query.class ?? '');
  const kind = req.query.kind === 'notes' ? 'notes' : 'test';
  const items = stmt.uploads.all(school, className, kind).map((m) => ({
    id: m.id,
    kind: m.kind,
    title: m.title,
    subject: m.subject,
    description: m.description,
    fileName: m.file_name,
    mime: m.mime,
    size: m.size,
    views: m.views,
    createdAt: m.created_at,
    // Anonym = kein Name, keine ID – nichts, was Rückschlüsse erlaubt
    author: m.anonymous || !m.username ? null : { username: m.username, color: m.color },
    mine: Boolean(req.user && m.uploader_id === req.user.id),
  }));
  res.json({ school, className, kind, items });
});

mollyRouter.get('/files/:id', (req, res) => {
  const item = stmt.upload.get(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Datei nicht gefunden.' });
  stmt.view.run(item.id);
  res.set('Content-Type', item.mime);
  res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(item.file_name)}`);
  res.sendFile(path.join(uploadRoot, 'molly', path.basename(item.file_path)));
});

mollyRouter.post('/uploads', requireAuth, handleUpload(upload.single('file')), async (req, res) => {
  const file = req.file;
  const fail = (status, error) => (removeFile(file), res.status(status).json({ error }));
  if (!file) return fail(400, 'Bitte eine Datei auswählen.');

  const verified = await verifiedClass(req.user);
  if (!verified.canUpload) return fail(403, verified.reason);

  const kind = req.body.kind === 'notes' ? 'notes' : 'test';
  const title = String(req.body.title ?? '').trim();
  if (title.length < 3 || title.length > 120) return fail(400, 'Der Titel muss 3–120 Zeichen lang sein.');
  const anonymous = req.body.anonymous !== 'false'; // Standard: anonym

  const id = Number(
    stmt.insert.run({
      school: verified.school,
      className: verified.className,
      kind,
      title,
      subject: String(req.body.subject ?? '').trim().slice(0, 40),
      description: String(req.body.description ?? '').trim().slice(0, 1000),
      fileName: file.originalname.slice(0, 200),
      filePath: file.filename,
      mime: file.mimetype,
      size: file.size,
      uploaderId: req.user.id,
      anonymous: anonymous ? 1 : 0,
      now: Date.now(),
    }).lastInsertRowid,
  );

  const reward = award(req.user.id, 'molly.upload', id);
  if (!anonymous) award(req.user.id, 'molly.public_upload', id); // nur gezählt – für Abzeichen
  res.status(201).json({ id, school: verified.school, className: verified.className, reward });
});

mollyRouter.delete('/uploads/:id', requireAuth, async (req, res) => {
  const item = stmt.upload.get(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Nicht gefunden.' });
  if (item.uploader_id !== req.user.id && !isAdmin(req.user)) return res.status(403).json({ error: 'Nur eigene Uploads können gelöscht werden.' });
  stmt.remove.run(item.id);
  removeFile({ path: path.join(uploadRoot, 'molly', path.basename(item.file_path)) });
  res.json({ ok: true });
});
