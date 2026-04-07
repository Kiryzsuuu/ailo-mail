require('dotenv').config();

const { connectMongo } = require('../src/lib/db');
const User = require('../src/models/User');
const Letter = require('../src/models/Letter');

function nowIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

async function pickCreator() {
  const preferredEmail = String(process.env.SAMPLE_LETTER_CREATOR_EMAIL || '').trim().toLowerCase();
  if (preferredEmail) {
    const u = await User.findOne({ email: preferredEmail });
    if (!u) throw new Error(`User dengan email ${preferredEmail} tidak ditemukan. Buat user itu dulu atau kosongkan SAMPLE_LETTER_CREATOR_EMAIL.`);
    return u;
  }

  // Fallback: use superadmin if seeded
  const superEmail = String(process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
  if (superEmail) {
    const u = await User.findOne({ email: superEmail });
    if (u) return u;
  }

  // Final fallback: first user in DB
  const any = await User.findOne({}).sort({ createdAt: 1 });
  if (!any) {
    throw new Error('Tidak ada user di database. Buat user dulu (mis. seed superadmin), lalu jalankan script ini lagi.');
  }
  return any;
}

async function main() {
  await connectMongo();

  const creator = await pickCreator();

  const submittedAt = new Date();
  const y = String(submittedAt.getFullYear());

  const letter = await Letter.create({
    createdBy: creator._id,
    status: 'SUBMITTED',
    kind: 'HTML',

    template: 'SURAT_TUGAS',

    place: 'Bandung',
    date: nowIsoDate(),

    number: `TEST/SDM4/AI-Center/${y}/${String(submittedAt.getTime()).slice(-4)}`,
    attachment: '-',
    subject: 'Surat Tugas (Contoh untuk Test Tanda Tangan)',

    body: [
      'Pada hari ini, saya yang bertanda tangan di bawah ini memberikan surat tugas sebagai contoh untuk pengujian fitur “Beri Tanda Tangan”.',
      '',
      'Silakan lanjutkan proses persetujuan/tanda tangan menggunakan akun role SUPREME/SUPERADMIN.',
    ].join('\n'),

    signatoryName: 'Prof. Ir. Agus Pratondo, S.T., M.T., Ph.D.',
    signatoryTitle: 'Ketua CoE Artificial Intelligence for Learning and Optimization (AILO)',
    signatoryNip: '09770043',

    tableRowsRaw: [
      'Agnes Gabriela Putri Winata|103062300117',
      'Muhammad Raia Pratama Putra Wibowo|103062300043',
      'David Chandra|103062330056',
    ].join('\n'),

    detailsRaw: [
      'Tanggal: 28 – 30 Oktober 2025',
      'Tempat: Jakarta International Expo – Kemayoran',
      'Catatan: Ini hanya contoh seed untuk testing tanda tangan.',
    ].join('\n'),

    submittedAt,
    requiredSupremeSignatures: 1,
    requestedSignersSetAt: submittedAt,
  });

  // eslint-disable-next-line no-console
  console.log('[ok] Surat contoh dibuat');
  // eslint-disable-next-line no-console
  console.log('  id           :', String(letter._id));
  // eslint-disable-next-line no-console
  console.log('  status       :', letter.status);
  // eslint-disable-next-line no-console
  console.log('  dibuat oleh  :', `${creator.email} (${creator.role})`);
  // eslint-disable-next-line no-console
  console.log('  buka preview :', `/letters/${String(letter._id)}/preview`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
