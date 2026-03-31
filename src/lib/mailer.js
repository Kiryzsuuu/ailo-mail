const nodemailer = require('nodemailer');

let cachedTransport = null;

function getTransport() {
  if (cachedTransport) return cachedTransport;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || '587');
  const secure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    // Fallback: log to console only
    cachedTransport = null;
    return null;
  }

  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  return cachedTransport;
}

async function sendOtpEmail({ to, code, purpose }) {
  const transport = getTransport();
  const subject = `Kode OTP ${purpose === 'login' ? 'Login' : purpose === 'register' ? 'Registrasi' : 'Reset Password'} AILO`;
  const text = `Kode OTP kamu adalah: ${code}\n\nKode ini berlaku selama 10 menit.`;

  if (!transport) {
    // eslint-disable-next-line no-console
    console.log('[OTP EMAIL MOCK]', { to, subject, text });
    return;
  }

  const from = process.env.SMTP_FROM || 'AILO Web Mailer <no-reply@example.com>';

  await transport.sendMail({ from, to, subject, text });
}

module.exports = { sendOtpEmail };
