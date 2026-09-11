const { randomBytes, scrypt, createCipheriv, createDecipheriv } = require('crypto');
const { promisify } = require('util');
const { KEYS, labels, makeBackup, validateBackup, digest } = require('./backupUtils');
const derive = promisify(scrypt);
const FULL_KEYS = [...KEYS, 'users', 'recovery', 'passwordResets', 'loginEvents'];
const FULL_LABELS = { ...labels, users: 'Benutzerkonten und Rechte', recovery: 'Authenticator und Wiederherstellung', passwordResets: 'Passwortanfragen', loginEvents: 'Anmeldeverlauf' };
const FORMAT = 'fussball-app-encrypted-backup';
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
async function keyFor(password, salt) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) fail('Das Sicherungspasswort muss 12 bis 256 Zeichen enthalten.');
  return derive(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}
async function seal(data, password, auth, version, recoveryKey) {
  const salt = randomBytes(16), iv = randomBytes(12);
  const key = await keyFor(password, salt);
  const payload = JSON.stringify({ data, appVersion: version, exportedAt: new Date().toISOString(), exportedBy: auth.username, recoveryKeyFingerprint: digest(recoveryKey.toString('hex')) });
  if (Buffer.byteLength(payload) > 8 * 1024 * 1024) fail('Die vollständige Sicherung überschreitet die unterstützte Größe von 8 MB Nutzdaten.');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  key.fill(0);
  return { format: FORMAT, schemaVersion: 1, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
}
async function unseal(backup, password, recoveryKey) {
  if (!backup || backup.format !== FORMAT || backup.schemaVersion !== 1 || Buffer.byteLength(JSON.stringify(backup)) > 12 * 1024 * 1024) fail('Keine unterstützte vollständige Sicherung.');
  const bytes = (field, length) => {
    if (typeof backup[field] !== 'string') fail('Beschädigte Sicherung.');
    const value = Buffer.from(backup[field], 'base64');
    if (value.toString('base64') !== backup[field] || (length && value.length !== length)) fail('Beschädigte Sicherung.');
    return value;
  };
  const salt = bytes('salt', 16), iv = bytes('iv', 12), tag = bytes('tag', 16), ciphertext = bytes('ciphertext');
  const key = await keyFor(password, salt);
  let payload;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    payload = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'));
  } catch { fail('Das Sicherungspasswort ist falsch oder die Datei wurde beschädigt.'); }
  finally { key.fill(0); }
  if (payload.recoveryKeyFingerprint !== digest(recoveryKey.toString('hex'))) fail('Diese Sicherung gehört zu einer anderen Serverkonfiguration. Für die Sicherheitsdaten wird die ursprüngliche Serverkonfiguration benötigt.');
  return payload.data;
}
function validateFull(raw, models) {
  // Older complete backups predate tasks. Preserve current tasks instead of deleting them.
  const keys = FULL_KEYS.filter(key => key !== 'tasks' || Object.hasOwn(raw || {}, 'tasks'));
  if (!raw || Array.isArray(raw) || Object.keys(raw).length !== keys.length || keys.some(key => !Array.isArray(raw[key]))) fail('Die vollständige Sicherung enthält nicht alle erforderlichen Datenbereiche.');
  const businessKeys = KEYS.filter(key => keys.includes(key));
  const business = Object.fromEntries(businessKeys.map(key => [key, raw[key]]));
  const auth = { username: 'Matthias', isAdmin: true, cashPermissions: { canViewDeleted: true } };
  const data = validateBackup(makeBackup(business, auth, '7.8.0'), businessKeys, auth, models);
  const inspect = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (key.startsWith('$') || ['__proto__', 'constructor', 'prototype'].includes(key)) fail('Unzulässige Datenfelder.');
      inspect(item);
    }
  };
  for (const key of FULL_KEYS.filter(key => !KEYS.includes(key))) {
    if (raw[key].length > 20000) fail('Zu viele Datensätze.');
    const ids = new Set(), unique = new Set();
    data[key] = raw[key].map(row => {
      inspect(row);
      if (!row || !/^[a-f\d]{24}$/i.test(row._id || '') || ids.has(String(row._id).toLowerCase())) fail('Ungültige oder doppelte Datensatz-ID.');
      ids.add(String(row._id).toLowerCase());
      const uniqueValue = key === 'users' ? row.name : key === 'recovery' ? row.key : key === 'passwordResets' && row.status === 'open' ? row.userId : null;
      if (uniqueValue != null) {
        if (unique.has(uniqueValue)) fail('Doppelte Konten oder Sicherheitseinträge.');
        unique.add(uniqueValue);
      }
      try {
        const doc = new models[key](row, undefined, { strict: 'throw' });
        if (doc.validateSync()) fail('Ungültiger Datensatz.');
        return doc.toObject();
      } catch { fail(`Ungültiger Datensatz in ${FULL_LABELS[key]}.`); }
    });
  }
  if (!data.users.some(user => user.name === 'Matthias' && user.password)) fail('Das geschützte Hauptadminkonto Matthias fehlt.');
  const recoveryUsers = new Set();
  for (const row of data.recovery) if (row.userId !== undefined) {
    if (recoveryUsers.has(row.userId)) fail('Doppelte Authenticator-Zuordnung.');
    recoveryUsers.add(row.userId);
  }
  return data;
}
module.exports = { FULL_KEYS, FULL_LABELS, FORMAT, seal, unseal, validateFull };
