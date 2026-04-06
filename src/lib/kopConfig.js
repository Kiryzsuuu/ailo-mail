const fs = require('fs/promises');
const path = require('path');

const kopPath = path.join(__dirname, '..', 'config', 'kop.json');

let cached = null;

function toPosixPath(p) {
  return String(p || '').replace(/\\/g, '/');
}

function getLogoDiskPath(logoPath) {
  const cleaned = toPosixPath(logoPath).replace(/^\//, '');
  if (!cleaned) return null;

  const publicDir = path.join(__dirname, '..', '..', 'public');
  return path.join(publicDir, cleaned);
}

function getAssetDiskPath(assetPath) {
  const cleaned = toPosixPath(assetPath).replace(/^\//, '');
  if (!cleaned) return null;

  const publicDir = path.join(__dirname, '..', '..', 'public');
  return path.join(publicDir, cleaned);
}

async function tryReadLogoDataUrl(logoPath) {
  try {
    const diskPath = getLogoDiskPath(logoPath);
    if (!diskPath) return '';

    const buf = await fs.readFile(diskPath);
    const ext = path.extname(diskPath).toLowerCase();
    const mime = ext === '.svg'
      ? 'image/svg+xml'
      : ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.webp'
          ? 'image/webp'
          : 'image/png';

    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return '';
  }
}

async function tryReadAssetDataUrl(assetPath) {
  try {
    const diskPath = getAssetDiskPath(assetPath);
    if (!diskPath) return '';

    const buf = await fs.readFile(diskPath);
    const ext = path.extname(diskPath).toLowerCase();
    const mime = ext === '.svg'
      ? 'image/svg+xml'
      : ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.webp'
          ? 'image/webp'
          : 'image/png';

    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return '';
  }
}

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
    logoDataUrl: '',
    stationeryPath: String(parsed.stationeryPath ?? ''),
    stationeryDataUrl: '',
    headerImagePath: String(parsed.headerImagePath ?? ''),
    headerImageDataUrl: '',
    footerImagePath: String(parsed.footerImagePath ?? ''),
    footerImageDataUrl: '',
    footerLines: Array.isArray(parsed.footerLines) ? parsed.footerLines.map(String) : [],
  };

  cached.logoDataUrl = await tryReadLogoDataUrl(cached.logoPath);
  cached.stationeryDataUrl = await tryReadAssetDataUrl(cached.stationeryPath);
  cached.headerImageDataUrl = await tryReadAssetDataUrl(cached.headerImagePath);
  cached.footerImageDataUrl = await tryReadAssetDataUrl(cached.footerImagePath);

  return cached;
}

module.exports = { getKopConfig };
