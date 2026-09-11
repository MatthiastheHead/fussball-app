const { randomBytes } = require('crypto');
const { FULL_KEYS, FULL_LABELS, seal, unseal, validateFull } = require('./fullBackupUtils');
const { labels, snapshotHash, scopeFor, makeBackup, validateBackup, prepareCashImport } = require('./backupUtils');

module.exports = function registerBackupRoutes({ app, mongoose, models, requireSession, version, recoveryKey, invalidateAllSessions = () => {} }) {
  const mayFull = auth => auth.username === 'Matthias' || auth.backupPermissions?.canFullBackup === true;
  const previews = new Map();
  const requireBackup = permission => (req, res, next) => requireSession(req, res, () => {
    if (!req.auth.isAdmin && req.auth.backupPermissions?.[permission] !== true) {
      return res.status(403).json({ error: 'Für diese Sicherungsfunktion fehlt dir die Berechtigung.' });
    }
    next();
  });
  const read = async (keys, session) => {
    const data = {};
    for (const key of keys) data[key] = await models[key].find({}).session(session).lean();
    return data;
  };
  const snapshot = async keys => {
    const session = await mongoose.startSession();
    try {
      let data;
      await session.withTransaction(async () => { data = await read(keys, session); });
      return data;
    } finally { await session.endSession(); }
  };
  const sendError = (res, error) => {
    console.error('Sicherungsfehler:', error.message);
    res.status(error.status || 503).json({ error: error.status ? error.message : 'Die Sicherung konnte nicht verarbeitet werden. Der Import benötigt eine Datenbank mit Transaktionsunterstützung. Es wurden keine Teiländerungen übernommen.' });
  };
  app.get('/backup/options', requireSession, (req, res) => res.json({
    exportScopes: scopeFor(req.auth), importScopes: scopeFor(req.auth, true),
    canFullBackup: mayFull(req.auth), labels, includesDeletedCash: !!req.auth.cashPermissions?.canViewDeleted,
  }));
  const mainOnly = (req, res, next) => requireSession(req, res, () => {
    if (!mayFull(req.auth)) return res.status(403).json({ error: 'Für vollständige Sicherungen fehlt dir die besondere Freigabe des Hauptadmins.' });
    next();
  });
  app.post('/backup/full/export', mainOnly, async (req, res) => {
    try { res.json(await seal(await snapshot(FULL_KEYS), req.body?.password, req.auth, version, recoveryKey)); }
    catch (error) { sendError(res, error); }
  });
  app.post('/backup/full/preview', mainOnly, async (req, res) => {
    try {
      for (const [id, preview] of previews) if (preview.expiresAt < Date.now() || preview.owner === req.auth.token) previews.delete(id);
      if (previews.size >= 5) return res.status(429).json({ error: 'Zu viele offene Importprüfungen.' });
      const data = validateFull(await unseal(req.body?.backup, req.body?.password, recoveryKey), models);
      const before = await snapshot(FULL_KEYS);
      const preservedTasks = !Object.hasOwn(data, 'tasks');
      if (preservedTasks) data.tasks = before.tasks;
      const recoveryBackup = await seal(before, req.body?.password, req.auth, version, recoveryKey);
      const token = randomBytes(24).toString('hex'), expiresAt = Date.now() + 5 * 60 * 1000;
      previews.set(token, { full: true, owner: req.auth.token, expiresAt, data, beforeHash: snapshotHash(before) });
      res.json({ full: true, preservedTasks, token, expiresAt, recoveryBackup, summary: FULL_KEYS.map(key => ({ key, label: FULL_LABELS[key], before: before[key].length, after: data[key].length })) });
    } catch (error) { sendError(res, error); }
  });
  app.post('/backup/export', requireBackup('canExport'), async (req, res) => {
    try {
      const keys = req.body?.scopes;
      if (!Array.isArray(keys) || !keys.length || keys.some(key => !scopeFor(req.auth).includes(key)) || new Set(keys).size !== keys.length) {
        return res.status(400).json({ error: 'Bitte gültige Bereiche für die Sicherung auswählen.' });
      }
      res.json(makeBackup(await snapshot(keys), req.auth, version));
    } catch (error) { sendError(res, error); }
  });
  app.post('/backup/preview', requireBackup('canImport'), async (req, res) => {
    try {
      for (const [id, preview] of previews) if (preview.expiresAt < Date.now()) previews.delete(id);
      for (const [id, preview] of previews) if (preview.owner === req.auth.token) previews.delete(id);
      if (previews.size >= 5) return res.status(429).json({ error: 'Zu viele offene Importprüfungen. Bitte später erneut versuchen.' });
      const data = validateBackup(req.body?.backup, req.body?.scopes, req.auth, models);
      const keys = Object.keys(data);
      const before = await snapshot(keys);
      if (keys.includes('teamCash')) data.teamCash = prepareCashImport(data.teamCash, before.teamCash, req.auth);
      const token = randomBytes(24).toString('hex');
      const expiresAt = Date.now() + 5 * 60 * 1000;
      const recoveryBackup = makeBackup(before, req.auth, version);
      previews.set(token, { owner: req.auth.token, expiresAt, data, beforeHash: snapshotHash(before) });
      res.json({ token, expiresAt, recoveryBackup,
        summary: keys.map(key => ({ key, label: labels[key], before: before[key].length, after: data[key].length })),
      });
    } catch (error) { sendError(res, error); }
  });
  app.post('/backup/import', requireBackup('canImport'), async (req, res) => {
    const preview = previews.get(req.body?.token);
    if (!preview || preview.owner !== req.auth.token || preview.expiresAt < Date.now() || req.body?.confirm !== true) {
      return res.status(400).json({ error: 'Die Importprüfung fehlt oder ist abgelaufen. Bitte die Datei erneut prüfen.' });
    }
    // A preview is single-use, including failed attempts.
    previews.delete(req.body.token);
    let session;
    try {
      const keys = Object.keys(preview.data);
      if (preview.full ? !mayFull(req.auth) : keys.some(key => !scopeFor(req.auth, true).includes(key))) return res.status(403).json({ error: 'Deine Importberechtigung hat sich geändert.' });
      session = await mongoose.startSession();
      await session.withTransaction(async () => {
        const current = await read(keys, session);
        if (snapshotHash(current) !== preview.beforeHash) throw Object.assign(new Error('Die Daten wurden seit der Prüfung geändert. Bitte erneut prüfen.'), { status: 409 });
        for (const key of keys) {
          await models[key].deleteMany({}, { session });
          if (preview.data[key].length) await models[key].insertMany(preview.data[key], { session, ordered: true });
        }
      });
      if (preview.full) { previews.clear(); invalidateAllSessions(); }
      res.json({ ok: true, full: !!preview.full, importedAt: new Date().toISOString(), importedBy: req.auth.username, scopes: keys });
    } catch (error) { sendError(res, error); }
    finally { if (session) await session.endSession(); }
  });
};
