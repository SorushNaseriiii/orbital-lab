import { open, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(root, 'dist', 'assets');

function jpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
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
    if (sof.has(marker) && segmentLength >= 7) {
      return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
    }
    offset += segmentLength;
  }
  return null;
}

async function inspect(name, minimumBytes) {
  const file = path.join(assetsDir, name);
  let info;
  try { info = await stat(file); }
  catch { throw new Error(`Missing ${name} in dist/assets. The NASA asset download did not complete.`); }
  if (info.size < minimumBytes) throw new Error(`${name} is too small (${info.size} bytes).`);
  const handle = await open(file, 'r');
  let header;
  try {
    header = Buffer.alloc(2 * 1024 * 1024);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    header = header.subarray(0, bytesRead);
  } finally { await handle.close(); }
  const dimensions = jpegDimensions(header);
  if (!dimensions || dimensions.height < 512 || dimensions.width < 1024 || Math.abs(dimensions.width / dimensions.height - 2) > 0.12) {
    throw new Error(`${name} is not a valid 2:1 equirectangular JPEG.`);
  }
  console.log(`[ORBITAL LAB] Verified ${name}: ${dimensions.width}×${dimensions.height}, ${(info.size / 1024 / 1024).toFixed(2)} MB.`);
}

await inspect('earth-blue-marble.jpg', 500_000);
await inspect('earth-night-lights.jpg', 250_000);
console.log('[ORBITAL LAB] Both Earth maps are present in the static deployment output.');
