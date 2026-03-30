const puppeteer = require('puppeteer');

async function generatePdfBuffer(html) {
  const browser = await puppeteer.launch({
    headless: 'new',
  });

  try {
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '16mm',
        right: '16mm',
        bottom: '16mm',
        left: '16mm',
      },
    });

    return pdf;
  } finally {
    await browser.close();
  }
}

module.exports = { generatePdfBuffer };
