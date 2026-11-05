#!/usr/bin/env node
// Browser end-to-end test of the club pages against the local stand-in database.
//   CLUB_TODAY=2026-11-05 node tools/math-science-club/local-api.mjs &
//   NODE_PATH=$(npm root -g) node tools/math-science-club/tests/club-pages.e2e.mjs
// Needs Playwright with Chromium (not a site dependency). Serves the repository itself.
// Covers: home page next meeting (third-Thursday check) and agenda; food sign-up from two
// separate phones (only the device that signed up can change or remove its entry);
// officer tools (wrong code refused; edit an event; add, cancel and delete an event;
// remove a sign-up); and the static fallback when the database is off.
// Environment: CLUB_API_URL (default http://127.0.0.1:8789), CLUB_OFFICER_CODE (default local-officer-code).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const API = (process.env.CLUB_API_URL || "http://127.0.0.1:8789").replace(/\/$/, "");
const CODE = process.env.CLUB_OFFICER_CODE || "local-officer-code";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const SITE = `http://127.0.0.1:${server.address().port}/math-science-club/`;
const Q = `?api=${encodeURIComponent(API)}`;

let browser;
try {
  browser = await chromium.launch();
  const errors = [];
  // set the "How many" box of a sign-up category in the officer editor, found by its label
  const setNeeded = (page, label, value) => page.evaluate(([l, v]) => {
    const row = [...document.querySelectorAll("[data-slot-row]")].find((r) => r.querySelector("[data-slot-label]").value === l);
    row.querySelector("[data-slot-needed]").value = v;
  }, [label, value]);
  const phone = async () => {
    const ctx = await browser.newContext({ ...devices["Pixel 7"], timezoneId: "America/New_York" });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(String(e)));
    p.on("dialog", (d) => d.accept());
    return p;
  };

  // home
  const a = await phone();
  await a.goto(SITE + Q);
  await a.waitForSelector(".club-event");
  const next = await a.innerText("#club-next-body");
  assert.match(next, /Thursday, November 19, 2026/);
  assert.match(next, /5:00 PM/);
  assert.match(next, /Third Thursday of November/);
  const months = await a.$$eval("#club-upcoming .club-month", (h) => h.map((x) => x.textContent));
  assert.deepEqual(months, ["November 2026", "December 2026"]);
  assert.equal(await a.textContent("#club-past-count"), "13");

  // student A signs up from the QR link (no event in the URL → next sign-up event)
  await a.goto(SITE + "signup/" + Q);
  await a.waitForSelector("#su-form-wrap:not([hidden])");
  assert.match(await a.innerText("#su-event-body"), /Thursday, November 19, 2026/);
  await a.click("#su-submit");
  assert.match(await a.textContent("#su-msg"), /Enter your name/);
  await a.fill("#su-name", "E2E Student A");
  await a.click("#su-submit");
  assert.match(await a.textContent("#su-msg"), /Choose a category/);
  await a.check('input[name="su-slot"][value="Dessert"]');
  await a.fill("#su-item", "Brownies");
  await a.fill("#su-note", "contains nuts");
  await a.click("#su-submit");
  await a.waitForFunction(() => /signed up to bring Brownies/.test(document.getElementById("su-msg").textContent));
  assert.match(await a.innerText("#su-list"), /E2E Student A — Brownies \(contains nuts\) \(you\)/);
  assert.match(await a.innerText("#su-mine"), /Brownies/);

  // student B on another phone sees it but cannot change it
  const b = await phone();
  await b.goto(SITE + "signup/" + Q);
  await b.waitForSelector("#su-list li");
  assert.match(await b.innerText("#su-list"), /E2E Student A — Brownies/);
  assert.doesNotMatch(await b.innerText("#su-list"), /\(you\)/);
  assert.equal(await b.isHidden("#su-mine-wrap"), true);

  // A changes and removes
  await a.click('#su-mine [data-edit]');
  await a.fill("#su-item", "Cookies");
  await a.check('input[name="su-slot"][value="Snack"]');
  await a.click("#su-submit");
  await a.waitForFunction(() => /Saved/.test(document.getElementById("su-msg").textContent));
  assert.match(await a.innerText("#su-list"), /E2E Student A — Cookies/);
  await a.click('#su-mine [data-remove]');
  await a.waitForFunction(() => /removed/.test(document.getElementById("su-msg").textContent));
  assert.doesNotMatch(await a.innerText("#su-list"), /E2E Student A/);

  // B signs up (for the officer to remove later)
  await b.fill("#su-name", "E2E Student B");
  await b.check('input[name="su-slot"][value="Drinks"]');
  await b.fill("#su-item", "Lemonade");
  await b.click("#su-submit");
  await b.waitForFunction(() => /Lemonade/.test(document.getElementById("su-msg").textContent));

  // officer tools
  const o = await phone();
  await o.goto(SITE + "officers/" + Q);
  await o.fill("#of-code", "wrong-code");
  await o.click("#of-signin-form button[type=submit]");
  await o.waitForFunction(() => /not accepted/.test(document.getElementById("of-signin-msg").textContent));
  await o.fill("#of-code", CODE);
  await o.click("#of-signin-form button[type=submit]");
  await o.waitForSelector("#of-app:not([hidden]) #of-upcoming li");
  await o.click('#of-upcoming li:has-text("Nov 19") [data-edit]');
  await o.waitForSelector("#of-editor:not([hidden])");
  await o.fill("#of-location", "E2E Room 101");
  await o.fill("#of-signup-note", "E2E: the club provides pizza");
  await setNeeded(o, "Drinks", "3");
  assert.match(await o.innerText("#of-signups"), /E2E Student B — Lemonade/);
  await o.click("#of-signups [data-remove-signup]");
  await o.waitForFunction(() => /Sign-up removed/.test(document.getElementById("of-form-msg").textContent));
  await o.click("#of-save");
  await o.waitForFunction(() => /Saved/.test(document.getElementById("of-list-msg").textContent));
  // add, cancel, delete an event
  await o.click("#of-add");
  await o.fill("#of-date", "2027-01-21");
  await o.fill("#of-start", "17:00");
  await o.fill("#of-title", "E2E January Meeting");
  await o.click("#of-save");
  await o.waitForFunction(() => /E2E January Meeting/.test(document.getElementById("of-list-msg").textContent));
  await o.click('#of-upcoming li:has-text("E2E January Meeting") [data-edit]');
  await o.check("#of-cancelled");
  await o.click("#of-save");
  await o.waitForFunction(() => /Saved/.test(document.getElementById("of-list-msg").textContent));
  await a.goto(SITE + Q);
  await a.waitForSelector(".club-event");
  assert.match(await a.innerText("#club-upcoming"), /E2E January Meeting[\s\S]*Cancelled/);
  assert.match(await a.innerText("#club-next-body"), /E2E Room 101/);
  await a.goto(SITE + "signup/" + Q);
  await a.waitForSelector("#su-list");
  assert.match(await a.innerText("#su-list"), /Drinks\s+0 of 3 needed/);
  assert.match(await a.innerText("#su-event-body"), /the club provides pizza/);
  await o.click('#of-upcoming li:has-text("E2E January Meeting") [data-edit]');
  await o.click("#of-delete");
  await o.waitForFunction(() => /Deleted/.test(document.getElementById("of-list-msg").textContent));
  // put the November meeting back the way it was
  await o.click('#of-upcoming li:has-text("Nov 19") [data-edit]');
  await o.fill("#of-location", "");
  await o.fill("#of-signup-note", "");
  await setNeeded(o, "Drinks", "");
  await o.click("#of-save");
  await o.waitForFunction(() => /Saved/.test(document.getElementById("of-list-msg").textContent));

  // static fallback (database off)
  const s = await phone();
  await s.goto(SITE + "?api=off");
  await s.waitForSelector(".club-event");
  assert.ok((await s.$$(".club-event")).length >= 4);
  await s.goto(SITE + "signup/?api=off");
  await s.waitForFunction(() => /isn't available|opens soon|could not be reached/.test(document.getElementById("su-status").textContent));

  assert.deepEqual(errors, [], "no page errors");
  console.log("PASS club pages end-to-end");
} catch (e) {
  console.error("FAIL", e.message);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.close();
}
