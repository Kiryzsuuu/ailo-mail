const puppeteer = require('puppeteer');
const fs = require('fs/promises');
const path = require('path');

const FIELD_LABELS = {
  name: 'Nama Penerima',
  date: 'Tanggal',
  certNo: 'Nomor Sertifikat',
  event: 'Nama Kegiatan',
  position: 'Jabatan / Peran',
  organization: 'Instansi',
};

function fieldLabel(field) {
  return FIELD_LABELS[field] || field;
}

async function toDataUrl(filePath) {
  if (!filePath) return '';
  try {
    const buf = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
      : ext === '.png' ? 'image/png'
      : ext === '.webp' ? 'image/webp'
      : 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return '';
  }
}

function escapeHtml(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildCertHtml(template, fields, bgDataUrl) {
  const isLand = (template.orientation || 'landscape') === 'landscape';
  const w = isLand ? 297 : 210;
  const h = isLand ? 210 : 297;
  const bgColor = template.bgColor || '#ffffff';

  const elementsHtml = (template.elements || []).map((el) => {
    const value = el.type === 'text'
      ? el.text
      : (fields[el.field] || `[${fieldLabel(el.field)}]`);

    const style = [
      `position:absolute`,
      `left:${el.x}%`,
      `top:${el.y}%`,
      `transform:translate(-50%,-50%)`,
      `font-size:${el.fontSize || 32}pt`,
      `font-family:${escapeHtml(el.fontFamily || 'Calibri, Arial, sans-serif')}`,
      `color:${escapeHtml(el.color || '#1a1a1a')}`,
      `text-align:${el.align || 'center'}`,
      `width:${el.maxWidth || 80}%`,
      `font-weight:${el.bold ? 'bold' : 'normal'}`,
      `font-style:${el.italic ? 'italic' : 'normal'}`,
      `line-height:1.3`,
      `word-break:break-word`,
      `white-space:pre-wrap`,
    ].join(';');

    return `<div style="${style}">${escapeHtml(value)}</div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
@page { size: ${w}mm ${h}mm; margin: 0; }
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; width: ${w}mm; height: ${h}mm; overflow: hidden; }
.cert-root { position: relative; width: ${w}mm; height: ${h}mm; background: ${bgColor}; }
.cert-bg { position: absolute; inset: 0; width: 100%; height: 100%; }
.cert-bg img { display: block; width: 100%; height: 100%; object-fit: cover; }
</style>
</head>
<body>
<div class="cert-root">
${bgDataUrl ? `<div class="cert-bg"><img src="${bgDataUrl}" alt="" /></div>` : ''}
${elementsHtml}
</div>
</body>
</html>`;
}

async function generateOneCertPdf(template, fields, bgDataUrl) {
  const html = buildCertHtml(template, fields, bgDataUrl);
  const isLand = (template.orientation || 'landscape') === 'landscape';

  const browser = await puppeteer.launch({ headless: 'new' });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    return await page.pdf({
      width: isLand ? '297mm' : '210mm',
      height: isLand ? '210mm' : '297mm',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
  } finally {
    await browser.close();
  }
}

async function generateBulkCertPdf(template, recordsArray) {
  const bgDataUrl = await toDataUrl(template.backgroundPath);
  const isLand = (template.orientation || 'landscape') === 'landscape';
  const browser = await puppeteer.launch({ headless: 'new' });

  try {
    const pages = [];
    const page = await browser.newPage();

    for (const fields of recordsArray) {
      const html = buildCertHtml(template, fields, bgDataUrl);
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const buf = await page.pdf({
        width: isLand ? '297mm' : '210mm',
        height: isLand ? '210mm' : '297mm',
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
      pages.push(buf);
    }

    return pages;
  } finally {
    await browser.close();
  }
}

module.exports = { generateOneCertPdf, generateBulkCertPdf, toDataUrl, fieldLabel, FIELD_LABELS };
