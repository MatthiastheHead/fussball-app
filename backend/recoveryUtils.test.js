const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createOtpAuthUrl,
  decryptSecret,
  deriveRecoveryKey,
  encodeBase32,
  encryptSecret,
  generateRecoveryCodes,
  generateTotp,
  hashRecoveryCode,
  normalizeRecoveryCode,
  verifyTotp,
} = require('./recoveryUtils');

test('erzeugt den offiziellen RFC-6238-Testwert', () => {
  const secret = encodeBase32(Buffer.from('12345678901234567890'));
  assert.equal(generateTotp(secret, { timeMs: 59_000, digits: 8 }), '94287082');
});

test('akzeptiert einen TOTP-Code nur im erlaubten Zeitfenster', () => {
  const secret = encodeBase32(Buffer.from('12345678901234567890'));
  const timeMs = 1_700_000_000_000;
  const token = generateTotp(secret, { timeMs });
  assert.equal(verifyTotp(secret, token, { timeMs, window: 1 }), Math.floor(timeMs / 30_000));
  assert.equal(verifyTotp(secret, 'abcdef', { timeMs }), null);
  assert.equal(verifyTotp(secret, token, { timeMs: timeMs + 90_000, window: 1 }), null);
});

test('verschlüsselt den Authenticator-Schlüssel mit Integritätsschutz', () => {
  const key = deriveRecoveryKey('nur-fuer-den-test');
  const encrypted = encryptSecret('MEINSECRET', key);
  assert.notEqual(encrypted, 'MEINSECRET');
  assert.equal(decryptSecret(encrypted, key), 'MEINSECRET');
  assert.throws(() => decryptSecret(`${encrypted}x`, key));
});

test('erzeugt acht einmalige und normalisierbare Notfallcodes', () => {
  const key = deriveRecoveryKey('weiterer-test');
  const codes = generateRecoveryCodes();
  assert.equal(codes.length, 8);
  assert.equal(new Set(codes).size, 8);
  assert.match(codes[0], /^[A-Z2-7]{4}(?:-[A-Z2-7]{4}){2}$/);
  assert.equal(normalizeRecoveryCode(codes[0].toLowerCase()), codes[0].replaceAll('-', ''));
  assert.equal(hashRecoveryCode(codes[0], key), hashRecoveryCode(codes[0].toLowerCase(), key));
});

test('erstellt für beliebige Benutzer einen kompatiblen otpauth-Link', () => {
  const url = createOtpAuthUrl('ABCDEF234567', 'Sabine Beispiel', 'Fussball-App');
  assert.match(url, /^otpauth:\/\/totp\/Fussball-App%3ASabine%20Beispiel\?/);
  assert.match(url, /secret=ABCDEF234567/);
  assert.match(url, /period=30/);
});
