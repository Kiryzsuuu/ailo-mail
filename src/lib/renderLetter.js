const ejs = require('ejs');
const fs = require('fs/promises');
const path = require('path');

const viewsDir = path.join(__dirname, '..', '..', 'views');
const letterCssPath = path.join(__dirname, '..', '..', 'public', 'letter.css');

function normalizeLetterInput(body) {
  const clean = (value) => (value == null ? '' : String(value));
  const fontKey = clean(body.font || 'calibri');
  const fontCustomRaw = clean(body.fontCustom || '');
  const fontCustom = sanitizeFontFamily(fontCustomRaw);
  return {
    font: fontKey,
    fontCustom,
    fontFamily: fontCustom || fontKeyToStack(fontKey),
    place: clean(body.place),
    date: clean(body.date),
    formattedDate: formatDateId(clean(body.date)),
    number: clean(body.number),
    attachment: clean(body.attachment),
    subject: clean(body.subject),
    recipient: clean(body.recipient),
    recipientAddress: clean(body.recipientAddress),
    body: clean(body.body),
    closing: clean(body.closing),
    signatoryName: clean(body.signatoryName),
    signatoryTitle: clean(body.signatoryTitle),
    signatureDataUrl: clean(body.signatureDataUrl),
    qrDataUrl: clean(body.qrDataUrl),
  };
}

async function renderLetterHtml({ kop, letter, withChrome }) {
  const css = await fs.readFile(letterCssPath, 'utf8');

  return ejs.renderFile(path.join(viewsDir, 'partials', 'letter.ejs'), {
    kop,
    letter: {
      ...letter,
      bodyHtml: textToHtml(letter.body),
      recipientAddressHtml: textToHtml(letter.recipientAddress),
    },
    css,
    letterFontFamily: letter.fontFamily || fontKeyToStack(letter.font || 'calibri'),
    withChrome: Boolean(withChrome),
  });
}

function sanitizeFontFamily(value) {
  const v = String(value || '').trim();
  if (!v) return '';

  // Allow common font-family characters only (prevent CSS injection)
  // letters, numbers, spaces, commas, quotes, hyphen
  if (!/^[a-zA-Z0-9\s,\-"']{1,120}$/.test(v)) return '';
  return v;
}

function fontKeyToStack(key) {
  const k = String(key || '').toLowerCase();
  switch (k) {
    case 'calibri':
      return 'Calibri, "Segoe UI", Arial, sans-serif';
    case 'arial':
      return 'Arial, Helvetica, sans-serif';
    case 'times':
      return '"Times New Roman", Times, serif';
    case 'georgia':
      return 'Georgia, "Times New Roman", serif';
    case 'tahoma':
      return 'Tahoma, "Segoe UI", Arial, sans-serif';
    case 'verdana':
      return 'Verdana, "Segoe UI", Arial, sans-serif';
    case 'trebuchet':
      return '"Trebuchet MS", "Segoe UI", Arial, sans-serif';
    case 'garamond':
      return 'Garamond, "Times New Roman", serif';
    case 'courier':
      return '"Courier New", Courier, monospace';
    case 'system':
      return 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    default:
      return 'Calibri, "Segoe UI", Arial, sans-serif';
  }
}

function formatDateId(iso) {
  try {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return iso;
    const months = [
      'Januari',
      'Februari',
      'Maret',
      'April',
      'Mei',
      'Juni',
      'Juli',
      'Agustus',
      'September',
      'Oktober',
      'November',
      'Desember',
    ];
    return `${d} ${months[m - 1]} ${y}`;
  } catch {
    return iso;
  }
}

function textToHtml(text) {
  const escaped = escapeHtml(text ?? '');
  // Preserve blank lines, treat as paragraphs via <br>
  return escaped.replaceAll(/\r\n|\n|\r/g, '<br>');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

module.exports = { renderLetterHtml, normalizeLetterInput };
