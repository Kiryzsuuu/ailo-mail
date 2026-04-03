require('dotenv').config();

const request = require('supertest');
const mongoose = require('mongoose');

const { connectMongo } = require('../src/lib/db');
const { app } = require('../src/app');
const User = require('../src/models/User');
const Letter = require('../src/models/Letter');
const { hashPassword } = require('../src/lib/security');
const OtpCode = require('../src/models/OtpCode');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function randomId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

async function main() {
  const runId = randomId();
  const password = `P@ssw0rd-${runId}`;

  const userEmail = `e2e-user-${runId}@example.test`;
  const supremeEmail = `e2e-supreme-${runId}@example.test`;
  const adminEmail = `e2e-admin-${runId}@example.test`;

  const createdUserIds = [];
  const createdLetterIds = [];

  await connectMongo();

  try {
    // Create Supreme/Admin accounts directly in DB
    const supreme = await User.create({
      email: supremeEmail,
      name: 'E2E Supreme',
      role: 'SUPREME',
      passwordHash: await hashPassword(password),
    });
    const admin = await User.create({
      email: adminEmail,
      name: 'E2E Admin',
      role: 'ADMIN',
      passwordHash: await hashPassword(password),
    });
    createdUserIds.push(String(supreme._id), String(admin._id));

    // 1) Register as USER (role USER)
    const agentUser = request.agent(app);

    let res = await agentUser.get('/register');
    assert(res.status === 200, 'GET /register should return 200');

    res = await agentUser
      .post('/register')
      .type('form')
      .send({ email: userEmail, name: 'E2E User', password });
    assert(res.status === 200, 'POST /register should return 200 and show OTP page');

    const createdUser = await User.findOne({ email: userEmail });
    assert(createdUser, 'Registered user should exist in DB');
    createdUserIds.push(String(createdUser._id));

    // Verify register OTP via DB (simulating email)
    const registerOtp = await OtpCode.findOne({ userId: createdUser._id, purpose: 'register' }).lean();
    assert(registerOtp, 'Register OTP should exist in DB');

    res = await agentUser
      .post('/verify-otp')
      .type('form')
      .send({ email: userEmail, purpose: 'register', code: registerOtp.code });
    assert(res.status === 302, 'Verify-otp (register) should redirect');
    assert(String(res.headers.location || '') === '/', 'After OTP verify, user should go to landing (/)');

    // 2) Dashboard accessible
    res = await agentUser.get('/dashboard');
    assert(res.status === 200, 'GET /dashboard should return 200 for logged-in user');

    // 3) Create draft letter
    const today = new Date().toISOString().slice(0, 10);
    res = await agentUser
      .post('/letters/preview')
      .type('form')
      .send({
        font: 'calibri',
        fontCustom: '',
        place: 'Bandung',
        date: today,
        number: `001/E2E/${runId}`,
        attachment: '-',
        subject: `E2E Subject ${runId}`,
        recipient: 'Yth. Test',
        recipientAddress: 'Alamat Test',
        body: 'Isi surat untuk E2E test.',
        closing: 'Hormat kami,',
        signatoryName: 'Penandatangan',
        signatoryTitle: 'Jabatan',
      });
    assert(res.status === 302, 'POST /letters/preview should redirect');

    const previewLocation = String(res.headers.location || '');
    const match = previewLocation.match(/^\/letters\/([^/]+)\/preview$/);
    assert(match, 'Redirect location should be /letters/:id/preview');
    const letterId = match[1];

    createdLetterIds.push(letterId);

    res = await agentUser.get(`/letters/${letterId}/preview`);
    assert(res.status === 200, 'GET letter preview should return 200');

    let letter = await Letter.findById(letterId).lean();
    assert(letter && letter.status === 'DRAFT', 'Letter should be DRAFT after creation');

    // 4) Submit to Supreme
    res = await agentUser.post(`/letters/${letterId}/submit`).type('form').send({});
    assert(res.status === 302, 'Submit should redirect');

    letter = await Letter.findById(letterId).lean();
    assert(letter.status === 'SUBMITTED', 'Letter should be SUBMITTED after submit');

    // 5) Supreme login and approve
    const agentSupreme = request.agent(app);
    res = await agentSupreme.get('/login');
    assert(res.status === 200, 'GET /login should return 200');

    res = await agentSupreme.post('/login').type('form').send({ email: supremeEmail, password });
    assert(res.status === 200, 'Supreme login should return 200 and show OTP page');

    const supremeOtp = await OtpCode.findOne({ userId: supreme._id, purpose: 'login' }).lean();
    assert(supremeOtp, 'Supreme OTP should exist in DB');

    res = await agentSupreme
      .post('/verify-otp')
      .type('form')
      .send({ email: supremeEmail, purpose: 'login', code: supremeOtp.code });
    assert(res.status === 302, 'Supreme OTP verify should redirect');

    res = await agentSupreme.get('/approvals');
    assert(res.status === 200, 'GET /approvals should return 200 for Supreme');

    res = await agentSupreme
      .post(`/letters/${letterId}/approve`)
      .type('form')
      .send({ xPct: 75.5, yPct: 88.2 });
    assert(res.status === 302, 'Approve should redirect');

    letter = await Letter.findById(letterId).lean();
    assert(letter.status === 'APPROVED', 'Letter should be APPROVED after approve');
    assert(letter.signatureToken, 'signatureToken should be set after approve');

    // 6) PDF downloadable after approval
    res = await agentUser.get(`/letters/${letterId}/pdf`);
    assert(res.status === 200, 'PDF should be downloadable after approval');
    assert(String(res.headers['content-type'] || '').includes('application/pdf'), 'PDF response content-type should be application/pdf');

    // 7) Verification link works
    res = await request(app).get(`/verify/${encodeURIComponent(letter.signatureToken)}`);
    assert(res.status === 200, 'GET /verify/:token should return 200');
    assert(String(res.text || '').includes('VALID'), 'Verify page should contain VALID');

    // 8) Admin can access users page
    const agentAdmin = request.agent(app);
    res = await agentAdmin.post('/login').type('form').send({ email: adminEmail, password });
    assert(res.status === 200, 'Admin login should return 200 and show OTP page');

    const adminOtp = await OtpCode.findOne({ userId: admin._id, purpose: 'login' }).lean();
    assert(adminOtp, 'Admin OTP should exist in DB');

    res = await agentAdmin
      .post('/verify-otp')
      .type('form')
      .send({ email: adminEmail, purpose: 'login', code: adminOtp.code });
    assert(res.status === 302, 'Admin OTP verify should redirect');

    res = await agentAdmin.get('/admin/users');
    assert(res.status === 200, 'GET /admin/users should return 200 for Admin');

    // eslint-disable-next-line no-console
    console.log('E2E smoke test: OK');
  } finally {
    // Cleanup
    if (createdLetterIds.length) {
      await Letter.deleteMany({ _id: { $in: createdLetterIds } });
    }
    if (createdUserIds.length) {
      await User.deleteMany({ _id: { $in: createdUserIds } });
    }
    await mongoose.disconnect();
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
  // eslint-disable-next-line no-console
  console.error('E2E smoke test: FAILED');
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
  });
