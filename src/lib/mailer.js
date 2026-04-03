const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

let cachedTransport = null;
let cachedLogoAttachment = null;

function getLogoAttachment() {
  if (cachedLogoAttachment) return cachedLogoAttachment;

  try {
    const logoPath = path.join(__dirname, '..', '..', 'public', 'assets', 'logo-ailo.png');
    const content = fs.readFileSync(logoPath);
    cachedLogoAttachment = {
      filename: 'logo-ailo.png',
      content,
      cid: 'logo-ailo',
    };
    return cachedLogoAttachment;
  } catch (err) {
    cachedLogoAttachment = null;
    return null;
  }
}

function escapeHtml(input) {
  return String(input)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildOtpEmailHtml({ code, purpose }) {
  const safeCode = escapeHtml(code);

  const title =
    purpose === 'login'
      ? 'Kode OTP Login'
      : purpose === 'register'
        ? 'Kode OTP Registrasi'
        : purpose === 'change-email'
          ? 'Kode OTP Ubah Email'
          : 'Kode OTP Reset Password';

  const subtitle =
    purpose === 'login'
      ? 'Gunakan kode ini untuk masuk ke akun Anda.'
      : purpose === 'register'
        ? 'Gunakan kode ini untuk menyelesaikan pendaftaran akun.'
        : purpose === 'change-email'
          ? 'Gunakan kode ini untuk mengonfirmasi perubahan email akun.'
          : 'Gunakan kode ini untuk melanjutkan proses reset password.';

  // Email client friendly HTML: table layout + inline CSS.
  return `<!doctype html>
<html lang="id">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0; padding:0; background:#f6fbfc;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6fbfc;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; background:#ffffff; border:1px solid #d9e6ea; border-radius:14px; overflow:hidden;">
            <tr>
              <td style="padding:18px 20px; background:#ffffff; border-bottom:1px solid #edf4f6;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <div style="font-family:Arial, Helvetica, sans-serif; font-size:14px; color:#0f172a; font-weight:700;">
                        AILO Web Mailer
                      </div>
                    </td>
                    <td align="right" style="vertical-align:middle;">
                      <img src="cid:logo-ailo" width="36" height="36" alt="AILO" style="display:block; border-radius:8px;" />
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 20px 18px;">
                <div style="font-family:Arial, Helvetica, sans-serif; font-size:22px; line-height:28px; color:#0f172a; font-weight:800; margin:0 0 6px;">
                  ${escapeHtml(title)}
                </div>
                <div style="font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:20px; color:#475569; margin:0 0 18px;">
                  ${escapeHtml(subtitle)}
                </div>

                <div style="text-align:center; padding:14px 12px; background:#f2fbfc; border:1px dashed #0e7490; border-radius:12px;">
                  <div style="font-family:Arial, Helvetica, sans-serif; font-size:12px; color:#0e7490; letter-spacing:0.12em; font-weight:700;">
                    KODE OTP
                  </div>
                  <div style="font-family:Arial, Helvetica, sans-serif; font-size:34px; line-height:44px; font-weight:900; color:#0f172a; letter-spacing:0.18em; margin-top:8px;">
                    ${safeCode}
                  </div>
                </div>

                <div style="font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:18px; color:#64748b; margin-top:16px;">
                  Kode ini berlaku selama <b>10 menit</b>. Jangan berikan kode ini kepada siapa pun.
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 20px 18px; background:#ffffff; border-top:1px solid #edf4f6;">
                <div style="font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:18px; color:#94a3b8;">
                  Jika Anda tidak merasa melakukan permintaan ini, abaikan email ini.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

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
  const subject = `Kode OTP ${
    purpose === 'login'
      ? 'Login'
      : purpose === 'register'
        ? 'Registrasi'
        : purpose === 'change-email'
          ? 'Ubah Email'
          : 'Reset Password'
  } AILO`;
  const text = `Kode OTP kamu adalah: ${code}\n\nKode ini berlaku selama 10 menit.`;
  const html = buildOtpEmailHtml({ code, purpose });

  if (!transport) {
    // eslint-disable-next-line no-console
    console.log('[OTP EMAIL MOCK]', { to, subject, text, htmlPreview: html.slice(0, 180) + '...' });
    return;
  }

  const from = process.env.SMTP_FROM || 'AILO Web Mailer <no-reply@example.com>';

  const logoAttachment = getLogoAttachment();
  const attachments = logoAttachment ? [logoAttachment] : [];

  await transport.sendMail({ from, to, subject, text, html, attachments });
}

module.exports = { sendOtpEmail };
