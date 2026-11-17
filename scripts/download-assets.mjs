import { mkdir, writeFile, stat, rm, open, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'public', 'assets');
const force = process.argv.includes('--force');

function readJpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset++; continue; }
    let marker = bytes[offset + 1];
    offset += 2;
    while (marker === 0xff && offset < bytes.length) marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    if (startOfFrame.has(marker) && segmentLength >= 7) {
      return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
    }
    offset += segmentLength;
  }
  return null;
}

function isEquirectangularJpeg(bytes) {
  const dimensions = readJpegDimensions(bytes);
  if (!dimensions) return false;
  const { width, height } = dimensions;
  return width >= 1024 && height >= 512 && Math.abs(width / height - 2) <= 0.12;
}

async function readHeader(filePath) {
  const handle = await open(filePath, 'r');
  try {
    const header = Buffer.alloc(2 * 1024 * 1024);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    return header.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function isValidLocal(filePath, minBytes) {
  try {
    const info = await stat(filePath);
    if (info.size < minBytes) return false;
    return isEquirectangularJpeg(await readHeader(filePath));
  } catch {
    return false;
  }
}

async function ensureMap({ name, destination, marker, failedMarker, minBytes, localCandidates, candidates, attribution }) {
  if (!force && await isValidLocal(destination, minBytes)) {
    const info = await stat(destination);
    console.log(`[ORBITAL LAB] Valid ${name} map found (${(info.size / 1024 / 1024).toFixed(1)} MB); keeping it.`);
    return true;
  }

  if (force) await rm(destination, { force: true });
  else if (await stat(destination).then(() => true).catch(() => false)) {
    console.warn(`[ORBITAL LAB] Existing ${name} map is incomplete or not a valid 2:1 equirectangular JPEG; replacing it.`);
    await rm(destination, { force: true });
  }

  if (!force) {
    for (const localPath of localCandidates) {
      if (path.resolve(localPath) === path.resolve(destination)) continue;
      if (!await isValidLocal(localPath, minBytes)) continue;
      await copyFile(localPath, destination);
      await writeFile(marker, `Copied from ${localPath}\n${attribution}\n`);
      await rm(failedMarker, { force: true });
      console.log(`[ORBITAL LAB] Reused existing ${name} map from ${localPath}.`);
      return true;
    }
  }

  let lastError;
  for (const candidate of candidates) {
    console.log(`[ORBITAL LAB] Downloading ${candidate.label}...`);
    try {
      const response = await fetch(candidate.url, {
        signal: AbortSignal.timeout(30_000),
        headers: { 'User-Agent': 'ORBITAL-LAB educational orbital visualization' }
      });
      if (!response.ok) throw new Error(`NASA server returned HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < candidate.minBytes || !isEquirectangularJpeg(bytes)) {
        throw new Error(`Unexpected image payload or non-equirectangular JPEG (${bytes.length} bytes).`);
      }
      await writeFile(destination, bytes);
      await writeFile(marker, `${candidate.label}\n${candidate.url}\n${attribution}\n`);
      await rm(failedMarker, { force: true });
      console.log(`[ORBITAL LAB] Installed ${name} map (${(bytes.length / 1024 / 1024).toFixed(1)} MB).`);
      return true;
    } catch (error) {
      lastError = error;
      console.warn(`[ORBITAL LAB] Could not fetch ${candidate.label}: ${error.message}`);
    }
  }

  await writeFile(failedMarker, `Last attempt: ${new Date().toISOString()}\n${lastError?.message || 'unknown error'}\nRun npm run assets:force while online to retry.\n`);
  console.warn(`[ORBITAL LAB] ${name} map is not available. Add a valid 2:1 JPEG to ${path.relative(root, destination)} or retry while online.`);
  return false;
}

await mkdir(directory, { recursive: true });

const dayDestination = path.join(directory, 'earth-blue-marble.jpg');
const nightDestination = path.join(directory, 'earth-night-lights.jpg');

await ensureMap({
  name: 'NASA Blue Marble daytime Earth',
  destination: dayDestination,
  marker: path.join(directory, 'earth-blue-marble-source.txt'),
  failedMarker: path.join(directory, 'earth-texture-download-failed.txt'),
  minBytes: 500_000,
  localCandidates: [path.join(root, 'earth-blue-marble.jpg'), path.join(root, 'assets', 'earth-blue-marble.jpg'), path.join(root, 'public', 'earth-blue-marble.jpg')],
  candidates: [
    {
      label: 'NASA Blue Marble Next Generation · July · 2 km/pixel',
      url: 'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/july/world.200407.3x21600x10800.jpg',
      minBytes: 10_000_000
    },
    {
      label: 'NASA Blue Marble Next Generation · July · 8 km/pixel',
      url: 'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/july/world.200407.3x5400x2700.jpg',
      minBytes: 500_000
    }
  ],
  attribution: 'NASA Earth Observatory; Blue Marble: Next Generation, produced by Reto Stöckli, NASA Goddard Space Flight Center.'
});

await ensureMap({
  name: 'NASA Black Marble night-lights',
  destination: nightDestination,
  marker: path.join(directory, 'earth-night-lights-source.txt'),
  failedMarker: path.join(directory, 'earth-night-lights-download-failed.txt'),
  minBytes: 250_000,
  localCandidates: [path.join(root, 'earth-night-lights.jpg'), path.join(root, 'assets', 'earth-night-lights.jpg'), path.join(root, 'public', 'earth-night-lights.jpg')],
  candidates: [
    {
      label: 'NASA Black Marble 2016 · global · 0.1 degree · 3600×1800',
      url: 'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_01deg.jpg',
      minBytes: 250_000
    }
  ],
  attribution: 'NASA Earth Observatory images by Joshua Stevens, using Suomi NPP VIIRS data from Miguel Román, NASA GSFC; Black Marble 2016 global color map.'
});
