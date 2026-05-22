const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function renderPdf(pdfRel, outRel) {
  const pdfAbs = path.resolve(pdfRel);
  const outAbs = path.resolve(outRel);
  const b64 = fs.readFileSync(pdfAbs).toString('base64');

  const html = `<!DOCTYPE html>
<html>
<head>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<style>body{margin:0;padding:0;background:#fff;}canvas{display:block;}</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
window._b64 = "${b64}";
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const data = atob(window._b64);
const bytes = new Uint8Array(data.length);
for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i);
pdfjsLib.getDocument({ data: bytes }).promise
  .then(pdf => pdf.getPage(1))
  .then(p => {
    const vp = p.getViewport({ scale: 3.0 });
    const c = document.getElementById('c');
    c.width = vp.width; c.height = vp.height;
    return p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  })
  .then(() => { document.body.setAttribute('data-done', '1'); });
</script>
</body></html>`;

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1270, deviceScaleFactor: 3 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.body.getAttribute('data-done') === '1', { timeout: 30000 });
  const canvas = await page.$('canvas');
  const ss = await canvas.screenshot();
  fs.writeFileSync(outAbs, ss);
  await browser.close();
  process.stdout.write(`wrote ${outRel}\n`);
}

renderPdf(process.argv[2], process.argv[3]).catch(e => { console.error(e.message); process.exit(1); });
