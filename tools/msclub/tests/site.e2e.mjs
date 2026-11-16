#!/usr/bin/env node
// Browser test of the club site's page layout (assets/site.js) against the local stand-in
// database. The sign-up, officer and fallback flows are in club-pages.e2e.mjs.
//   CLUB_TODAY=2026-11-05 node tools/msclub/local-api.mjs &
//   NODE_PATH=$(npm root -g) node tools/msclub/tests/site.e2e.mjs
// Checks:
//   - home: the next meeting appears once (in Up next, not again as a card), the next three
//     events as cards, the link to the full schedule; no recaps until there is one;
//     an old link to msclub/#schedule lands on the schedule page;
//   - header menu Home · Schedule · Officer tools on every club page; the footer keeps
//     Officer tools;
//   - schedule: List and Cards views (remembered), the "Sign-up open" filter, earlier events,
//     the printed-schedule note;
//   - event page: details, sign-up button, no calendar file; who's bringing what with each
//     note on its own line underneath, and even spacing with or without notes; the sign-up
//     page has the same list and a link back to the event; a past event has no sign-up;
//   - the sign-up page with no event named lists the events taking sign-ups;
//   - sign-up closed site-wide by the officers: no sign-up buttons, and the pages say so;
//   - on a computer the footer doesn't jump: at the bottom of the window on a short page,
//     out of view while the schedule loads, scrollbar room always kept.
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
const rpc = async (fn, body) => (await fetch(`${API}/rest/v1/rpc/${fn}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();
const admin = (action, payload = {}) => rpc("club_admin", { p_code: CODE, p_action: action, p_payload: payload });
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
const MENU = ["Home", "Schedule", "Officer tools"];
const menu = (p) => p.$$eval('.club-bar nav[aria-label="Club"] a', (x) => x.map((a) => a.textContent.trim()));

let browser;
try {
  browser = await chromium.launch();
  const errors = [];
  const p = await (await browser.newContext({ ...devices["Pixel 7"], timezoneId: "America/New_York" })).newPage();
  p.on("pageerror", (e) => errors.push(String(e)));

  // home
  await p.goto(SITE + Q);
  await p.waitForSelector("#site-coming .club-card");
  assert.equal(await p.textContent("#site-next-label"), "Next meeting");
  assert.match(await p.innerText("#site-next .club-next-meta"), /Math and Science Club Meeting/);
  const cards = await p.$$eval("#site-coming .club-card-title", (x) => x.map((y) => y.textContent));
  assert.equal(cards.length, 3, "the next three events after Up next");
  assert.equal(cards.includes("Math and Science Club Meeting"), false, "the next meeting isn't repeated as a card");
  assert.match(await p.innerText("#site-more"), /See the full schedule: 1 more coming up, 13 earlier this semester/);
  assert.equal(await p.isHidden("#site-news-wrap"), true, "no recaps written yet");
  assert.match(await p.getAttribute("#site-next a.club-btn", "href"), /^\.\/signup\/\?event=[0-9a-f-]{36}$/);
  assert.match(await p.getAttribute("#site-coming .club-card a.club-btn", "href"), /^\.\/signup\/\?event=[0-9a-f-]{36}$/);
  assert.equal(await p.$(".pv-banner, .site-banner"), null, "no preview banner");
  assert.equal(await p.getAttribute('meta[name="robots"]', "content"), "noindex, nofollow", "kept out of search engines for now");
  assert.deepEqual(await menu(p), MENU);
  assert.equal(await p.getAttribute('.club-bar nav a[aria-current="page"]', "href"), "./");
  assert.equal(await p.$(".club-bar-officer"), null, "no separate Officer tools button at the right edge");
  assert.equal(await p.$$eval('.club-footer a[href="officers/"]', (x) => x.length), 1, "Officer tools stays in the footer");
  // an old link to the schedule section of the home page
  await p.goto(SITE + "#schedule");
  await p.waitForURL(/\/msclub\/schedule\/$/);

  // schedule: List (default), Cards, filter, earlier
  await p.goto(SITE + "schedule/" + Q);
  await p.waitForSelector("#site-upcoming .site-row");
  assert.deepEqual(await menu(p), MENU);
  assert.equal(await p.getAttribute('.club-bar nav a[aria-current="page"]', "href"), "../schedule/");
  assert.equal(await p.$$eval("#site-upcoming .site-row", (x) => x.length), 5);
  assert.equal(await p.isHidden("#site-past-wrap"), false);
  assert.match(await p.innerText(".club-fine"), /MSSE scholars need to attend at least 4 each semester/);
  // STEAM Day has its own page: its title and button go there
  const steamRow = p.locator('.site-row:has-text("STEAM Day Somerset 2027")');
  assert.equal(await steamRow.locator(".site-row-title a").getAttribute("href"), "../events/steam-day-2027/");
  assert.equal(await steamRow.locator("a.club-btn").getAttribute("href"), "../events/steam-day-2027/");
  assert.match(await steamRow.innerText(), /Help eighth graders explore science at SCC/, "its line from data/pages.json");
  await p.click('[data-filter="signup"]');
  assert.deepEqual(await p.$$eval("#site-upcoming .site-row-title", (x) => x.map((y) => y.textContent)),
    ["Math and Science Club Meeting", "Math and Science Club Holiday Party", "STEAM Day Somerset 2027"]);
  await p.click('[data-view="cards"]');
  await p.waitForSelector("#site-upcoming .club-card");
  assert.equal(await p.$$eval("#site-upcoming .club-card", (x) => x.length), 3);
  await p.reload();
  await p.waitForSelector("#site-upcoming .club-card");
  assert.equal(await p.getAttribute('[data-view="cards"]', "aria-pressed"), "true", "the chosen view is remembered");
  await p.click('[data-view="list"]');

  // event page: the next meeting. Two sign-ups go in through the local API first (one with
  // a note, one without) and come out again at the end of this block.
  const meetingHref = await p.getAttribute('#site-upcoming .site-row-title a:text-is("Math and Science Club Meeting")', "href");
  const meetingId = new URLSearchParams(meetingHref.split("?")[1]).get("id");
  const added = [
    await rpc("club_signup", { p_event_id: meetingId, p_entry: { name: "Test Person A", slot: "Food or drink", item: "Turkey", note: "fried in peanut oil" } }),
    await rpc("club_signup", { p_event_id: meetingId, p_entry: { name: "Test Person B", slot: "Food or drink", item: "Autumn Harvest Pasta Salad", note: "" } }),
  ];
  assert.ok(added.every((r) => r.ok), "test sign-ups saved locally");
  try {
    await p.click('#site-upcoming .site-row-title a:text-is("Math and Science Club Meeting")');
    await p.waitForFunction(() => document.getElementById("ev-title").textContent === "Math and Science Club Meeting");
    assert.deepEqual(await menu(p), MENU);
    assert.equal(await p.textContent("#ev-kicker"), "Club meeting · Sign-up open");
    assert.match(await p.innerText("#site-event .club-event-when"), /Thursday, November 19, 2026 · 5:00 PM/);
    assert.match(await p.getAttribute("#site-event .club-event-cta a.club-btn", "href"), /^\.\.\/signup\/\?event=/);
    assert.equal(await p.$("#pv-ics, #site-ics"), null, "no Add to my calendar (dropped, Justin's call)");
    assert.doesNotMatch(await p.innerText("#site-event"), /Add to my calendar|Sample text|sample/i);
    // who's bringing what: the note sits on its own line under the entry, without brackets,
    // and every row is spaced the same whether or not it has a note
    const rows = await p.$$eval(".site-bring li", (x) => x.map((li) => {
      const line = li.querySelector(".club-bring-line"), note = li.querySelector(".note"), cs = getComputedStyle(li);
      return { line: line && line.textContent, note: note && note.textContent, noteBlock: !!note && getComputedStyle(note).display === "block",
        noteIndented: !!note && note.getBoundingClientRect().left > line.getBoundingClientRect().left, pad: [cs.paddingTop, cs.paddingBottom] };
    }));
    assert.deepEqual(rows.map((r) => [r.line, r.note]), [["Turkey · Test Person A", "fried in peanut oil"], ["Autumn Harvest Pasta Salad · Test Person B", null]]);
    assert.ok(rows[0].noteBlock && rows[0].noteIndented, "the note is on its own line, indented");
    assert.deepEqual(rows[0].pad, rows[1].pad, "rows with and without a note are spaced the same");

    // its sign-up page: the club menu, a link back, the same list, and the form
    await p.click("#site-event .club-event-cta a.club-btn");
    await p.waitForSelector("#su-form");
    assert.deepEqual(await menu(p), MENU);
    assert.equal(await p.getAttribute("main h1", "class"), "visually-hidden", "the heading is for screen readers when the form shows");
    assert.match(await p.innerText("#site-signup-back"), /Math and Science Club Meeting details/);
    assert.match(await p.getAttribute("#site-signup-back a", "href"), /^\.\.\/event\/\?id=/);
    assert.deepEqual(await p.$$eval("#su-list li .note", (x) => x.map((n) => n.textContent)), ["fried in peanut oil"], "notes under the entry here too");
    assert.equal(await p.$$eval("#su-list .club-bring-line", (x) => x.length), 2);
    assert.equal(await p.isDisabled("#su-submit"), false);
  } finally {
    for (const r of added) if (r.ok) await rpc("club_signup_remove", { p_id: r.id, p_token: r.token });
  }

  // a past event: no sign-up, and nothing written about it yet
  await p.goto(SITE + "schedule/" + Q);
  await p.waitForSelector("#site-upcoming .site-row");
  await p.click("#site-past-wrap summary");
  await p.click('#site-past .site-row-title a:text-is("Laurel STEAM Day")');
  await p.waitForFunction(() => document.getElementById("ev-title").textContent === "Laurel STEAM Day");
  assert.equal(await p.textContent("#ev-kicker"), "Event · Past event");
  assert.equal(await p.$("#site-event .club-event-cta"), null);

  // the sign-up page with no event named: the events taking sign-ups
  await p.goto(SITE + "signup/" + Q);
  await p.waitForSelector("#site-choose:not([hidden]) .site-row");
  assert.equal(await p.getAttribute("main h1", "class"), "site-page-title");
  assert.deepEqual(await p.$$eval("#site-choose .site-row-title", (x) => x.map((y) => y.textContent)),
    ["Math and Science Club Meeting", "Math and Science Club Holiday Party", "STEAM Day Somerset 2027"]);
  assert.equal(await p.isHidden("#site-signup"), true);
  // a link naming an event that isn't taking sign-ups says so, and lists the ones that are
  await p.goto(SITE + "signup/" + Q + "&event=00000000-0000-0000-0000-000000000000");
  await p.waitForSelector("#site-choose:not([hidden])");
  assert.match(await p.innerText("#site-choose"), /That event isn't on the schedule\./);

  // officers close sign-up for the whole site: no buttons, and the pages say so
  assert.equal((await admin("set_signups_open", { open: false })).ok, true);
  try {
    await p.goto(SITE + Q);
    await p.waitForSelector("#site-coming .club-card");
    assert.equal(await p.$$eval("#site-next a.club-btn, #site-coming a.club-btn", (x) => x.length), 0, "no sign-up buttons while sign-up is closed");
    assert.match(await p.innerText("#site-next"), /Sign-up is closed right now\./);
    await p.goto(SITE + "schedule/" + Q);
    await p.waitForSelector("#site-upcoming .site-row");
    assert.equal(await p.$$eval(".site-chip-open", (x) => x.length), 0, "nothing is labelled Sign-up open");
    await p.click('[data-filter="signup"]');
    assert.match(await p.innerText("#site-upcoming"), /No upcoming events match/);
    await p.goto(SITE + "signup/" + Q + "&event=" + meetingId);
    await p.waitForSelector("#su-form");
    assert.equal(await p.isDisabled("#su-submit"), true, "the form is closed too");
    assert.match(await p.innerText("#su-msg"), /Sign-up is closed right now/);
  } finally {
    assert.equal((await admin("set_signups_open", { open: true })).ok, true);
  }

  // the other club pages have the same menu
  for (const rel of ["officers/", "qr/", "events/steam-day-2027/"]) {
    await p.goto(SITE + rel + Q);
    assert.deepEqual(await menu(p), MENU, rel);
    assert.equal(await p.$(".club-bar-officer"), null, rel);
  }

  // the footer doesn't jump between pages on a computer: a short page fills the window, so
  // its footer sits at the bottom; while the schedule loads the footer stays out of view;
  // room for the scrollbar is always kept
  const d = await (await browser.newContext({ viewport: { width: 1920, height: 1300 }, timezoneId: "America/New_York" })).newPage();
  d.on("pageerror", (e) => errors.push(String(e)));
  await d.route(/\/rpc\/club_events$/, async (r) => { await new Promise((z) => setTimeout(z, 800)); await r.continue().catch(() => {}); });
  for (const rel of ["signup/", "event/?id=" + meetingId]) {
    await d.goto(SITE + rel + (rel.includes("?") ? "&" : "?") + Q.slice(1), { waitUntil: "domcontentloaded" });
    assert.equal(await d.evaluate(() => document.body.classList.contains("is-loading")), true, rel);
    assert.ok(await d.evaluate(() => document.querySelector("footer.club-footer").getBoundingClientRect().top >= innerHeight), rel + ": footer out of view while loading");
    await d.waitForFunction(() => !document.body.classList.contains("is-loading"));
    const f = await d.evaluate(() => ({ bottom: document.querySelector("footer.club-footer").getBoundingClientRect().bottom, h: innerHeight, gutter: getComputedStyle(document.documentElement).scrollbarGutter }));
    assert.ok(Math.abs(f.bottom - f.h) < 2, rel + ": short page, footer at the bottom of the window");
    assert.equal(f.gutter, "stable", rel);
  }

  assert.deepEqual(errors, [], "no page errors");
  console.log("PASS club site layout");
} catch (e) {
  console.error("FAIL", e.message, (e.stack || "").split("\n").find((l) => l.includes("site.e2e")) || "");
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.close();
}
