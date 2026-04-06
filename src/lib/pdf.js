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

async function generatePdfBuffer(html, options = {}) {
  const browser = await puppeteer.launch({
    headless: 'new',
  });

  try {
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: 'networkidle0' });

    const repeatingHeaderFooter = Boolean(options.repeatingHeaderFooter);
    const kop = options.kop || {};
    const stationeryDataUrl = kop && String(kop.stationeryDataUrl || '').trim();
    // If the user provided a full-page stationery template, always prefer it.
    // This ensures we follow the uploaded artwork exactly (no custom SVG/header/footer).
    const useStationery = repeatingHeaderFooter && Boolean(stationeryDataUrl);
    const hasHeaderImage = Boolean(String(kop.headerImageDataUrl || '').trim());

    if (repeatingHeaderFooter && !useStationery) {
      // Hide in-document kop/footer; they will be supplied by Puppeteer per-page header/footer.
      await page.addStyleTag({
        content: [
          '@page{margin:0 !important;}',
          'html,body{margin:0 !important; padding:0 !important;}',
          // Keep letter content aligned like normal (16mm), while header/footer can go edge-to-edge.
          '.letter{padding-left:16mm !important; padding-right:16mm !important; padding-top:12.5mm !important; padding-bottom:12.5mm !important;}',
          '.kop{display:none !important;}',
          '.telkom-footer{display:none !important;}',
        ].join('\n'),
      });
    }

    if (useStationery) {
      // DOCX stationery mode: full-page background image per page.
      // This matches the DOCX look (logo + footer wave) exactly.
      await page.addStyleTag({
        content: [
          '@page{size:A4; margin:0 !important;}',
          'html,body{background:transparent !important; margin:0 !important; padding:0 !important;}',
          `body{background-image:url("${stationeryDataUrl}") !important; background-repeat:no-repeat !important; background-position:left top !important; background-size:100% 100% !important;}`,
          // Hide in-document kop/footer because the stationery already contains them.
          '.kop{display:none !important;}',
          '.telkom-footer{display:none !important;}',
          // Follow the uploaded template; only enforce 1.25cm safe padding top/bottom.
          '.letter{padding:12.5mm 16mm 12.5mm 16mm !important;}',
        ].join('\n'),
      });
    }

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
            top: '16mm',
            right: '16mm',
            bottom: '16mm',
            left: '16mm',
          }),
    });

    return pdf;
  } finally {
    await browser.close();
  }
}

module.exports = { generatePdfBuffer };
