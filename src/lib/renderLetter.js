const ejs = require('ejs');
const fs = require('fs/promises');
const path = require('path');
const sanitizeHtml = require('sanitize-html');

const viewsDir = path.join(__dirname, '..', '..', 'views');
const letterCssPath = path.join(__dirname, '..', '..', 'public', 'letter.css');

function normalizeLetterInput(body) {
  const clean = (value) => (value == null ? '' : String(value));
  const cleanNum = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const cleanTemplate = (value) => {
    const t = String(value || '').trim().toUpperCase();
    const allowed = new Set([
      'DEFAULT',
      'SURAT_TUGAS',
      'SURAT_TUGAS_PANDUAN',
      'SURAT_TUGAS_TENAGA_AHLI',
      'SURAT_TUGAS_UNDANGAN',
      'SURAT_TUGAS_IN_HOUSE_TRAINING',
    ]);
    return allowed.has(t) ? t : 'DEFAULT';
  };
  const fontKey = clean(body.font || 'calibri');
  const fontCustomRaw = clean(body.fontCustom || '');
  const fontCustom = sanitizeFontFamily(fontCustomRaw);

  const fontSizePt = Math.max(8, Math.min(24, cleanNum(body.fontSizePt, 12)));
  const lineHeight = Math.max(1.0, Math.min(2.2, cleanNum(body.lineHeight, 1.55)));
  const paragraphSpacingPt = Math.max(0, Math.min(24, cleanNum(body.paragraphSpacingPt, 0)));
  const sectionSpacingPt = Math.max(0, Math.min(48, cleanNum(body.sectionSpacingPt, 0)));

  const bodyHtml = clean(body.bodyHtml || '');
  const recipientAddressHtml = clean(body.recipientAddressHtml || '');

  return {
    template: cleanTemplate(body.template),
    font: fontKey,
    fontCustom,
    fontFamily: fontCustom || fontKeyToStack(fontKey),
    fontSizePt,
    lineHeight,
    paragraphSpacingPt,
    sectionSpacingPt,
    place: clean(body.place),
    date: clean(body.date),
    formattedDate: formatDateId(clean(body.date)),
    number: clean(body.number),
    attachment: clean(body.attachment),
    subject: clean(body.subject),
    recipient: clean(body.recipient),
    recipientAddress: clean(body.recipientAddress),
    recipientAddressHtml,
    body: clean(body.body),
    bodyHtml,
    closing: clean(body.closing),
    signatoryName: clean(body.signatoryName),
    signatoryTitle: clean(body.signatoryTitle),
    signatoryNip: clean(body.signatoryNip),
    tableRowsRaw: clean(body.tableRowsRaw),
    detailsRaw: clean(body.detailsRaw),
  };
}

async function renderLetterHtml({ kop, letter, withChrome }) {
  const css = await fs.readFile(letterCssPath, 'utf8');

  const template = String(letter.template || 'DEFAULT').toUpperCase();
  const partialFile = template === 'DEFAULT' ? 'letter.ejs' : 'letter-task.ejs';

  const tableConfig = tableConfigForTemplate(template);
  const tableRows = parseTableRows(letter.tableRowsRaw, tableConfig.columns);
  const detailsRows = parseKeyValueLines(letter.detailsRaw);

  const safeBodyHtml = sanitizeRich(letter.bodyHtml) || textToHtml(letter.body);
  const safeRecipientAddressHtml = sanitizeRich(letter.recipientAddressHtml) || textToHtml(letter.recipientAddress);

  return ejs.renderFile(path.join(viewsDir, 'partials', partialFile), {
    kop,
    letter: {
      ...letter,
      bodyHtml: safeBodyHtml,
      recipientAddressHtml: safeRecipientAddressHtml,
      tableConfig,
      tableRows,
      detailsRows,
    },
    css,
    letterFontFamily: letter.fontFamily || fontKeyToStack(letter.font || 'calibri'),
    withChrome: Boolean(withChrome),
  });
}

function sanitizeRich(html) {
  const raw = String(html || '').trim();
  if (!raw) return '';

  return sanitizeHtml(raw, {
    allowedTags: [
      'b', 'strong', 'i', 'em', 'u', 's',
      'p', 'div', 'br',
      'ul', 'ol', 'li',
      'h1', 'h2', 'h3',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'span',
      'img',
      'blockquote',
    ],
    allowedAttributes: {
      '*': ['style'],
      img: ['src', 'alt', 'style'],
      a: ['href', 'target', 'rel'],
    },
    allowedSchemes: ['http', 'https', 'data'],
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noreferrer noopener', target: '_blank' }),
    },
    allowedStyles: {
      '*': {
        'text-align': [/^(left|right|center|justify)$/],
        'font-weight': [/^([1-9]00|bold|normal)$/],
        'font-style': [/^(italic|normal)$/],
        'text-decoration': [/^(underline|line-through|none)$/],
      },
      img: {
        'width': [/^\d+(px|%)$/],
        'max-width': [/^\d+(px|%)$/],
        'height': [/^auto$|^\d+(px|%)$/],
      },
    },
  });
}

function tableConfigForTemplate(template) {
  const t = String(template || 'DEFAULT').toUpperCase();
  if (t === 'SURAT_TUGAS') {
    return { title: 'SURAT TUGAS', numberLabel: 'Nomor', columns: ['No', 'Nama', 'NIM'] };
  }
  if (t === 'SURAT_TUGAS_PANDUAN') {
    return { title: 'SURAT TUGAS', numberLabel: 'No', columns: ['No', 'Nama', 'NIP', 'Fakultas'] };
  }
  if (t === 'SURAT_TUGAS_TENAGA_AHLI') {
    return { title: 'SURAT TUGAS', numberLabel: 'No', columns: ['No', 'Nama', 'NIP', 'Fakultas'] };
  }
  if (t === 'SURAT_TUGAS_UNDANGAN') {
    return { title: 'SURAT TUGAS', numberLabel: 'No', columns: ['No', 'Nama', 'NIP', 'Fakultas'] };
  }
  if (t === 'SURAT_TUGAS_IN_HOUSE_TRAINING') {
    return { title: 'SURAT TUGAS', numberLabel: 'No', columns: ['No', 'Nama', 'Fakultas'] };
  }
  return { title: '', numberLabel: 'Nomor', columns: [] };
}

function parseTableRows(raw, columns) {
  const cols = Array.isArray(columns) ? columns : [];
  const text = String(raw || '').trim();
  if (!text || cols.length === 0) return [];
  const lines = text
    .split(/\r\n|\n|\r/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split('|').map((p) => p.trim());
    const row = {};
    // If user doesn't provide No, auto-fill
    const needsAutoNo = cols[0] === 'No' && (parts.length === cols.length - 1);
    const values = needsAutoNo ? [String(i + 1), ...parts] : parts;
    for (let c = 0; c < cols.length; c++) {
      row[cols[c]] = values[c] != null ? String(values[c]) : '';
    }
    out.push(row);
  }
  return out;
}

function parseKeyValueLines(raw) {
  const text = String(raw || '').trim();
  if (!text) return [];
  const lines = text
    .split(/\r\n|\n|\r/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out = [];
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx < 0) {
      out.push({ k: line, v: '' });
      continue;
    }
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    out.push({ k, v });
  }
  return out;
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
