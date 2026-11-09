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
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".pdf": "application/pdf", ".jpg": "image/jpeg" };
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
  assert.equal(await a.$$eval("#club-upcoming .club-card .club-card-actions a.club-btn", (c) => c.length), 3, "sign-up buttons on the two food events and STEAM Day");
  assert.equal(await a.$$eval("#club-upcoming .club-card [data-signup]", (c) => c.length), 2, "the food events open the pop-up; STEAM Day's button goes to its info page");
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
  assert.match(await text(a, "#club-next-body .club-next-bring"), /Who's bringing what[\s\S]*Nobody has signed up yet/i);
  const [bringBox, actBox] = [await a.$eval(".club-next-bring", (e) => e.getBoundingClientRect().toJSON()), await a.$eval(".club-next-actions", (e) => e.getBoundingClientRect().toJSON())];
  assert.ok(bringBox.bottom <= actBox.top, "phone: list sits above the sign-up button");
  // officer tools: a button in the club bar at the top of the page
  assert.equal(await a.isVisible(".club-bar a.club-bar-officer"), true);
  assert.equal(await a.getAttribute(".club-bar a.club-bar-officer", "href"), "officers/");
  // the home page has no QR code (the QR poster is linked from the footer), and no flyer on a phone
  assert.equal(await a.$$eval('img[src$="qr-club.svg"]', (l) => l.length), 0, "no QR code on the home page");
  assert.equal(await a.getAttribute('footer a[href="qr/"]', "href"), "qr/", "QR poster linked from the footer");
  await a.waitForSelector("#club-flyers[data-shown]", { state: "attached" });
  assert.equal(await a.isVisible("#club-flyer-panel"), false, "no flyer on a phone");

  // student A signs up in the pop-up from the next-meeting card
  await a.click("#club-next-body [data-signup]");
  await a.waitForSelector("#club-signup-dialog[open]");
  assert.match(await text(a, "#m-info"), /Thursday, November 19, 2026/);
  assert.equal(await a.isVisible("#m-slots-wrap"), false, "no categories for food");
  assert.equal(await a.$$eval('input[name="m-slot"]', (r) => r.length), 0);
  await a.click("#m-submit");
  assert.match(await a.textContent("#m-msg"), /Enter your name/);
  await a.fill("#m-name", "E2E Student A");
  await a.fill("#m-item", "Brownies");
  await a.fill("#m-note", "contains nuts");
  await a.click("#m-submit");
  await a.waitForFunction(() => /signed up to bring Brownies/.test(document.getElementById("m-msg").textContent));
  assert.match(await text(a, "#m-list"), /Brownies · E2E Student A \(contains nuts\) \(you\)/);
  await a.click("#club-signup-dialog [data-close]");
  assert.match(await text(a, "#club-next-body"), /1 person is bringing 1 dish\./);
  const cardList = await text(a, "#club-next-body .club-next-bring");
  assert.match(cardList, /Brownies · E2E Student A \(contains nuts\) \(you\)/, "card list updates after signing up");
  assert.doesNotMatch(cardList, /Main dish|Dessert|Drinks|signed up/, "one plain list, no category boxes");
  // the same person brings a second dish: counted once, with both dishes
  await a.click("#club-next-body [data-signup]");
  await a.waitForSelector("#club-signup-dialog[open]");
  assert.equal(await a.inputValue("#m-name"), "E2E Student A", "name remembered for the next dish");
  await a.fill("#m-item", "Lemon bars");
  await a.click("#m-submit");
  await a.waitForFunction(() => /Bringing something else too\?/.test(document.getElementById("m-msg").textContent));
  await a.click("#club-signup-dialog [data-close]");
  assert.match(await text(a, "#club-next-body"), /1 person is bringing 2 dishes\./);
  // take the second dish back off so the rest of the test starts from one dish
  await a.click("#club-next-body [data-signup]");
  await a.waitForSelector('#club-signup-dialog[open] #m-mine li:has-text("Lemon bars")');
  await a.click('#m-mine li:has-text("Lemon bars") [data-remove]');
  await a.waitForFunction(() => /removed/.test(document.getElementById("m-msg").textContent));
  await a.click("#club-signup-dialog [data-close]");
  assert.match(await text(a, "#club-next-body"), /1 person is bringing 1 dish\./);

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
  await b.fill("#su-item", "Lemonade");
  await b.click("#su-submit");
  await b.waitForFunction(() => /Lemonade/.test(document.getElementById("su-msg").textContent));
  assert.match(await text(b, '#su-pick-options label:has-text("November 19")'), /2 people are bringing 2 dishes/, "step 1 card count updates after signing up");
  assert.equal(await b.isChecked("#su-ev-" + novId), true, "selection kept after the counts update");

  // A changes and then removes their entry (pop-up again). A's page loaded before B signed
  // up, so the pop-up must fetch fresh data to show B's lemonade.
  await a.click("#club-next-body [data-signup]");
  await a.waitForSelector("#club-signup-dialog[open]");
  assert.match(await text(a, "#m-list"), /Lemonade · E2E Student B/, "pop-up shows sign-ups made after the page loaded");
  await a.click("#m-mine [data-edit]");
  await a.fill("#m-item", "Cookies");
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
  // on a computer: no QR code; the Thanksgiving flyer is beside the next-meeting card until
  // November 19, and it opens the PDF to view or print
  assert.equal(await o.$$eval('img[src$="qr-club.svg"]', (l) => l.length), 0, "no QR code on the home page");
  await o.waitForSelector("#club-flyer-panel:not([hidden]) .club-flyer");
  assert.equal(await o.$$eval("#club-flyers .club-flyer", (l) => l.length), 1, "one event flyer (the website flyer isn't tied to an event)");
  assert.match(await text(o, "#club-flyer-panel"), /^Flyer Thanksgiving Dinner View or print \(PDF\)/);
  const [nextBox, flyerBox] = [await o.$eval(".club-next", (e) => e.getBoundingClientRect().toJSON()), await o.$eval("#club-flyer-panel", (e) => e.getBoundingClientRect().toJSON())];
  assert.ok(flyerBox.left >= nextBox.right && Math.abs(flyerBox.top - nextBox.top) < 2, "desktop: the flyer sits beside the next-meeting card");
  const flyerLink = await o.$eval("#club-flyers .club-flyer", (x) => ({ href: x.href, target: x.target }));
  assert.match(flyerLink.href, /\/msclub\/flyers\/2026-11-19-thanksgiving-dinner\.pdf$/);
  assert.equal(flyerLink.target, "_blank");
  await o.waitForFunction(() => { const i = document.querySelector("#club-flyers img"); return i.complete && i.naturalWidth > 0; });
  const flyerPdf = await o.request.get(flyerLink.href);
  assert.equal(flyerPdf.status(), 200);
  assert.equal((await flyerPdf.body()).subarray(0, 5).toString(), "%PDF-");
  assert.deepEqual(await o.evaluate(() => [Club.flyerOnHome({ event_date: "2026-11-19" }, "2026-11-19"), Club.flyerOnHome({ event_date: "2026-11-19" }, "2026-11-20"), Club.flyerOnHome({ event_date: null }, "2026-11-05")]),
    [true, false, false], "an event flyer shows through its day; the website flyer never shows here");
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
  // flyer library: oldest first (the website flyer first), View or print and Download; nothing archived yet
  await o.waitForSelector("#of-flyers .club-flyer-item");
  assert.deepEqual(await o.$$eval("#of-flyers h3", (h) => h.map((x) => x.textContent)), ["The club has a website", "Thanksgiving Dinner"]);
  assert.equal(await o.textContent("#of-flyers-archive-count"), "0");
  assert.match(await text(o, '#of-flyers li:has-text("Thanksgiving")'), /Made November 9, 2026\. On the club home page through Thursday, November 19, 2026\. View or print/);
  assert.equal(await o.getAttribute('#of-flyers li:has-text("Thanksgiving") a[download]', "download"), "Math-Science-Club-Thanksgiving-Dinner-flyer.pdf");
  assert.equal(await o.getAttribute('#of-flyers li:has-text("Thanksgiving") a[target=_blank].club-btn', "href"), "../flyers/2026-11-19-thanksgiving-dinner.pdf");
  await o.click('#of-upcoming li:has-text("Nov 19") [data-edit]');
  await o.waitForSelector("#of-editor[open]");
  assert.equal(await o.isVisible("#of-slots-setup"), false, "no categories to set up for food");
  await o.fill("#of-theme", "Tacos");
  await o.fill("#of-location", "E2E Room 101");
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
  // work this event: STEAM Day volunteers pick a shift. STEAM Day's card links to its info
  // page, so its form opens here from a link that names it (the info page's fallback)
  assert.equal(await a.getAttribute('#su-events a.club-pick-link:has-text("STEAM Day Somerset 2027")', "href"), "../events/steam-day-2027/");
  const steamId = await a.evaluate(async () => (await Club.load("../")).events.find((e) => e.page === "steam-day-2027").id);
  await a.goto(SITE + "signup/" + Q + "&event=" + steamId);
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

  // one volunteer list (places assigned later), on a temporary event so the seeded data
  // stays as it was: a new "work this event" sign-up starts with one Volunteers list; the
  // officer adds a note with an email; volunteers give only their name; the email is a link
  await o.click("#of-add");
  await o.fill("#of-date", "2027-02-19");
  await o.fill("#of-title", "E2E Volunteer Day");
  await o.selectOption("#of-kind", "event");
  await o.check("#of-signup");
  await o.selectOption("#of-signup-kind", "work");
  assert.deepEqual(await o.$$eval("[data-slot-label]", (i) => i.map((x) => x.value)), ["Volunteers"], "work starts with one volunteer list");
  await o.fill("#of-signup-note", "We'll assign your place near or on the date of the event. Questions? Contact justin.howard@kctcs.edu.");
  await o.click("#of-save");
  await o.waitForFunction(() => /Saved: E2E Volunteer Day/.test(document.getElementById("of-list-msg").textContent));
  await a.goto(SITE + "signup/" + Q);
  await a.click('#su-events label:has-text("E2E Volunteer Day")');
  await a.waitForSelector("#su-app:not([hidden]) #su-list");
  assert.equal(await a.isVisible("#su-slots-wrap"), false, "no shift or role to pick");
  assert.equal(await a.getAttribute('#su-info a[href^="mailto:"]', "href"), "mailto:justin.howard@kctcs.edu");
  await a.fill("#su-name", "E2E Helper");
  await a.click("#su-submit");
  await a.waitForFunction(() => /signed up to work this event/.test(document.getElementById("su-msg").textContent));
  assert.match(await text(a, "#su-list"), /Volunteers 1 signed up E2E Helper \(you\)/);
  await o.click('#of-upcoming li:has-text("E2E Volunteer Day") [data-edit]');
  await o.click("#of-delete");
  await o.waitForFunction(() => /Deleted: E2E Volunteer Day/.test(document.getElementById("of-list-msg").textContent));

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
  await o.click("#of-save");
  await o.waitForFunction(() => /Saved/.test(document.getElementById("of-list-msg").textContent));

  // STEAM Day: the card's sign-up button goes to its info page, whose own button opens the form
  const v = await desktop();
  await v.goto(SITE + Q);
  await v.waitForSelector(".club-card");
  const steamInfoCard = v.locator('.club-card:has-text("STEAM Day Somerset 2027")');
  assert.equal(await steamInfoCard.locator(".club-card-actions a.club-btn").getAttribute("href"), "./events/steam-day-2027/");
  assert.equal(await steamInfoCard.locator(".club-card-title a").getAttribute("href"), "./events/steam-day-2027/", "the title links to the info page too");
  assert.equal(await steamInfoCard.locator("[data-signup]").count(), 0, "no pop-up from the card");
  // anywhere on the card goes there, not just the button: click on the date, as a person would
  await steamInfoCard.scrollIntoViewIfNeeded();
  const dateBox = await steamInfoCard.locator(".club-date").boundingBox();
  await v.mouse.click(dateBox.x + dateBox.width / 2, dateBox.y + dateBox.height / 2);
  await v.waitForURL(/\/msclub\/events\/steam-day-2027\/$/);
  await v.waitForFunction(() => /to about/.test(document.getElementById("ev-when").textContent) && !document.querySelector("[data-ev-count]").hidden);
  assert.equal(await text(v, "#ev-when"), "Friday, March 5, 2027 · 8:00 AM to about 2:00 PM · North Campus");
  assert.equal(await v.textContent("h1"), "STEAM Day 2027: Volunteer with the Math & Science Club");
  const evButtons = v.locator("[data-ev-signup]");
  assert.deepEqual(await evButtons.allInnerTexts(), ["Sign up to work this event", "Sign up to work this event"], "a button at the top and after \"Sign up below\"");
  assert.match(await text(v, ".club-event-cta >> nth=0"), /Nobody has signed up yet\./);
  assert.match(await text(v, ".club-event-scholars"), /MSSE scholars: working STEAM Day counts as one of the 4 activities you need each semester\./);
  assert.ok(await v.evaluate(() => {
    const last = [...document.querySelectorAll("[data-ev-signup]")].pop(), f = document.querySelector(".club-footnote");
    return !!(last.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING) && f.textContent === "ESTEM paid eligibility may be available. Ask your mentor or event sponsor for details.";
  }), "the ESTEM footnote follows the sign-up line");
  assert.deepEqual(await v.$$eval('main a[href^="http"]', (l) => l.map((x) => [new URL(x.href).hostname, x.target])),
    [["somerset.kctcs.edu", "_blank"], ["students-residents.aamc.org", "_blank"], ["www.abet.org", "_blank"]]);
  // the top button opens the sign-up form; sign up, see the count, then take it back off
  await evButtons.first().click();
  await v.waitForSelector("#club-signup-dialog[open] #m-name");
  assert.equal(await v.textContent("#club-modal-title"), "Sign up to work this event");
  assert.doesNotMatch(await text(v, "#m-info"), /More about/, "no link to the page you're already on");
  await v.fill("#m-name", "E2E Volunteer");
  if (await v.isVisible('input[name="m-slot"]')) await v.check('input[name="m-slot"] >> nth=0'); // the test database still has shifts
  await v.click("#m-submit");
  await v.waitForFunction(() => /You're signed up to work this event/.test(document.getElementById("m-msg").textContent));
  await v.click("#club-signup-dialog [data-close]");
  assert.match(await text(v, ".club-event-cta >> nth=0"), /1 person has signed up\./);
  await evButtons.last().click();
  await v.waitForSelector('#club-signup-dialog[open] #m-mine li:has-text("E2E Volunteer")');
  await v.click('#m-mine li:has-text("E2E Volunteer") [data-remove]');
  await v.waitForFunction(() => /removed/.test(document.getElementById("m-msg").textContent));
  await v.click("#club-signup-dialog [data-close]");
  assert.match(await text(v, ".club-event-cta >> nth=1"), /Nobody has signed up yet\./);
  // on the sign-up page, the STEAM Day card goes straight to its info page (no form in between)
  const steamHref = await v.getAttribute("[data-ev-signup] >> nth=0", "href"); // ../../signup/?event=<id>, the pop-up's fallback
  await v.goto(SITE + "signup/" + Q);
  const steamPick = v.locator('#su-pick-events a.club-pick-link:has-text("STEAM Day")');
  assert.equal(await steamPick.getAttribute("href"), "../events/steam-day-2027/");
  assert.match(await steamPick.innerText(), /Details and sign-up/);
  assert.equal(await v.locator('#su-pick-events input[type=radio]').evaluateAll((r) => r.filter((x) => x.closest(".club-pick-option").textContent.includes("STEAM")).length), 0, "no radio for STEAM Day");
  await steamPick.click();
  await v.waitForURL(/\/msclub\/events\/steam-day-2027\/$/);
  // a link that names the event still opens its form there (for browsers without the pop-up)
  await v.goto(SITE + "signup/" + steamHref.split("signup/")[1]);
  await v.waitForSelector('#su-info a:has-text("More about STEAM Day Somerset 2027")');
  assert.equal(await v.isVisible("#su-app"), true);

  // once a flyer's event date has passed it leaves the home page and moves to the archive
  // (here the Thanksgiving flyer's date is moved to November 1; the test database's today is November 5)
  const r = await desktop();
  await r.route("**/flyers/flyers.json", async (route) => {
    const res = await route.fetch(), j = await res.json();
    j.flyers.find((f) => f.id === "2026-11-19-thanksgiving-dinner").event_date = "2026-11-01";
    await route.fulfill({ response: res, json: j });
  });
  await r.goto(SITE + Q);
  await r.waitForSelector("#club-flyers[data-shown]", { state: "attached" });
  assert.equal(await r.getAttribute("#club-flyers", "data-shown"), "0");
  assert.equal(await r.isVisible("#club-flyer-panel"), false, "past flyer is off the home page");
  const [topBox, cardBox] = [await r.$eval(".club-top", (e) => e.getBoundingClientRect().toJSON()), await r.$eval(".club-next", (e) => e.getBoundingClientRect().toJSON())];
  assert.ok(Math.abs(topBox.width - cardBox.width) < 2, "with no flyer the next-meeting card takes the full width");
  await r.goto(SITE + "officers/" + Q);
  await r.fill("#of-code", CODE);
  await r.click("#of-signin-form button[type=submit]");
  await r.waitForSelector("#of-flyers-archive .club-flyer-item", { state: "attached" }); // inside the closed Archive
  assert.deepEqual(await r.$$eval("#of-flyers h3", (h) => h.map((x) => x.textContent)), ["The club has a website"]);
  assert.equal(await r.textContent("#of-flyers-archive-count"), "1");
  await r.click('summary:has-text("Archive")');
  assert.match(await text(r, "#of-flyers-archive"), /Thanksgiving Dinner[\s\S]*Made November 9, 2026\. Event: Sunday, November 1, 2026\./);

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
  await s.goto(SITE + "events/steam-day-2027/?api=off");
  await s.waitForFunction(() => !document.querySelector("[data-ev-closed]").hidden);
  assert.match(await text(s, "[data-ev-closed] >> nth=0"), /Sign-up isn't available right now/);
  assert.equal(await s.isVisible("[data-ev-signup] >> nth=0"), false, "no sign-up button without the database");
  assert.equal(await text(s, "#ev-when"), "Friday, March 5, 2027 · 8:00 AM to about 2:00 PM · North Campus", "date and time from the printed schedule");

  assert.deepEqual(errors, [], "no page errors");
  console.log("PASS club pages end-to-end");
} catch (e) {
  console.error("FAIL", e.message, (e.stack || "").split("\n").find((l) => l.includes("club-pages.e2e")) || "");
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.close();
}
