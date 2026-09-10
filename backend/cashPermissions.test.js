const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { ACCESS_KEYS } = require('./accessUtils');
const server = readFileSync(require.resolve('./server'), 'utf8');

test('Kassen-Middleware verlangt explizite Rechte, nicht nur die allgemeine Adminrolle', () => {
  const context = { sessions: new Map() };
  vm.createContext(context);
  vm.runInContext(server.slice(server.indexOf('const pruneSessions ='), server.indexOf('const requireMainAdmin =')), context);
  vm.runInContext(server.slice(server.indexOf('const requireCashPermission ='), server.indexOf('const safeUser =')), context);
  for (const [session, permission, expected] of [
    [null, 'canDelete', 401],
    [{ isAdmin: false, cashPermissions: {} }, 'canDelete', 403],
    [{ isAdmin: false, cashPermissions: { canDelete: true } }, 'canDelete', 200],
    [{ isAdmin: true, cashPermissions: { canDelete: true } }, 'canViewDeleted', 403],
    [{ cashPermissions: { canDelete: true, canViewDeleted: true } }, 'canViewDeleted', 200],
  ]) {
    context.sessions.clear();
    if (session) context.sessions.set('test', { ...session, expiresAt: Date.now() + 60000 });
    context.req = { get: () => 'Bearer test' };
    context.res = { status(code) { this.code = code; return this; }, json() {} };
    context.permission = permission;
    vm.runInContext('requireCashPermission(permission)(req, res, () => { res.code = 200; })', context);
    assert.equal(context.res.code, expected);
  }
});

test('nur Matthias vergibt Kassenrechte; Änderungen widerrufen vorhandene Sitzungen', async () => {
  let handler;
  let saved = false;
  let invalidated = false;
  const user = { name: 'Kassentrainer', cashPermissions: { canDelete: false }, async save() { saved = true; } };
  const context = {
    app: { patch(path, middleware, fn) { handler = fn; } }, requireAdmin: 'admin',
    mongoose: { isValidObjectId: () => true }, ACCESS_KEYS, ADMIN_USERNAME: 'Matthias',
    User: { findById: async () => user },
    invalidateSessionsForUsername: () => { invalidated = true; }, safeUser: user => user,
    console,
  };
  vm.runInNewContext(server.slice(server.indexOf("app.patch('/admin/users/:id/access'"), server.indexOf("app.patch('/admin/users/:id/password'")), context);
  const res = { status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
  const req = { params: { id: 'test' }, auth: { username: 'AndererAdmin' }, body: { cashPermissions: { canDelete: true, canViewDeleted: true } } };
  await handler(req, res);
  assert.equal(res.code, 403);
  assert.equal(saved, false);
  req.auth.username = 'Matthias';
  await handler(req, res);
  assert.equal(saved, true);
  assert.equal(invalidated, true);
  assert.equal(user.cashPermissions.canDelete, true);
  assert.equal(user.cashPermissions.canViewDeleted, true);
  saved = false;
  req.auth.username = 'AndererAdmin';
  req.body = { isAdmin: false, permissions: { teamCash: false } };
  await handler(req, res);
  assert.equal(res.code, 403);
  assert.equal(saved, false);
});
