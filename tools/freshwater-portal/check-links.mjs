#!/usr/bin/env node
// Re-check every external link in research/freshwater/data/resources.json and record
// the result on the record (last_checked, check_status, check_detail, final_url).
//
//   node tools/freshwater-portal/check-links.mjs           check and write results
//   node tools/freshwater-portal/check-links.mjs --dry-run print results only
//
// Policy (from the project brief): a link that fails an automated check is flagged for
// administrator review — it is never silently replaced. Some sites refuse automated
// requests (HTTP 403/429, bot walls) while working normally in a browser; those are
// recorded as "blocked_automated_check" so a person can confirm them by hand. This tool
// identifies itself honestly and does not try to get past such blocks.
//
// Uses the system `curl` (present on Windows 10+, macOS and Linux) so that it honors
// the same proxy and certificate settings as the rest of the machine. No dependencies.
// Afterwards run: node tools/freshwater-portal/build.mjs

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FILE = path.join(ROOT, "research/freshwater/data/resources.json");
const DRY = process.argv.includes("--dry-run");
const UA = "biology-at-scc-linkcheck/1.0 (+https://biologyatscc.com/research/freshwater/resources/)";
const today = new Date().toISOString().slice(0, 10);

function check(url) {
  try {
    const out = execFileSync("curl", ["-sS", "-L", "-o", process.platform === "win32" ? "NUL" : "/dev/null", "--max-time", "45",
      "-A", UA, "-w", "%{http_code} %{url_effective}", url], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const [code, ...rest] = out.trim().split(" ");
    return { code: +code, finalUrl: rest.join(" ") };
  } catch (e) {
    const msg = String(e.stderr || e.message).split("\n").find((l) => l.trim()) || "request failed";
    return { code: 0, finalUrl: url, error: msg.replace(/^curl: \(\d+\)\s*/, "") };
  }
}

const norm = (u) => u.replace(/\/+$/, "").toLowerCase();
const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
let flagged = 0;
for (const r of data.records) {
  const res = check(r.url);
  let status, detail;
  if (res.code >= 200 && res.code < 300) {
    if (norm(res.finalUrl) !== norm(r.url)) { status = "redirected"; detail = `HTTP ${res.code} after redirect`; }
    else { status = "ok"; detail = `HTTP ${res.code}`; }
  } else if ([401, 403, 405, 406, 429].includes(res.code)) {
    status = "blocked_automated_check"; detail = `The site refused the automated check (HTTP ${res.code}); confirm in a browser`;
  } else if (res.code === 0) {
    status = "blocked_automated_check"; detail = `The automated check could not connect (${res.error}); confirm in a browser`;
  } else {
    status = "unavailable"; detail = `HTTP ${res.code}`;
  }
  if (status !== "ok") flagged++;
  console.log(`${status.padEnd(24)} ${String(res.code).padEnd(4)} ${r.id}${status === "redirected" ? " -> " + res.finalUrl : ""}`);
  Object.assign(r, { last_checked: today, check_status: status, check_detail: detail });
  if (status === "redirected") r.final_url = res.finalUrl; else delete r.final_url;
}
if (!DRY) fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n");
console.log(`\n${data.records.length} links checked, ${flagged} flagged for review${DRY ? " (dry run, nothing written)" : ""}.`);
