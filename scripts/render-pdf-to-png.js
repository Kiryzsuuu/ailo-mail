const path = require('path');
const puppeteer = require('puppeteer');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const pdfRel = process.argv[2] || 'public/examples/Template kop.pdf';
  const outRel = process.argv[3] || 'public/examples/_template_kop_page1_zoom.png';
  const zoom = Number(process.argv[4] || 250);

  const pdfAbs = path.resolve(pdfRel);
  const outAbs = path.resolve(outRel);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });

  const url = `file:///${pdfAbs.replace(/\\/g, '/')}` + `#page=1&zoom=${encodeURIComponent(String(zoom))}`;
  await page.goto(url, { waitUntil: 'networkidle0' });
  await delay(1500);

  const handle = await page.$('embed, iframe');
  if (handle) {
    const box = await handle.boundingBox();
    if (box) {
      await page.screenshot({
        path: outAbs,
        clip: { x: box.x, y: box.y, width: box.width, height: box.height },
      });
    } else {
      await page.screenshot({ path: outAbs, fullPage: true });
    }
  } else {
    await page.screenshot({ path: outAbs, fullPage: true });
  }

  await browser.close();
  process.stdout.write(`wrote ${outRel}\n`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
