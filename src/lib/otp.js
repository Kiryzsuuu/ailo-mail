const crypto = require('crypto');

const OtpCode = require('../models/OtpCode');

function generateNumericOtp(length = 6) {
  const digits = '0123456789';
  let result = '';
  for (let i = 0; i < length; i += 1) {
    const idx = crypto.randomInt(0, digits.length);
    result += digits[idx];
  }
  return result;
}

async function createOtp({ userId, purpose, channel = 'email', ttlMinutes = 10 }) {
  const code = generateNumericOtp(6);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

  await OtpCode.deleteMany({
    userId,
    purpose,
    usedAt: null,
  });

  const doc = await OtpCode.create({ userId, purpose, channel, code, expiresAt });
  return doc;
}

async function verifyOtp({ userId, purpose, code }) {
  const now = new Date();
  const otp = await OtpCode.findOne({
    userId,
    purpose,
    code: String(code || ''),
    usedAt: null,
    expiresAt: { $gt: now },
  });

  if (!otp) return { ok: false };

  otp.usedAt = now;
  await otp.save();
  return { ok: true };
}

module.exports = { generateNumericOtp, createOtp, verifyOtp };
