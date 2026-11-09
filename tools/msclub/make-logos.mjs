#!/usr/bin/env node
// Vector versions of the Math & Science Club logos, recolored for this site.
//   1. shield-green.svg: the club's shield logo (gold shield, six colored icons, "KCTCS
//      SOMERSET / MATH & SCIENCE CLUB") on the site's deep green instead of navy.
//   2. seal-green.svg: the club's circular seal (gold ring, ring text, four white
//      icons) on the same green.
//   3. seal-combined.svg: a variation that combines both: the shield and its colored
//      icons inside the seal, with right-side-up text on the lower arc.
// The originals were shared as screenshots, so these are redrawn by hand, not traced:
// colors are kept (gold, icon colors, white), shapes and lettering are close matches.
// Lettering is converted to outlines so the logos look the same on every device.
// Fonts (SIL Open Font License): Bebas Neue, Josefin Sans, Cinzel (via @fontsource).
//
//   npm install --no-save opentype.js@1.3.4 @fontsource/bebas-neue@5.1.0 \
//     @fontsource/josefin-sans@5.1.0 @fontsource/cinzel@5.1.0     (once; not site dependencies)
//   node tools/msclub/make-logos.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const opentype = require("opentype.js");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "msclub/assets/logos");
const font = (pkg, file) => opentype.loadSync(require.resolve(`@fontsource/${pkg}/files/${file}`));
const BEBAS = font("bebas-neue", "bebas-neue-latin-400-normal.woff");
const JOSEFIN = font("josefin-sans", "josefin-sans-latin-400-normal.woff");
const CINZEL = font("cinzel", "cinzel-latin-600-normal.woff");

// Colors: gold and icon colors as in the originals; the background is the site's green
// (a deep shade of the site accent #2e6b3e) in place of navy.
const C = {
  bg: "#1a3d27", goldShield: "#da9a1e", goldSeal: "#e3b231", white: "#ffffff",
  flask: "#d4d8dc", liquid: "#4cc0e0", sprout: "#3cb54f", planet: "#e8392f", atom: "#86d6f2", crystal: "#cfd3d6"
};

const r2 = (n) => Math.round(n * 100) / 100;
// lay out text as glyph outlines; returns { d, width } for a baseline at (x, y)
function text(f, str, size, x, y, spacing = 0) {
  const glyphs = f.stringToGlyphs(str), scale = size / f.unitsPerEm;
  let cx = 0; const parts = [];
  glyphs.forEach((g, i) => {
    parts.push({ g, x: cx });
    cx += g.advanceWidth * scale + spacing;
    if (i < glyphs.length - 1) cx += f.getKerningValue(g, glyphs[i + 1]) * scale;
  });
  const width = cx - spacing;
  return { width, d: (ox) => parts.map((p) => p.g.getPath(ox + p.x, y, size).toPathData(2)).join("") };
}
function centered(f, str, size, cx, y, spacing = 0) { const t = text(f, str, size, 0, y, spacing); return t.d(cx - t.width / 2); }
function fit(f, str, width, spacing = 0) { return width / text(f, str, 1, 0, 0, spacing).width; }

// text around a circle. dir "out": tops point outward, read clockwise; "in": tops point
// inward, read left to right along the bottom. centerDeg: screen angle of the text's middle.
function ring(f, str, size, cx, cy, radius, centerDeg, dir, spacing = 0, fill) {
  const scale = size / f.unitsPerEm, glyphs = f.stringToGlyphs(str);
  const adv = glyphs.map((g, i) => g.advanceWidth * scale + spacing + (i < glyphs.length - 1 ? f.getKerningValue(g, glyphs[i + 1]) * scale : 0));
  const total = adv.reduce((a, b) => a + b, 0) - spacing;
  const rText = dir === "out" ? radius + size * 0.35 : radius - size * 0.35; // arc spacing measured mid-letter
  let s = -total / 2, out = "";
  glyphs.forEach((g, i) => {
    const w = g.advanceWidth * scale, mid = s + w / 2;
    const a = dir === "out" ? centerDeg + (mid / rText) * 180 / Math.PI : centerDeg - (mid / rText) * 180 / Math.PI;
    const rad = a * Math.PI / 180, px = cx + radius * Math.cos(rad), py = cy + radius * Math.sin(rad);
    const rot = dir === "out" ? a + 90 : a - 90;
    out += `<path transform="translate(${r2(px)} ${r2(py)}) rotate(${r2(rot)})" d="${g.getPath(-w / 2, 0, size).toPathData(2)}"${fill ? ` fill="${fill}"` : ""}/>`;
    s += adv[i];
  });
  return { svg: out, arcDeg: (total / rText) * 180 / Math.PI };
}

// rounded polygon path
function rounded(pts, rad) {
  let d = "";
  pts.forEach((p, i) => {
    const prev = pts[(i - 1 + pts.length) % pts.length], next = pts[(i + 1) % pts.length];
    const v1 = [prev[0] - p[0], prev[1] - p[1]], v2 = [next[0] - p[0], next[1] - p[1]];
    const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2), r = Math.min(rad, l1 / 2, l2 / 2);
    const a = [p[0] + v1[0] / l1 * r, p[1] + v1[1] / l1 * r], b = [p[0] + v2[0] / l2 * r, p[1] + v2[1] / l2 * r];
    d += (i === 0 ? "M" : "L") + r2(a[0]) + " " + r2(a[1]) + "Q" + p[0] + " " + p[1] + " " + r2(b[0]) + " " + r2(b[1]);
  });
  return d + "Z";
}
const SHIELD = [[500, 160], [790, 238], [790, 640], [500, 838], [210, 640], [210, 238]]; // in a 1000 box

// ---------------------------------------------------------------- icons (100 x 100 boxes)
const icon = {
  flask: `<g fill="none" stroke="${C.flask}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M36 8H64"/><path d="M42 9V38L17 82Q13 91 24 91H76Q87 91 83 82L58 38V9"/></g>` +
    `<path d="M30 60H70L80 82Q82 86 77 86H23Q18 86 20 82Z" fill="${C.liquid}"/><circle cx="54" cy="73" r="3.5" fill="${C.bg}"/>`,
  sprout: `<g fill="none" stroke="${C.sprout}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"><path d="M50 84V40"/>` +
    `<path d="M50 64C36 64 27 55 27 43C40 43 50 51 50 64Z"/><path d="M50 54C50 40 59 31 73 31C73 44 64 54 50 54Z"/>` +
    `<path d="M50 40C43 33 43 21 50 12C57 21 57 33 50 40Z"/><path d="M30 90Q40 79 50 85Q60 79 70 90Z"/></g>`,
  integral: `<path d="M64 13C56 6 47 10 46 24L44 76C43 90 34 94 26 87" fill="none" stroke="${C.goldShield}" stroke-width="6" stroke-linecap="round"/>`,
  planet: `<g fill="none" stroke="${C.planet}" stroke-linecap="round"><circle cx="50" cy="50" r="23" stroke-width="9"/>` +
    `<path d="M22 72C6 86 14 94 40 80C60 69 80 52 88 38C96 24 86 20 72 29" stroke-width="6"/></g>`,
  atom: `<g fill="none" stroke="${C.atom}" stroke-width="4.5"><ellipse cx="50" cy="50" rx="42" ry="15"/>` +
    `<ellipse cx="50" cy="50" rx="42" ry="15" transform="rotate(60 50 50)"/><ellipse cx="50" cy="50" rx="42" ry="15" transform="rotate(-60 50 50)"/></g>` +
    `<circle cx="50" cy="50" r="10" fill="${C.atom}"/>`,
  crystal: `<g fill="none" stroke="${C.crystal}" stroke-width="4.5" stroke-linejoin="round"><path d="M40 86V34L52 18L64 34V86Z"/><path d="M40 34H64M52 18V86"/>` +
    `<path d="M22 86V56L30 46L40 54"/><path d="M64 54L74 46L82 56V86"/><path d="M14 88H90"/></g>`,
  // seal icons (white line art, gold nucleus)
  molecule: `<g fill="none" stroke="${C.white}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">` +
    `<path d="M33 38L48 47V65L33 74L18 65V47Z"/><path d="M48 47L64 41L74 56L64 71L48 65"/><path d="M23 50L33 44.5M43 62L33 68"/>` +
    `<path d="M64 41L70 25L86 21"/><path d="M18 65L8 80"/><path d="M64 71L72 86"/></g>`,
  microscope: `<g fill="none" stroke="${C.white}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">` +
    `<path d="M18 90H82"/><path d="M38 90V82H70V90"/><path d="M60 82C80 74 82 46 62 34"/><path d="M30 62H58"/>` +
    `<path d="M36 14L50 9L62 46L48 51Z"/><path d="M44 52L46 60"/><path d="M33 10L38 6L52 4"/></g>`,
  atomWhite: `<g fill="none" stroke="${C.white}" stroke-width="4"><ellipse cx="50" cy="50" rx="42" ry="15"/>` +
    `<ellipse cx="50" cy="50" rx="42" ry="15" transform="rotate(60 50 50)"/><ellipse cx="50" cy="50" rx="42" ry="15" transform="rotate(-60 50 50)"/></g>` +
    `<circle cx="50" cy="50" r="9" fill="${C.goldSeal}"/>`,
  graph: `<g fill="none" stroke="${C.white}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 8V88H92"/>` +
    `<path d="M22 50C32 12 44 12 52 50S74 88 84 50"/></g>`
};
const place = (name, x, y, size) => `<g transform="translate(${r2(x - size / 2)} ${r2(y - size / 2)}) scale(${r2(size / 100)})">${icon[name]}</g>`;
const svg = (box, title, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" width="${box}" height="${box}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;

// ---------------------------------------------------------------- 1. shield
function shieldLogo() {
  let b = `<rect width="1000" height="1000" fill="${C.bg}"/>`;
  b += `<path d="${rounded(SHIELD, 34)}" fill="none" stroke="${C.goldShield}" stroke-width="17" stroke-linejoin="round"/>`;
  b += `<rect x="60" y="476" width="880" height="146" fill="${C.bg}"/>`; // the title breaks the shield sides
  ["flask", "sprout", "integral", "planet", "atom", "crystal"].forEach((n, i) => { b += place(n, 268 + i * 91, 298, 86); });
  const ks = 0.06 * 52;
  b += `<path fill="${C.white}" d="${centered(JOSEFIN, "KCTCS SOMERSET", fit(JOSEFIN, "KCTCS SOMERSET", 530, 0) * 0.97, 500, 445, ks)}"/>`;
  // MATH & SCIENCE, fitted to 780 px wide
  const sz = 150, amp = 52, gap = 22;
  const m = text(BEBAS, "MATH", sz, 0, 605), a = text(BEBAS, "&", amp, 0, 572), sc = text(BEBAS, "SCIENCE", sz, 0, 605);
  const total = m.width + gap + a.width + gap + sc.width, k = 780 / total;
  const m2 = text(BEBAS, "MATH", sz * k, 0, 605), a2 = text(BEBAS, "&", amp * k, 0, 572), s2 = text(BEBAS, "SCIENCE", sz * k, 0, 605);
  let x = 500 - (m2.width + a2.width + s2.width + 2 * gap * k) / 2;
  b += `<path fill="${C.goldShield}" d="${m2.d(x)}${a2.d(x + m2.width + gap * k)}${s2.d(x + m2.width + a2.width + 2 * gap * k)}"/>`;
  b += `<path fill="${C.goldShield}" d="${centered(BEBAS, "CLUB", sz * k * 1.05, 500, 738)}"/>`;
  return svg(1000, "KCTCS Somerset Math and Science Club logo", b);
}

// ---------------------------------------------------------------- 2. seal (as shared, recolored)
function sealLogo() {
  const cx = 200, cy = 200;
  let b = `<rect width="400" height="400" fill="${C.bg}"/><circle cx="${cx}" cy="${cy}" r="170" fill="none" stroke="${C.goldSeal}" stroke-width="3"/>`;
  // one continuous clockwise ring, tops outward: gold club name, then the college in white
  const sz = 21, R = 146, sp = 4.2;
  const gold = "· MATH & SCIENCE CLUB ·", white = " SOMERSET COMMUNITY COLLEGE ";
  const g = ring(CINZEL, gold, sz, cx, cy, R, -90, "out", sp, C.goldSeal);
  const wArc = 360 - g.arcDeg;
  // spread the white part over the rest of the circle
  const wNatural = ring(CINZEL, white, sz, cx, cy, R, 90, "out", sp).arcDeg;
  const extra = ((wArc - wNatural) * Math.PI / 180) * (R + sz * 0.35) / (white.length - 1);
  b += g.svg + ring(CINZEL, white, sz, cx, cy, R, 90, "out", sp + extra, C.white).svg;
  ["molecule", "microscope", "atomWhite", "graph"].forEach((n, i) => { b += place(n, 110 + i * 60, 200, 50); });
  return svg(400, "Math and Science Club, Somerset Community College seal", b);
}

// ---------------------------------------------------------------- 3. seal + shield combined
function combinedLogo() {
  const cx = 200, cy = 200;
  let b = `<rect width="400" height="400" fill="${C.bg}"/>`;
  b += `<circle cx="${cx}" cy="${cy}" r="186" fill="none" stroke="${C.goldSeal}" stroke-width="5"/>`;
  b += `<circle cx="${cx}" cy="${cy}" r="132" fill="none" stroke="${C.goldSeal}" stroke-width="1.6"/>`;
  b += ring(CINZEL, "MATH & SCIENCE CLUB", 25, cx, cy, 147, -90, "out", 2.6, C.goldSeal).svg;
  b += ring(CINZEL, "SOMERSET COMMUNITY COLLEGE", 18.5, cx, cy, 171, 90, "in", 1.4, C.white).svg;
  // gold dots between the two lines of ring text
  for (const a of [180, 0]) { const r = a * Math.PI / 180; b += `<circle cx="${r2(cx + 159 * Math.cos(r))}" cy="${r2(cy + 159 * Math.sin(r))}" r="4" fill="${C.goldSeal}"/>`; }
  // the shield, scaled into the center, holding the six colored icons
  const s = 0.27, ox = cx - 500 * s, oy = cy - 500 * s + 4;
  const pts = SHIELD.map(([x, y]) => [r2(ox + x * s), r2(oy + y * s)]);
  b += `<path d="${rounded(pts, 34 * s)}" fill="none" stroke="${C.goldShield}" stroke-width="5" stroke-linejoin="round"/>`;
  ["flask", "sprout", "integral"].forEach((n, i) => { b += place(n, 156 + i * 44, 170, 36); });
  ["planet", "atom", "crystal"].forEach((n, i) => { b += place(n, 156 + i * 44, 216, 36); });
  return svg(400, "Math and Science Club, Somerset Community College seal with shield", b);
}

fs.mkdirSync(OUT, { recursive: true });
for (const [file, make] of [["shield-green.svg", shieldLogo], ["seal-green.svg", sealLogo], ["seal-combined.svg", combinedLogo]]) {
  fs.writeFileSync(path.join(OUT, file), make());
  console.log("wrote msclub/assets/logos/" + file);
}
