const test = require('node:test');
const assert = require('node:assert/strict');
const { permissionsFor, isAdminUser, mayAccess, cashPermissionsFor } = require('./accessUtils');

test('bestehende Benutzer behalten standardmäßig alle bisherigen Zugriffe', () => {
  assert.deepEqual(permissionsFor({ name: 'Altbestand' }), {
    training: true, checklists: true, teamGenerator: true, teamCash: true,
  });
});

test('entzogene Rechte werden ausgewertet und Admins dürfen alle Bereiche öffnen', () => {
  const user = { name: 'User', permissions: { teamCash: false } };
  assert.equal(mayAccess(user, 'teamCash'), false);
  assert.equal(mayAccess({ ...user, isAdmin: true }, 'teamCash'), true);
});

test('Matthias ist unabhängig vom gespeicherten Flag Hauptadmin', () => {
  assert.equal(isAdminUser({ name: 'Matthias', isAdmin: false }), true);
});

test('Kassenrechte unterscheiden Benutzer, Kassenadmin, Admin und Hauptadmin', () => {
  for (const [user, canDelete, canViewDeleted] of [
    [{ name: 'Trainer' }, false, false],
    [{ name: 'Trainer', cashPermissions: { canDelete: true } }, true, false],
    [{ name: 'Trainer', cashPermissions: { canDelete: true, canViewDeleted: true } }, true, true],
    [{ name: 'Trainer', cashPermissions: { canViewDeleted: true } }, false, false],
    [{ name: 'Trainer', permissions: { teamCash: false }, cashPermissions: { canDelete: true, canViewDeleted: true } }, false, false],
    [{ name: 'Admin', isAdmin: true }, true, false],
    [{ name: 'Admin', isAdmin: true, cashPermissions: { canViewDeleted: true } }, true, true],
    [{ name: 'Matthias', isAdmin: false, permissions: { teamCash: false } }, true, true],
  ]) assert.deepEqual(cashPermissionsFor(user), { canDelete, canViewDeleted });
});
