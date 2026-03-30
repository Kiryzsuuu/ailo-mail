const fs = require('fs/promises');
const path = require('path');

const kopPath = path.join(__dirname, '..', 'config', 'kop.json');

let cached = null;

async function getKopConfig() {
  if (cached) return cached;

  const raw = await fs.readFile(kopPath, 'utf8');
  const parsed = JSON.parse(raw);

  cached = {
    orgNameLine1: String(parsed.orgNameLine1 ?? ''),
    orgNameLine2: String(parsed.orgNameLine2 ?? ''),
    affiliationLine: String(parsed.affiliationLine ?? ''),
    addressLines: Array.isArray(parsed.addressLines) ? parsed.addressLines.map(String) : [],
    email: String(parsed.email ?? ''),
    website: String(parsed.website ?? ''),
    logoPath: String(parsed.logoPath ?? ''),
  };

  return cached;
}

module.exports = { getKopConfig };
