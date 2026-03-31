const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = 12;

async function hashPassword(plain) {
  const password = String(plain || '');
  if (password.length < 8) throw new Error('Password minimal 8 karakter.');
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  if (!plain || !hash) return false;
  return bcrypt.compare(String(plain), String(hash));
}

module.exports = { hashPassword, verifyPassword };
