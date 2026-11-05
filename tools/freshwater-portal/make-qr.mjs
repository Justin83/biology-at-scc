#!/usr/bin/env node
// Writes research/freshwater/assets/qr-submit.svg: a QR code for the student observation
// form, made with the same vendored library (qrcode-generator 1.4.4, MIT) that the faculty
// review page uses for class QR codes. The URL comes from assets/fieldobs.js (submitUrl).
//   node tools/freshwater-portal/make-qr.mjs          (write)
//   node tools/freshwater-portal/make-qr.mjs --check  (exit 1 if the file is out of date)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ASSETS = path.join(ROOT, "research/freshwater/assets");
const require = createRequire(import.meta.url);
const qrcode = require(path.join(ASSETS, "vendor/qrcode-generator/qrcode.js"));

const cfg = fs.readFileSync(path.join(ASSETS, "fieldobs.js"), "utf8");
const url = (cfg.match(/submitUrl:\s*"([^"]+)"/) || [])[1];
if (!url) throw new Error("submitUrl not found in assets/fieldobs.js");

export function qrSvg(text, title) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount(), m = 4, size = n + 2 * m;
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
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * 8}" height="${size * 8}" shape-rendering="crispEdges" role="img" aria-label="${title}"><title>${title}</title><rect width="${size}" height="${size}" fill="#fff"/><path fill="#000" d="${d}"/></svg>\n`;
}

const out = path.join(ASSETS, "qr-submit.svg");
const svg = qrSvg(url, `QR code: ${url}`);
if (process.argv.includes("--check")) {
  const old = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
  if (old !== svg) { console.error("research/freshwater/assets/qr-submit.svg is out of date — run tools/freshwater-portal/make-qr.mjs"); process.exit(1); }
  console.log("qr-submit.svg matches " + url);
} else {
  fs.writeFileSync(out, svg);
  console.log("wrote " + path.relative(ROOT, out) + " for " + url);
}
