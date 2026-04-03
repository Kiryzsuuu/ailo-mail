const path = require('path');
const fs = require('fs');
const express = require('express');
const morgan = require('morgan');
const session = require('express-session');
const ConnectMongo = require('connect-mongo');
const { getKopConfig } = require('./lib/kopConfig');
const { renderLetterHtml, normalizeLetterInput } = require('./lib/renderLetter');
const { generatePdfBuffer } = require('./lib/pdf');
const User = require('./models/User');
const Letter = require('./models/Letter');
const { hashPassword, verifyPassword } = require('./lib/security');
const OtpCode = require('./models/OtpCode');
const ActivityLog = require('./models/ActivityLog');
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
const { logActivity, actorFromUser } = require('./lib/activityLog');

const app = express();

const shouldLogHttp =
  String(process.env.LOG_HTTP || '').trim() === '1' ||
  process.env.NODE_ENV === 'development';

if (shouldLogHttp) {
  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const end = process.hrtime.bigint();
      const ms = Number(end - start) / 1e6;
      const xfwd = String(req.headers['x-forwarded-for'] || '').trim();
      const remote = (xfwd ? xfwd.split(',')[0].trim() : req.socket?.remoteAddress) || '-';

      const url = req.originalUrl || req.url;
      const skip =
        url.startsWith('/assets/') ||
        url.endsWith('.css') ||
        url.endsWith('.js') ||
        url.endsWith('.png') ||
        url.endsWith('.jpg') ||
        url.endsWith('.jpeg') ||
        url.endsWith('.svg') ||
        url.endsWith('.ico');

      if (!skip) {
        const line = `${new Date().toISOString()} ${req.method} ${url} ${res.statusCode} ${ms.toFixed(1)} ms ${remote}`;

        // eslint-disable-next-line no-console
        console.log(line);

        fs.promises
          .appendFile(path.join(__dirname, '..', 'logs', 'http.log'), `${line}\n`)
          .catch(() => {
            // ignore
          });
      }
    });

    next();
  });

  morgan.token('remote', (req) => {
    const xfwd = String(req.headers['x-forwarded-for'] || '').trim();
    if (xfwd) return xfwd.split(',')[0].trim();
    return req.socket?.remoteAddress || '-';
  });

  app.use(
    morgan(':method :url :status :res[content-length] - :response-time ms :remote', {
      skip: (req) =>
        req.url.startsWith('/assets/') ||
        req.url.endsWith('.css') ||
        req.url.endsWith('.js') ||
        req.url.endsWith('.png') ||
        req.url.endsWith('.jpg') ||
        req.url.endsWith('.jpeg') ||
        req.url.endsWith('.svg') ||
        req.url.endsWith('.ico'),
    })
  );
}

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

// Landing page - PROTECTED: only for logged-in users
app.get('/', requireAuth, async (req, res, next) => {
  try {
    return res.render('landing');
  } catch (error) {
    next(error);
  }
});

// Login page - ALWAYS render form (no redirect)
app.get('/login', (req, res) => {
  if (shouldLogHttp) {
    // eslint-disable-next-line no-console
    console.log('[route] GET /login handler hit');
  }
  return res.render('login', { error: '' });
});

// Register page - ALWAYS render form (no redirect)
app.get('/register', (req, res) => {
  return res.render('register', { error: '' });
});

// Forgot password - ALWAYS render form (no redirect)
app.get('/forgot-password', (req, res) => {
  return res.render('forgot-password', { error: '', info: '' });
});

app.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await User.findOne({ email });
    if (!user) {
      await logActivity({
        req,
        actor: actorFromUser(null),
        action: 'auth.login_failed',
        statusCode: 401,
        meta: { email },
      });
      return res.status(401).render('login', { error: 'Email atau password salah.' });
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      await logActivity({
        req,
        actor: actorFromUser(user),
        action: 'auth.login_failed',
        statusCode: 401,
        meta: { email },
      });
      return res.status(401).render('login', { error: 'Email atau password salah.' });
    }

    const otp = await createOtp({ userId: user._id, purpose: 'login' });
    await sendOtpEmail({ to: user.email, code: otp.code, purpose: 'login' });

    await logActivity({
      req,
      actor: actorFromUser(user),
      action: 'auth.login_otp_sent',
      statusCode: 200,
      meta: { email: user.email },
    });

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

    await logActivity({
      req,
      actor: actorFromUser(created),
      action: 'auth.register_created',
      statusCode: 200,
      meta: { email: created.email },
    });

    const otp = await createOtp({ userId: created._id, purpose: 'register' });
    await sendOtpEmail({ to: created.email, code: otp.code, purpose: 'register' });

    await logActivity({
      req,
      actor: actorFromUser(created),
      action: 'auth.register_otp_sent',
      statusCode: 200,
      meta: { email: created.email },
    });

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
      await logActivity({
        req,
        actor: actorFromUser(null),
        action: 'auth.forgot_requested_unknown',
        statusCode: 200,
        meta: { email },
      });
      return res.render('forgot-password', { error: '', info: 'Jika email terdaftar, kode OTP telah dikirim.' });
    }

    const otp = await createOtp({ userId: user._id, purpose: 'forgot' });
    await sendOtpEmail({ to: user.email, code: otp.code, purpose: 'forgot' });

    await logActivity({
      req,
      actor: actorFromUser(user),
      action: 'auth.forgot_otp_sent',
      statusCode: 200,
      meta: { email: user.email },
    });

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
      await logActivity({
        req,
        actor: actorFromUser(user),
        action: 'auth.forgot_reset_failed',
        statusCode: 400,
        meta: { email },
      });
      return res.status(400).render('reset-password', { email, error: 'Kode OTP tidak valid atau sudah kedaluwarsa.' });
    }

    user.passwordHash = await hashPassword(password);
    await user.save();

    await logActivity({
      req,
      actor: actorFromUser(user),
      action: 'auth.forgot_reset_success',
      statusCode: 302,
      meta: { email },
    });

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

    if (!['login', 'register', 'change-email'].includes(purpose)) {
      return res.status(400).render('verify-otp', { email, purpose, error: 'Purpose OTP tidak dikenal.', info: '' });
    }

    // Special case: change-email uses logged-in session userId, not lookup by email.
    if (purpose === 'change-email') {
      const userId = req.session?.userId;
      const pendingEmail = String(req.session?.pendingEmail || '').trim().toLowerCase();
      console.log(`[OTP Verify] change-email START userId=${userId}, pendingEmail=${pendingEmail}`);

      if (!userId || !pendingEmail) {
        return res.status(400).render('verify-otp', { email, purpose, error: 'Permintaan ganti email tidak ditemukan. Silakan ulangi dari halaman profile.', info: '' });
      }

      // Optional: ensure the rendered email matches pending email
      if (email && email !== pendingEmail) {
        return res.status(400).render('verify-otp', { email: pendingEmail, purpose, error: 'Email tidak cocok. Silakan ulangi.', info: '' });
      }

      const exists = await User.findOne({ email: pendingEmail }).lean();
      if (exists) {
        return res.status(400).render('verify-otp', { email: pendingEmail, purpose, error: 'Email baru sudah digunakan. Silakan pakai email lain.', info: '' });
      }

      const result = await verifyOtp({ userId, purpose, code });
      if (!result.ok) {
        await logActivity({
          req,
          actor: actorFromUser(res.locals.currentUser),
          action: 'profile.email_change_otp_failed',
          statusCode: 400,
          meta: { pendingEmail },
        });
        return res.status(400).render('verify-otp', { email: pendingEmail, purpose, error: 'Kode OTP tidak valid atau sudah kedaluwarsa.', info: '' });
      }

      await User.findByIdAndUpdate(userId, { email: pendingEmail, emailVerified: true });
      console.log(`[OTP Verify] change-email SUCCESS userId=${userId}, newEmail=${pendingEmail}`);

      await logActivity({
        req,
        actor: actorFromUser({ _id: userId, email: pendingEmail, role: res.locals.currentUser?.role, name: res.locals.currentUser?.name }),
        action: 'profile.email_change_success',
        statusCode: 302,
        meta: { newEmail: pendingEmail },
      });

      req.session.pendingEmail = null;
      return req.session.save((err) => {
        if (err) {
          console.error('[OTP Verify] change-email session save error:', err);
          return res.redirect('/profile');
        }
        return res.redirect('/profile');
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).render('verify-otp', { email, purpose, error: 'Email tidak ditemukan.', info: '' });
    }

    const result = await verifyOtp({ userId: user._id, purpose, code });
    if (!result.ok) {
      await logActivity({
        req,
        actor: actorFromUser(user),
        action: 'auth.otp_verify_failed',
        statusCode: 400,
        meta: { email, purpose },
      });
      return res.status(400).render('verify-otp', { email, purpose, error: 'Kode OTP tidak valid atau sudah kedaluwarsa.', info: '' });
    }

    if (purpose === 'register') {
      user.emailVerified = true;
      await user.save();
    }

    req.session.userId = String(user._id);
    console.log('[OTP Verify] Session userId set:', req.session.userId);
    req.session.save((err) => {
      if (err) {
        console.error('[OTP Verify] Session save error:', err);
        return res.status(500).render('verify-otp', { email, purpose, error: 'Save session gagal', info: '' });
      }
      console.log('[OTP Verify] Session saved, redirecting to /');
      logActivity({
        req,
        actor: actorFromUser(user),
        action: 'auth.otp_verify_success',
        statusCode: 302,
        meta: { email, purpose },
      });
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      return res.redirect('/');
    });
  } catch (error) {
    next(error);
  }
});

// Profile - edit user profile
app.get('/profile', requireAuth, (req, res) => {
  const userId = res.locals.currentUser._id;
  const userEmail = res.locals.currentUser.email;
  console.log(`[GET /profile] userId=${userId}, email=${userEmail}`);
  res.render('profile', {
    currentUser: res.locals.currentUser,
    errors: [],
    success: false,
  });
});

app.post('/profile', requireAuth, async (req, res, next) => {
  try {
    const currentUser = res.locals.currentUser;
    const userId = currentUser._id;
    const userEmail = currentUser.email;
    const name = String(req.body.name || '').trim();
    console.log(`[POST /profile] UPDATE NAME START userId=${userId}, email=${userEmail}`);

    const errors = [];
    if (!name) errors.push('Nama tidak boleh kosong.');

    if (errors.length > 0) {
      console.log(`[POST /profile] VALIDATION ERROR userId=${userId}: ${errors.join(' | ')}`);
      return res.render('profile', { currentUser, errors, success: false });
    }

    await User.findByIdAndUpdate(currentUser._id, { name });
    console.log(`[POST /profile] NAME UPDATED userId=${userId}, name=${name}`);

    await logActivity({
      req,
      actor: actorFromUser(currentUser),
      action: 'profile.name_updated',
      statusCode: 200,
      meta: { name },
    });

    const updatedUser = await User.findById(currentUser._id).lean();
    console.log(`[POST /profile] SUCCESS userId=${userId}`);
    return res.render('profile', { currentUser: updatedUser, errors: [], success: true });
  } catch (error) {
    console.error('[POST /profile] EXCEPTION:', error.message);
    next(error);
  }
});

app.post('/profile/password', requireAuth, async (req, res, next) => {
  try {
    const currentUser = res.locals.currentUser;
    const userId = currentUser._id;
    const userEmail = currentUser.email;

    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    const confirmPassword = String(req.body.confirmPassword || '');

    console.log(`[POST /profile/password] START userId=${userId}, email=${userEmail}`);

    const errors = [];
    if (!currentPassword) errors.push('Password saat ini wajib diisi.');
    if (newPassword.length < 8) errors.push('Password baru minimal 8 karakter.');
    if (newPassword !== confirmPassword) errors.push('Password baru dan konfirmasi tidak cocok.');

    if (errors.length > 0) {
      console.log(`[POST /profile/password] VALIDATION ERROR userId=${userId}: ${errors.join(' | ')}`);
      return res.render('profile', { currentUser, errors, success: false });
    }

    const user = await User.findById(currentUser._id);
    if (!user) {
      console.error(`[POST /profile/password] USER NOT FOUND userId=${userId}`);
      return res.status(401).render('profile', { currentUser, errors: ['User tidak ditemukan.'], success: false });
    }

    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) {
      console.log(`[POST /profile/password] PASSWORD MISMATCH userId=${userId}`);
      return res.render('profile', { currentUser, errors: ['Password saat ini tidak cocok.'], success: false });
    }

    user.passwordHash = await hashPassword(newPassword);
    await user.save();
    console.log(`[POST /profile/password] SUCCESS userId=${userId}`);

    await logActivity({
      req,
      actor: actorFromUser(currentUser),
      action: 'profile.password_updated',
      statusCode: 200,
      meta: {},
    });

    const updatedUser = await User.findById(currentUser._id).lean();
    return res.render('profile', { currentUser: updatedUser, errors: [], success: true });
  } catch (error) {
    console.error('[POST /profile/password] EXCEPTION:', error.message);
    next(error);
  }
});

app.post('/profile/request-email-change', requireAuth, async (req, res, next) => {
  try {
    const currentUser = res.locals.currentUser;
    const userId = currentUser._id;
    const userEmail = currentUser.email;

    const newEmail = String(req.body.newEmail || '').trim().toLowerCase();
    const currentPassword = String(req.body.currentPassword || '');

    console.log(`[POST /profile/request-email-change] START userId=${userId}, email=${userEmail}, newEmail=${newEmail}`);

    const errors = [];
    if (!newEmail) errors.push('Email baru wajib diisi.');
    if (!currentPassword) errors.push('Password saat ini wajib diisi.');
    if (newEmail && newEmail === userEmail) errors.push('Email baru harus berbeda dari email saat ini.');

    const exists = newEmail ? await User.findOne({ email: newEmail }).lean() : null;
    if (exists) errors.push('Email baru sudah digunakan.');

    const user = await User.findById(currentUser._id);
    if (!user) errors.push('User tidak ditemukan.');

    if (user) {
      const ok = await verifyPassword(currentPassword, user.passwordHash);
      if (!ok) errors.push('Password saat ini tidak cocok.');
    }

    if (errors.length > 0) {
      console.log(`[POST /profile/request-email-change] VALIDATION ERROR userId=${userId}: ${errors.join(' | ')}`);
      return res.render('profile', { currentUser, errors, success: false });
    }

    // Store pending email in session and send OTP to new email
    req.session.pendingEmail = newEmail;
    const otp = await createOtp({ userId, purpose: 'change-email' });
    await sendOtpEmail({ to: newEmail, code: otp.code, purpose: 'change-email' });
    console.log(`[POST /profile/request-email-change] OTP SENT userId=${userId}, to=${newEmail}`);

    await logActivity({
      req,
      actor: actorFromUser(currentUser),
      action: 'profile.email_change_otp_sent',
      statusCode: 200,
      meta: { newEmail },
    });

    return req.session.save((err) => {
      if (err) {
        console.error('[POST /profile/request-email-change] Session save error:', err);
        return res.render('profile', { currentUser, errors: ['Gagal menyimpan sesi. Silakan coba lagi.'], success: false });
      }
      return res.render('verify-otp', {
        email: newEmail,
        purpose: 'change-email',
        error: '',
        info: 'Kode OTP untuk ganti email telah dikirim ke email baru Anda.',
      });
    });
  } catch (error) {
    console.error('[POST /profile/request-email-change] EXCEPTION:', error.message);
    next(error);
  }
});

app.post('/logout', (req, res, next) => {
  const sessionId = req.sessionID;
  const userId = req.session?.userId || 'unknown';
  console.log(`[POST /logout] START sessionId=${sessionId}, userId=${userId}`);
  
  // Explicit session userId clear
  if (req.session) {
    req.session.userId = null;
    req.session.destroy((sessionErr) => {
      if (sessionErr) {
        console.error(`[POST /logout] Session destroy FAILED sessionId=${sessionId}:`, sessionErr.message);
        // Even if destroy fails, still clear cookies and redirect
      } else {
        console.log(`[POST /logout] Session DESTROYED sessionId=${sessionId}`);
      }
      
      // Aggressive cookie clearing to prevent stale session
      res.setHeader('Clear-Site-Data', '"cookies"');
      res.clearCookie('connect.sid', { path: '/', httpOnly: true, sameSite: 'lax' });
      res.clearCookie('connect.sid', { path: '/', httpOnly: false });
      res.clearCookie('connect.sid');
      
      // Cache headers to prevent browser cache
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate, private, max-age=0');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.set('Surrogate-Control', 'no-store');
      
      console.log(`[POST /logout] REDIRECT to /login sessionId=${sessionId}`);
      logActivity({
        req,
        actor: actorFromUser(res.locals.currentUser),
        action: 'auth.logout',
        statusCode: 303,
        meta: {},
      });
      return res.redirect(303, '/login');
    });
  } else {
    // No session at all, just redirect
    console.log(`[POST /logout] NO SESSION - direct redirect sessionId=${sessionId}`);
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    logActivity({
      req,
      actor: actorFromUser(res.locals.currentUser),
      action: 'auth.logout',
      statusCode: 303,
      meta: {},
    });
    return res.redirect(303, '/login');
  }
});

app.get('/logout', (req, res, next) => {
  const sessionId = req.sessionID;
  const userId = req.session?.userId || 'unknown';
  console.log(`[GET /logout] START sessionId=${sessionId}, userId=${userId}`);
  
  // Explicit session userId clear
  if (req.session) {
    req.session.userId = null;
    req.session.destroy((sessionErr) => {
      if (sessionErr) {
        console.error(`[GET /logout] Session destroy FAILED sessionId=${sessionId}:`, sessionErr.message);
        // Even if destroy fails, still clear cookies and redirect
      } else {
        console.log(`[GET /logout] Session DESTROYED sessionId=${sessionId}`);
      }
      
      // Aggressive cookie clearing
      res.setHeader('Clear-Site-Data', '"cookies"');
      res.clearCookie('connect.sid', { path: '/', httpOnly: true, sameSite: 'lax' });
      res.clearCookie('connect.sid', { path: '/', httpOnly: false });
      res.clearCookie('connect.sid');
      
      // Cache headers
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate, private, max-age=0');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.set('Surrogate-Control', 'no-store');
      
      console.log(`[GET /logout] REDIRECT to /login sessionId=${sessionId}`);
      return res.redirect(303, '/login');
    });
  } else {
    // No session at all
    console.log(`[GET /logout] NO SESSION - direct redirect sessionId=${sessionId}`);
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.redirect(303, '/login');
  }
});

// Dashboard - Admin/detail view for logged-in users
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

    await logActivity({
      req,
      actor: actorFromUser(currentUser),
      action: 'letter.draft_created',
      statusCode: 302,
      targetLetterId: created._id,
      meta: { number: created.number || '', subject: created.subject || '' },
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

    await logActivity({
      req,
      actor: actorFromUser(currentUser),
      action: 'letter.submitted',
      statusCode: 302,
      targetLetterId: letter._id,
      meta: {},
    });

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

    await logActivity({
      req,
      actor: actorFromUser(currentUser),
      action: 'letter.approved',
      statusCode: 302,
      targetLetterId: letter._id,
      meta: { xPct, yPct },
    });

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

    await logActivity({
      req,
      actor: actorFromUser(currentUser),
      action: 'letter.mark_sent',
      statusCode: 302,
      targetLetterId: letter._id,
      meta: {},
    });

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

app.get('/admin/logs', requireRole(['ADMIN', 'SUPERADMIN']), async (req, res, next) => {
  try {
    const currentUser = res.locals.currentUser;
    const pageRaw = Number(req.query.page);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
    const limit = 100;
    const skip = (page - 1) * limit;

    const logs = await ActivityLog.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit + 1).lean();
    const hasNext = logs.length > limit;
    const rows = hasNext ? logs.slice(0, limit) : logs;

    return res.render('admin/logs', { currentUser, logs: rows, page, hasNext });
  } catch (error) {
    next(error);
  }
});

// Backwards-compatible aliases
app.get('/admin/log', requireRole(['ADMIN', 'SUPERADMIN']), (req, res) => {
  const page = req.query?.page;
  return res.redirect(page ? `/admin/logs?page=${encodeURIComponent(String(page))}` : '/admin/logs');
});

app.get('/logs', requireRole(['ADMIN', 'SUPERADMIN']), (req, res) => {
  const page = req.query?.page;
  return res.redirect(page ? `/admin/logs?page=${encodeURIComponent(String(page))}` : '/admin/logs');
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
    const created = await User.create({ email, name, role, passwordHash });

    await logActivity({
      req,
      actor: actorFromUser(currentUser),
      action: 'admin.user_created',
      statusCode: 302,
      targetUserId: created._id,
      meta: { email: created.email, role: created.role },
    });
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

    await logActivity({
      req,
      actor: actorFromUser(currentUser),
      action: 'admin.user_role_changed',
      statusCode: 302,
      targetUserId: target._id,
      meta: { role },
    });
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

if (String(process.env.DEBUG_ROUTES || '') === '1') {
  app.get('/__debug/routes', (req, res) => {
    const stack = app.router?.stack || app._router?.stack || [];
    const routes = [];
    for (const layer of stack) {
      if (!layer.route || !layer.route.path) continue;
      const methods = Object.keys(layer.route.methods || {}).filter((m) => layer.route.methods[m]);
      routes.push({ path: layer.route.path, methods });
    }
    res.json({ count: routes.length, routes });
  });
}

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
