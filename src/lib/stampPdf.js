const { PDFDocument } = require('pdf-lib');

function bufferFromDataUrl(dataUrl) {
  const raw = String(dataUrl || '').trim();
  if (!raw.startsWith('data:')) return null;
  const comma = raw.indexOf(',');
  if (comma < 0) return null;
  const b64 = raw.slice(comma + 1);
  if (!b64) return null;
  return Buffer.from(b64, 'base64');
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

async function stampPdfWithQrs({ pdfBuffer, stamps }) {
  const cleanStamps = Array.isArray(stamps) ? stamps.filter(Boolean) : [];
  if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer)) {
    throw new Error('pdfBuffer must be a Buffer');
  }

  if (cleanStamps.length === 0) return pdfBuffer;

  const pdf = await PDFDocument.load(pdfBuffer);
  const pages = pdf.getPages();
  if (!pages.length) return pdfBuffer;

  const firstPage = pages[0];
  const { width, height } = firstPage.getSize();

  for (const stamp of cleanStamps) {
    const xPct = Number(stamp.xPct);
    const yPct = Number(stamp.yPct);
    const qrDataUrl = String(stamp.qrDataUrl || '');

    if (!Number.isFinite(xPct) || !Number.isFinite(yPct) || !qrDataUrl) continue;

    const qrBytes = bufferFromDataUrl(qrDataUrl);
    if (!qrBytes) continue;

    const qrImage = await pdf.embedPng(qrBytes);

    // Size in PDF points. Keep it readable but not huge.
    const qrSize = clamp(Number(stamp.sizePt) || 92, 48, 160);

    const xCenter = (clamp(xPct, 0, 100) / 100) * width;
    const yFromTop = (clamp(yPct, 0, 100) / 100) * height;
    const yCenter = height - yFromTop;

    const x = clamp(xCenter - qrSize / 2, 0, Math.max(0, width - qrSize));
    const y = clamp(yCenter - qrSize / 2, 0, Math.max(0, height - qrSize));

    firstPage.drawImage(qrImage, {
      x,
      y,
      width: qrSize,
      height: qrSize,
    });
  }

  const out = await pdf.save();
  return Buffer.from(out);
}

module.exports = { stampPdfWithQrs };
