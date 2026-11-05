#!/usr/bin/env node
// Browser end-to-end test of the club pages against the local stand-in database.
//   CLUB_TODAY=2026-11-05 node tools/math-science-club/local-api.mjs &
//   NODE_PATH=$(npm root -g) node tools/math-science-club/tests/club-pages.e2e.mjs
// Needs Playwright with Chromium (not a site dependency). Serves the repository itself.
// Covers:
//   - home page: next meeting (third-Thursday check, food theme), event cards by month,
//     the big-screen QR;
//   - signing up in the pop-up on the home page and on the QR sign-up page, from two
//     separate phones (only the device that signed up can change or remove its entry);
//   - officer tools in a desktop browser: wrong code refused; set a food theme and a
//     "how many" in the editor pop-up; remove a sign-up; add, cancel and delete an event;
//   - the printed-schedule fallback when the database cannot be reached.
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
const text = (page, sel) => page.innerText(sel).then((t) => t.replace(/\s+/g, " "));

let browser;
try {
  browser = await chromium.launch();
  const errors = [];
  const watch = (p) => { p.on("pageerror", (e) => errors.push(String(e))); p.on("dialog", (d) => d.accept()); return p; };
  const phone = async () => watch(await (await browser.newContext({ ...devices["Pixel 7"], timezoneId: "America/New_York" })).newPage());
  const desktop = async () => watch(await (await browser.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: "America/New_York" })).newPage());
  // set the "How many" box of a sign-up category in the officer editor, found by its label
  const setNeeded = (page, label, value) => page.evaluate(([l, v]) => {
    const row = [...document.querySelectorAll("[data-slot-row]")].find((r) => r.querySelector("[data-slot-label]").value === l);
    row.querySelector("[data-slot-needed]").value = v;
  }, [label, value]);

  // home page
  const a = await phone();
  await a.goto(SITE + Q);
  await a.waitForSelector(".club-card");
  const next = await text(a, "#club-next-body");
  assert.match(next, /Thursday, November 19, 2026/);
  assert.match(next, /Third Thursday of November/);
  assert.match(next, /Food theme: to be announced/);
  assert.deepEqual(await a.$$eval("#club-upcoming .club-month", (h) => h.map((x) => x.textContent)), ["November 2026", "December 2026"]);
  assert.equal(await a.$$eval("#club-upcoming .club-card", (c) => c.length), 4);
  assert.equal(await a.$$eval("#club-upcoming .club-card [data-signup]", (c) => c.length), 2, "sign-up buttons on the two food events");
  assert.equal(await a.textContent("#club-past-count"), "13");
  // big-screen QR
  await a.click("#club-bigqr-open");
  assert.equal(await a.isVisible("#club-bigqr img"), true);
  assert.match(await text(a, "#club-bigqr-event"), /Thursday, November 19 · 5:00 PM/);
  await a.click("#club-bigqr [data-close]");

  // student A signs up in the pop-up from the next-meeting card
  await a.click("#club-next-body [data-signup]");
  await a.waitForSelector("#club-signup-dialog[open]");
  assert.match(await text(a, "#m-info"), /Thursday, November 19, 2026/);
  assert.deepEqual(await a.$$eval('input[name="m-slot"]', (r) => r.map((x) => x.value)), ["Main dish", "Side", "Snack", "Dessert", "Drinks"]);
  await a.click("#m-submit");
  assert.match(await a.textContent("#m-msg"), /Enter your name/);
  await a.fill("#m-name", "E2E Student A");
  await a.check('input[name="m-slot"][value="Dessert"]');
  await a.fill("#m-item", "Brownies");
  await a.fill("#m-note", "contains nuts");
  await a.click("#m-submit");
  await a.waitForFunction(() => /signed up to bring Brownies/.test(document.getElementById("m-msg").textContent));
  assert.match(await text(a, "#m-list"), /E2E Student A: Brownies \(contains nuts\) \(you\)/);
  await a.click("#club-signup-dialog [data-close]");
  assert.match(await text(a, "#club-next-body"), /1 person has signed up/);

  // student B on another phone, on the QR sign-up page. Choosing the get-together is a
  // required first step: nothing is preselected and the form stays hidden until then.
  const novId = await a.getAttribute("#club-next-body [data-signup]", "data-signup");
  const b = await phone();
  await b.goto(SITE + "signup/" + Q);
  await b.waitForSelector("#su-pick:not([hidden])");
  assert.equal(await b.$$eval('input[name="su-event"]', (r) => r.length), 2, "both food events offered");
  assert.equal(await b.$$eval('input[name="su-event"]:checked', (r) => r.length), 0, "nothing preselected");
  assert.equal(await b.isHidden("#su-app"), true, "form hidden until a get-together is chosen");
  assert.equal(await b.isVisible("#su-choose-first"), true);
  await b.click('#su-pick-options label:has-text("November 19")');
  await b.waitForSelector("#su-app:not([hidden]) #su-list li");
  assert.ok(b.url().includes("event=" + novId), "choice kept in the address");
  // sees A's entry, cannot change it
  assert.match(await text(b, "#su-list"), /E2E Student A: Brownies/);
  assert.doesNotMatch(await text(b, "#su-list"), /\(you\)/);
  assert.equal(await b.isHidden("#su-mine-wrap"), true);
  await b.fill("#su-name", "E2E Student B");
  await b.check('input[name="su-slot"][value="Drinks"]');
  await b.fill("#su-item", "Lemonade");
  await b.click("#su-submit");
  await b.waitForFunction(() => /Lemonade/.test(document.getElementById("su-msg").textContent));

  // A changes and then removes their entry (pop-up again). A's page loaded before B signed
  // up, so the pop-up must fetch fresh data to show B's lemonade.
  await a.click("#club-next-body [data-signup]");
  await a.waitForSelector("#club-signup-dialog[open]");
  assert.match(await text(a, "#m-list"), /E2E Student B: Lemonade/, "pop-up shows sign-ups made after the page loaded");
  await a.click("#m-mine [data-edit]");
  await a.fill("#m-item", "Cookies");
  await a.check('input[name="m-slot"][value="Snack"]');
  await a.click("#m-submit");
  await a.waitForFunction(() => /Saved/.test(document.getElementById("m-msg").textContent));
  assert.match(await text(a, "#m-list"), /E2E Student A: Cookies/);
  await a.click("#m-mine [data-remove]");
  await a.waitForFunction(() => /removed/.test(document.getElementById("m-msg").textContent));
  assert.doesNotMatch(await text(a, "#m-list"), /E2E Student A/);
  await a.click("#club-signup-dialog [data-close]");

  // officer tools on a desktop browser
  const o = await desktop();
  await o.goto(SITE + "officers/" + Q);
  await o.fill("#of-code", "wrong-code");
  await o.click("#of-signin-form button[type=submit]");
  await o.waitForFunction(() => /not accepted/.test(document.getElementById("of-signin-msg").textContent));
  await o.fill("#of-code", CODE);
  await o.click("#of-signin-form button[type=submit]");
  await o.waitForSelector("#of-app:not([hidden]) #of-upcoming li");
  await o.click('#of-upcoming li:has-text("Nov 19") [data-edit]');
  await o.waitForSelector("#of-editor[open]");
  assert.deepEqual(await o.$$eval("[data-slot-label]", (i) => i.map((x) => x.value)), ["Main dish", "Side", "Snack", "Dessert", "Drinks"]);
  await o.fill("#of-theme", "Tacos");
  await o.fill("#of-location", "E2E Room 101");
  await setNeeded(o, "Drinks", "3");
  assert.match(await text(o, "#of-signups"), /E2E Student B: Lemonade/);
  await o.click("#of-signups [data-remove-signup]");
  await o.waitForFunction(() => /Sign-up removed/.test(document.getElementById("of-form-msg").textContent));
  await o.click("#of-save");
  await o.waitForFunction(() => /Saved/.test(document.getElementById("of-list-msg").textContent));
  assert.equal(await o.isVisible("#of-editor"), false, "editor closes after saving");
  assert.match(await text(o, '#of-upcoming li:has-text("Nov 19")'), /Food theme: Tacos/);
  // add, cancel, delete an event
  await o.click("#of-add");
  await o.fill("#of-date", "2027-01-21");
  await o.fill("#of-start", "17:00");
  await o.fill("#of-title", "E2E January Meeting");
  await o.fill("#of-theme", "Pasta");
  await o.click("#of-save");
  await o.waitForFunction(() => /E2E January Meeting/.test(document.getElementById("of-list-msg").textContent));
  await o.click('#of-upcoming li:has-text("E2E January Meeting") [data-edit]');
  await o.check("#of-cancelled");
  await o.click("#of-save");
  await o.waitForFunction(() => /Saved/.test(document.getElementById("of-list-msg").textContent));

  // the public pages show the changes
  await a.goto(SITE + Q);
  await a.waitForSelector(".club-card");
  assert.match(await text(a, "#club-next-body"), /Food theme: Tacos/);
  assert.match(await text(a, "#club-next-body"), /E2E Room 101/);
  assert.match(await text(a, '.club-card:has-text("E2E January Meeting")'), /Cancelled[\s\S]*Food theme: Pasta/);
  await a.goto(SITE + "signup/" + Q + "&event=" + novId); // a card's link names its event
  await a.waitForSelector("#su-app:not([hidden]) #su-list");
  assert.equal(await a.isChecked("#su-ev-" + novId), true, "event from the link is preselected");
  assert.match(await text(a, "#su-list"), /Drinks 0 of 3 needed/);
  assert.match(await text(a, "#su-info"), /Food theme: Tacos/);

  // clean up: delete the test event, put the November meeting back the way it was
  await o.click('#of-upcoming li:has-text("E2E January Meeting") [data-edit]');
  await o.click("#of-delete");
  await o.waitForFunction(() => /Deleted/.test(document.getElementById("of-list-msg").textContent));
  await o.click('#of-upcoming li:has-text("Nov 19") [data-edit]');
  await o.fill("#of-theme", "");
  await o.fill("#of-location", "");
  await setNeeded(o, "Drinks", "");
  await o.click("#of-save");
  await o.waitForFunction(() => /Saved/.test(document.getElementById("of-list-msg").textContent));

  // fallback when the database cannot be reached: block every database request
  const s = await phone();
  await s.route((url) => url.pathname.startsWith("/rest/v1/"), (route) => route.abort());
  await s.goto(SITE + "?api=off");
  await s.waitForSelector(".club-card");
  assert.ok((await s.$$(".club-card")).length >= 4, "printed schedule shown");
  assert.equal(await s.$$eval("[data-signup]", (x) => x.length), 0, "no sign-up buttons without the database");
  await s.goto(SITE + "signup/?api=off");
  await s.waitForFunction(() => /isn't working|opens soon|couldn't be reached/.test(document.getElementById("su-status").textContent));
  assert.equal(await s.isHidden("#su-app"), true, "no sign-up form without the database");

  assert.deepEqual(errors, [], "no page errors");
  console.log("PASS club pages end-to-end");
} catch (e) {
  console.error("FAIL", e.message);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.close();
}
