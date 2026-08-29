// 生成 PWA 图标（public/pwa-192x192.png、public/pwa-512x512.png）
// 深色底 + 白色上升柱状图 + 青色数据点，无需任何第三方依赖
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { Buffer } from 'node:buffer';

function crc32(buf) {
  if (!crc32.table) {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    crc32.table = table;
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crc32.table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makeIcon(size) {
  const s = size / 512;
  const bars = [
    [128, 320, 64, 64],
    [224, 256, 64, 128],
    [320, 192, 64, 192]
  ];
  const dots = [
    [160, 288],
    [256, 224],
    [352, 160]
  ];

  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const fx = x / s;
      const fy = y / s;
      let r = 17, g = 24, b = 39;

      for (const [bx, by, bw, bh] of bars) {
        if (fx >= bx && fx < bx + bw && fy >= by && fy < by + bh) {
          r = g = b = 255;
        }
      }
      for (const [cx, cy] of dots) {
        const dx = fx - cx;
        const dy = fy - cy;
        if (dx * dx + dy * dy <= 14 * 14) {
          r = 34; g = 211; b = 238;
        }
      }

      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

mkdirSync('public', { recursive: true });
writeFileSync('public/pwa-192x192.png', makeIcon(192));
writeFileSync('public/pwa-512x512.png', makeIcon(512));
console.log('PWA icons generated: public/pwa-192x192.png, public/pwa-512x512.png');
