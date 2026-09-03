const { promisify } = require('util');
const { randomBytes, scrypt, timingSafeEqual } = require('crypto');

const scryptAsync = promisify(scrypt);
const PASSWORD_PREFIX = 'scrypt';

const isPasswordHash = value =>
  typeof value === 'string' && value.startsWith(`${PASSWORD_PREFIX}$`);

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scryptAsync(String(password), salt, 64);
  return `${PASSWORD_PREFIX}$${salt}$${Buffer.from(derived).toString('hex')}`;
}

const safeStringEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

async function verifyPassword(password, storedPassword) {
  if (!isPasswordHash(storedPassword)) {
    return safeStringEqual(password, storedPassword || '');
  }

  const [, salt, storedHex] = storedPassword.split('$');
  if (!salt || !storedHex || !/^[a-f0-9]+$/i.test(storedHex)) return false;
  const storedBuffer = Buffer.from(storedHex, 'hex');
  const derived = Buffer.from(await scryptAsync(String(password), salt, storedBuffer.length));
  return derived.length === storedBuffer.length && timingSafeEqual(derived, storedBuffer);
}

module.exports = { hashPassword, isPasswordHash, verifyPassword };
