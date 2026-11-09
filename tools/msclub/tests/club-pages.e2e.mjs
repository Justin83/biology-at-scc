#!/usr/bin/env node
// Browser end-to-end test of the club pages against the local stand-in database.
//   CLUB_TODAY=2026-11-05 node tools/msclub/local-api.mjs &
//   NODE_PATH=$(npm root -g) node tools/msclub/tests/club-pages.e2e.mjs
// Needs Playwright with Chromium (not a site dependency). Serves the repository itself.
// Covers:
//   - home page: next meeting (food theme), event cards by month, the big-screen QR;
//     one QR code on the whole club site, and it opens the club website;
//   - signing up in the pop-up on the home page and on the sign-up page, from two
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
const SITE = `http://127.0.0.1:${server.address().port}/msclub/`;
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
  assert.doesNotMatch(next, /third Thursday/i);
  assert.match(next, /Food theme: to be announced/);
  assert.deepEqual(await a.$$eval("#club-upcoming .club-month", (h) => h.map((x) => x.textContent)), ["November 2026", "December 2026", "March 2027"]);
  assert.equal(await a.$$eval("#club-upcoming .club-card", (c) => c.length), 5);
  assert.equal(await a.$$eval("#club-upcoming .club-card [data-signup]", (c) => c.length), 3, "sign-up buttons on the two food events and STEAM Day");
  // STEAM Day (added by 003): a volunteer sign-up, no food theme
  const steamCard = await text(a, '.club-card:has-text("STEAM Day Somerset 2027")');
  assert.match(steamCard, /Sign up to work this event/);
  assert.doesNotMatch(steamCard, /Food theme/);
  assert.equal(await a.textContent("#club-past-count"), "13");
  // club bar tab
  assert.equal((await a.textContent('.club-bar nav a[href="signup/"]')).trim(), "Event sign-up");
  assert.equal((await a.textContent('.club-bar nav a[aria-current="page"]')).trim(), "Home");
  // the main site's links are replaced by one way back
  assert.equal((await a.textContent("header .club-back")).replace(/\s+/g, " ").trim(), "← Back to Biology at SCC");
  assert.equal(await a.getAttribute("header .club-back", "href"), "../index.html");
  assert.equal(await a.$$eval("header nav", (n) => n.length), 0, "no main-site link row on club pages");
  // who's bringing what is on the next-meeting card, above the button on a phone
  assert.match(await text(a, "#club-next-body .club-next-bring"), /Who's bringing what[\s\S]*Dessert nobody yet/i);
  const [bringBox, actBox] = [await a.$eval(".club-next-bring", (e) => e.getBoundingClientRect().toJSON()), await a.$eval(".club-next-actions", (e) => e.getBoundingClientRect().toJSON())];
  assert.ok(bringBox.bottom <= actBox.top, "phone: list sits above the sign-up button");
  // officer tools: a button in the club bar at the top of the page
  assert.equal(await a.isVisible(".club-bar a.club-bar-officer"), true);
  assert.equal(await a.getAttribute(".club-bar a.club-bar-officer", "href"), "officers/");
  // the landing-page QR and the big-screen view open the club website
  assert.match(await a.getAttribute(".club-scan img", "src"), /qr-club\.svg$/);
  // big-screen QR
  await a.click("#club-bigqr-open");
  assert.match(await a.getAttribute("#club-bigqr img", "src"), /qr-club\.svg$/);
  assert.equal(await a.isVisible("#club-bigqr img"), true);
  assert.match(await text(a, "#club-bigqr-event"), /Next meeting: Thursday, November 19 · 5:00 PM/);
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
  assert.match(await text(a, "#m-list"), /Brownies · E2E Student A \(contains nuts\) \(you\)/);
  await a.click("#club-signup-dialog [data-close]");
  assert.match(await text(a, "#club-next-body"), /1 person has signed up/);
  assert.match(await text(a, "#club-next-body .club-next-bring"), /Dessert 1 signed up Brownies · E2E Student A \(contains nuts\) \(you\)/, "card list updates after signing up");

  // student B on another phone, on the sign-up page: clickable cards (club meetings in
  // one group, other events and trips in another); nothing is preselected and the form
  // stays hidden until a card is chosen.
  const novId = await a.getAttribute("#club-next-body [data-signup]", "data-signup");
  const b = await phone();
  await b.goto(SITE + "signup/" + Q);
  await b.waitForSelector("#su-pick:not([hidden])");
  assert.equal(await b.$$eval('#su-meetings input[name="su-event"]', (r) => r.length), 2, "both food events under club meetings");
  assert.equal(await b.$$eval('input[name="su-event"]:checked', (r) => r.length), 0, "nothing preselected");
  assert.equal(await b.isHidden("#su-app"), true, "form hidden until a get-together is chosen");
  assert.match(await text(b, "#su-meetings"), /Club meetings[\s\S]*Math and Science Club Meeting[\s\S]*Holiday Party/i);
  assert.match(await text(b, "#su-events"), /Events and trips[\s\S]*STEAM Day Somerset 2027/i, "STEAM Day under events and trips");
  assert.equal(await b.$$eval("main .lede", (x) => x.length), 0, "no intro line");
  assert.equal(await b.getAttribute("main h1", "class"), "visually-hidden", "page heading is for screen readers only");
  assert.equal((await b.textContent("main h1")).trim(), "Event sign-up");
  // QR poster: in the footer, not the club bar
  assert.equal(await b.$$eval('.club-bar a[href$="qr/"]', (x) => x.length), 0);
  assert.equal(await b.$$eval('footer a[href="../qr/"]', (x) => x.length), 1);
  // one QR code on the whole club site, and it opens the club website (people go to
  // the food sign-up from there): none on this page, the same one on the poster
  assert.equal(await b.$$eval('img[src*="qr"]', (x) => x.length), 0, "no QR code on the sign-up page");
  const poster = await phone();
  await poster.goto(SITE + "qr/");
  assert.deepEqual(await poster.$$eval('img[src*="qr"]', (x) => x.map((i) => i.getAttribute("src"))), ["../assets/qr-club.svg"], "poster has only the club website QR");
  assert.doesNotMatch(await poster.textContent("main"), /third Thursday/i);
  await poster.close();
  await b.click('#su-pick-options label:has-text("November 19")');
  await b.waitForSelector("#su-app:not([hidden]) #su-list li");
  assert.ok(b.url().includes("event=" + novId), "choice kept in the address");
  // sees A's entry, cannot change it
  assert.match(await text(b, "#su-list"), /Brownies · E2E Student A/);
  assert.doesNotMatch(await text(b, "#su-list"), /\(you\)/);
  assert.equal(await b.isHidden("#su-mine-wrap"), true);
  await b.fill("#su-name", "E2E Student B");
  await b.check('input[name="su-slot"][value="Drinks"]');
  await b.fill("#su-item", "Lemonade");
  await b.click("#su-submit");
  await b.waitForFunction(() => /Lemonade/.test(document.getElementById("su-msg").textContent));
  assert.match(await text(b, '#su-pick-options label:has-text("November 19")'), /2 people signed up/, "step 1 card count updates after signing up");
  assert.equal(await b.isChecked("#su-ev-" + novId), true, "selection kept after the counts update");

  // A changes and then removes their entry (pop-up again). A's page loaded before B signed
  // up, so the pop-up must fetch fresh data to show B's lemonade.
  await a.click("#club-next-body [data-signup]");
  await a.waitForSelector("#club-signup-dialog[open]");
  assert.match(await text(a, "#m-list"), /Lemonade · E2E Student B/, "pop-up shows sign-ups made after the page loaded");
  await a.click("#m-mine [data-edit]");
  await a.fill("#m-item", "Cookies");
  await a.check('input[name="m-slot"][value="Snack"]');
  await a.click("#m-submit");
  await a.waitForFunction(() => /Saved/.test(document.getElementById("m-msg").textContent));
  assert.match(await text(a, "#m-list"), /Cookies · E2E Student A/);
  await a.click("#m-mine [data-remove]");
  await a.waitForFunction(() => /removed/.test(document.getElementById("m-msg").textContent));
  assert.doesNotMatch(await text(a, "#m-list"), /E2E Student A/);
  await a.click("#club-signup-dialog [data-close]");

  // officer tools on a desktop browser
  const o = await desktop();
  await o.goto(SITE + Q);
  await o.waitForSelector("#club-next-body .club-next-bring");
  const [infoD, bringD] = [await o.$eval(".club-next-info", (e) => e.getBoundingClientRect().toJSON()), await o.$eval(".club-next-bring", (e) => e.getBoundingClientRect().toJSON())];
  assert.ok(bringD.left >= infoD.right && bringD.top < infoD.bottom, "desktop: list sits beside the meeting details");
  await o.click("#club-next-body [data-signup]");
  await o.waitForSelector("#club-signup-dialog[open] #m-list li");
  const [listD, formD] = [await o.$eval(".club-su-list", (e) => e.getBoundingClientRect().toJSON()), await o.$eval(".club-su-form", (e) => e.getBoundingClientRect().toJSON())];
  assert.ok(formD.left >= listD.right && Math.abs(formD.top - listD.top) < 5, "desktop pop-up: list beside the form");
  await o.click("#club-signup-dialog [data-close]");
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
  // an event with sign-up that isn't a club meeting goes in its own group
  await o.click("#of-add");
  await o.fill("#of-date", "2027-02-12");
  await o.fill("#of-start", "08:00");
  await o.fill("#of-title", "E2E Campus Trip");
  await o.selectOption("#of-kind", "campus-tour");
  await o.check("#of-signup");
  await o.selectOption("#of-signup-kind", "going");
  assert.deepEqual(await o.$$eval("[data-slot-label]", (i) => i.map((x) => x.value)), ["Going"], "who's going: one list");
  await setNeeded(o, "Going", "2");
  await o.click("#of-save");
  await o.waitForFunction(() => /E2E Campus Trip/.test(document.getElementById("of-list-msg").textContent));
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
  assert.match(await text(a, "#su-events"), /Events and trips[\s\S]*E2E Campus Trip/i, "trip listed under events and trips");
  assert.doesNotMatch(await text(a, "#su-meetings"), /E2E Campus Trip/);
  // who's going: name only, no category to pick, spots shown
  await a.click('#su-events label:has-text("E2E Campus Trip")');
  await a.waitForSelector("#su-app:not([hidden]) #su-list");
  assert.match(await text(a, "#su-list-title"), /Who's going/i);
  assert.equal(await a.isVisible("#su-slots-wrap"), false, "nothing to choose for a trip");
  assert.equal(await a.isVisible("#su-item"), false);
  assert.match(await text(a, "#su-list"), /Going 0 of 2 spots/);
  await a.fill("#su-name", "E2E Rider");
  await a.click("#su-submit");
  await a.waitForFunction(() => /on the list/.test(document.getElementById("su-msg").textContent));
  assert.match(await text(a, "#su-list"), /Going 1 of 2 spots E2E Rider \(you\)/);
  // work this event: STEAM Day volunteers pick a shift
  await a.click('#su-events label:has-text("STEAM Day Somerset 2027")');
  await a.waitForFunction(() => /working/i.test(document.getElementById("su-list-title").textContent));
  assert.match(await text(a, "#su-slots-legend"), /Shift or role/);
  assert.equal(await a.isVisible("#su-item"), false);
  assert.match(await text(a, "#su-info"), /S-STEM scholars/);
  await a.fill("#su-name", "E2E Volunteer");
  await a.click("#su-submit");
  assert.match(await a.textContent("#su-msg"), /Choose a shift or role/);
  await a.check('input[name="su-slot"][value="Setup"]');
  await a.click("#su-submit");
  await a.waitForFunction(() => /signed up to work this event/.test(document.getElementById("su-msg").textContent));
  assert.match(await text(a, "#su-list"), /Setup 1 signed up E2E Volunteer \(you\)/);
  assert.match(await text(a, "#su-mine"), /Setup · E2E Volunteer/);
  await a.click("#su-mine [data-remove]");
  await a.waitForFunction(() => /removed/.test(document.getElementById("su-msg").textContent));

  // postponed: officer postpones the trip (postponed and cancelled can't both be on);
  // the card shows a Postponed pill, no sign-up button, and the sign-up page drops it
  await o.click('#of-upcoming li:has-text("E2E Campus Trip") [data-edit]');
  await o.check("#of-cancelled");
  await o.check("#of-postponed");
  assert.equal(await o.isChecked("#of-cancelled"), false, "postponed turns cancelled off");
  await o.click("#of-save");
  await o.waitForFunction(() => /Saved: E2E Campus Trip/.test(document.getElementById("of-list-msg").textContent));
  assert.match(await text(o, '#of-upcoming li:has-text("E2E Campus Trip")'), /Postponed/);
  await a.goto(SITE + Q);
  await a.waitForSelector('.club-card:has-text("E2E Campus Trip")');
  const trip = await text(a, '.club-card:has-text("E2E Campus Trip")');
  assert.match(trip, /Campus tour Postponed/);
  assert.doesNotMatch(trip, /Sign up/);
  assert.equal(await a.$$eval('.club-card:has-text("E2E Campus Trip").is-cancelled', (x) => x.length), 0, "postponed is not crossed out");
  await a.goto(SITE + "signup/" + Q);
  await a.waitForSelector("#su-pick:not([hidden])");
  assert.doesNotMatch(await text(a, "#su-pick"), /E2E Campus Trip/, "no sign-up for a postponed event");
  // no Competition type any more
  assert.equal(await o.$$eval('#of-kind option[value="competition"]', (x) => x.length), 0);

  // one volunteer list (places assigned later): the officer switches STEAM Day to the
  // usual single list and adds a note with an email; volunteers give only their name,
  // and the email in the note is a link
  await o.click('#of-upcoming li:has-text("STEAM Day Somerset 2027") [data-edit]');
  await o.waitForSelector("#of-editor[open]");
  await o.click("#of-slot-default");
  assert.deepEqual(await o.$$eval("[data-slot-label]", (i) => i.map((x) => x.value)), ["Volunteers"]);
  await o.fill("#of-signup-note", "We'll assign your place near or on the date of the event. Questions? Contact justin.howard@kctcs.edu.");
  await o.click("#of-save");
  await o.waitForFunction(() => /Saved: STEAM Day Somerset 2027/.test(document.getElementById("of-list-msg").textContent));
  await a.goto(SITE + "signup/" + Q);
  await a.click('#su-events label:has-text("STEAM Day Somerset 2027")');
  await a.waitForSelector("#su-app:not([hidden]) #su-list");
  assert.equal(await a.isVisible("#su-slots-wrap"), false, "no shift or role to pick");
  assert.equal(await a.getAttribute('#su-info a[href^="mailto:"]', "href"), "mailto:justin.howard@kctcs.edu");
  await a.fill("#su-name", "E2E Helper");
  await a.click("#su-submit");
  await a.waitForFunction(() => /signed up to work this event/.test(document.getElementById("su-msg").textContent));
  assert.match(await text(a, "#su-list"), /Volunteers 1 signed up E2E Helper \(you\)/);
  await a.click("#su-mine [data-remove]");
  await a.waitForFunction(() => /removed/.test(document.getElementById("su-msg").textContent));

  // clean up: delete the test event, put the November meeting back the way it was
  await o.click('#of-upcoming li:has-text("E2E January Meeting") [data-edit]');
  await o.click("#of-delete");
  await o.waitForFunction(() => /Deleted/.test(document.getElementById("of-list-msg").textContent));
  await o.click('#of-upcoming li:has-text("E2E Campus Trip") [data-edit]');
  await o.click("#of-delete");
  await o.waitForFunction(() => /Deleted[\s\S]*E2E Campus Trip|E2E Campus Trip[\s\S]*deleted/i.test(document.getElementById("of-list-msg").textContent));
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
  console.error("FAIL", e.message, (e.stack || "").split("\n").find((l) => l.includes("club-pages.e2e")) || "");
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.close();
}
