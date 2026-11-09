#!/usr/bin/env node
// Writes the club's one QR code from homeUrl in msclub/assets/club.js:
//   msclub/assets/qr-club.svg -> club website (people go to the food sign-up from there)
// Uses the vendored qrcode-generator 1.4.4 (MIT) in research/freshwater/assets/vendor/.
//   node tools/math-science-club/make-qr.mjs          (write)
//   node tools/math-science-club/make-qr.mjs --check  (exit 1 if a file is out of date)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const qrcode = require(path.join(ROOT, "research/freshwater/assets/vendor/qrcode-generator/qrcode.js"));
const cfg = fs.readFileSync(path.join(ROOT, "msclub/assets/club.js"), "utf8");
const url = (k) => { const m = cfg.match(new RegExp(k + ':\\s*"([^"]+)"')); if (!m) throw new Error(k + " not found in club.js"); return m[1]; };

function qrSvg(text, title) {
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

let stale = false;
for (const [file, key] of [["qr-club.svg", "homeUrl"]]) {
  const out = path.join(ROOT, "msclub/assets", file);
  const svg = qrSvg(url(key), `QR code: ${url(key)}`);
  if (process.argv.includes("--check")) {
    const old = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
    if (old !== svg) { console.error(`msclub/assets/${file} is out of date`); stale = true; }
    else console.log(`${file} matches ${url(key)}`);
  } else {
    fs.writeFileSync(out, svg);
    console.log(`wrote msclub/assets/${file} for ${url(key)}`);
  }
}
if (stale) process.exit(1);
