// Generate Android app icons from SquadHQ's existing brand logo.
// Uses only built-in Node.js modules; no additional dependencies.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const publicDir = path.resolve(__dirname, '..', 'public');
const sourcePath = path.join(publicDir, 'brand', 'squadhq-logo.png');
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function decodePng(file) {
  const png = fs.readFileSync(file);
  if (!png.subarray(0, 8).equals(signature)) throw new Error('Invalid PNG signature');
  let width, height, depth, type, interlace;
  const idats = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const kind = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
      interlace = data[12];
    } else if (kind === 'IDAT') {
      idats.push(data);
    } else if (kind === 'IEND') break;
    offset += length + 12;
  }
  if (depth !== 8 || interlace !== 0 || ![2, 6].includes(type)) {
    throw new Error('Expected non-interlaced 8-bit RGB or RGBA PNG');
  }
  const channels = type === 2 ? 3 : 4;
  const stride = width * channels;
  const compressed = zlib.inflateSync(Buffer.concat(idats));
  if (compressed.length !== (stride + 1) * height) throw new Error('Invalid PNG image data');
  const pixels = Buffer.alloc(stride * height);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filter = compressed[rowStart];
    const current = pixels.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? current[x - channels] : 0;
      const above = previous[x];
      const upperLeft = x >= channels ? previous[x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) {
        const p = left + above - upperLeft;
        const a = Math.abs(p - left), b = Math.abs(p - above), c = Math.abs(p - upperLeft);
        predictor = a <= b && a <= c ? left : b <= c ? above : upperLeft;
      } else if (filter !== 0) throw new Error('Unsupported PNG filter: ' + filter);
      current[x] = (compressed[rowStart + 1 + x] + predictor) & 255;
    }
    previous = current;
  }
  return { width, height, channels, pixels };
}

const crcTable = Array.from({ length: 256 }, (_, i) => {
  let crc = i;
  for (let j = 0; j < 8; j++) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : crc >>> 1;
  return crc >>> 0;
});
function pngChunk(name, bytes) {
  const tag = Buffer.from(name, 'ascii');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(bytes.length);
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([tag, bytes])) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([header, tag, bytes, tail]);
}

function resizeAndEncode(source, size) {
  const { width, height, channels, pixels } = source;
  const rowBytes = size * 4;
  const raw = Buffer.alloc((rowBytes + 1) * size);
  const get = (x, y, channel) => {
    if (channel === 3 && channels === 3) return 255;
    return pixels[(y * width + x) * channels + channel];
  };
  for (let y = 0; y < size; y++) {
    const fy = Math.max(0, Math.min(height - 1, (y + 0.5) * height / size - 0.5));
    const y0 = Math.floor(fy), y1 = Math.min(height - 1, y0 + 1), dy = fy - y0;
    for (let x = 0; x < size; x++) {
      const fx = Math.max(0, Math.min(width - 1, (x + 0.5) * width / size - 0.5));
      const x0 = Math.floor(fx), x1 = Math.min(width - 1, x0 + 1), dx = fx - x0;
      const outOffset = y * (rowBytes + 1) + 1 + x * 4;
      for (let channel = 0; channel < 4; channel++) {
        const upper = get(x0, y0, channel) * (1 - dx) + get(x1, y0, channel) * dx;
        const lower = get(x0, y1, channel) * (1 - dx) + get(x1, y1, channel) * dx;
        raw[outOffset + channel] = Math.round(upper * (1 - dy) + lower * dy);
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const original = decodePng(sourcePath);
const iconDir = path.join(publicDir, 'icons');
fs.mkdirSync(iconDir, { recursive: true });
for (const size of [192, 512]) {
  const target = path.join(iconDir, 'squadhq-' + size + '.png');
  fs.writeFileSync(target, resizeAndEncode(original, size));
  console.log('Generated ' + target);
}
