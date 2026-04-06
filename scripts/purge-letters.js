require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { connectMongo } = require('../src/lib/db');
const Letter = require('../src/models/Letter');

async function main() {
  await connectMongo();

  const letters = await Letter.find({}).select('_id kind upload').lean();
  const uploadPaths = letters
    .map((l) => (String(l.kind || '').toUpperCase() === 'UPLOAD' ? String(l.upload?.storagePath || '').trim() : ''))
    .filter(Boolean);

  const del = await Letter.deleteMany({});

  let removedFiles = 0;
  for (const p of uploadPaths) {
    try {
      await fs.promises.unlink(p);
      removedFiles += 1;
    } catch (e) {
      // ignore missing
    }
  }

  const uploadsRoot = path.join(__dirname, '..', 'uploads', 'letters');
  try {
    const entries = await fs.promises.readdir(uploadsRoot);
    for (const name of entries) {
      const full = path.join(uploadsRoot, name);
      try {
        const st = await fs.promises.stat(full);
        if (st.isFile()) {
          await fs.promises.unlink(full);
          removedFiles += 1;
        }
      } catch (e) {
        // ignore
      }
    }
  } catch (e) {
    // ignore
  }

  // eslint-disable-next-line no-console
  console.log(`[purge-letters] deleted letters: ${del.deletedCount || 0}`);
  // eslint-disable-next-line no-console
  console.log(`[purge-letters] removed upload files: ${removedFiles}`);

  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[purge-letters] FAILED', err);
  process.exit(1);
});
