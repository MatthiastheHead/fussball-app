const {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_STEP_SECONDS = 30;

function encodeBase32(value) {
  const buffer = Buffer.from(value);
  let bits = 0;
  let bitCount = 0;
  let encoded = '';

  for (const byte of buffer) {
    bits = (bits << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5) {
      encoded += BASE32_ALPHABET[(bits >>> (bitCount - 5)) & 31];
      bitCount -= 5;
    }
  }

  if (bitCount > 0) encoded += BASE32_ALPHABET[(bits << (5 - bitCount)) & 31];
  return encoded;
}

function decodeBase32(value) {
  const normalized = String(value || '')
    .toUpperCase()
    .replace(/[\s=-]/g, '');
  let bits = 0;
  let bitCount = 0;
  const bytes = [];

  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) throw new Error('Ungültiger Base32-Schlüssel.');
    bits = (bits << 5) | index;
    bitCount += 5;
    if (bitCount >= 8) {
      bytes.push((bits >>> (bitCount - 8)) & 255);
      bitCount -= 8;
    }
  }

  return Buffer.from(bytes);
}

function generateTotp(secret, options = {}) {
  const digits = options.digits || 6;
  const stepSeconds = options.stepSeconds || TOTP_STEP_SECONDS;
  const timeMs = options.timeMs ?? Date.now();
  const counter = options.counter ?? Math.floor(timeMs / 1000 / stepSeconds);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

function safeStringEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyTotp(secret, token, options = {}) {
  const normalizedToken = String(token || '').trim();
  const digits = options.digits || 6;
  if (!new RegExp(`^\\d{${digits}}$`).test(normalizedToken)) return null;

  const stepSeconds = options.stepSeconds || TOTP_STEP_SECONDS;
  const timeMs = options.timeMs ?? Date.now();
  const currentCounter = Math.floor(timeMs / 1000 / stepSeconds);
  const window = Number.isInteger(options.window) ? Math.max(0, options.window) : 1;
  let matchedCounter = null;

  for (let offset = -window; offset <= window; offset += 1) {
    const counter = currentCounter + offset;
    if (counter < 0) continue;
    const expected = generateTotp(secret, { digits, stepSeconds, counter });
    if (safeStringEqual(normalizedToken, expected)) matchedCounter = counter;
  }

  return matchedCounter;
}

function generateAuthenticatorSecret() {
  return encodeBase32(randomBytes(20));
}

function createOtpAuthUrl(secret, account = 'Matthias', issuer = 'Fussball-App') {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function deriveRecoveryKey(material) {
  if (!material) throw new Error('Kein Schlüsselmaterial für die Wiederherstellung vorhanden.');
  return createHash('sha256')
    .update('fussball-app-admin-recovery-v1\0')
    .update(String(material))
    .digest();
}

function encryptSecret(secret, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(secret), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

function decryptSecret(value, key) {
  const [version, ivValue, tagValue, encryptedValue] = String(value || '').split('.');
  if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) {
    throw new Error('Der gespeicherte Authenticator-Schlüssel ist ungültig.');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function normalizeRecoveryCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
}

function hashRecoveryCode(code, key) {
  return createHmac('sha256', key).update(normalizeRecoveryCode(code)).digest('hex');
}

function generateRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => {
    const compact = encodeBase32(randomBytes(8)).slice(0, 12);
    return compact.match(/.{1,4}/g).join('-');
  });
}

module.exports = {
  createOtpAuthUrl,
  decodeBase32,
  decryptSecret,
  deriveRecoveryKey,
  encodeBase32,
  encryptSecret,
  generateAuthenticatorSecret,
  generateRecoveryCodes,
  generateTotp,
  hashRecoveryCode,
  normalizeRecoveryCode,
  safeStringEqual,
  verifyTotp,
};
