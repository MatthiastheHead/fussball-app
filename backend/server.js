// backend/server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { randomBytes } = require('crypto');
const { version } = require('./package.json');
const revision = process.env.RENDER_GIT_COMMIT?.slice(0, 7) || 'local';

// === Modelle ===
const Checklist = require('./models/Checklist');
const Player = require('./models/Player');
const Training = require('./models/Training');
const AppSettings = require('./models/AppSettings');
const AdminRecovery = require('./models/AdminRecovery');
const LoginEvent = require('./models/LoginEvent');
const PasswordResetRequest = require('./models/PasswordResetRequest');
const TeamCash = require('./models/TeamCash');
const { ACCESS_KEYS, permissionsFor, isAdminUser, cashPermissionsFor, backupPermissionsFor } = require('./accessUtils');
const registerBackupRoutes = require('./backupRoutes');
const CashReceipt = require('./models/CashReceipt');
const registerReceiptRoutes = require('./receiptRoutes');
const Task = require('./models/Task');
const registerTaskRoutes = require('./taskRoutes');
const { hashPassword, isPasswordHash, verifyPassword } = require('./authUtils');
const {
  createOtpAuthUrl,
  decryptSecret,
  deriveRecoveryKey,
  encryptSecret,
  generateAuthenticatorSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
  safeStringEqual,
  verifyTotp,
} = require('./recoveryUtils');

const TRAINING_LOCATIONS = ['Sportplatz', 'Turnhalle'];
const ADMIN_USERNAME = 'Matthias';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 10;
const RECOVERY_WINDOW_MS = 15 * 60 * 1000;
const RECOVERY_SETUP_TTL_MS = 15 * 60 * 1000;
const MAX_RECOVERY_ATTEMPTS = 5;
const sessions = new Map();
const loginAttempts = new Map();
const recoveryAttempts = new Map();

const pruneSessions = () => {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt <= now) sessions.delete(token);
  }
};

const getBearerToken = req => {
  const authorization = req.get('authorization') || '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
};

const requireSession = (req, res, next) => {
  pruneSessions();
  const token = getBearerToken(req);
  const session = token ? sessions.get(token) : null;
  if (!session) return res.status(401).json({ error: 'Bitte erneut einloggen.' });
  req.auth = { ...session, token };
  next();
};

const requireAdmin = (req, res, next) =>
  requireSession(req, res, () => {
    if (!req.auth.isAdmin) {
      return res.status(403).json({ error: 'Nur Admins dürfen diesen Bereich öffnen.' });
    }
    next();
  });

const requireMainAdmin = (req, res, next) =>
  requireSession(req, res, () => {
    if (req.auth.username !== ADMIN_USERNAME) {
      return res.status(403).json({ error: 'Nur Matthias darf diesen Bereich öffnen.' });
    }
    next();
  });

const requireAccess = accessKey => (req, res, next) =>
  requireSession(req, res, () => {
    if (!req.auth.isAdmin && req.auth.permissions?.[accessKey] === false) {
      return res.status(403).json({ error: 'Für diesen Bereich fehlt dir die Berechtigung.' });
    }
    next();
  });

const userPermissions = permissionsFor;
const requireCashPermission = permission => (req, res, next) =>
  requireSession(req, res, () => {
    if (req.auth.cashPermissions?.[permission] !== true) {
      return res.status(403).json({ error: 'Für diese Kassenfunktion fehlt dir die Berechtigung.' });
    }
    next();
  });
const safeUser = user => ({
  _id: user._id,
  name: user.name,
  isAdmin: isAdminUser(user, ADMIN_USERNAME),
  isMainAdmin: user.name === ADMIN_USERNAME,
  permissions: userPermissions(user),
  cashPermissions: cashPermissionsFor(user, ADMIN_USERNAME),
  backupPermissions: backupPermissionsFor(user),
});

const loginAttemptKey = (req, username = '') =>
  `${req.ip || req.socket?.remoteAddress || 'unknown'}|${String(username).toLowerCase()}`;

const pruneLoginAttempts = () => {
  const now = Date.now();
  for (const [key, attempt] of loginAttempts.entries()) {
    if (now - attempt.startedAt > LOGIN_WINDOW_MS) loginAttempts.delete(key);
  }
};

const isLoginBlocked = key => {
  const attempt = loginAttempts.get(key);
  if (!attempt || Date.now() - attempt.startedAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
    return false;
  }
  return attempt.count >= MAX_LOGIN_ATTEMPTS;
};

const recordFailedLogin = key => {
  const current = loginAttempts.get(key);
  if (!current || Date.now() - current.startedAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, startedAt: Date.now() });
    return;
  }
  current.count += 1;
};

const recoveryAttemptKey = (req, purpose) =>
  `${req.ip || req.socket?.remoteAddress || 'unknown'}|${purpose}`;

const pruneRecoveryAttempts = () => {
  const now = Date.now();
  for (const [key, attempt] of recoveryAttempts.entries()) {
    if (now - attempt.startedAt > RECOVERY_WINDOW_MS) recoveryAttempts.delete(key);
  }
};

const isRecoveryBlocked = key => {
  const attempt = recoveryAttempts.get(key);
  if (!attempt || Date.now() - attempt.startedAt > RECOVERY_WINDOW_MS) {
    recoveryAttempts.delete(key);
    return false;
  }
  return attempt.count >= MAX_RECOVERY_ATTEMPTS;
};

const recordFailedRecovery = key => {
  const current = recoveryAttempts.get(key);
  if (!current || Date.now() - current.startedAt > RECOVERY_WINDOW_MS) {
    recoveryAttempts.set(key, { count: 1, startedAt: Date.now() });
    return;
  }
  current.count += 1;
};

const invalidateSessionsForUsername = username => {
  for (const [token, session] of sessions.entries()) {
    if (session.username === username) sessions.delete(token);
  }
};

const clearLoginAttemptsForUsername = username => {
  const suffix = `|${String(username).toLowerCase()}`;
  for (const key of loginAttempts.keys()) {
    if (key.endsWith(suffix)) loginAttempts.delete(key);
  }
};

async function replaceCollectionSafely(Model, list, cleanDocument) {
  const existing = await Model.find({}).lean();
  const existingById = new Map(existing.map(item => [String(item._id), item]));
  const keepIds = [];
  const newDocuments = [];
  const updateOperations = [];

  list.forEach(item => {
    const id = String(item?._id || '');
    const previous = mongoose.isValidObjectId(id) ? existingById.get(id) : null;
    const clean = cleanDocument(item, previous || null);
    if (previous) {
      keepIds.push(id);
      updateOperations.push({
        replaceOne: {
          filter: { _id: id },
          replacement: clean,
        },
      });
    } else {
      newDocuments.push(clean);
    }
  });

  if (newDocuments.length > 0) {
    const inserted = await Model.insertMany(newDocuments);
    keepIds.push(...inserted.map(item => String(item._id)));
  }
  if (updateOperations.length > 0) {
    await Model.bulkWrite(updateOperations);
  }
  await Model.deleteMany(keepIds.length > 0 ? { _id: { $nin: keepIds } } : {});
}

// === 1) Überprüfung der Umgebung ===
if (!process.env.MONGODB_URI) {
  console.error('❌ Keine MONGODB_URI in .env gefunden!');
  process.exit(1);
}

// Die Verschlüsselung ist an das nur auf dem Server vorhandene Datenbank-Geheimnis
// gebunden. Im Repository und in der Datenbank liegt dadurch kein Klartext-Schlüssel.
const recoveryEncryptionKey = deriveRecoveryKey(process.env.MONGODB_URI);

// === 2) Mit MongoDB verbinden ===
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('✅ Mit MongoDB verbunden');
    console.log('Aktuell verbundene DB:', mongoose.connection.name);
  })
  .catch((err) => {
    console.error('❌ Fehler beim Verbinden mit MongoDB:', err);
    process.exit(1);
  });

// === 3) Users-Schema ===
const User = require('./models/User');

// === 4) Express-App konfigurieren ===
const app = express();
// Render leitet die echte Client-IP über genau einen vorgeschalteten Proxy weiter.
// Das ist wichtig, damit die Anmelde- und Wiederherstellungsbremse pro Gerät greift.
app.set('trust proxy', 1);
app.use(cors());

// ⚙️ Body-Limit deutlich erhöht (Fix für HTTP 413)
app.use('/backup', requireSession, express.json({ limit: '100mb' }));
app.use(express.json({ limit: '16mb' }));
app.use(express.urlencoded({ limit: '16mb', extended: true }));

// ---- Diagnose-/Health-Routen ----
const sendHealth = (_req, res) => {
  const connected = mongoose.connection?.readyState === 1;
  res.status(connected ? 200 : 503).json({
    ok: connected,
    db: connected ? 'connected' : 'not-connected',
    version,
    revision,
  });
};

// Öffentlicher Healthcheck für Frontend und Hosting. Der alte Diagnosepfad
// bleibt aus Kompatibilitätsgründen erhalten.
app.get('/health', sendHealth);
app.get('/__health', sendHealth);

app.get('/__routes', (req, res) => {
  const routes = (app._router?.stack || [])
    .filter(l => l.route)
    .map(l => {
      const methods = Object.keys(l.route.methods).join(',').toUpperCase();
      return `${methods} ${l.route.path}`;
    });
  res.json(routes);
});

// favicon ignorieren
app.get('/favicon.ico', (_req, res) => res.status(204).end());

// Root-Info
app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'fussball-api', version, revision });
});

// === 5) API-Endpunkte ===

// ---- 5.1 Anmeldung und Benutzer ----
app.post('/auth/login', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!name || !password || name.length > 100 || password.length > 256) {
    return res.status(400).json({ error: 'Benutzername und Passwort werden benötigt.' });
  }

  const attemptKey = loginAttemptKey(req, name);
  pruneLoginAttempts();
  if (isLoginBlocked(attemptKey)) {
    return res.status(429).json({ error: 'Zu viele Anmeldeversuche. Bitte später erneut versuchen.' });
  }

  try {
    const user = await User.findOne({ name });
    const passwordMatches = user
      ? await verifyPassword(password, user.password)
      : false;
    if (!user || !passwordMatches) {
      recordFailedLogin(attemptKey);
      return res.status(401).json({ error: 'Falscher Benutzername oder Passwort.' });
    }

    loginAttempts.delete(attemptKey);
    if (!isPasswordHash(user.password)) {
      user.password = await hashPassword(password);
      await user.save();
    }

    pruneSessions();
    const token = randomBytes(32).toString('hex');
    sessions.set(token, {
      username: user.name,
      isAdmin: isAdminUser(user, ADMIN_USERNAME),
      permissions: userPermissions(user),
      cashPermissions: cashPermissionsFor(user, ADMIN_USERNAME),
      backupPermissions: backupPermissionsFor(user),
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    await LoginEvent.create({ username: user.name, loggedInAt: new Date() });
    res.json({
      name: user.name,
      isAdmin: isAdminUser(user, ADMIN_USERNAME),
      isMainAdmin: user.name === ADMIN_USERNAME,
      backupPermissions: backupPermissionsFor(user),
      cashPermissions: cashPermissionsFor(user, ADMIN_USERNAME),
      permissions: userPermissions(user),
      token,
      expiresInMs: SESSION_TTL_MS,
    });
  } catch (err) {
    console.error('Fehler POST /auth/login:', err);
    res.status(500).json({ error: 'Anmeldung konnte nicht abgeschlossen werden.' });
  }
});

app.post('/auth/logout', (req, res) => {
  const token = getBearerToken(req);
  if (token) sessions.delete(token);
  res.status(204).end();
});

const findRecoveryForUser = async user => {
  if (!user?._id) return null;
  const userId = String(user._id);
  let recovery = await AdminRecovery.findOne({ userId });

  // Ein eventuell bereits eingerichtetes Matthias-Konto aus Version 6.4
  // wird beim ersten Zugriff automatisch dem Benutzerkonto zugeordnet.
  if (!recovery && user.name === ADMIN_USERNAME) {
    recovery = await AdminRecovery.findOne({ key: 'matthias' });
  }
  if (recovery && (recovery.userId !== userId || recovery.username !== user.name)) {
    recovery.userId = userId;
    recovery.username = user.name;
    await recovery.save();
  }
  return recovery;
};

const recoveryStatusPayload = recovery => ({
  enabled: !!(recovery?.encryptedSecret && recovery?.enabledAt),
  enabledAt: recovery?.enabledAt || null,
  updatedAt: recovery?.updatedAt || null,
  remainingRecoveryCodes: Array.isArray(recovery?.recoveryCodeHashes)
    ? recovery.recoveryCodeHashes.length
    : 0,
});

const sendRecoveryStatus = async (req, res) => {
  try {
    const user = await User.findOne({ name: req.auth.username });
    const recovery = await findRecoveryForUser(user);
    res.set('Cache-Control', 'no-store');
    res.json(recoveryStatusPayload(recovery));
  } catch (err) {
    console.error('Fehler GET Kontowiederherstellung:', err);
    res.status(500).json({ error: 'Authenticator-Status konnte nicht geladen werden.' });
  }
};

const startRecoverySetup = async (req, res) => {
  const currentPassword =
    typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  if (!currentPassword || currentPassword.length > 256) {
    return res.status(400).json({ error: 'Gib dein aktuelles Passwort ein.' });
  }

  const attemptKey = recoveryAttemptKey(req, `authenticator-setup:${req.auth.username}`);
  pruneRecoveryAttempts();
  if (isRecoveryBlocked(attemptKey)) {
    return res.status(429).json({ error: 'Zu viele Versuche. Bitte warte 15 Minuten.' });
  }

  try {
    const user = await User.findOne({ name: req.auth.username });
    const passwordMatches = user
      ? await verifyPassword(currentPassword, user.password)
      : false;
    if (!user || !passwordMatches) {
      recordFailedRecovery(attemptKey);
      return res.status(401).json({ error: 'Das aktuelle Passwort ist falsch.' });
    }

    const secret = generateAuthenticatorSecret();
    const recoveryCodes = generateRecoveryCodes(8);
    const pendingValues = {
      userId: String(user._id),
      username: user.name,
      pendingEncryptedSecret: encryptSecret(secret, recoveryEncryptionKey),
      pendingRecoveryCodeHashes: recoveryCodes.map(code =>
        hashRecoveryCode(code, recoveryEncryptionKey)
      ),
      pendingCreatedAt: new Date(),
    };
    const existingRecovery = await findRecoveryForUser(user);
    if (existingRecovery) {
      Object.assign(existingRecovery, pendingValues);
      await existingRecovery.save();
    } else {
      await AdminRecovery.create({
        key: `user:${user._id}`,
        ...pendingValues,
      });
    }

    recoveryAttempts.delete(attemptKey);
    res.set('Cache-Control', 'no-store');
    res.json({
      secret,
      otpAuthUrl: createOtpAuthUrl(secret, user.name, 'Fussball-App'),
      recoveryCodes,
      expiresInMs: RECOVERY_SETUP_TTL_MS,
    });
  } catch (err) {
    console.error('Fehler POST Kontowiederherstellung/setup:', err);
    res.status(500).json({ error: 'Authenticator-Einrichtung konnte nicht gestartet werden.' });
  }
};

const confirmRecoverySetup = async (req, res) => {
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Gib den 6-stelligen Code aus der Authenticator-App ein.' });
  }

  const attemptKey = recoveryAttemptKey(req, `authenticator-confirm:${req.auth.username}`);
  pruneRecoveryAttempts();
  if (isRecoveryBlocked(attemptKey)) {
    return res.status(429).json({ error: 'Zu viele Versuche. Bitte warte 15 Minuten.' });
  }

  try {
    const user = await User.findOne({ name: req.auth.username });
    const recovery = await findRecoveryForUser(user);
    const pendingAge = recovery?.pendingCreatedAt
      ? Date.now() - new Date(recovery.pendingCreatedAt).getTime()
      : Number.POSITIVE_INFINITY;
    if (!recovery?.pendingEncryptedSecret || pendingAge > RECOVERY_SETUP_TTL_MS) {
      if (recovery?.pendingEncryptedSecret) {
        await AdminRecovery.updateOne(
          { _id: recovery._id },
          {
            $unset: {
              pendingEncryptedSecret: 1,
              pendingRecoveryCodeHashes: 1,
              pendingCreatedAt: 1,
            },
          }
        );
      }
      return res.status(410).json({
        error: 'Die Einrichtung ist abgelaufen. Bitte starte sie erneut.',
      });
    }

    const secret = decryptSecret(recovery.pendingEncryptedSecret, recoveryEncryptionKey);
    const matchedCounter = verifyTotp(secret, code, { window: 1 });
    if (matchedCounter === null) {
      recordFailedRecovery(attemptKey);
      return res.status(401).json({ error: 'Der Authenticator-Code ist ungültig.' });
    }

    const enabledAt = new Date();
    const result = await AdminRecovery.updateOne(
      { _id: recovery._id, pendingEncryptedSecret: recovery.pendingEncryptedSecret },
      {
        $set: {
          encryptedSecret: recovery.pendingEncryptedSecret,
          recoveryCodeHashes: recovery.pendingRecoveryCodeHashes,
          lastUsedCounter: matchedCounter,
          enabledAt,
        },
        $unset: {
          pendingEncryptedSecret: 1,
          pendingRecoveryCodeHashes: 1,
          pendingCreatedAt: 1,
        },
      }
    );
    if (result.modifiedCount !== 1) {
      return res.status(409).json({ error: 'Die Einrichtung wurde bereits erneuert. Bitte starte erneut.' });
    }

    recoveryAttempts.delete(attemptKey);
    res.set('Cache-Control', 'no-store');
    res.json({ enabled: true, enabledAt, remainingRecoveryCodes: 8 });
  } catch (err) {
    console.error('Fehler POST Kontowiederherstellung/confirm:', err);
    res.status(500).json({ error: 'Authenticator-Einrichtung konnte nicht bestätigt werden.' });
  }
};

const recoverPassword = async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const credential = typeof req.body?.credential === 'string' ? req.body.credential.trim() : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  if (
    !username ||
    username.length > 100 ||
    !credential ||
    credential.length > 100 ||
    newPassword.length < 8 ||
    newPassword.length > 256
  ) {
    return res.status(400).json({
      error: 'Gib Benutzername, Authenticator- oder Notfallcode und ein Passwort mit mindestens 8 Zeichen ein.',
    });
  }

  const attemptKey = recoveryAttemptKey(req, `password-reset:${username.toLowerCase()}`);
  pruneRecoveryAttempts();
  if (isRecoveryBlocked(attemptKey)) {
    return res.status(429).json({
      error: 'Zu viele Wiederherstellungsversuche. Bitte warte 15 Minuten.',
    });
  }

  const rejectCredential = () => {
    recordFailedRecovery(attemptKey);
    return res.status(401).json({
      error: 'Benutzername oder Authenticator- beziehungsweise Notfallcode ist ungültig.',
    });
  };

  try {
    const [user, newPasswordHash] = await Promise.all([
      User.findOne({ name: username }),
      hashPassword(newPassword),
    ]);
    const recovery = user ? await findRecoveryForUser(user) : null;
    if (!user || !recovery?.encryptedSecret || !recovery.enabledAt) return rejectCredential();

    let consumed = false;
    if (/^\d{6}$/.test(credential)) {
      const secret = decryptSecret(recovery.encryptedSecret, recoveryEncryptionKey);
      const matchedCounter = verifyTotp(secret, credential, { window: 1 });
      if (matchedCounter !== null && matchedCounter > (recovery.lastUsedCounter ?? -1)) {
        const result = await AdminRecovery.updateOne(
          {
            _id: recovery._id,
            $or: [
              { lastUsedCounter: { $lt: matchedCounter } },
              { lastUsedCounter: { $exists: false } },
            ],
          },
          { $set: { lastUsedCounter: matchedCounter } }
        );
        consumed = result.modifiedCount === 1;
      }
    } else {
      const normalizedCode = normalizeRecoveryCode(credential);
      if (normalizedCode.length === 12) {
        const candidateHash = hashRecoveryCode(normalizedCode, recoveryEncryptionKey);
        const storedHash = recovery.recoveryCodeHashes.find(hash =>
          safeStringEqual(hash, candidateHash)
        );
        if (storedHash) {
          const result = await AdminRecovery.updateOne(
            { _id: recovery._id, recoveryCodeHashes: storedHash },
            { $pull: { recoveryCodeHashes: storedHash } }
          );
          consumed = result.modifiedCount === 1;
        }
      }
    }

    if (!consumed) return rejectCredential();

    user.password = newPasswordHash;
    await user.save();
    invalidateSessionsForUsername(user.name);
    clearLoginAttemptsForUsername(user.name);
    await PasswordResetRequest.updateMany(
      { userId: String(user._id), status: 'open' },
      {
        $set: {
          status: 'resolved',
          resolvedAt: new Date(),
          resolvedBy: user.name,
        },
      }
    );
    recoveryAttempts.delete(attemptKey);
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true });
  } catch (err) {
    console.error('Fehler POST /auth/recover-password:', err);
    res.status(500).json({ error: 'Das Passwort konnte nicht zurückgesetzt werden.' });
  }
};

app.post('/auth/recover-password', recoverPassword);

// Kompatibilität zur kurzzeitig veröffentlichten Version 6.4.
app.post('/auth/recover-matthias', (req, res) => {
  req.body = { ...(req.body || {}), username: ADMIN_USERNAME };
  return recoverPassword(req, res);
});

app.post('/auth/password-reset-requests', async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  if (!username || username.length > 100) {
    return res.status(400).json({ error: 'Gib deinen Benutzernamen ein.' });
  }

  const attemptKey = recoveryAttemptKey(req, `reset-request:${username.toLowerCase()}`);
  pruneRecoveryAttempts();
  if (isRecoveryBlocked(attemptKey)) {
    return res.status(429).json({ error: 'Zu viele Anfragen. Bitte warte 15 Minuten.' });
  }

  try {
    const user = await User.findOne({ name: username });
    if (user) {
      const now = new Date();
      await PasswordResetRequest.findOneAndUpdate(
        { userId: String(user._id), status: 'open' },
        {
          $set: { username: user.name, lastRequestedAt: now },
          $setOnInsert: {
            userId: String(user._id),
            status: 'open',
            firstRequestedAt: now,
          },
          $inc: { requestCount: 1 },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
    recordFailedRecovery(attemptKey);
    res.status(202).json({ ok: true });
  } catch (err) {
    console.error('Fehler POST /auth/password-reset-requests:', err);
    res.status(500).json({ error: 'Die Anfrage konnte nicht übermittelt werden.' });
  }
});

app.get('/account/recovery/status', requireSession, sendRecoveryStatus);
app.post('/account/recovery/setup', requireSession, startRecoverySetup);
app.post('/account/recovery/confirm', requireSession, confirmRecoverySetup);

// Die alten Matthias-Pfade bleiben während der Umstellung kompatibel und
// erzwingen weiterhin eine angemeldete Admin-Sitzung.
app.get('/admin/recovery/status', requireAdmin, sendRecoveryStatus);
app.post('/admin/recovery/setup', requireAdmin, startRecoverySetup);
app.post('/admin/recovery/confirm', requireAdmin, confirmRecoverySetup);

app.get('/admin/password-reset-requests', requireAdmin, async (_req, res) => {
  try {
    const requests = await PasswordResetRequest.find({ status: 'open' })
      .sort({ lastRequestedAt: -1 })
      .limit(200)
      .lean();
    res.json(requests.map(request => ({
      _id: request._id,
      username: request.username,
      firstRequestedAt: request.firstRequestedAt,
      lastRequestedAt: request.lastRequestedAt,
      requestCount: request.requestCount,
    })));
  } catch (err) {
    console.error('Fehler GET /admin/password-reset-requests:', err);
    res.status(500).json({ error: 'Passwortanfragen konnten nicht geladen werden.' });
  }
});

app.patch('/admin/password-reset-requests/:id/resolve', requireAdmin, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Ungültige Passwortanfrage.' });
  }
  try {
    const request = await PasswordResetRequest.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          status: 'resolved',
          resolvedAt: new Date(),
          resolvedBy: req.auth.username,
        },
      },
      { new: true }
    );
    if (!request) return res.status(404).json({ error: 'Passwortanfrage nicht gefunden.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Fehler PATCH /admin/password-reset-requests/:id/resolve:', err);
    res.status(500).json({ error: 'Passwortanfrage konnte nicht erledigt werden.' });
  }
});

app.get('/admin/users', requireAdmin, async (_req, res) => {
  try {
    const allUsers = await User.find().sort({ name: 1 }).lean();
    res.json(allUsers.map(safeUser));
  } catch (err) {
    console.error('Fehler GET /admin/users:', err);
    res.status(500).json({ error: 'Benutzer konnten nicht geladen werden.' });
  }
});

app.post('/admin/users', requireAdmin, async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!name || password.length < 8 || name.length > 100 || password.length > 256) {
    return res.status(400).json({
      error: 'Benutzername und ein Passwort mit mindestens 8 Zeichen werden benötigt.',
    });
  }
  try {
    const user = await User.create({ name, password: await hashPassword(password) });
    res.status(201).json(safeUser(user));
  } catch (err) {
    console.error('Fehler POST /admin/users:', err);
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'Dieser Benutzername existiert bereits.' });
    }
    res.status(500).json({ error: 'Benutzer konnte nicht angelegt werden.' });
  }
});

app.patch('/admin/users/:id/access', requireAdmin, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Ungültiger Benutzer.' });
  }
  const permissions = Object.fromEntries(
    ACCESS_KEYS.map(key => [key, req.body?.permissions?.[key] !== false])
  );
  const isAdmin = req.body?.isAdmin === true;
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    if (req.body?.cashPermissions !== undefined && req.auth.username !== ADMIN_USERNAME) {
      return res.status(403).json({ error: 'Nur der Hauptadmin darf besondere Kassenrechte vergeben.' });
    }
    if ((user.cashPermissions?.canViewDeleted || user.backupPermissions?.canFullBackup) && req.auth.username !== ADMIN_USERNAME) {
      return res.status(403).json({ error: 'Nur der Hauptadmin darf Konten mit Zugriff auf gelöschte Buchungen ändern.' });
    }
    if (user.name === ADMIN_USERNAME && req.auth.username !== ADMIN_USERNAME) {
      return res.status(403).json({ error: 'Nur Matthias darf das Hauptadmin-Konto ändern.' });
    }
    if (user.name === ADMIN_USERNAME && !isAdmin) {
      return res.status(400).json({ error: 'Matthias bleibt geschützter Hauptadmin.' });
    }
    user.isAdmin = user.name === ADMIN_USERNAME || isAdmin;
    user.permissions = permissions;
    if (req.body?.backupPermissions?.canFullBackup === true && req.auth.username !== ADMIN_USERNAME) {
      return res.status(403).json({ error: 'Nur der Hauptadmin darf vollständige Sicherungen freigeben.' });
    }
    if (req.body?.backupPermissions !== undefined) {
      user.backupPermissions = {
        canFullBackup: req.body.backupPermissions?.canFullBackup === true,
        canExport: req.body.backupPermissions?.canExport === true,
        canImport: req.body.backupPermissions?.canImport === true,
      };
    }
    if (req.body?.cashPermissions !== undefined) {
      user.cashPermissions = {
        canDelete: req.body.cashPermissions?.canDelete === true,
        canViewDeleted: req.body.cashPermissions?.canViewDeleted === true,
      };
    }
    await user.save();
    invalidateSessionsForUsername(user.name);
    res.json(safeUser(user));
  } catch (err) {
    console.error('Fehler PATCH /admin/users/:id/access:', err);
    res.status(500).json({ error: 'Berechtigungen konnten nicht gespeichert werden.' });
  }
});

app.patch('/admin/users/:id/password', requireAdmin, async (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (
    !mongoose.isValidObjectId(req.params.id) ||
    password.length < 8 ||
    password.length > 256
  ) {
    return res.status(400).json({ error: 'Ungültiger Benutzer oder ungültiges Passwort.' });
  }
  try {
    const target = await User.findById(req.params.id).select('name cashPermissions backupPermissions');
    if (!target) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    if ((target.name === ADMIN_USERNAME || target.cashPermissions?.canViewDeleted || target.backupPermissions?.canFullBackup) && req.auth.username !== ADMIN_USERNAME) {
      return res.status(403).json({ error: 'Nur der Hauptadmin darf dieses geschützte Konto ändern.' });
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { password: await hashPassword(password) } },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    invalidateSessionsForUsername(user.name);
    await PasswordResetRequest.updateMany(
      { userId: String(user._id), status: 'open' },
      {
        $set: {
          status: 'resolved',
          resolvedAt: new Date(),
          resolvedBy: req.auth.username,
        },
      }
    );
    res.json(safeUser(user));
  } catch (err) {
    console.error('Fehler PATCH /admin/users/:id/password:', err);
    res.status(500).json({ error: 'Passwort konnte nicht geändert werden.' });
  }
});

app.delete('/admin/users/:id', requireAdmin, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Ungültiger Benutzer.' });
  }
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    if ((user.cashPermissions?.canViewDeleted || user.backupPermissions?.canFullBackup) && req.auth.username !== ADMIN_USERNAME) {
      return res.status(403).json({ error: 'Nur der Hauptadmin darf dieses Konto löschen.' });
    }
    if (user.name === ADMIN_USERNAME && req.auth.username !== ADMIN_USERNAME) {
      return res.status(403).json({ error: 'Nur Matthias darf das Hauptadmin-Konto ändern.' });
    }
    if (user.name === ADMIN_USERNAME) {
      return res.status(400).json({ error: 'Der Administrator kann nicht gelöscht werden.' });
    }
    invalidateSessionsForUsername(user.name);
    await Promise.all([
      user.deleteOne(),
      AdminRecovery.deleteMany({ userId: String(user._id) }),
      PasswordResetRequest.deleteMany({ userId: String(user._id) }),
    ]);
    res.status(204).end();
  } catch (err) {
    console.error('Fehler DELETE /admin/users/:id:', err);
    res.status(500).json({ error: 'Benutzer konnte nicht gelöscht werden.' });
  }
});

app.get('/admin/login-events', requireMainAdmin, async (req, res) => {
  const requestedLimit = Number(req.query.limit);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(500, Math.max(1, Math.trunc(requestedLimit)))
    : 200;
  try {
    const events = await LoginEvent.find({}).sort({ loggedInAt: -1 }).limit(limit).lean();
    res.json(events.map(event => ({
      _id: event._id,
      username: event.username,
      loggedInAt: event.loggedInAt,
    })));
  } catch (err) {
    console.error('Fehler GET /admin/login-events:', err);
    res.status(500).json({ error: 'Login-Protokoll konnte nicht geladen werden.' });
  }
});

// Kompatibler Pfad ohne Passwortausgabe. Auch dieser Zugriff bleibt Matthias vorbehalten.
app.get('/users', requireAdmin, async (_req, res) => {
  try {
    const allUsers = await User.find().sort({ name: 1 }).lean();
    res.json(allUsers.map(safeUser));
  } catch (err) {
    console.error('Fehler GET /users:', err);
    res.status(500).json({ error: 'Benutzer konnten nicht geladen werden.' });
  }
});

app.post('/users', requireAdmin, (_req, res) => {
  res.status(410).json({
    error: 'Dieser alte Benutzer-Endpunkt wurde aus Sicherheitsgründen abgeschaltet.',
  });
});

// ---- 5.2 Players ----
app.get('/players', requireSession, async (req, res) => {
  try {
    const allPlayers = await Player.find().lean();
    res.json(allPlayers);
  } catch (err) {
    console.error('Fehler GET /players:', err);
    res.status(500).json({ error: 'Datenbankfehler beim Laden der Players' });
  }
});

app.get('/team-generator/access', requireAccess('teamGenerator'), (_req, res) => {
  res.json({ ok: true });
});

app.post('/players', requireAdmin, async (req, res) => {
  const { reset, list } = req.body || {};
  if (!reset || !Array.isArray(list)) {
    return res.status(400).json({ error: 'Ungültige Anfrage: { reset: true, list: [...] } erwartet.' });
  }

  try {
    const names = list.map(player =>
      typeof player?.name === 'string' ? player.name.trim() : ''
    );
    if (names.some(name => !name)) {
      return res.status(400).json({ error: 'Jedes Team-Mitglied benötigt einen Namen.' });
    }
    if (new Set(names.map(name => name.toLocaleLowerCase('de-DE'))).size !== names.length) {
      return res.status(409).json({ error: 'Namen dürfen nicht doppelt vorkommen.' });
    }
    await replaceCollectionSafely(Player, list, p => ({
        name: p.name.trim(),
        isTrainer: !!p.isTrainer,
        note: typeof p.note === 'string' ? p.note : "",
        memberSince: typeof p.memberSince === 'string' ? p.memberSince : "",
        inactive: !!p.inactive
      }));
    const saved = await Player.find().lean();
    res.json(saved);
  } catch (err) {
    console.error('Fehler POST /players:', err);
    res.status(500).json({ error: 'Datenbankfehler beim Speichern der Players' });
  }
});

// ---- 5.3 Trainings ----
app.get('/trainings', requireAccess('training'), async (req, res) => {
  try {
    const allTrainings = await Training.find().lean();
    res.json(allTrainings);
  } catch (err) {
    console.error('Fehler GET /trainings:', err);
    res.status(500).json({ error: 'Datenbankfehler beim Laden der Trainings' });
  }
});

app.post('/trainings', requireAccess('training'), async (req, res) => {
  const { reset, list } = req.body || {};
  if (!reset || !Array.isArray(list)) {
    return res.status(400).json({ error: 'Ungültige Anfrage: { reset: true, list: [...] } erwartet.' });
  }

  try {
    const dates = list.map(t => (typeof t?.date === 'string' ? t.date.trim() : ''));
    if (dates.some(date => !date)) {
      return res.status(400).json({ error: 'Jedes Training benötigt ein gültiges Datum.' });
    }
    if (new Set(dates).size !== dates.length) {
      return res.status(409).json({ error: 'Für ein Datum darf nur ein Training angelegt werden.' });
    }

    const cleanObject = value =>
      value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const cleanDate = value => {
      if (!value) return null;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    };
    const cleanAudit = value => {
      if (!value || typeof value !== 'object') return null;
      return {
        by: typeof value.by === 'string' ? value.by : '',
        at: typeof value.at === 'string' ? value.at : '',
        action: typeof value.action === 'string' ? value.action : '',
      };
    };
    const cleanRatings = value =>
      Object.fromEntries(
        Object.entries(cleanObject(value)).map(([name, rating]) => [
          name,
          Math.max(
            0,
            Math.min(3, Number.isFinite(Number(rating)) ? Math.round(Number(rating)) : 0)
          ),
        ])
      );
    const cleanReasons = value =>
      Object.fromEntries(
        Object.entries(cleanObject(value))
          .map(([name, reason]) => [
            name,
            typeof reason === 'string' ? reason.trim() : '',
          ])
          .filter(([, reason]) => reason)
      );
    const cleanTraining = (training, previous = null) => ({
      date: training.date.trim(),
      location: TRAINING_LOCATIONS.includes(training.location)
        ? training.location
        : previous?.location || 'Sportplatz',
      participants: cleanObject(training.participants),
      ratings: cleanRatings(training.ratings),
      trainerStatus: cleanObject(training.trainerStatus),
      note: typeof training.note === 'string' ? training.note : '',
      playerNotes: cleanObject(training.playerNotes),
      inactiveReasons: Object.prototype.hasOwnProperty.call(training, 'inactiveReasons')
        ? cleanReasons(training.inactiveReasons)
        : cleanReasons(previous?.inactiveReasons),
      createdBy:
        typeof training.createdBy === 'string' && training.createdBy.trim()
          ? training.createdBy.trim()
          : previous?.createdBy || '',
      createdAt:
        cleanDate(training.createdAt) || previous?.createdAt || (previous ? null : new Date()),
      lastEdited: cleanAudit(training.lastEdited) || previous?.lastEdited || null,
      history: Array.isArray(training.history)
        ? training.history.map(cleanAudit).filter(Boolean).slice(-50)
        : Array.isArray(previous?.history)
          ? previous.history.slice(-50)
          : [],
    });

    // Bestehende IDs bleiben erhalten. Neue Datensätze werden zuerst angelegt
    // und erst danach werden entfernte Datensätze gelöscht. So kann ein Fehler
    // nicht mehr die komplette Trainingssammlung leeren.
    const existing = await Training.find({}).lean();
    const existingIds = new Set(existing.map(item => String(item._id)));
    const existingById = new Map(existing.map(item => [String(item._id), item]));
    const keepIds = [];
    const newDocuments = [];
    const updateOperations = [];

    list.forEach(training => {
      const id = String(training?._id || '');
      if (mongoose.isValidObjectId(id) && existingIds.has(id)) {
        const clean = cleanTraining(training, existingById.get(id));
        keepIds.push(id);
        updateOperations.push({
          replaceOne: {
            filter: { _id: id },
            replacement: clean,
          },
        });
      } else {
        newDocuments.push(cleanTraining(training));
      }
    });

    if (newDocuments.length > 0) {
      const inserted = await Training.insertMany(newDocuments);
      keepIds.push(...inserted.map(item => String(item._id)));
    }
    if (updateOperations.length > 0) {
      await Training.bulkWrite(updateOperations);
    }
    await Training.deleteMany(
      keepIds.length > 0 ? { _id: { $nin: keepIds } } : {}
    );

    const saved = await Training.find().lean();
    res.json(saved);
  } catch (err) {
    console.error('Fehler POST /trainings:', err);
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'Für ein Datum darf nur ein Training angelegt werden.' });
    }
    res.status(500).json({ error: 'Datenbankfehler beim Speichern der Trainings' });
  }
});

// ---- 5.4 App-Einstellungen ----
app.get('/settings', requireSession, async (_req, res) => {
  try {
    const settings = await AppSettings.findOne({ key: 'app' }).lean();
    res.json({
      defaultTrainingLocation: settings?.defaultTrainingLocation || 'Sportplatz',
    });
  } catch (err) {
    console.error('Fehler GET /settings:', err);
    res.status(500).json({ error: 'Datenbankfehler beim Laden der Einstellungen' });
  }
});

app.post('/settings', requireAdmin, async (req, res) => {
  const defaultTrainingLocation = req.body?.defaultTrainingLocation;
  if (!TRAINING_LOCATIONS.includes(defaultTrainingLocation)) {
    return res.status(400).json({ error: 'Ungültiger Standard-Trainingsort.' });
  }
  try {
    const settings = await AppSettings.findOneAndUpdate(
      { key: 'app' },
      { $set: { defaultTrainingLocation } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    res.json({ defaultTrainingLocation: settings.defaultTrainingLocation });
  } catch (err) {
    console.error('Fehler POST /settings:', err);
    res.status(500).json({ error: 'Datenbankfehler beim Speichern der Einstellungen' });
  }
});

// ---- 5.5 Checklists ----
console.log('🧩 Registriere Checklisten-Endpunkte...');

app.get('/checklists', requireAccess('checklists'), async (_req, res) => {
  try {
    const list = await Checklist.find({}).sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (e) {
    console.error('Fehler GET /checklists:', e);
    res.status(500).json({ error: 'Datenbankfehler beim Laden der Checklisten' });
  }
});

app.post('/checklists', requireAccess('checklists'), async (req, res) => {
  const { reset, list } = req.body || {};
  if (!reset || !Array.isArray(list)) {
    return res.status(400).json({ error: 'Ungültige Anfrage: { reset: true, list: [...] } erwartet.' });
  }
  try {
    const cleanRemarks = value =>
      Object.fromEntries(
        Object.entries(value && typeof value === 'object' && !Array.isArray(value) ? value : {})
          .map(([name, remark]) => [
            name,
            typeof remark === 'string' ? remark.trim() : '',
          ])
          .filter(([, remark]) => remark)
      );
    await replaceCollectionSafely(Checklist, list, (cl, previous) => ({
        title: typeof cl.title === 'string' ? cl.title : 'Unbenannt',
        items: typeof cl.items === 'object' && cl.items !== null ? cl.items : {},
        remarks: Object.prototype.hasOwnProperty.call(cl, 'remarks')
          ? cleanRemarks(cl.remarks)
          : cleanRemarks(previous?.remarks),
        createdBy: cl.createdBy || previous?.createdBy || '',
        createdAt:
          cl.createdAt && !Number.isNaN(new Date(cl.createdAt).getTime())
            ? new Date(cl.createdAt)
            : previous?.createdAt || new Date(),
        lastEdited:
          cl.lastEdited && typeof cl.lastEdited === 'object'
            ? cl.lastEdited
            : previous?.lastEdited || null
      }));
    const saved = await Checklist.find({}).sort({ createdAt: -1 }).lean();
    res.json(saved);
  } catch (e) {
    console.error('Fehler POST /checklists:', e);
    res.status(500).json({ error: 'Datenbankfehler beim Speichern der Checklisten' });
  }
});

registerTaskRoutes({ app, Task, User, requireAccess, mongoose });
registerReceiptRoutes({ app, mongoose, TeamCash, CashReceipt, requireAccess });
require('./cashRemovalRoutes')({ app, mongoose, TeamCash, CashReceipt, requireCashPermission });
registerBackupRoutes({ app, mongoose, requireSession, version, recoveryKey: recoveryEncryptionKey, invalidateAllSessions: () => sessions.clear(),
  models: { players: Player, trainings: Training, checklists: Checklist, settings: AppSettings, teamCash: TeamCash, receipts: CashReceipt, tasks: Task, users: User, recovery: AdminRecovery, passwordResets: PasswordResetRequest, loginEvents: LoginEvent },
});

// ---- 5.6 Mannschaftskasse ----
const cleanTeamCash = document => {
  const cash = document?.toObject ? document.toObject() : document || {};
  const transactions = Array.isArray(cash.transactions)
    ? cash.transactions.filter(transaction => !transaction.deletedAt).sort(
        (a, b) =>
          String(b.date || '').localeCompare(String(a.date || '')) ||
          new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      )
    : [];
  const spentCents = transactions.filter(transaction => transaction.type !== 'deposit').reduce(
    (sum, transaction) => sum + (Number(transaction.amountCents) || 0),
    0
  );
  const depositedCents = transactions.filter(transaction => transaction.type === 'deposit').reduce(
    (sum, transaction) => sum + (Number(transaction.amountCents) || 0), 0
  );
  const openingBalanceCents = Number(cash.openingBalanceCents) || 0;
  return {
    openingBalanceCents,
    openingBalanceUpdatedBy: cash.openingBalanceUpdatedBy || '',
    openingBalanceUpdatedAt: cash.openingBalanceUpdatedAt || null,
    spentCents,
    depositedCents,
    balanceCents: openingBalanceCents + depositedCents - spentCents,
    transactions,
  };
};

const validCashDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

app.get('/team-cash', requireAccess('teamCash'), async (req, res) => {
  try {
    const cash = await TeamCash.findOne({ key: 'team-cash' }).lean();
    res.json({ ...cleanTeamCash(cash), generatedAt: new Date().toISOString(), generatedBy: req.auth.username });
  } catch (err) {
    console.error('Fehler GET /team-cash:', err);
    res.status(500).json({ error: 'Die Mannschaftskasse konnte nicht geladen werden.' });
  }
});

app.post('/team-cash/opening-balance', requireAdmin, async (req, res) => {
  const amountCents = Number(req.body?.amountCents);
  if (!Number.isSafeInteger(amountCents) || amountCents < 0 || amountCents > 100_000_000) {
    return res.status(400).json({ error: 'Bitte einen gültigen Kassenbestand eingeben.' });
  }

  try {
    const cash = await TeamCash.findOneAndUpdate(
      { key: 'team-cash' },
      {
        $set: {
          openingBalanceCents: amountCents,
          openingBalanceUpdatedBy: req.auth.username,
          openingBalanceUpdatedAt: new Date(),
        },
        $setOnInsert: { key: 'team-cash', transactions: [] },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json(cleanTeamCash(cash));
  } catch (err) {
    console.error('Fehler POST /team-cash/opening-balance:', err);
    res.status(500).json({ error: 'Der Kassenbestand konnte nicht gespeichert werden.' });
  }
});

app.post('/team-cash/transactions', requireAccess('teamCash'), async (req, res) => {
  const type = req.body?.type === undefined ? 'expense' : req.body.type;
  if (!['expense', 'deposit'].includes(type)) {
    return res.status(400).json({ error: 'Bitte Einzahlung oder Ausgabe auswählen.' });
  }
  const date = String(req.body?.date || '').trim();
  const person = req.auth.username;
  const purpose = String(req.body?.purpose || '').trim();
  const amountCents = Number(req.body?.amountCents);

  if (!validCashDate(date)) {
    return res.status(400).json({ error: 'Bitte ein gültiges Datum auswählen.' });
  }
  if (!purpose || purpose.length > 200) {
    return res.status(400).json({ error: 'Bitte einen Verwendungszweck mit höchstens 200 Zeichen eintragen.' });
  }
  if (!Number.isSafeInteger(amountCents) || amountCents < 1 || amountCents > 100_000_000) {
    return res.status(400).json({ error: 'Bitte einen gültigen Buchungsbetrag eingeben.' });
  }

  try {
    const transactionId = new mongoose.Types.ObjectId();
    const cash = await TeamCash.findOneAndUpdate(
      { key: 'team-cash' },
      {
        $setOnInsert: { key: 'team-cash', openingBalanceCents: 0 },
        $push: {
          transactions: {
            _id: transactionId,
            type,
            date,
            person,
            amountCents,
            purpose,
            createdBy: req.auth.username,
            createdAt: new Date(),
          },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ ...cleanTeamCash(cash), createdTransactionId: String(transactionId) });
  } catch (err) {
    console.error('Fehler POST /team-cash/transactions:', err);
    res.status(500).json({ error: 'Die Buchung konnte nicht gespeichert werden.' });
  }
});

app.patch('/team-cash/transactions/:id', requireAccess('teamCash'), async (req, res) => {
  const { type, date, amountCents, purpose } = req.body || {};
  if (!mongoose.isValidObjectId(req.params.id) || !['expense', 'deposit'].includes(type)
      || !validCashDate(date) || typeof purpose !== 'string' || !purpose.trim() || purpose.trim().length > 200
      || !Number.isSafeInteger(amountCents) || amountCents < 1 || amountCents > 100_000_000) {
    return res.status(400).json({ error: 'Bitte Datum, Buchungsart, positiven Betrag und Verwendungszweck prüfen.' });
  }
  try {
    const now = new Date();
    // Check the original creation time atomically with the write. Never restart the window.
    const cash = await TeamCash.findOneAndUpdate(
      { key: 'team-cash', transactions: { $elemMatch: {
        _id: req.params.id, deletedAt: null,
        createdAt: { $gt: new Date(now.getTime() - 15 * 60 * 1000), $lte: now },
      } } },
      { $set: {
        'transactions.$.type': type,
        'transactions.$.date': date,
        'transactions.$.amountCents': amountCents,
        'transactions.$.purpose': purpose.trim(),
        'transactions.$.lastEditedAt': now,
        'transactions.$.lastEditedBy': req.auth.username,
      } },
      { new: true, runValidators: true }
    );
    if (!cash) return res.status(409).json({ error: 'Bearbeiten nicht mehr möglich: Die 15 Minuten sind abgelaufen oder die Buchung wurde gelöscht.' });
    res.json(cleanTeamCash(cash));
  } catch (err) {
    console.error('Fehler PATCH /team-cash/transactions:', err);
    res.status(500).json({ error: 'Die Buchung konnte nicht geändert werden.' });
  }
});

app.get('/team-cash/deleted', requireCashPermission('canViewDeleted'), async (_req, res) => {
  try {
    const cash = await TeamCash.findOne({ key: 'team-cash' }).lean();
    res.json((cash?.transactions || []).filter(transaction => transaction.deletedAt)
      .sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt)));
  } catch (err) {
    console.error('Fehler GET /team-cash/deleted:', err);
    res.status(500).json({ error: 'Gelöschte Buchungen konnten nicht geladen werden.' });
  }
});

app.delete('/team-cash/transactions/:id', requireCashPermission('canDelete'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Ungültige Buchung.' });
  }
  try {
    const cash = await TeamCash.findOneAndUpdate(
      { key: 'team-cash', transactions: { $elemMatch: { _id: req.params.id, deletedAt: null } } },
      { $set: {
        'transactions.$.deletedAt': new Date(),
        'transactions.$.deletedBy': req.auth.username,
      } },
      { new: true, runValidators: true }
    );
    if (!cash) {
      return res.status(404).json({ error: 'Die Buchung wurde nicht gefunden oder bereits gelöscht.' });
    }
    res.json(cleanTeamCash(cash));
  } catch (err) {
    console.error('Fehler DELETE /team-cash/transactions:', err);
    res.status(500).json({ error: 'Die Buchung konnte nicht gelöscht werden.' });
  }
});

// === 6) Fallback-Route ===
app.use((req, res) => {
  res.status(404).send('Nicht gefunden');
});

// === 7) Server starten ===
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server läuft unter http://localhost:${PORT} (oder Port ${PORT})`);
});
