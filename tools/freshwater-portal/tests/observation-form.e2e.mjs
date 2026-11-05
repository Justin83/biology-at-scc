#!/usr/bin/env node
// Browser end-to-end test of the student observation form and the faculty review page,
// against the local stand-in database (never production).
//
//   node tools/freshwater-portal/local-api.mjs &            (see that file for set-up)
//   node tools/freshwater-portal/tests/observation-form.e2e.mjs
//
// Needs Playwright with Chromium (not a site dependency; resolved through NODE_PATH, e.g.
// NODE_PATH=$(npm root -g)). It serves the repository itself on a free port, then:
//   1. phone-sized browser attaches tests/fixtures/exif-gps-orientation6.jpg: the form must read
//      the photo's time, GPS and camera, and rotate it upright;
//   2. sends the entry with the class code and checks the receipt;
//   3. checks what the database stored: upright 480x640 JPEG with NO embedded EXIF, photo
//      time/GPS/camera as separate fields, the entry private until approved;
//   4. faculty review page: sign in, open the entry, approve;
//   5. Observations page shows the entry, with only the consented name.
// Environment: FW_API_URL (default http://127.0.0.1:8788), FW_INSTRUCTOR_KEY (default local-instructor-key).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const API = (process.env.FW_API_URL || "http://127.0.0.1:8788").replace(/\/$/, "");
const IKEY = process.env.FW_INSTRUCTOR_KEY || "local-instructor-key";
const CODE = "e2e-class-code";
const FIXTURE = path.join(ROOT, "tools/freshwater-portal/tests/fixtures/exif-gps-orientation6.jpg");

const rpc = (fn, args) => fetch(`${API}/rest/v1/rpc/${fn}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(args) }).then((r) => r.json());
const ins = (action, payload = {}) => rpc("fw_instructor", { p_key: IKEY, p_action: action, p_payload: payload });

// minimal static server for the repository
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const SITE = `http://127.0.0.1:${server.address().port}/research/freshwater/`;

let browser;
try {
  assert.equal((await ins("set_upload_code", { code: CODE })).ok, true, "instructor key accepted by the local API");
  assert.equal((await ins("set_open", { open: true })).ok, true);
  browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["Pixel 7"], timezoneId: "America/New_York" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("dialog", (d) => d.accept());

  // 1. form reads the photo
  await page.goto(`${SITE}observations/submit/?api=${encodeURIComponent(API)}&code=${CODE}`);
  await page.waitForFunction(() => /open/i.test(document.getElementById("fo-status").textContent));
  assert.ok(!page.url().includes("code="), "class code removed from the address bar");
  await page.setInputFiles("#fo-library", [FIXTURE]);
  await page.waitForFunction(() => document.querySelectorAll("#fo-photos li").length === 1, null, { timeout: 30000 });
  const info = await page.innerText("#fo-photos li");
  assert.match(info, /480×640/, "photo rotated upright and kept at full size (under 1600 px)");
  assert.match(info, /37\.05979, -84\.61690 \(± 8 m\)/, "GPS read from EXIF");
  assert.match(info, /TestCam Field Phone 1/, "camera read from EXIF");
  assert.equal(await page.inputValue("#fo-when"), "2026-11-03T14:21", "time read from EXIF (offset -05:00)");
  assert.match(await page.textContent("#fo-loc-src"), /from photo/);
  // the server only accepts observation times within 400 days: keep the test usable later
  if (Date.now() - Date.parse("2026-11-03T19:21:05Z") > 350 * 864e5) await page.fill("#fo-when", new Date(Date.now() - 36e5 - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16));

  // 2. fill in and send
  await page.selectOption("#fo-site", "allen-branch");
  await page.fill(".fw-photo input[data-caption]", "E2E upstream view");
  await page.click("#fo-measure-details summary");
  await page.fill("#fo-m-water_temperature-v", "12,5");
  await page.fill("#fo-obs-1", "E2E Private Name");
  await page.fill("#fo-obs-2", "E2E Public Name");
  await page.check("#fo-obs-2-pub");
  for (const id of ["#fo-ok-own", "#fo-ok-faces", "#fo-ok-publish"]) await page.check(id);
  await page.click("#fo-send");
  await page.waitForSelector("#fo-done:not([hidden])", { timeout: 30000 });
  const receipt = (await page.textContent("#fo-receipt")).trim();
  assert.match(receipt, /^FW-[0-9A-F]{6}$/);

  // 3. what was stored
  const sub = (await ins("list", { status: "submitted" })).submissions.find((s) => s.receipt === receipt);
  assert.ok(sub, "entry waiting for review");
  assert.equal(sub.location_source, "photo");
  assert.deepEqual(sub.measurements.map((m) => [m.parameter, m.value, m.unit]), [["water_temperature", 12.5, "°C"]]);
  const got = await ins("get", { id: sub.id });
  const ph = got.photos[0];
  assert.equal(ph.camera, "TestCam Field Phone 1");
  assert.equal(Number(ph.latitude), 37.059788);
  assert.deepEqual([ph.width, ph.height], [480, 640]);
  const jpeg = Buffer.from((await ins("photo", { id: ph.id })).image_b64, "base64");
  assert.equal(jpeg.includes(Buffer.from("Exif\0\0")), false, "stored JPEG has no EXIF block");
  assert.equal(jpeg.includes(Buffer.from("TestCam")), false, "stored JPEG does not contain the camera name");
  const before = (await rpc("fw_public_observations", {})).observations.map((o) => o.receipt);
  assert.ok(!before.includes(receipt), "not public before approval");

  // 4. faculty review
  await page.goto(`${SITE}observations/review/?api=${encodeURIComponent(API)}`);
  await page.fill("#rv-key", IKEY);
  await page.click("#rv-signin button[type=submit]");
  await page.waitForSelector(`#rv-list li:has-text("${receipt}")`);
  await page.click(`#rv-list li:has-text("${receipt}") [data-open]`);
  await page.waitForSelector("#rv-detail:not([hidden])");
  await page.click('[data-review="approved"]');
  await page.waitForFunction(() => /Approved/.test(document.getElementById("rv-review-msg").textContent));

  // 5. public page
  await page.goto(`${SITE}observations/?api=${encodeURIComponent(API)}`);
  await page.waitForSelector(`#obs-${receipt}`);
  const card = await page.innerText(`#obs-${receipt}`);
  assert.match(card, /E2E Public Name/);
  assert.doesNotMatch(card, /E2E Private Name/, "private name not shown");
  assert.doesNotMatch(card, /TestCam/, "camera not shown publicly");
  assert.deepEqual(errors, [], "no page errors");
  console.log(`PASS observation form end-to-end (${receipt})`);
} catch (e) {
  console.error("FAIL", e.message);
  process.exitCode = 1;
} finally {
  await ins("set_upload_code", { code: "class-test-code" }).catch(() => {});
  if (browser) await browser.close();
  server.close();
}
