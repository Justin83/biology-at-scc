#!/usr/bin/env node
// The Math & Science Club flyer library: the source of every flyer in msclub/flyers/.
//
// Each flyer below is its text plus a design (a function that returns the page's HTML).
// This script renders a flyer to a letter-size PDF and a preview image, and writes
// msclub/flyers/flyers.json, the list the club pages read (the home page's flyer panel on
// computers and the Flyer library in Officer tools).
//
//   node tools/msclub/flyers/make-flyers.mjs              render flyers whose PDF is missing
//   node tools/msclub/flyers/make-flyers.mjs <id> [...]   render these flyers again
//   node tools/msclub/flyers/make-flyers.mjs --all        render every flyer again
//   node tools/msclub/flyers/make-flyers.mjs --check      check flyers.json and the files (no browser)
//
// Needs Playwright with Chromium (NODE_PATH=$(npm root -g) if it's installed globally) and
// the fonts (SIL Open Font License), installed once and not site dependencies:
//   cd tools/msclub && npm install --no-save @fontsource/bebas-neue@5.1.0 @fontsource/josefin-sans@5.1.0
//
// To make a new flyer (for example next year's Thanksgiving dinner): copy last year's entry
// to the END of FLYERS (the list is oldest first), give it a new id, made date, event date
// and text, keep or copy its design, and run this script with the new id. Old flyers stay
// in the list: once their event date passes they move to the archive in Officer tools.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const OUT = path.join(ROOT, "msclub/flyers");
const require = createRequire(path.join(ROOT, "tools/msclub/package.json"));

const URL_TEXT = "biologyatscc.com/msclub"; // printed under the QR code (msclub/assets/qr-club.svg)
const NAVY = "#002c52"; // the club logo's original background

// ---------------------------------------------------------------- the flyers, oldest first
const FLYERS = [
  {
    id: "2026-website",
    design: website,
    made: "2026-11-09",
    event_date: null, // not tied to an event: stays current until it's archived
    title: "The club has a website",
    about: "Announces the club website with its QR code. Made for the acrylic display stand.",
    download: "Math-Science-Club-website-flyer.pdf",
    text: {
      headline: "The club has a website",
      sub: "Everything for the club, in one place.",
      checks: ["Meeting dates and upcoming events", "Event sign-up for meetings, volunteering and trips", "Works on any phone, no account needed"],
      scan: "Scan with your phone's camera, or go to"
    }
  },
  {
    id: "2026-11-19-thanksgiving-dinner",
    design: thanksgiving,
    made: "2026-11-09",
    event_date: "2026-11-19",
    title: "Thanksgiving Dinner",
    about: "Club meeting, Thursday, November 19, 2026, 5:00 PM. Asks members to bring food.",
    download: "Math-Science-Club-Thanksgiving-Dinner-flyer.pdf",
    text: {
      date: "Thursday, November 19, 2026", time: "5:00 PM",
      lede: "Join the club for a Thanksgiving meal before the break. Want to bring food? Pick a dish so we have a little of everything.",
      checks: ["Pick a main dish, side, dessert or drinks", "See who's bringing what"],
      scan: "<strong>Want to bring food?</strong> Scan to open the club website."
    }
  }
];
// To take a flyer off the home page and into the archive before its date, add
// `archived: true` to its entry.

// ---------------------------------------------------------------- shared pieces
const FONT_FILES = {
  "bebas-neue-latin-400-normal.woff2": "@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2",
  "josefin-sans-latin-400-normal.woff2": "@fontsource/josefin-sans/files/josefin-sans-latin-400-normal.woff2",
  "josefin-sans-latin-600-normal.woff2": "@fontsource/josefin-sans/files/josefin-sans-latin-600-normal.woff2",
  "josefin-sans-latin-700-normal.woff2": "@fontsource/josefin-sans/files/josefin-sans-latin-700-normal.woff2"
};
const FONTS = `
  @font-face { font-family: "Bebas Neue"; src: url("bebas-neue-latin-400-normal.woff2") format("woff2"); font-weight: 400; }
  @font-face { font-family: "Josefin Sans"; src: url("josefin-sans-latin-400-normal.woff2") format("woff2"); font-weight: 400; }
  @font-face { font-family: "Josefin Sans"; src: url("josefin-sans-latin-600-normal.woff2") format("woff2"); font-weight: 600; }
  @font-face { font-family: "Josefin Sans"; src: url("josefin-sans-latin-700-normal.woff2") format("woff2"); font-weight: 700; }`;
const check = (color) => `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="${color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// ---------------------------------------------------------------- design: website (navy and gold)
function website(f) {
  const t = f.text;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Math &amp; Science Club website flyer</title>
<style>${FONTS}
  :root {
    --navy: ${NAVY};      /* the original club logo background */
    --navy-ink: #0d2240;
    --gold: #e3b231;      /* seal gold */
    --gold-deep: #da9a1e; /* shield gold */
    --rule: #d9dee5;
  }
  @page { size: 8.5in 11in; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-family: "Josefin Sans", sans-serif; color: var(--navy-ink); }
  .page { width: 8.5in; height: 11in; padding: 0.4in; display: flex; flex-direction: column; }

  .top {
    background: var(--navy); border-radius: 0.28in; color: #fff; text-align: center;
    padding: 0.38in 0.5in 0.4in; position: relative; overflow: hidden;
  }
  .top::after { /* thin gold rule along the bottom of the panel */
    content: ""; position: absolute; left: 0.5in; right: 0.5in; bottom: 0.17in; height: 2px; background: var(--gold); opacity: 0.55;
  }
  .logo { width: 2.55in; height: 2.55in; display: block; margin: 0 auto; }
  .name { font-family: "Bebas Neue", sans-serif; color: var(--gold-deep); font-size: 54pt; line-height: 0.95; letter-spacing: 0.01em; margin: 0.16in 0 0; }
  .college { font-weight: 400; font-size: 14.5pt; letter-spacing: 0.2em; text-transform: uppercase; margin: 0.08in 0 0.06in; color: #fff; }

  .body { flex: 1; display: flex; flex-direction: column; align-items: center; text-align: center; padding-top: 0.3in; }
  .headline { font-weight: 700; font-size: 30pt; line-height: 1.1; color: var(--navy); margin: 0; }
  .sub { font-size: 15pt; margin: 0.1in 0 0; color: #34465e; }

  .row { display: flex; align-items: center; justify-content: center; gap: 0.38in; margin-top: 0.32in; }
  .qr-wrap { border: 5px solid var(--gold); border-radius: 0.2in; padding: 0.06in; background: #fff; }
  .qr { width: 3.25in; height: 3.25in; display: block; }
  .list { list-style: none; margin: 0; padding: 0; text-align: left; }
  .list li { display: flex; align-items: flex-start; gap: 0.14in; font-size: 16pt; line-height: 1.25; margin: 0 0 0.26in; max-width: 2.95in; }
  .list li:last-child { margin-bottom: 0; }
  .dot { flex: none; width: 0.34in; height: 0.34in; border-radius: 50%; background: var(--navy); color: var(--gold); display: flex; align-items: center; justify-content: center; margin-top: -0.04in; }

  .scan { font-weight: 600; font-size: 15pt; margin: 0.32in 0 0; color: var(--navy); }
  .url { font-weight: 700; font-size: 14.5pt; margin: 0.06in 0 0; color: var(--navy); letter-spacing: 0.01em; }
</style>
</head>
<body>
<div class="page">
  <section class="top">
    <img class="logo" src="seal-combined-navy.svg" alt="Math &amp; Science Club, Somerset Community College logo">
    <p class="name">Math &amp; Science Club</p>
    <p class="college">Somerset Community College</p>
  </section>

  <section class="body">
    <h1 class="headline">${t.headline}</h1>
    <p class="sub">${t.sub}</p>

    <div class="row">
      <div class="qr-wrap"><img class="qr" src="qr-club.svg" alt="QR code for the Math &amp; Science Club website"></div>
      <ul class="list">
        ${t.checks.map((c) => `<li><span class="dot">${check("#e3b231")}</span><span>${c}</span></li>`).join("\n        ")}
      </ul>
    </div>

    <p class="scan">${t.scan}</p>
    <p class="url">${URL_TEXT}</p>

  </section>
</div>
</body>
</html>
`;
}

// ---------------------------------------------------------------- shared by the event designs
const EVENT_BASE_CSS = `${FONTS}
  @page { size: 8.5in 11in; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-family: "Josefin Sans", sans-serif; }
  p, h1, ul { margin: 0; }
`;
const EVENT_BODY_CSS = `
  .when { display: inline-flex; align-items: stretch; border-radius: 0.16in; overflow: hidden; }
  .when-date, .when-time { font-weight: 700; font-size: 21pt; padding: 0.13in 0.24in 0.08in; }
  .lede { font-size: 14.5pt; line-height: 1.35; max-width: 6.5in; }
  .row { display: flex; align-items: center; justify-content: center; gap: 0.36in; }
  .qr-wrap { border-radius: 0.2in; padding: 0.06in; background: #fff; }
  .qr { width: 2.95in; height: 2.95in; display: block; }
  .list { list-style: none; padding: 0; text-align: left; }
  .list li { display: flex; align-items: flex-start; gap: 0.14in; font-size: 15.5pt; line-height: 1.25; margin: 0 0 0.24in; max-width: 3.05in; }
  .list li:last-child { margin-bottom: 0; }
  .dot { flex: none; width: 0.34in; height: 0.34in; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-top: -0.04in; }
  .scan { font-size: 15pt; } .scan strong { font-weight: 700; }
  .url { font-weight: 700; font-size: 13.5pt; margin-top: 0.05in; }
  .deco { position: absolute; display: block; pointer-events: none; }
  .frame > *, .body > * { flex-shrink: 0; }
`;
function eventBody(t, checkColor) {
  return `
    <div class="when"><span class="when-date">${t.date}</span><span class="when-time">${t.time}</span></div>
    <p class="lede">${t.lede}</p>
    <div class="row">
      <div class="qr-wrap"><img class="qr" src="qr-club.svg" alt="QR code for the Math &amp; Science Club website"></div>
      <ul class="list">${t.checks.map((c) => `<li><span class="dot">${check(checkColor)}</span><span>${c}</span></li>`).join("")}</ul>
    </div>
    <p class="scan">${t.scan}</p>
    <p class="url">${URL_TEXT}</p>`;
}

// leaves for the autumn design: a maple leaf and a pointed leaf, each in a 100 x 100 box
const MAPLE = "M50 2L58 22L70 13L67 34L88 27L82 44L98 50L80 58L86 73L64 66L57 84L52 70L52 98L48 98L48 70L43 84L36 66L14 73L20 58L2 50L18 44L12 27L33 34L30 13L42 22Z";
const LEAF = "M50 4C78 22 84 62 50 96C16 62 22 22 50 4Z";
function leaf(n, kind, x, y, size, rot, fill, opacity = 1) {
  const vein = kind === "maple"
    ? `<path d="M50 96V30M50 60L28 40M50 60L72 40M50 74L26 64M50 74L74 64" stroke="rgba(0,0,0,0.22)" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
    : `<path d="M50 92V14M50 40L36 30M50 56L34 44M50 40L64 30M50 56L66 44M50 72L38 62M50 72L62 62" stroke="rgba(0,0,0,0.22)" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  const id = "lf" + n, shape = kind === "maple" ? MAPLE : LEAF;
  return `<svg class="deco" style="left:${x}in;top:${y}in;width:${size}in;height:${size}in;transform:rotate(${rot}deg);opacity:${opacity}" viewBox="0 0 100 100" aria-hidden="true"><defs><clipPath id="${id}"><path d="${shape}"/></clipPath></defs><path d="${shape}" fill="${fill}"/><g clip-path="url(#${id})">${vein}</g></svg>`;
}

// ---------------------------------------------------------------- design: thanksgiving (cream, cranberry, pumpkin, leaves)
function thanksgiving(f) {
  const t = f.text;
  const c = { cream: "#fbf4e6", cranberry: "#8a1f2d", pumpkin: "#c8601b", gold: "#e0a526", brown: "#5b3a24", olive: "#7d7a2e", rust: "#a8431c" };
  const L = [
    // top-left cluster
    ["maple", -0.28, -0.3, 1.25, -22, c.rust], ["leaf", 0.72, -0.34, 0.85, 48, c.gold], ["maple", -0.3, 0.78, 0.8, 18, c.pumpkin],
    // top-right cluster
    ["maple", 6.48, -0.32, 1.2, 28, c.cranberry], ["leaf", 5.86, -0.3, 0.78, -42, c.olive], ["maple", 6.9, 0.78, 0.82, -14, c.gold],
    // bottom corners, smaller
    ["leaf", -0.26, 9.55, 0.72, 140, c.pumpkin], ["maple", 0.3, 9.86, 0.6, 196, c.gold, 0.9],
    ["maple", 7.0, 9.3, 0.86, 164, c.rust], ["leaf", 6.62, 9.78, 0.62, 214, c.cranberry, 0.9],
    // a few loose leaves
    ["leaf", 0.5, 2.45, 0.36, 30, c.gold, 0.85], ["leaf", 7.0, 2.75, 0.34, -28, c.pumpkin, 0.85]
  ];
  const leaves = L.map((a, i) => leaf(i + 1, ...a)).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${f.title} flyer</title><style>${EVENT_BASE_CSS}${EVENT_BODY_CSS}
  .page { width: 8.5in; height: 11in; padding: 0.32in; }
  .frame { position: relative; overflow: hidden; height: 100%; background: ${c.cream}; border: 3px solid ${c.gold}; border-radius: 0.3in; color: ${c.brown};
           display: flex; flex-direction: column; align-items: center; text-align: center; padding: 0.36in 0.5in 0.3in; }
  .frame::before { content: ""; position: absolute; inset: 0.09in; border: 1.2px solid ${c.gold}; border-radius: 0.24in; opacity: 0.7; pointer-events: none; }
  .logo { width: 1.95in; height: 1.95in; display: block; position: relative; }
  .kicker { font-family: "Bebas Neue", sans-serif; color: ${c.pumpkin}; font-size: 22pt; letter-spacing: 0.14em; margin-top: 0.12in; }
  .title { font-family: "Bebas Neue", sans-serif; color: ${c.cranberry}; font-size: 62pt; line-height: 0.92; margin-top: 0.02in; white-space: nowrap; }
  .subtitle { font-size: 14pt; letter-spacing: 0.18em; text-transform: uppercase; margin-top: 0.1in; color: ${c.brown}; }
  .when { margin-top: 0.3in; border: 3px solid ${c.cranberry}; background: #fff; }
  .when-date { color: ${c.cranberry}; } .when-time { color: #fff; background: ${c.cranberry}; }
  .lede { margin-top: 0.2in; color: ${c.brown}; }
  .row { margin-top: 0.3in; }
  .qr-wrap { border: 5px solid ${c.pumpkin}; }
  .qr { width: 3.15in; height: 3.15in; }
  .list li { color: ${c.brown}; } .dot { background: ${c.cranberry}; }
  .scan { margin-top: 0.3in; color: ${c.cranberry}; } .url { color: ${c.cranberry}; }
  </style></head><body><div class="page"><div class="frame">${leaves}
    <img class="logo" src="seal-round-navy.svg" alt="Math &amp; Science Club, Somerset Community College logo">
    <p class="kicker">Math &amp; Science Club</p>
    <h1 class="title">${f.title}</h1>
    <p class="subtitle">Somerset Community College</p>
    ${eventBody(t, c.gold)}
  </div></div></body></html>`;
}

// ---------------------------------------------------------------- flyers.json
const pdfName = (f) => f.id + ".pdf";
const previewName = (f) => f.id + ".jpg";
function libraryJson() {
  const flyers = FLYERS.map((f) => {
    const o = { id: f.id, title: f.title, about: f.about, made: f.made, event_date: f.event_date, pdf: pdfName(f), preview: previewName(f), download: f.download };
    if (f.archived) o.archived = true;
    return o;
  });
  return JSON.stringify({
    note: "Club flyers, oldest first. Made by tools/msclub/flyers/make-flyers.mjs; do not edit by hand. A flyer with an event_date shows on the club home page (computers) through that date, then moves to the archive in Officer tools.",
    flyers
  }, null, 2) + "\n";
}

function problems() {
  const out = [], ids = new Set();
  const iso = (s) => /^\d{4}-\d\d-\d\d$/.test(s) && !isNaN(Date.parse(s + "T00:00:00Z"));
  FLYERS.forEach((f, i) => {
    if (!/^[a-z0-9-]+$/.test(f.id)) out.push(`${f.id}: id must be lowercase letters, digits and hyphens`);
    if (ids.has(f.id)) out.push(`${f.id}: duplicate id`);
    ids.add(f.id);
    if (!iso(f.made)) out.push(`${f.id}: made must be a date (YYYY-MM-DD)`);
    if (f.event_date !== null && !iso(f.event_date)) out.push(`${f.id}: event_date must be a date or null`);
    if (i && f.made < FLYERS[i - 1].made) out.push(`${f.id}: the list is oldest first; made ${f.made} comes before the flyer above it`);
    if (!/\.pdf$/.test(f.download)) out.push(`${f.id}: download name must end in .pdf`);
    const pdf = path.join(OUT, pdfName(f)), jpg = path.join(OUT, previewName(f));
    if (!fs.existsSync(pdf)) out.push(`${f.id}: missing msclub/flyers/${pdfName(f)} (run make-flyers.mjs)`);
    else if (fs.readFileSync(pdf).subarray(0, 5).toString() !== "%PDF-") out.push(`${f.id}: ${pdfName(f)} is not a PDF`);
    if (!fs.existsSync(jpg)) out.push(`${f.id}: missing msclub/flyers/${previewName(f)} (run make-flyers.mjs)`);
  });
  const jsonFile = path.join(OUT, "flyers.json");
  if (!fs.existsSync(jsonFile) || fs.readFileSync(jsonFile, "utf8") !== libraryJson()) out.push("msclub/flyers/flyers.json is out of date (run make-flyers.mjs)");
  const known = new Set(FLYERS.flatMap((f) => [pdfName(f), previewName(f)]).concat("flyers.json"));
  if (fs.existsSync(OUT)) for (const n of fs.readdirSync(OUT)) if (!known.has(n)) out.push(`msclub/flyers/${n} is not in the flyer list`);
  return out;
}

// ---------------------------------------------------------------- render
async function render(list) {
  const { chromium } = require("playwright");
  const build = fs.mkdtempSync(path.join(os.tmpdir(), "msclub-flyers-"));
  for (const [name, src] of Object.entries(FONT_FILES)) fs.copyFileSync(require.resolve(src), path.join(build, name));
  fs.copyFileSync(path.join(ROOT, "msclub/assets/qr-club.svg"), path.join(build, "qr-club.svg"));
  const seal = fs.readFileSync(path.join(ROOT, "msclub/assets/logos/seal-combined-navy.svg"), "utf8");
  fs.writeFileSync(path.join(build, "seal-combined-navy.svg"), seal);
  // the same seal on a navy circle instead of a navy square, for designs with a light background
  const square = `<rect width="400" height="400" fill="${NAVY}"/>`;
  if (!seal.includes(square)) throw new Error("seal-combined-navy.svg no longer starts with a navy square; update make-flyers.mjs");
  fs.writeFileSync(path.join(build, "seal-round-navy.svg"), seal.replace(square, `<circle cx="200" cy="200" r="198" fill="${NAVY}"/>`));
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  try {
    for (const f of list) {
      const html = path.join(build, f.id + ".html");
      fs.writeFileSync(html, f.design(f));
      // 8.5 x 11 in at 96 px per inch; the preview is 612 x 792 (72 per inch)
      const ctx = await browser.newContext({ viewport: { width: 816, height: 1056 }, deviceScaleFactor: 0.75 });
      const p = await ctx.newPage();
      await p.goto("file://" + html);
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(300);
      const fit = await p.evaluate(() => {
        const pg = document.querySelector(".page");
        return { overflow: pg.scrollHeight - pg.clientHeight, fonts: [...document.fonts].filter((x) => x.status === "error").length };
      });
      if (fit.overflow > 0) throw new Error(`${f.id}: the text runs ${fit.overflow}px past the bottom of the page; shorten it`);
      if (fit.fonts) throw new Error(`${f.id}: ${fit.fonts} font(s) failed to load`);
      await p.pdf({ path: path.join(OUT, pdfName(f)), width: "8.5in", height: "11in", printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
      await p.screenshot({ path: path.join(OUT, previewName(f)), type: "jpeg", quality: 82 });
      await ctx.close();
      console.log(`wrote msclub/flyers/${pdfName(f)} and ${previewName(f)}`);
    }
  } finally {
    await browser.close();
    fs.rmSync(build, { recursive: true, force: true });
  }
}

const args = process.argv.slice(2);
if (args.includes("--check")) {
  const p = problems();
  if (p.length) { console.error(p.join("\n")); process.exit(1); }
  console.log(`flyers: ${FLYERS.length} in the library, files and flyers.json current`);
} else {
  const ids = args.filter((a) => !a.startsWith("--"));
  const unknown = ids.filter((id) => !FLYERS.some((f) => f.id === id));
  if (unknown.length) { console.error(`unknown flyer id(s): ${unknown.join(", ")}`); process.exit(1); }
  const list = args.includes("--all") ? FLYERS
    : ids.length ? FLYERS.filter((f) => ids.includes(f.id))
    : FLYERS.filter((f) => !fs.existsSync(path.join(OUT, pdfName(f))));
  if (list.length) await render(list);
  fs.writeFileSync(path.join(OUT, "flyers.json"), libraryJson());
  console.log("wrote msclub/flyers/flyers.json");
}
