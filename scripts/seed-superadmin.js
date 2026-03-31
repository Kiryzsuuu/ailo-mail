require('dotenv').config();

const { connectMongo } = require('../src/lib/db');
const User = require('../src/models/User');
const { hashPassword } = require('../src/lib/security');

async function main() {
  const email = String(process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.SUPERADMIN_PASSWORD || '');
  const name = String(process.env.SUPERADMIN_NAME || 'Super Admin');

  if (!email || !password) {
    throw new Error('SUPERADMIN_EMAIL dan SUPERADMIN_PASSWORD wajib di-set di .env sebelum seed.');
  }

  await connectMongo();

  const existing = await User.findOne({ email });
  if (existing) {
    // eslint-disable-next-line no-console
    console.log('Superadmin sudah ada:', existing.email);
    process.exit(0);
  }

  const passwordHash = await hashPassword(password);
  await User.create({ email, name, passwordHash, role: 'SUPERADMIN' });

  // eslint-disable-next-line no-console
  console.log('Superadmin dibuat:', email);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
