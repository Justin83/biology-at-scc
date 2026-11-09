#!/usr/bin/env node
// Writes the BIO 151 live-lab QR codes from STUDENT_FORM_URL in labs/bio151-spectro/config.js:
//   labs/bio151-spectro/qr-student-form.svg   (dashboard "Show QR for students")
//   docs/bio151-live-lab/qr-student-form.png  (handouts; same URL as qr-latex-snippet.tex)
// Uses the vendored qrcode-generator 1.4.4 (MIT) in research/freshwater/assets/vendor/.
//   node tools/bio151-live-lab/make-qr.mjs          (write)
//   node tools/bio151-live-lab/make-qr.mjs --check  (exit 1 if a file is out of date)
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const qrcode = require(path.join(ROOT, "research/freshwater/assets/vendor/qrcode-generator/qrcode.js"));
const cfg = fs.readFileSync(path.join(ROOT, "labs/bio151-spectro/config.js"), "utf8");
const url = (cfg.match(/STUDENT_FORM_URL:\s*"([^"]+)"/) || [])[1];
if (!url) throw new Error("STUDENT_FORM_URL not found in labs/bio151-spectro/config.js");

const qr = qrcode(0, "M");
qr.addData(url);
qr.make();
const n = qr.getModuleCount(), m = 4, size = n + 2 * m;

// SVG: one rectangle per run of dark modules
let d = "";
for (let r = 0; r < n; r++) {
  for (let c = 0; c < n; c++) {
    if (!qr.isDark(r, c)) continue;
    let w = 1;
    while (c + w < n && qr.isDark(r, c + w)) w++;
    d += `M${c + m} ${r + m}h${w}v1h-${w}z`;
    c += w - 1;
  }
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="512" height="512" shape-rendering="crispEdges" role="img" aria-label="QR code: ${url}"><title>QR code: ${url}</title><rect width="${size}" height="${size}" fill="#fff"/><path fill="#000" d="${d}"/></svg>\n`;

// PNG: 8-bit grayscale, about 600 px square
const scale = Math.floor(600 / size), px = size * scale;
const raw = Buffer.alloc((px + 1) * px, 255);
for (let y = 0; y < px; y++) {
  raw[y * (px + 1)] = 0; // filter: none
  const r = Math.floor(y / scale) - m;
  for (let x = 0; x < px; x++) {
    const c = Math.floor(x / scale) - m;
    if (r >= 0 && r < n && c >= 0 && c < n && qr.isDark(r, c)) raw[y * (px + 1) + 1 + x] = 0;
  }
}
const crcTable = Array.from({ length: 256 }, (_, k) => { let c = k; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(px, 0); ihdr.writeUInt32BE(px, 4); ihdr[8] = 8; ihdr[9] = 0; // 8-bit grayscale
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);

let stale = false;
for (const [rel, data] of [["labs/bio151-spectro/qr-student-form.svg", Buffer.from(svg)], ["docs/bio151-live-lab/qr-student-form.png", png]]) {
  const out = path.join(ROOT, rel);
  if (process.argv.includes("--check")) {
    const old = fs.existsSync(out) ? fs.readFileSync(out) : Buffer.alloc(0);
    if (!old.equals(data)) { console.error(`${rel} is out of date`); stale = true; }
    else console.log(`${rel} matches ${url}`);
  } else {
    fs.writeFileSync(out, data);
    console.log(`wrote ${rel} for ${url}`);
  }
}
if (stale) process.exit(1);
