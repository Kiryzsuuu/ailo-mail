const crypto = require('crypto');
const qrcode = require('qrcode');

function base64UrlEncode(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function base64UrlDecode(str) {
  const s = String(str || '').replaceAll('-', '+').replaceAll('_', '/');
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s + pad, 'base64');
}

function signToken(payload, secret) {
  const json = JSON.stringify(payload);
  const payloadB64 = base64UrlEncode(Buffer.from(json, 'utf8'));
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest();
  const sigB64 = base64UrlEncode(sig);
  return `${payloadB64}.${sigB64}`;
}

function verifyToken(token, secret) {
  const raw = String(token || '');
  const [payloadB64, sigB64] = raw.split('.');
  if (!payloadB64 || !sigB64) return { ok: false, reason: 'format' };

  const expected = crypto.createHmac('sha256', secret).update(payloadB64).digest();
  const actual = base64UrlDecode(sigB64);
  if (actual.length !== expected.length) return { ok: false, reason: 'sig' };
  if (!crypto.timingSafeEqual(actual, expected)) return { ok: false, reason: 'sig' };

  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: 'json' };
  }
}

async function qrDataUrl(text) {
  return qrcode.toDataURL(String(text || ''), {
    errorCorrectionLevel: 'M',
    margin: 1,
    scale: 6,
  });
}

function getBaseUrl(req) {
  const envBase = String(process.env.BASE_URL || '').trim();
  if (envBase) return envBase.replace(/\/$/, '');

  const proto = req.headers['x-forwarded-proto'] ? String(req.headers['x-forwarded-proto']).split(',')[0].trim() : req.protocol;
  const host = req.headers['x-forwarded-host'] ? String(req.headers['x-forwarded-host']).split(',')[0].trim() : req.get('host');
  return `${proto}://${host}`;
}

module.exports = { signToken, verifyToken, qrDataUrl, getBaseUrl };
