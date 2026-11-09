#!/usr/bin/env node
// Checks the club pages (msclub/**/index.html): one <h1>, <title>, meta
// description, <main id="main">, unique ids, alt text, local links and anchors that
// resolve, external links that open in a new tab, the schedule data, and the QR code.
//   node tools/msclub/check.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CLUB = path.join(ROOT, "msclub");
const problems = [];
const warn = (m) => problems.push(m);
const rel = (f) => path.relative(ROOT, f);

const pages = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) walk(path.join(d, e.name));
    else if (e.name === "index.html") pages.push(path.join(d, e.name));
  }
})(CLUB);

for (const file of pages) {
  const html = fs.readFileSync(file, "utf8"), r = rel(file);
  if ((html.match(/<h1[\s>]/g) || []).length !== 1) warn(`${r}: must have exactly one <h1>`);
  if (!/<title>[^<]+<\/title>/.test(html)) warn(`${r}: missing <title>`);
  if (!/<meta name="description" content="[^"]+"/.test(html)) warn(`${r}: missing meta description`);
  if (!/<main id="main"/.test(html)) warn(`${r}: missing <main id="main">`);
  for (const m of html.matchAll(/<a\b[^>]*\bhref="https?:\/\/[^"]*"[^>]*>/g)) if (!/\btarget="_blank"/.test(m[0])) warn(`${r}: external link without target="_blank"`);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dup.length) warn(`${r}: duplicate id(s) ${[...new Set(dup)].join(", ")}`);
  for (const m of html.matchAll(/<img\s[^>]*>/g)) if (!/\salt="/.test(m[0])) warn(`${r}: <img> without alt`);
  for (const m of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const u = m[1];
    if (/^(https?:|mailto:|data:|javascript:)/.test(u)) continue;
    const [p, hash] = u.split("#");
    if (!p) { if (hash && !ids.includes(hash)) warn(`${r}: in-page link to missing id #${hash}`); continue; }
    let target = path.resolve(path.dirname(file), p.split("?")[0]);
    if (p.endsWith("/") || (fs.existsSync(target) && fs.statSync(target).isDirectory())) target = path.join(target, "index.html");
    if (!fs.existsSync(target)) { warn(`${r}: broken link ${u}`); continue; }
    if (hash && target.endsWith(".html") && !fs.readFileSync(target, "utf8").includes(`id="${hash}"`)) warn(`${r}: link ${u} points to a missing anchor`);
  }
}

// schedule data
const KINDS = ["meeting", "social", "astronomy", "campus-tour", "conference", "competition", "event", "graduation"];
const ev = JSON.parse(fs.readFileSync(path.join(CLUB, "data/events.json"), "utf8")).events;
for (const e of ev) {
  if (!/^\d{4}-\d\d-\d\d$/.test(e.starts_on)) warn(`events.json: ${e.id} bad starts_on`);
  if (!KINDS.includes(e.kind)) warn(`events.json: ${e.id} unknown kind ${e.kind}`);
  if (!e.title) warn(`events.json: ${e.id} missing title`);
}

// the QR code matches homeUrl in club.js
try { execFileSync(process.execPath, [path.join(ROOT, "tools/msclub/make-qr.mjs"), "--check"], { stdio: "pipe" }); }
catch (e) { warn(String(e.stderr || e.message).trim()); }

if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log(`msclub: ${pages.length} pages OK, ${ev.length} events, QR code current`);
