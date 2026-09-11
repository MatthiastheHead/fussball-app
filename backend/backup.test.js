const test = require('node:test');
const assert = require('node:assert/strict');
const registerRoutes = require('./backupRoutes');
const { KEYS, makeBackup, validateBackup, scopeFor, prepareCashImport, digest } = require('./backupUtils');
const { backupPermissionsFor } = require('./accessUtils');
const realModels = {
  tasks: require('./models/Task'),
  players: require('./models/Player'), trainings: require('./models/Training'),
  checklists: require('./models/Checklist'), settings: require('./models/AppSettings'), teamCash: require('./models/TeamCash'),
};
Object.assign(realModels, { users: require('./models/User'), recovery: require('./models/AdminRecovery'), passwordResets: require('./models/PasswordResetRequest'), loginEvents: require('./models/LoginEvent') });
const { FULL_KEYS, seal, unseal } = require('./fullBackupUtils');
const { encryptSecret, decryptSecret, hashRecoveryCode } = require('./recoveryUtils');
const recoveryKey = Buffer.alloc(32, 7);
const password = 'Sicherung-Test-2026';
const clone = value => JSON.parse(JSON.stringify(value));
const id = n => n.toString(16).padStart(24, '0');
const admin = { username: 'Matthias', token: 'session-a', isAdmin: true, cashPermissions: { canDelete: true, canViewDeleted: true } };
const fixture = () => clone({
  tasks: [new realModels.tasks({ _id: id(30), title: 'Leibchen waschen', assignedTo: id(20), assignedName: 'Matthias', dueDate: '2026-09-15', createdBy: 'Matthias', updatedBy: 'Matthias' })],
  players: [new realModels.players({ _id: id(1), name: 'Mia', note: 'Hinweis', inactive: false })],
  trainings: [new realModels.trainings({ _id: id(2), date: 'Do, 10.09.2026', participants: { Mia: '✅' }, ratings: { Mia: 3 }, history: [{ by: 'Matthias', action: 'Erstellt' }] })],
  checklists: [new realModels.checklists({ _id: id(3), title: 'Beitrag', items: { Mia: true }, remarks: { Mia: 'Bezahlt' } })],
  settings: [new realModels.settings({ _id: id(4), key: 'app', defaultTrainingLocation: 'Turnhalle' })],
  teamCash: [new realModels.teamCash({ _id: id(5), key: 'team-cash', openingBalanceCents: 10000, transactions: [
    { _id: id(6), date: '2026-09-10', type: 'deposit', amountCents: 500, purpose: 'Beitrag', person: 'Matthias', createdBy: 'Matthias' },
    { _id: id(7), date: '2026-09-09', type: 'expense', amountCents: 200, purpose: 'Fehlbuchung', person: 'Matthias', createdBy: 'Matthias', deletedAt: new Date(), deletedBy: 'Matthias' },
  ] })],
});

test('Alte Komplettsicherungen lassen heutige Aufgaben erhalten', async () => {
  const { state, invoke } = harness();
  const originalTasks = clone(state.db.tasks);
  const old = clone(state.db);
  delete old.tasks;
  const backup = await seal(old, password, admin, '7.7.0', recoveryKey);
  const preview = await invoke('/backup/full/preview', { backup, password });
  assert.equal(preview.code, 200);
  assert.equal(preview.body.preservedTasks, true);
  assert.equal((await invoke('/backup/import', { token: preview.body.token, confirm: true })).code, 200);
  assert.deepEqual(state.db.tasks, originalTasks);
});

test('Aufgaben in Teilsicherungen beachten die Bereichsrechte', () => {
  const auth = { username: 'Trainer', permissions: { tasks: false } };
  assert.equal(scopeFor(auth).includes('tasks'), false);
  assert.throws(() => validateBackup(makeBackup(fixture(), admin, '7.8.0'), ['tasks'], auth, realModels), /Importberechtigung/);
});

function harness() {
  const state = { db: { ...fixture(), users: [new realModels.users({ _id: id(20), name: 'Matthias', password: 'stored-hash', isAdmin: true })], recovery: [], passwordResets: [], loginEvents: [] }, failInsert: null, invalidated: false };
  state.db = clone(state.db);
  const routes = {};
  const models = {};
  for (const key of FULL_KEYS) {
    models[key] = function (row, fields, options) { return new realModels[key](row, fields, options); };
    models[key].find = () => ({ session: session => ({ lean: async () => clone(session.working[key]) }) });
    models[key].deleteMany = async (_, { session }) => { session.working[key] = []; };
    models[key].insertMany = async (rows, { session }) => {
      if (state.failInsert === key) throw new Error('Simulierter Schreibfehler');
      session.working[key].push(...clone(rows));
    };
  }
  const mongoose = { startSession: async () => ({
    async withTransaction(callback) { this.working = clone(state.db); await callback(); state.db = this.working; },
    async endSession() {},
  }) };
  const app = {};
  for (const method of ['get', 'post']) app[method] = (path, access, handler) => { routes[path] = { access, handler }; };
  registerRoutes({ app, mongoose, models, recoveryKey, invalidateAllSessions: () => { state.invalidated = true; }, version: '7.7.0', requireSession: (req, res, next) => req.auth ? next() : res.status(401).json({ error: 'Login fehlt' }) });
  const invoke = (path, body = {}, auth = admin) => new Promise((resolve, reject) => {
    const req = { body, auth };
    const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.body = data; resolve(this); } };
    routes[path].access(req, res, () => { Promise.resolve(routes[path].handler(req, res)).catch(reject); });
  });
  return { state, invoke };
}

test('Sicherungsrechte sind für Admins vorhanden und für Benutzer separat freizugeben', () => {
  assert.deepEqual(backupPermissionsFor({ name: 'Matthias' }), { canExport: true, canImport: true, canFullBackup: true });
  assert.deepEqual(backupPermissionsFor({ name: 'Trainer' }), { canExport: false, canImport: false, canFullBackup: false });
  assert.deepEqual(backupPermissionsFor({ name: 'Trainer', backupPermissions: { canExport: true } }), { canExport: true, canImport: false, canFullBackup: false });
});

test('Export und validierter Import erhalten sämtliche Mannschaftsdaten und IDs', async () => {
  const { state, invoke } = harness();
  const exported = await invoke('/backup/export', { scopes: KEYS });
  assert.equal(exported.code, 200);
  assert.deepEqual(exported.body.data, Object.fromEntries(KEYS.map(key => [key, state.db[key]])));
  assert.equal(exported.body.exportedBy, 'Matthias');
  const original = clone(state.db);
  state.db.players[0].note = 'Spätere Änderung';
  const preview = await invoke('/backup/preview', { backup: exported.body, scopes: KEYS });
  assert.equal(preview.code, 200);
  assert.equal(state.db.players[0].note, 'Spätere Änderung');
  assert.equal(preview.body.recoveryBackup.data.players[0].note, 'Spätere Änderung');
  const result = await invoke('/backup/import', { token: preview.body.token, confirm: true });
  assert.equal(result.code, 200);
  assert.equal(result.body.importedBy, 'Matthias');
  assert.deepEqual(state.db, original);
  assert.equal((await invoke('/backup/import', { token: preview.body.token, confirm: true })).code, 400);
});

test('Sicherung respektiert Modulrechte und verbirgt gelöschte Buchungen', async () => {
  const { invoke } = harness();
  const auth = { username: 'Trainer', token: 'trainer', backupPermissions: { canExport: true }, permissions: { training: false, checklists: false } };
  assert.equal((await invoke('/backup/export', { scopes: ['trainings'] }, auth)).code, 400);
  const backup = await invoke('/backup/export', { scopes: ['teamCash'] }, auth);
  assert.equal(backup.body.data.teamCash[0].transactions.length, 1);
  assert.equal(backup.body.includesDeletedCash, false);
  assert.equal((await invoke('/backup/preview', {}, auth)).code, 403);
  assert.equal((await invoke('/backup/export', {}, null)).code, 401);
});

test('beschädigte Sicherungen, doppelte IDs und unzulässige Bereiche werden abgewiesen', () => {
  const backup = makeBackup(fixture(), admin, '7.7.0');
  backup.data.players[0].note = 'Verändert';
  assert.throws(() => validateBackup(backup, ['players'], admin, realModels), /Prüfsumme/);
  backup.checksum = digest(backup.data);
  backup.data.players.push(clone(backup.data.players[0]));
  backup.checksum = digest(backup.data);
  assert.throws(() => validateBackup(backup, ['players'], admin, realModels), /doppelte/);
  const fresh = makeBackup(fixture(), admin, '7.7.0');
  assert.throws(() => validateBackup(fresh, ['users'], admin, realModels), /Importberechtigung/);
  assert.throws(() => validateBackup(fresh, ['teamCash'], { isAdmin: true, cashPermissions: {} }, realModels), /gelöschte/);
  assert.throws(() => validateBackup(fresh, ['players'], { backupPermissions: { canImport: true } }, realModels), /Importberechtigung/);
});

test('freigegebener Benutzer kann erlaubte Trainings importieren, ohne weitere Bereiche zu verändern', async () => {
  const { state, invoke } = harness();
  const auth = { username: 'Trainer', token: 'b', backupPermissions: { canImport: true }, permissions: { training: true, checklists: false, teamCash: false } };
  const backup = makeBackup({ trainings: [] }, admin, '7.7.0');
  const previousPlayers = clone(state.db.players);
  const preview = await invoke('/backup/preview', { backup, scopes: ['trainings'] }, auth);
  assert.equal(preview.code, 200);
  assert.equal((await invoke('/backup/import', { token: preview.body.token, confirm: true }, auth)).code, 200);
  assert.deepEqual(state.db.trainings, []);
  assert.deepEqual(state.db.players, previousPlayers);
});

test('Änderungen seit der Vorschau verhindern ein Überschreiben', async () => {
  const { state, invoke } = harness();
  const backup = makeBackup(fixture(), admin, '7.7.0');
  const preview = await invoke('/backup/preview', { backup, scopes: ['players'] });
  state.db.players[0].note = 'Neu seit der Vorschau';
  const result = await invoke('/backup/import', { token: preview.body.token, confirm: true });
  assert.equal(result.code, 409);
  assert.equal(state.db.players[0].note, 'Neu seit der Vorschau');
});

test('Fehler im zweiten Bereich rollen auch Änderungen des ersten Bereichs zurück', async () => {
  const { state, invoke } = harness();
  const data = fixture(); data.players[0].note = 'Importiert';
  const backup = makeBackup(data, admin, '7.7.0');
  const before = clone(state.db);
  const preview = await invoke('/backup/preview', { backup, scopes: ['players', 'trainings'] });
  state.failInsert = 'trainings';
  const result = await invoke('/backup/import', { token: preview.body.token, confirm: true });
  assert.equal(result.code, 503);
  assert.deepEqual(state.db, before);
});

test('Importvorschau gilt nur für dieselbe Sitzung und benötigt eine Bestätigung', async () => {
  const { invoke } = harness();
  const preview = await invoke('/backup/preview', { backup: makeBackup(fixture(), admin, '7.7.0'), scopes: ['players'] });
  assert.equal((await invoke('/backup/import', { token: preview.body.token, confirm: true }, { ...admin, token: 'andere-sitzung' })).code, 400);
  assert.equal((await invoke('/backup/import', { token: preview.body.token, confirm: false })).code, 400);
  assert.equal((await invoke('/backup/import', { token: preview.body.token, confirm: true })).code, 200);
});

test('Kassenimport erhält Löschprotokolle und schützt den Startbestand', () => {
  const current = fixture().teamCash;
  const incoming = clone(current);
  incoming[0].transactions = [ { ...current[0].transactions[1], deletedAt: null } ];
  const result = prepareCashImport(incoming, current, admin);
  assert.ok(result[0].transactions[0].deletedAt);
  incoming[0].openingBalanceCents = 20000;
  assert.throws(() => prepareCashImport(incoming, current, { cashPermissions: { canDelete: true } }), /startbestand/);
  assert.ok(scopeFor({ isAdmin: false, cashPermissions: { canDelete: true } }, true).includes('teamCash'));
});


test('Komplettsicherung ist verschlüsselt, authentifiziert und an die Serverkonfiguration gebunden', async () => {
  const raw = { users: [{ password: 'Geheimer-Hash' }] };
  const encrypted = await seal(raw, password, admin, '7.7.0', recoveryKey);
  assert.equal(JSON.stringify(encrypted).includes('Geheimer-Hash'), false);
  assert.deepEqual(await unseal(encrypted, password, recoveryKey), raw);
  await assert.rejects(unseal(encrypted, 'falsches-passwort', recoveryKey), /passwort/i);
  await assert.rejects(unseal(encrypted, password, Buffer.alloc(32, 8)), /Serverkonfiguration/);
  const tampered = { ...encrypted, ciphertext: Buffer.alloc(Buffer.from(encrypted.ciphertext, 'base64').length).toString('base64') };
  await assert.rejects(unseal(tampered, password, recoveryKey), /beschädigt/);
  await assert.rejects(seal(raw, 'kurz', admin, '7.7.0', recoveryKey), /12 bis/);
});

test('Vollständiger Import stellt alle zehn Bereiche wieder her und beendet Sitzungen', async () => {
  const { state, invoke } = harness();
  state.db.recovery = clone([new realModels.recovery({ _id: id(21), key: 'main', userId: id(20), username: 'Matthias', encryptedSecret: encryptSecret('JBSWY3DPEHPK3PXP', recoveryKey), recoveryCodeHashes: [hashRecoveryCode('ABCDEFGHJKLM', recoveryKey)] })]);
  state.db.loginEvents = clone([new realModels.loginEvents({ _id: id(22), username: 'Matthias' })]);
  const original = clone(state.db);
  const exported = await invoke('/backup/full/export', { password });
  assert.equal(exported.code, 200);
  state.db.users[0].password = 'changed';
  state.db.teamCash[0].transactions = [];
  const preview = await invoke('/backup/full/preview', { backup: exported.body, password });
  assert.equal(preview.code, 200);
  assert.equal(preview.body.summary.length, 10);
  assert.equal(preview.body.recoveryBackup.data, undefined);
  const result = await invoke('/backup/import', { token: preview.body.token, confirm: true });
  assert.equal(result.code, 200);
  assert.deepEqual(state.db, original);
  assert.equal(state.invalidated, true);
  assert.equal(decryptSecret(state.db.recovery[0].encryptedSecret, recoveryKey), 'JBSWY3DPEHPK3PXP');
  assert.equal(state.db.recovery[0].recoveryCodeHashes[0], hashRecoveryCode('ABCDEFGHJKLM', recoveryKey));
});

test('Andere Admins erhalten keine Kontensicherung; Hauptadmin darf beim Import nicht fehlen', async () => {
  const { state, invoke } = harness();
  for (const path of ['/backup/full/export', '/backup/full/preview']) {
    assert.equal((await invoke(path, { password }, { ...admin, username: 'Robert' })).code, 403);
    assert.equal((await invoke(path, { password }, { ...admin, username: 'Trainer', isAdmin: false, backupPermissions: { canExport: true, canImport: true } })).code, 403);
  }
  state.db.users = [];
  const encrypted = await seal(state.db, password, admin, '7.7.0', recoveryKey);
  assert.equal((await invoke('/backup/full/preview', { backup: encrypted, password })).code, 400);
});

test('Fehler beim Wiederherstellen der Konten rollt auch Mannschaftsdaten zurück', async () => {
  const { state, invoke } = harness();
  const exported = await invoke('/backup/full/export', { password });
  state.db.players[0].note = 'Aktueller Stand';
  const before = clone(state.db);
  const preview = await invoke('/backup/full/preview', { backup: exported.body, password });
  state.failInsert = 'users';
  assert.equal((await invoke('/backup/import', { token: preview.body.token, confirm: true })).code, 503);
  assert.deepEqual(state.db, before);
  assert.equal(state.invalidated, false);
});


test('Hauptadmin kann vollständige Sicherung gezielt an Benutzer delegieren', async () => {
  const { invoke } = harness();
  const rights = backupPermissionsFor({ name: 'Robert', backupPermissions: { canFullBackup: true } });
  assert.deepEqual(rights, { canExport: true, canImport: true, canFullBackup: true });
  const auth = { username: 'Robert', token: 'delegated', isAdmin: false, backupPermissions: rights };
  const exported = await invoke('/backup/full/export', { password }, auth);
  assert.equal(exported.code, 200);
  const preview = await invoke('/backup/full/preview', { backup: exported.body, password }, auth);
  assert.equal(preview.code, 200);
  assert.equal((await invoke('/backup/import', { token: preview.body.token, confirm: true }, auth)).code, 200);
});
