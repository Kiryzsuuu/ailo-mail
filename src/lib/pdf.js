const puppeteer = require('puppeteer');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function telkomWebsiteLabel(kop) {
  const raw = kop && kop.website ? String(kop.website) : 'www.telkomuniversity.ac.id';
  return raw.replace(/^https?:\/\//, '');
}

function buildRepeatingHeaderTemplate(kop) {
  const headerImgSrc = (kop && String(kop.headerImageDataUrl || '').trim()) || '';
  if (headerImgSrc) {
    return `
      <div style="width:100%; padding:12.5mm 0 0 0;">
        <img alt="Header" src="${headerImgSrc}" style="display:block; width:100%; height:auto;" />
      </div>
    `;
  }

  const logoSrc = (kop && String(kop.logoDataUrl || '').trim()) || '';
  const logoImg = logoSrc
    ? `<img alt="Logo" src="${logoSrc}" style="height:38px; width:auto; object-fit:contain;" />`
    : '';

  // Puppeteer header/footer templates render inside a fixed-height box.
  // Keep layout simple and self-contained.
  return `
    <div style="width:100%; padding:12.5mm 18mm 0 18mm; font-family:Calibri, 'Segoe UI', Arial, sans-serif;">
      <div style="display:flex; justify-content:flex-end; align-items:flex-start;">
        ${logoImg}
      </div>
    </div>
  `;
}

function buildRepeatingFooterTemplate(kop) {
  const footerImgSrc = (kop && String(kop.footerImageDataUrl || '').trim()) || '';
  if (footerImgSrc) {
    // Place footer image 12.5mm above the page bottom.
    // NOTE: This image becomes part of the PDF artwork (not selectable text).
    return `
      <div style="width:100%; padding:0; position:relative; height:100%;">
        <div style="position:absolute; left:0; right:0; bottom:12.5mm;">
          <img alt="Footer" src="${footerImgSrc}" style="display:block; width:100%; height:auto;" />
        </div>
      </div>
    `;
  }

  const lines = kop && Array.isArray(kop.footerLines) ? kop.footerLines : [];
  const safeLines = lines.map((l) => `<div>${escapeHtml(l)}</div>`).join('');
  const web = escapeHtml(telkomWebsiteLabel(kop));

  // Red band + white wave cutout, built as inline SVG for stable rendering.
  const bandSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 220" preserveAspectRatio="none" style="position:absolute; left:0; top:-1px; width:100%; height:100%;">
      <rect width="1200" height="220" fill="#c80000" />
      <path fill="#ffffff" d="M0,80 C220,150 420,10 600,70 C780,130 980,40 1200,95 L1200,0 L0,0 Z" opacity="0.92" />
    </svg>
  `;

  // IMPORTANT: In Puppeteer footerTemplate, the whole footer is confined to the bottom margin area.
  // Anchor the red band to the bottom of that area, keep text above it.
  return `
    <div style="width:100%; padding:0; font-family:Calibri, 'Segoe UI', Arial, sans-serif; color:#111; position:relative; height:100%;">
      <div style="padding:0 18mm 34mm 18mm;">
        <div style="border-top:1px solid rgba(17,17,17,0.45); padding-top:4px;">
          <div style="font-size:6.2pt; line-height:1.15; text-align:center;">${safeLines}</div>
          <div style="margin-top:3px; text-align:center; font-weight:800; font-size:9pt;">${web}</div>
        </div>
      </div>
      <div style="position:absolute; left:0; right:0; bottom:12.5mm; height:14mm; overflow:hidden;">
        ${bandSvg}
      </div>
    </div>
  `;
}

function buildPrintOverrideCss(options) {
  const { useStationery, repeatingHeaderFooter, stationeryDataUrl } = options;

  if (useStationery) {
    return [
      '@page{size:A4;margin:0 !important;}',
      'html,body{background:transparent !important;margin:0 !important;padding:0 !important;}',
      `body{background-image:url("${stationeryDataUrl}") !important;background-repeat:no-repeat !important;background-position:left top !important;background-size:100% 100% !important;}`,
      '.kop{display:none !important;}',
      '.telkom-footer{display:none !important;}',
      '.letter{position:static !important;overflow:visible !important;height:auto !important;width:100% !important;background:transparent !important;padding:0 !important;}',
      '.letter-header{display:none !important;}',
      '.letter-main{position:static !important;top:auto !important;bottom:auto !important;left:auto !important;width:100% !important;padding:40mm 25mm 45mm 25mm !important;overflow:visible !important;}',
    ].join('\n');
  }

  if (repeatingHeaderFooter) {
    // Fix the absolute-layout height collapse: @media print sets .letter{height:auto} but
    // children are position:absolute → container collapses to 0 → blank PDF.
    return [
      '@page{margin:0 !important;}',
      'html,body{margin:0 !important;padding:0 !important;}',
      '.letter{position:static !important;overflow:visible !important;height:auto !important;width:100% !important;padding:0 !important;}',
      '.letter-header{display:none !important;}',
      '.kop{display:none !important;}',
      '.telkom-footer{display:none !important;}',
      '.letter-main{position:static !important;top:auto !important;bottom:auto !important;left:auto !important;width:100% !important;padding:0 25mm !important;overflow:visible !important;}',
    ].join('\n');
  }

  // Basic mode: flex layout matching the @media screen preview so barcodes anchor correctly.
  return [
    '@page{size:A4;margin:0;}',
    'html,body{margin:0 !important;padding:0 !important;}',
    '.letter{display:flex !important;flex-direction:column !important;width:210mm !important;min-height:297mm !important;height:auto !important;margin:0 !important;overflow:visible !important;position:relative !important;}',
    '.letter-header{position:static !important;flex-shrink:0 !important;height:auto !important;min-height:var(--headerHeight) !important;}',
    '.letter-main{position:static !important;top:auto !important;bottom:auto !important;left:auto !important;flex:1 !important;overflow:visible !important;}',
    '.telkom-footer{position:static !important;flex-shrink:0 !important;bottom:auto !important;left:auto !important;width:100% !important;}',
  ].join('\n');
}

async function generatePdfBuffer(html, options = {}) {
  const repeatingHeaderFooter = Boolean(options.repeatingHeaderFooter);
  const kop = options.kop || {};
  const stationeryDataUrl = kop && String(kop.stationeryDataUrl || '').trim();
  const useStationery = repeatingHeaderFooter && Boolean(stationeryDataUrl);
  const hasHeaderImage = Boolean(String(kop.headerImageDataUrl || '').trim());

  // Inject CSS overrides directly into the HTML before Puppeteer renders it.
  // This is more reliable than addStyleTag() which races with Puppeteer's layout.
  const overrideCss = buildPrintOverrideCss({ useStationery, repeatingHeaderFooter, stationeryDataUrl });
  const processedHtml = html.includes('</head>')
    ? html.replace('</head>', `<style>${overrideCss}</style></head>`)
    : html + `<style>${overrideCss}</style>`;

  const browser = await puppeteer.launch({
    headless: 'new',
  });

  try {
    const page = await browser.newPage();

    await page.setContent(processedHtml, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: useStationery,
      displayHeaderFooter: repeatingHeaderFooter && !useStationery,
      headerTemplate: (repeatingHeaderFooter && !useStationery) ? buildRepeatingHeaderTemplate(kop) : undefined,
      footerTemplate: (repeatingHeaderFooter && !useStationery) ? buildRepeatingFooterTemplate(kop) : undefined,
      margin: useStationery
        ? {
          top: '0mm',
          right: '0mm',
          bottom: '0mm',
          left: '0mm',
        }
        : (repeatingHeaderFooter
          ? {
            top: hasHeaderImage ? '70mm' : '60mm',
            right: '0mm',
            bottom: '78mm',
            left: '0mm',
          }
          : {
            top: '0mm',
            right: '0mm',
            bottom: '0mm',
            left: '0mm',
          }),
    });

    return pdf;
  } finally {
    await browser.close();
  }
}

module.exports = { generatePdfBuffer };
