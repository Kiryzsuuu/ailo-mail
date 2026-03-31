const path = require('path');
const express = require('express');
const session = require('express-session');
const ConnectMongo = require('connect-mongo');
const { getKopConfig } = require('./lib/kopConfig');
const { renderLetterHtml, normalizeLetterInput } = require('./lib/renderLetter');
const { generatePdfBuffer } = require('./lib/pdf');
const User = require('./models/User');
const Letter = require('./models/Letter');
const { hashPassword, verifyPassword } = require('./lib/security');
const OtpCode = require('./models/OtpCode');
const {
  attachCurrentUser,
  requireAuth,
  requireRole,
  canManageUsers,
  canViewAllLetters,
  canApproveLetters,
  roleRank,
} = require('./middleware/auth');
const { signToken, verifyToken, qrDataUrl, getBaseUrl } = require('./lib/signature');
const { createOtp, verifyOtp } = require('./lib/otp');
const { sendOtpEmail } = require('./lib/mailer');

const app = express();

const sessionSecret = String(process.env.SESSION_SECRET || '').trim();
if (!sessionSecret && process.env.NODE_ENV === 'production') {
  throw new Error('SESSION_SECRET wajib di-set di environment (production).');
}

const signatureSecret = String(process.env.SIGNATURE_SECRET || '').trim();
if (!signatureSecret && process.env.NODE_ENV === 'production') {
  throw new Error('SIGNATURE_SECRET wajib di-set di environment (production).');
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(
  session({
    secret: sessionSecret || 'dev-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
    store: (ConnectMongo?.default || ConnectMongo?.MongoStore || ConnectMongo).create({
      mongoUrl: process.env.MONGODB_URI,
      collectionName: 'sessions',
      ttl: 7 * 24 * 60 * 60,
    }),
  })
);

app.use(attachCurrentUser);

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
    if (res.locals.currentUser) return res.redirect('/dashboard');
    res.render('landing');
  } catch (error) {
    next(error);
  }
});

app.get('/login', (req, res) => {
  if (res.locals.currentUser) return res.redirect('/dashboard');
  return res.render('login', { error: '' });
});

app.get('/register', (req, res) => {
  if (res.locals.currentUser) return res.redirect('/dashboard');
  return res.render('register', { error: '' });
});

app.get('/forgot-password', (req, res) => {
  if (res.locals.currentUser) return res.redirect('/dashboard');
  return res.render('forgot-password', { error: '', info: '' });
});

app.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await User.findOne({ email });
    if (!user) return res.status(401).render('login', { error: 'Email atau password salah.' });

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return res.status(401).render('login', { error: 'Email atau password salah.' });

    const otp = await createOtp({ userId: user._id, purpose: 'login' });
    await sendOtpEmail({ to: user.email, code: otp.code, purpose: 'login' });

    return res.render('verify-otp', {
      email: user.email,
      purpose: 'login',
      error: '',
      info: 'Kode OTP login telah dikirim ke email Anda.',
    });
  } catch (error) {
    next(error);
  }
});

app.post('/register', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const name = String(req.body.name || '').trim();
    const password = String(req.body.password || '');

    if (!email) return res.status(400).render('register', { error: 'Email wajib diisi.' });
    if (password.length < 8) return res.status(400).render('register', { error: 'Password minimal 8 karakter.' });

    const exists = await User.findOne({ email }).lean();
    if (exists) return res.status(400).render('register', { error: 'Email sudah terdaftar. Silakan login.' });

    const passwordHash = await hashPassword(password);
    const created = await User.create({ email, name, passwordHash, role: 'USER', emailVerified: false });

    const otp = await createOtp({ userId: created._id, purpose: 'register' });
    await sendOtpEmail({ to: created.email, code: otp.code, purpose: 'register' });

    return res.render('verify-otp', {
      email: created.email,
      purpose: 'register',
      error: '',
      info: 'Akun berhasil dibuat. Kode OTP registrasi telah dikirim ke email Anda.',
    });
  } catch (error) {
    next(error);
  }
});

app.post('/forgot-password', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).render('forgot-password', { error: 'Email wajib diisi.', info: '' });

    const user = await User.findOne({ email }).lean();
    if (!user) {
      return res.render('forgot-password', { error: '', info: 'Jika email terdaftar, kode OTP telah dikirim.' });
    }

    const otp = await createOtp({ userId: user._id, purpose: 'forgot' });
    await sendOtpEmail({ to: user.email, code: otp.code, purpose: 'forgot' });

    return res.render('reset-password', { email: user.email, error: '' });
  } catch (error) {
    next(error);
  }
});

app.post('/reset-password', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const code = String(req.body.code || '').trim();
    const password = String(req.body.password || '');

    if (password.length < 8) {
      return res.status(400).render('reset-password', { email, error: 'Password minimal 8 karakter.' });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(400).render('reset-password', { email, error: 'Email tidak ditemukan.' });

    const result = await verifyOtp({ userId: user._id, purpose: 'forgot', code });
    if (!result.ok) {
      return res.status(400).render('reset-password', { email, error: 'Kode OTP tidak valid atau sudah kedaluwarsa.' });
    }

    user.passwordHash = await hashPassword(password);
    await user.save();

    return res.redirect('/login');
  } catch (error) {
    next(error);
  }
});

app.post('/verify-otp', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const purpose = String(req.body.purpose || '').trim();
    const code = String(req.body.code || '').trim();

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).render('verify-otp', { email, purpose, error: 'Email tidak ditemukan.', info: '' });
    }

    if (!['login', 'register'].includes(purpose)) {
      return res.status(400).render('verify-otp', { email, purpose, error: 'Purpose OTP tidak dikenal.', info: '' });
    }

    const result = await verifyOtp({ userId: user._id, purpose, code });
    if (!result.ok) {
      return res.status(400).render('verify-otp', { email, purpose, error: 'Kode OTP tidak valid atau sudah kedaluwarsa.', info: '' });
    }

    if (purpose === 'register') {
      user.emailVerified = true;
      await user.save();
    }

    req.session.userId = String(user._id);
    return res.redirect('/dashboard');
  } catch (error) {
    next(error);
  }
});

app.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    return res.redirect('/');
  });
});

app.get('/dashboard', requireAuth, async (req, res, next) => {
  try {
    const currentUser = res.locals.currentUser;
    const query = canViewAllLetters(currentUser) ? {} : { createdBy: currentUser._id };
    const letters = await Letter.find(query).sort({ updatedAt: -1 }).lean();

    res.render('dashboard', {
      currentUser,
      letters,
      canApprove: canApproveLetters(currentUser),
      canManageUsers: canManageUsers(currentUser),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/mailer', requireAuth, async (req, res, next) => {
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

app.post('/letters/preview', requireAuth, async (req, res, next) => {
  try {
    const currentUser = res.locals.currentUser;
    const letterInput = normalizeLetterInput(req.body);

    const created = await Letter.create({
      createdBy: currentUser._id,
      status: 'DRAFT',
      ...letterInput,
    });

    res.redirect(`/letters/${created._id}/preview`);
  } catch (error) {
    next(error);
  }
});

app.post('/letters/:id/submit', requireAuth, async (req, res, next) => {
  try {
    const currentUser = res.locals.currentUser;
    const letter = await Letter.findById(req.params.id);
    if (!letter) return res.status(404).send('Surat tidak ditemukan.');
    if (String(letter.createdBy) !== String(currentUser._id)) return res.status(403).send('Forbidden');
    if (letter.status !== 'DRAFT') return res.redirect(`/letters/${letter._id}/preview`);

    letter.status = 'SUBMITTED';
    letter.submittedAt = new Date();
    await letter.save();

    return res.redirect(`/letters/${letter._id}/preview`);
  } catch (error) {
    next(error);
  }
});

app.post('/letters/:id/approve', requireRole(['SUPREME', 'SUPERADMIN']), async (req, res, next) => {
  try {
    const currentUser = res.locals.currentUser;
    const letter = await Letter.findById(req.params.id);
    if (!letter) return res.status(404).send('Surat tidak ditemukan.');

    if (letter.status !== 'SUBMITTED' && letter.status !== 'DRAFT') {
      return res.redirect(`/letters/${letter._id}/preview`);
    }

    const xPctRaw = Number(req.body.xPct);
    const yPctRaw = Number(req.body.yPct);
    const xPct = Number.isFinite(xPctRaw) ? Math.max(0, Math.min(100, xPctRaw)) : 80;
    const yPct = Number.isFinite(yPctRaw) ? Math.max(0, Math.min(100, yPctRaw)) : 86;

    const approvedAt = new Date();
    const token = signToken(
      {
        letterId: String(letter._id),
        approvedAt: approvedAt.toISOString(),
        number: letter.number || '',
        subject: letter.subject || '',
      },
      signatureSecret || 'dev-signature-secret'
    );

    letter.status = 'APPROVED';
    letter.approvedAt = approvedAt;
    letter.approvedBy = currentUser._id;
    letter.signatureToken = token;
    letter.barcodePosition = { xPct, yPct };
    await letter.save();

    return res.redirect(`/letters/${letter._id}/preview`);
  } catch (error) {
    next(error);
  }
});

app.post('/letters/:id/mark-sent', requireRole(['ADMIN', 'SUPREME', 'SUPERADMIN']), async (req, res, next) => {
  try {
    const currentUser = res.locals.currentUser;
    const letter = await Letter.findById(req.params.id);
    if (!letter) return res.status(404).send('Surat tidak ditemukan.');
    if (letter.status !== 'APPROVED') return res.redirect(`/letters/${letter._id}/preview`);

    letter.status = 'SENT';
    letter.sentAt = new Date();
    letter.sentBy = currentUser._id;
    await letter.save();

    return res.redirect(`/letters/${letter._id}/preview`);
  } catch (error) {
    next(error);
  }
});

app.get('/letters/:id/preview', requireAuth, async (req, res, next) => {
  try {
    const currentUser = res.locals.currentUser;
    const letter = await Letter.findById(req.params.id).lean();
    if (!letter) return res.status(404).send('Surat tidak ditemukan.');

    const canAccess = canViewAllLetters(currentUser) || String(letter.createdBy) === String(currentUser._id);
    if (!canAccess) return res.status(403).send('Forbidden');

    const kop = await getKopConfig();
    const baseUrl = getBaseUrl(req);

    let barcodeDataUrl = '';
    if (letter.signatureToken) {
      const verifyUrl = `${baseUrl}/verify/${encodeURIComponent(letter.signatureToken)}`;
      barcodeDataUrl = await qrDataUrl(verifyUrl);
    }

    const html = await renderLetterHtml({
      kop,
      letter: {
        ...letter,
        barcodeDataUrl,
      },
      withChrome: false,
    });

    const isCreator = String(letter.createdBy) === String(currentUser._id);
    const canApprove = canApproveLetters(currentUser);
    const showApprovePanel =
      canApprove &&
      !letter.signatureToken &&
      (letter.status === 'SUBMITTED' || (letter.status === 'DRAFT' && roleRank(currentUser.role) >= roleRank('SUPREME') && isCreator));

    const canSubmit =
      String(currentUser.role).toUpperCase() === 'USER' &&
      isCreator &&
      letter.status === 'DRAFT';

    const canDownload =
      (letter.status === 'APPROVED' || letter.status === 'SENT') &&
      Boolean(letter.signatureToken) &&
      canAccess;

    const canMarkSent =
      (letter.status === 'APPROVED') &&
      roleRank(currentUser.role) >= roleRank('ADMIN');

    const barcodePreviewDataUrl = showApprovePanel
      ? await qrDataUrl(`${baseUrl}/verify/pending`)
      : '';

    res.render('preview', {
      currentUser,
      letter,
      html,
      canApprove,
      showApprovePanel,
      canSubmit,
      canDownload,
      canMarkSent,
      barcodePreviewDataUrl,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/letters/:id/pdf', requireAuth, async (req, res, next) => {
  try {
    const currentUser = res.locals.currentUser;
    const letter = await Letter.findById(req.params.id).lean();
    if (!letter) return res.status(404).send('Surat tidak ditemukan.');

    const canAccess = canViewAllLetters(currentUser) || String(letter.createdBy) === String(currentUser._id);
    if (!canAccess) return res.status(403).send('Forbidden');

    if (!(letter.status === 'APPROVED' || letter.status === 'SENT') || !letter.signatureToken) {
      return res.status(403).send('Surat belum di-approve Supreme, belum bisa di-download.');
    }

    const kop = await getKopConfig();
    const baseUrl = getBaseUrl(req);
    const verifyUrl = `${baseUrl}/verify/${encodeURIComponent(letter.signatureToken)}`;
    const barcodeDataUrl = await qrDataUrl(verifyUrl);

    const html = await renderLetterHtml({
      kop,
      letter: {
        ...letter,
        barcodeDataUrl,
      },
      withChrome: false,
    });

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

app.get('/approvals', requireRole(['SUPREME', 'SUPERADMIN']), async (req, res, next) => {
  try {
    const currentUser = res.locals.currentUser;
    const lettersRaw = await Letter.find({ status: 'SUBMITTED' })
      .populate('createdBy', 'email')
      .sort({ submittedAt: -1 })
      .lean();

    const letters = lettersRaw.map((l) => ({
      ...l,
      createdByEmail: l.createdBy?.email || '',
    }));

    res.render('approvals', { currentUser, letters });
  } catch (error) {
    next(error);
  }
});

app.get('/admin/users', requireRole(['ADMIN', 'SUPERADMIN']), async (req, res, next) => {
  try {
    const currentUser = res.locals.currentUser;
    const users = await User.find({}).sort({ createdAt: -1 }).lean();
    const isSuper = String(currentUser.role).toUpperCase() === 'SUPERADMIN';
    const roles = isSuper ? User.ROLES : User.ROLES.filter((r) => r !== 'SUPERADMIN');
    res.render('admin/users', { currentUser, users, roles, error: '' });
  } catch (error) {
    next(error);
  }
});

app.get('/admin/users/new', requireRole(['ADMIN', 'SUPERADMIN']), (req, res) => {
  const currentUser = res.locals.currentUser;
  const isSuper = String(currentUser.role).toUpperCase() === 'SUPERADMIN';
  const roles = isSuper ? User.ROLES : User.ROLES.filter((r) => r !== 'SUPERADMIN');
  res.render('admin/new-user', { currentUser, roles, error: '' });
});

app.post('/admin/users', requireRole(['ADMIN', 'SUPERADMIN']), async (req, res, next) => {
  try {
    const currentUser = res.locals.currentUser;
    const isSuper = String(currentUser.role).toUpperCase() === 'SUPERADMIN';
    const rolesAllowed = isSuper ? User.ROLES : User.ROLES.filter((r) => r !== 'SUPERADMIN');

    const email = String(req.body.email || '').trim().toLowerCase();
    const name = String(req.body.name || '').trim();
    const role = String(req.body.role || 'USER').toUpperCase();
    const password = String(req.body.password || '');

    if (!rolesAllowed.includes(role)) {
      const roles = rolesAllowed;
      return res.status(400).render('admin/new-user', { currentUser, roles, error: 'Role tidak diizinkan.' });
    }

    const exists = await User.findOne({ email }).lean();
    if (exists) {
      const roles = rolesAllowed;
      return res.status(400).render('admin/new-user', { currentUser, roles, error: 'Email sudah terdaftar.' });
    }

    const passwordHash = await hashPassword(password);
    await User.create({ email, name, role, passwordHash });
    return res.redirect('/admin/users');
  } catch (error) {
    next(error);
  }
});

app.post('/admin/users/:id/role', requireRole(['ADMIN', 'SUPERADMIN']), async (req, res, next) => {
  try {
    const currentUser = res.locals.currentUser;
    const isSuper = String(currentUser.role).toUpperCase() === 'SUPERADMIN';
    const rolesAllowed = isSuper ? User.ROLES : User.ROLES.filter((r) => r !== 'SUPERADMIN');

    const role = String(req.body.role || '').toUpperCase();
    if (!rolesAllowed.includes(role)) return res.status(400).send('Role tidak diizinkan.');

    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).send('User tidak ditemukan.');

    if (!isSuper && String(target.role).toUpperCase() === 'SUPERADMIN') {
      return res.status(403).send('Tidak bisa mengubah role SUPERADMIN.');
    }

    target.role = role;
    await target.save();
    return res.redirect('/admin/users');
  } catch (error) {
    next(error);
  }
});

app.get('/verify/:token', async (req, res, next) => {
  try {
    const secret = signatureSecret || 'dev-signature-secret';
    const token = String(req.params.token || '');
    const verified = verifyToken(token, secret);
    if (!verified.ok) {
      return res.status(400).render('verify', { ok: false, message: 'Token tidak valid.', letter: null, approvedAt: '' });
    }

    const payload = verified.payload || {};
    const letterId = String(payload.letterId || '');
    const letter = await Letter.findById(letterId).lean();
    if (!letter) {
      return res.status(404).render('verify', { ok: false, message: 'Surat tidak ditemukan.', letter: null, approvedAt: '' });
    }

    if (!letter.signatureToken || letter.signatureToken !== token) {
      return res.status(400).render('verify', { ok: false, message: 'Tanda tangan tidak cocok.', letter: null, approvedAt: '' });
    }

    const approvedAt = letter.approvedAt ? new Date(letter.approvedAt).toLocaleString('id-ID') : '';
    return res.render('verify', { ok: true, message: '', letter, approvedAt });
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

module.exports = { app };
