#!/usr/bin/env node
// biologyatscc.com is kept out of search engines for now (Justin's call, 2026-11-16; it may
// go public one day, see "Search engines" in README.md). This check fails if any page would
// let a search engine list it:
//   - every HTML page must carry <meta name="robots" content="noindex, nofollow">;
//   - robots.txt must not block the HTML pages (a blocked page is never read, so its
//     noindex tag is never seen and a page already listed stays listed); it blocks the
//     files that can't carry the tag (PDFs and pictures).
//   node tools/check-noindex.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set([".git", "node_modules"]);
const pages = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".html")) pages.push(p);
  }
})(ROOT);

const problems = [];
for (const file of pages) {
  const head = fs.readFileSync(file, "utf8").split(/<\/head>/i)[0];
  const tag = /<meta\s+name="robots"\s+content="([^"]*)"/i.exec(head);
  if (!tag || !/\bnoindex\b/.test(tag[1])) problems.push(`${path.relative(ROOT, file)}: no <meta name="robots" content="noindex, nofollow"> in <head>`);
}
const robots = fs.existsSync(path.join(ROOT, "robots.txt")) ? fs.readFileSync(path.join(ROOT, "robots.txt"), "utf8") : null;
if (robots === null) problems.push("robots.txt is missing");
else {
  const rules = robots.split("\n").map((l) => l.replace(/#.*/, "").trim()).filter((l) => /^disallow:/i.test(l)).map((l) => l.slice(9).trim());
  if (rules.some((r) => r === "/" || r === "/*" || /\.html|\/\$$/.test(r))) problems.push("robots.txt blocks the HTML pages, so search engines can't see their noindex tag");
  for (const ext of ["pdf", "jpg", "png"]) if (!rules.includes(`/*.${ext}$`)) problems.push(`robots.txt doesn't block .${ext} files`);
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`noindex: ${pages.length} pages tagged, robots.txt blocks PDFs and pictures only`);
}
