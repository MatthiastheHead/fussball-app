const test = require('node:test');
const assert = require('node:assert/strict');

const { hashPassword, isPasswordHash, verifyPassword } = require('./authUtils');

test('prüft bestehende Klartext-Passwörter kompatibel', async () => {
  assert.equal(await verifyPassword('richtig', 'richtig'), true);
  assert.equal(await verifyPassword('falsch', 'richtig'), false);
});

test('erzeugt und prüft ein Scrypt-Passwort', async () => {
  const hash = await hashPassword('Mein sicheres Passwort');
  assert.equal(isPasswordHash(hash), true);
  assert.equal(await verifyPassword('Mein sicheres Passwort', hash), true);
  assert.equal(await verifyPassword('Falsches Passwort', hash), false);
});
