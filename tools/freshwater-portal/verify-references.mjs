#!/usr/bin/env node
// Re-verify every DOI in research/freshwater/data/references.json against Crossref and
// report any record whose title or year no longer matches. Read-only: it never edits
// the bibliography. Use it after adding references, and before citing a new one.
//
//   node tools/freshwater-portal/verify-references.mjs
//
// Uses the system `curl` (honors the machine's proxy and certificates). No dependencies.
// Crossref asks heavy users to identify themselves; this script sends a descriptive
// User-Agent and pauses between requests.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const refs = JSON.parse(fs.readFileSync(path.join(ROOT, "research/freshwater/data/references.json"), "utf8")).records;
const UA = "biology-at-scc-refcheck/1.0 (+https://biologyatscc.com/research/freshwater/standards/)";
const norm = (s) => String(s || "").toLowerCase().replace(/<[^>]+>/g, "").replace(/&(amp;)+/g, "&").replace(/[^a-z0-9]+/g, " ").trim();
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

let bad = 0, ok = 0;
for (const r of refs.filter((x) => x.doi)) {
  let m = null;
  for (let attempt = 0; attempt < 3 && !m; attempt++) {
    try {
      const out = execFileSync("curl", ["-sS", "-f", "--max-time", "60", "-A", UA, "https://api.crossref.org/works/" + encodeURIComponent(r.doi)], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      m = JSON.parse(out).message;
    } catch { sleep(4000); }
  }
  if (!m) { bad++; console.log(`UNRESOLVED  ${r.id}  ${r.doi}`); continue; }
  const year = (m["published-print"] || m["published-online"] || m.issued)["date-parts"][0][0];
  const t1 = norm(r.title), t2 = norm((m.title || [""])[0]);
  const titleOk = t1 === t2 || t2.startsWith(t1.slice(0, 40)) || t1.startsWith(t2.slice(0, 40));
  if (!titleOk || +year !== +r.year) { bad++; console.log(`MISMATCH    ${r.id}  stored: ${r.year} "${r.title.slice(0, 60)}"  crossref: ${year} "${t2.slice(0, 60)}"`); }
  else ok++;
  sleep(1200);
}
console.log(`\n${ok} DOIs verified, ${bad} need attention.`);
process.exit(bad ? 1 : 0);
