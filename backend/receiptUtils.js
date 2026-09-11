const { createHash } = require('crypto');
const MAX_FILE = 10 * 1024 * 1024;
const MAX_TOTAL = 32 * 1024 * 1024;
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
function validateReceipt(row) {
  if (!row || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 180 || /[\x00-\x1f/\\]/.test(row.name)) fail('Ungültiger Belegname.');
  if (typeof row.data !== 'string' || row.data.length > Math.ceil(MAX_FILE / 3) * 4) fail('Ein Beleg darf höchstens 10 MB groß sein.');
  const bytes = Buffer.from(row.data, 'base64');
  if (!bytes.length || bytes.length > MAX_FILE || bytes.toString('base64') !== row.data) fail('Ungültige oder zu große Belegdatei.');
  let type;
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) type = 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) type = 'image/png';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') type = 'image/webp';
  if (bytes.subarray(0, 5).toString() === '%PDF-') type = 'application/pdf';
  if (!type || type !== row.type) fail('Bitte ein JPEG-, PNG-, WebP-Foto oder eine PDF-Datei wählen.');
  return { name: row.name.trim(), type, data: row.data, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
module.exports = { MAX_FILE, MAX_TOTAL, validateReceipt };
