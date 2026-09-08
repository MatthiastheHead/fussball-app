const test = require('node:test');
const assert = require('node:assert/strict');
const { permissionsFor, isAdminUser, mayAccess } = require('./accessUtils');

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
