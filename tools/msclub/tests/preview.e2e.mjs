#!/usr/bin/env node
// Browser test of the club layout preview (msclub/preview/) against the local stand-in database.
//   CLUB_TODAY=2026-11-05 node tools/msclub/local-api.mjs &
//   NODE_PATH=$(npm root -g) node tools/msclub/tests/preview.e2e.mjs
// Checks:
//   - home: the next meeting appears once (in Up next, not again as a card), the next three
//     events as cards, the link to the full schedule, and the recaps;
//   - schedule: List and Cards views, the "Sign-up open" filter, earlier events;
//   - event page: details, sign-up button to the live form, who's signed up, add to calendar;
//     a past event shows its recap;
//   - sign-up closed site-wide by the officers: no sign-up buttons, and it says so;
//   - "Add to my calendar" files carry Somerset times as UTC, whatever the phone's time zone;
//   - read-only: no visit is counted and nothing is saved from the preview.
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
const admin = async (action, payload = {}) => (await fetch(`${API}/rest/v1/rpc/club_admin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ p_code: CODE, p_action: action, p_payload: payload }) })).json();
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
const PV = `http://127.0.0.1:${server.address().port}/msclub/preview/`;
const Q = `?api=${encodeURIComponent(API)}`;

let browser;
try {
  browser = await chromium.launch();
  const errors = [], writes = [];
  const watch = (p) => {
    p.on("pageerror", (e) => errors.push(String(e)));
    p.on("request", (r) => { if (/\/rpc\/club_(visit|signup|signup_update|signup_remove|admin|stats)$/.test(r.url())) writes.push(r.url()); });
    return p;
  };
  const p = watch(await (await browser.newContext({ ...devices["Pixel 7"], timezoneId: "America/New_York" })).newPage());

  // home
  await p.goto(PV + Q);
  await p.waitForSelector("#pv-coming .club-card");
  const nextTitle = await p.innerText("#pv-next .club-next-meta");
  assert.match(nextTitle, /Math and Science Club Meeting/);
  const cards = await p.$$eval("#pv-coming .club-card-title", (x) => x.map((y) => y.textContent));
  assert.equal(cards.length, 3, "the next three events after Up next");
  assert.equal(cards.includes("Math and Science Club Meeting"), false, "the next meeting isn't repeated as a card");
  assert.match(await p.innerText("#pv-more"), /See the full schedule: 1 more coming up, \d+ earlier this semester/);
  assert.deepEqual(await p.$$eval("#pv-news .club-card-title", (x) => x.map((y) => y.textContent)), ["Laurel STEAM Day", "Math and Science Club Meeting"]);
  assert.match(await p.getAttribute("#pv-coming .club-card a.club-btn", "href"), /^\.\.\/signup\/\?event=[0-9a-f-]{36}$/, "sign-up opens the live form");
  assert.ok((await p.textContent(".pv-banner")).includes("Layout preview"));

  // schedule: List (default), Cards, filter, earlier
  await p.goto(PV + "schedule/");
  await p.waitForSelector("#pv-upcoming .pv-row");
  assert.equal(await p.$$eval("#pv-upcoming .pv-row", (x) => x.length), 5);
  assert.equal(await p.isHidden("#pv-past-wrap"), false);
  await p.click('[data-filter="signup"]');
  assert.deepEqual(await p.$$eval("#pv-upcoming .pv-row-title", (x) => x.map((y) => y.textContent)),
    ["Math and Science Club Meeting", "Math and Science Club Holiday Party", "STEAM Day Somerset 2027"]);
  await p.click('[data-view="cards"]');
  await p.waitForSelector("#pv-upcoming .club-card");
  assert.equal(await p.$$eval("#pv-upcoming .club-card", (x) => x.length), 3);
  await p.reload();
  await p.waitForSelector("#pv-upcoming .club-card");
  assert.equal(await p.getAttribute('[data-view="cards"]', "aria-pressed"), "true", "the chosen view is remembered");
  await p.click('[data-view="list"]');

  // event page: the next meeting
  await p.click('#pv-upcoming .pv-row-title a:text-is("Math and Science Club Meeting")');
  await p.waitForFunction(() => document.getElementById("ev-title").textContent === "Math and Science Club Meeting");
  assert.equal(await p.textContent("#ev-kicker"), "Club meeting · Sign-up open");
  assert.match(await p.innerText("#pv-event .club-event-when"), /Thursday, November 19, 2026 · 5:00 PM/);
  assert.match(await p.getAttribute("#pv-event .club-event-cta a.club-btn", "href"), /^\.\.\/\.\.\/signup\/\?event=/);
  assert.ok(await p.$("#pv-ics"), "add to calendar");
  assert.match(await p.innerText(".pv-sample-note"), /Sample text/);

  // a past event shows its recap, and no sign-up
  await p.goto(PV + "schedule/");
  await p.waitForSelector("#pv-upcoming .pv-row");
  await p.click("#pv-past-wrap summary");
  await p.click('#pv-past .pv-row-title a:text-is("Laurel STEAM Day")');
  await p.waitForFunction(() => document.getElementById("ev-title").textContent === "Laurel STEAM Day");
  assert.equal(await p.textContent("#ev-kicker"), "Event · Recap");
  assert.equal(await p.$("#pv-event .club-event-cta"), null);

  // calendar files: Somerset wall-clock times, written as UTC, from a phone in another time zone
  const west = watch(await (await browser.newContext({ timezoneId: "America/Los_Angeles" })).newPage());
  await west.goto(PV + "schedule/");
  await west.waitForSelector("#pv-upcoming .pv-row");
  const ics = (e) => west.evaluate((x) => window.ClubPreview.ics(x), e);
  const winter = await ics({ id: "a", title: "Meeting", starts_on: "2026-11-19", start_time: "17:00", end_time: null });
  assert.match(winter, /\r\nDTSTART:20261119T220000Z\r\n/, "5:00 PM EST = 22:00 UTC");
  assert.doesNotMatch(winter, /DTEND/);
  const summer = await ics({ id: "b", title: "Social", starts_on: "2026-08-20", start_time: "17:00", end_time: "19:00" });
  assert.match(summer, /DTSTART:20260820T210000Z\r\nDTEND:20260820T230000Z/, "EDT is UTC-4");
  const afterChange = await ics({ id: "c", title: "Early", starts_on: "2027-03-14", start_time: "08:00", end_time: null });
  assert.match(afterChange, /DTSTART:20270314T120000Z/, "the morning daylight time starts");
  const allDay = await ics({ id: "d", title: "Tour", starts_on: "2026-09-11", start_time: null, end_time: null });
  assert.match(allDay, /DTSTART;VALUE=DATE:20260911\r\nDTEND;VALUE=DATE:20260912/);

  // officers close sign-up for the whole site: no buttons, and the preview says so
  assert.equal((await admin("set_signups_open", { open: false })).ok, true);
  try {
    await p.goto(PV);
    await p.waitForSelector("#pv-coming .club-card");
    assert.equal(await p.$$eval("#pv-next a.club-btn, #pv-coming a.club-btn", (x) => x.length), 0, "no sign-up buttons while sign-up is closed");
    assert.match(await p.innerText("#pv-next"), /Sign-up is closed right now\./);
    await p.goto(PV + "schedule/");
    await p.waitForSelector("#pv-upcoming .pv-row");
    assert.equal(await p.$$eval(".pv-chip-open", (x) => x.length), 0, "nothing is labelled Sign-up open");
    await p.click('[data-filter="signup"]');
    assert.match(await p.innerText("#pv-upcoming"), /No upcoming events match/);
  } finally {
    assert.equal((await admin("set_signups_open", { open: true })).ok, true);
  }

  assert.deepEqual(writes, [], "the preview counts no visits and saves nothing");
  assert.deepEqual(errors, [], "no page errors");
  console.log("PASS club layout preview");
} catch (e) {
  console.error("FAIL", e.message, (e.stack || "").split("\n").find((l) => l.includes("preview.e2e")) || "");
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.close();
}
