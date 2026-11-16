#!/usr/bin/env node
// Browser test of the club layout preview (msclub/preview/) against the local stand-in database.
//   CLUB_TODAY=2026-11-05 node tools/msclub/local-api.mjs &
//   NODE_PATH=$(npm root -g) node tools/msclub/tests/preview.e2e.mjs
// Checks:
//   - home: the next meeting appears once (in Up next, not again as a card), the next three
//     events as cards, the link to the full schedule, and the recaps;
//   - schedule: List and Cards views, the "Sign-up open" filter, earlier events;
//   - event page: details, sign-up button to the live form, no calendar file; who's bringing
//     what with each note on its own line underneath, and even spacing with or without notes;
//     a past event shows its recap;
//   - sign-up closed site-wide by the officers: no sign-up buttons, and it says so;
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
  // the header menu: Home, Schedule, then Officer tools; the footer keeps Officer tools too
  assert.deepEqual(await p.$$eval('.club-bar nav[aria-label="Club"] a', (x) => x.map((a) => a.textContent.trim())), ["Home", "Schedule", "Officer tools"]);
  assert.equal(await p.$(".club-bar-officer"), null, "no separate Officer tools button at the right edge");
  assert.equal(await p.$$eval('.club-footer a[href$="officers/"]', (x) => x.length), 1, "Officer tools stays in the footer");

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

  // event page: the next meeting. Two sign-ups go in through the local API first (one with
  // a note, one without) and come out again at the end of this block.
  const meetingHref = await p.getAttribute('#pv-upcoming .pv-row-title a:text-is("Math and Science Club Meeting")', "href");
  const meetingId = new URLSearchParams(meetingHref.split("?")[1]).get("id");
  const rpc = async (fn, body) => (await fetch(`${API}/rest/v1/rpc/${fn}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();
  const added = [
    await rpc("club_signup", { p_event_id: meetingId, p_entry: { name: "Test Person A", slot: "Food or drink", item: "Turkey", note: "fried in peanut oil" } }),
    await rpc("club_signup", { p_event_id: meetingId, p_entry: { name: "Test Person B", slot: "Food or drink", item: "Autumn Harvest Pasta Salad", note: "" } }),
  ];
  assert.ok(added.every((r) => r.ok), "test sign-ups saved locally");
  try {
    await p.click('#pv-upcoming .pv-row-title a:text-is("Math and Science Club Meeting")');
    await p.waitForFunction(() => document.getElementById("ev-title").textContent === "Math and Science Club Meeting");
    assert.equal(await p.textContent("#ev-kicker"), "Club meeting · Sign-up open");
    assert.match(await p.innerText("#pv-event .club-event-when"), /Thursday, November 19, 2026 · 5:00 PM/);
    assert.match(await p.getAttribute("#pv-event .club-event-cta a.club-btn", "href"), /^\.\.\/\.\.\/signup\/\?event=/);
    assert.equal(await p.$("#pv-ics"), null, "no Add to my calendar (dropped, Justin's call)");
    assert.doesNotMatch(await p.innerText("#pv-event"), /Add to my calendar/);
    assert.match(await p.innerText(".pv-sample-note"), /Sample text/);
    // who's bringing what: the note sits on its own line under the entry, without brackets,
    // and every row is spaced the same whether or not it has a note
    const rows = await p.$$eval(".pv-bring li", (x) => x.map((li) => {
      const line = li.querySelector(".club-bring-line"), note = li.querySelector(".note"), cs = getComputedStyle(li);
      return { line: line && line.textContent, note: note && note.textContent, noteBlock: !!note && getComputedStyle(note).display === "block",
        noteIndented: !!note && note.getBoundingClientRect().left > line.getBoundingClientRect().left, pad: [cs.paddingTop, cs.paddingBottom] };
    }));
    assert.deepEqual(rows.map((r) => [r.line, r.note]), [["Turkey · Test Person A", "fried in peanut oil"], ["Autumn Harvest Pasta Salad · Test Person B", null]]);
    assert.ok(rows[0].noteBlock && rows[0].noteIndented, "the note is on its own line, indented");
    assert.deepEqual(rows[0].pad, rows[1].pad, "rows with and without a note are spaced the same");
  } finally {
    for (const r of added) if (r.ok) await rpc("club_signup_remove", { p_id: r.id, p_token: r.token });
  }

  // a past event shows its recap, and no sign-up
  await p.goto(PV + "schedule/");
  await p.waitForSelector("#pv-upcoming .pv-row");
  await p.click("#pv-past-wrap summary");
  await p.click('#pv-past .pv-row-title a:text-is("Laurel STEAM Day")');
  await p.waitForFunction(() => document.getElementById("ev-title").textContent === "Laurel STEAM Day");
  assert.equal(await p.textContent("#ev-kicker"), "Event · Recap");
  assert.equal(await p.$("#pv-event .club-event-cta"), null);

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
