const path = require('path');
const express = require('express');
const multer = require('multer');
const { getKopConfig } = require('./lib/kopConfig');
const { renderLetterHtml, normalizeLetterInput } = require('./lib/renderLetter');
const { generatePdfBuffer } = require('./lib/pdf');
const { randomUUID } = require('crypto');

const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB each
  },
});

// In-memory preview store (simple local usage)
const previewStore = new Map();
const PREVIEW_TTL_MS = 15 * 60 * 1000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/logo.png', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'logo.png'));
});

app.get('/hero-portrait.png', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      '..',
      'Gemini_Generated_Image_in3s0kin3s0kin3s.png'
    )
  );
});

app.get('/hero-tile-1.jpg', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'assets', 'hero-tile-1.jpg'));
});

app.get('/hero-tile-2.jpg', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'assets', 'hero-tile-2.jpg'));
});

app.get('/hero-tile-3.jpg', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'assets', 'hero-tile-3.jpg'));
});

app.get('/', async (req, res, next) => {
  try {
    res.render('landing');
  } catch (error) {
    next(error);
  }
});

app.get('/mailer', async (req, res, next) => {
  try {
    const kop = await getKopConfig();

    res.render('index', {
      kop,
      defaults: {
        font: 'calibri',
        fontCustom: '',
        place: 'Bandung',
        date: new Date().toISOString().slice(0, 10),
        number: '',
        attachment: '-',
        subject: '',
        recipient: '',
        recipientAddress: '',
        body: '',
        closing: 'Hormat kami,',
        signatoryName: '',
        signatoryTitle: '',
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post(
  '/preview',
  upload.fields([
    { name: 'signatureImage', maxCount: 1 },
    { name: 'qrImage', maxCount: 1 },
  ]),
  async (req, res, next) => {
  try {
    cleanupPreviewStore();
    const kop = await getKopConfig();
    const letter = normalizeLetterInput(req.body);
    const signatureDataUrl = fileToDataUrl(req.files?.signatureImage?.[0]);
    const qrDataUrl = fileToDataUrl(req.files?.qrImage?.[0]);

    const payload = {
      kop,
      letter: {
        ...letter,
        signatureDataUrl,
        qrDataUrl,
      },
    };

    const html = await renderLetterHtml({ kop, letter, withChrome: false });

    const id = randomUUID();
    previewStore.set(id, { payload, createdAt: Date.now() });

    res.render('preview', { kop, letter: payload.letter, html, previewId: id });
  } catch (error) {
    next(error);
  }
  }
);

app.get('/pdf/:id', async (req, res, next) => {
  try {
    const entry = previewStore.get(req.params.id);
    if (!entry) return res.status(404).send('Preview tidak ditemukan. Silakan buat ulang.');

    // one-time use (avoid memory growth)
    previewStore.delete(req.params.id);

    const { kop, letter } = entry.payload;
    const html = await renderLetterHtml({ kop, letter, withChrome: false });
    const pdfBuffer = await generatePdfBuffer(html);

    const safeNumber = (letter.number || 'surat').replace(/[^a-z0-9-_]+/gi, '-');
    const filename = `surat-${safeNumber}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  res.status(404).send('Not Found');
});

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error(error);
  res.status(500).send(
    process.env.NODE_ENV === 'production'
      ? 'Terjadi error di server.'
      : `<pre>${escapeHtml(String(error.stack || error))}</pre>`
  );
});

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fileToDataUrl(file) {
  if (!file || !file.buffer) return '';
  const mime = String(file.mimetype || '').toLowerCase();
  if (!mime.startsWith('image/')) return '';
  const base64 = file.buffer.toString('base64');
  return `data:${mime};base64,${base64}`;
}

function cleanupPreviewStore() {
  const now = Date.now();
  for (const [id, entry] of previewStore.entries()) {
    if (!entry?.createdAt || now - entry.createdAt > PREVIEW_TTL_MS) {
      previewStore.delete(id);
    }
  }
}

module.exports = { app };
