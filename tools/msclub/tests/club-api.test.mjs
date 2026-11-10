// Contract tests for the club API (msclub/sql/001_club.sql, 002, 003, 004, 005, 006, 007, 008).
// Run against the local stand-in (never production), with "today" fixed so the seeded
// Fall 2026 schedule has upcoming events:
//   CLUB_TODAY=2026-11-05 node tools/msclub/local-api.mjs &
//   node --test tools/msclub/tests/*.test.mjs
// Environment: CLUB_API_URL (default http://127.0.0.1:8789), CLUB_OFFICER_CODE (default local-officer-code).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API = (process.env.CLUB_API_URL || "http://127.0.0.1:8789").replace(/\/$/, "");
const CODE = process.env.CLUB_OFFICER_CODE || "local-officer-code";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function rpc(fn, args = {}) {
  const r = await fetch(`${API}/rest/v1/rpc/${fn}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(args) });
  const body = await r.json();
  if (!r.ok) throw new Error(`${fn} HTTP ${r.status}: ${JSON.stringify(body)}`);
  return body;
}
const admin = (action, payload = {}, code = CODE) => rpc("club_admin", { p_code: code, p_action: action, p_payload: payload });
const events = async () => (await rpc("club_events")).events;
const find = async (date, title) => (await events()).find((e) => e.starts_on === date && e.title === title);

test("seeded schedule matches the static fallback (data/events.json)", async () => {
  const live = await events();
  const stat = JSON.parse(fs.readFileSync(path.join(ROOT, "msclub/data/events.json"), "utf8")).events;
  const strip = (e) => [e.starts_on, e.ends_on, e.start_time, e.end_time, e.title, e.theme, e.kind, e.tentative, e.page || null, e.signup_enabled, e.signup_kind, e.signup_note, JSON.stringify(e.slots)];
  const seeded = live.filter((e) => stat.some((s) => s.starts_on === e.starts_on && s.title === e.title));
  assert.equal(seeded.length, 18);
  assert.deepEqual(seeded.map(strip), stat.map(strip));
});

test("November meeting is on the third Thursday and has food sign-up (no categories)", async () => {
  const nov = await find("2026-11-19", "Math and Science Club Meeting");
  assert.ok(nov);
  const d = new Date(Date.UTC(2026, 10, 19));
  assert.equal(d.getUTCDay(), 4); // Thursday
  assert.ok(d.getUTCDate() > 14 && d.getUTCDate() <= 21); // third one
  assert.equal(nov.start_time, "17:00");
  assert.equal(nov.signup_enabled, true);
  assert.deepEqual(nov.slots, [], "005: no categories for food");
});

test("sign up, see it, change it, remove it (only with this device's token)", async () => {
  const nov = await find("2026-11-19", "Math and Science Club Meeting");
  const r = await rpc("club_signup", { p_event_id: nov.id, p_entry: { name: "Test A.", slot: "Dessert", item: "Brownies", note: "contains nuts" } });
  assert.equal(r.ok, true); assert.ok(r.token);
  let s = (await find("2026-11-19", "Math and Science Club Meeting")).signups.find((x) => x.id === r.id);
  assert.deepEqual([s.name, s.slot, s.item, s.note], ["Test A.", "Food or drink", "Brownies", "contains nuts"], "a category sent for food is ignored");
  assert.equal("token" in s || "token_hash" in s, false, "token never public");
  assert.equal((await rpc("club_signup", { p_event_id: nov.id, p_entry: { name: "test a.", slot: "Dessert", item: "brownies" } })).error, "duplicate");
  assert.equal((await rpc("club_signup_update", { p_id: r.id, p_token: "wrong", p_entry: { item: "Cookies" } })).error, "not_yours");
  assert.equal((await rpc("club_signup_update", { p_id: r.id, p_token: r.token, p_entry: { item: "Cookies", slot: "Snack" } })).ok, true);
  s = (await find("2026-11-19", "Math and Science Club Meeting")).signups.find((x) => x.id === r.id);
  assert.deepEqual([s.slot, s.item, s.note], ["Food or drink", "Cookies", "contains nuts"]);
  assert.equal((await rpc("club_signup_remove", { p_id: r.id, p_token: "wrong" })).error, "not_yours");
  assert.equal((await rpc("club_signup_remove", { p_id: r.id, p_token: r.token })).ok, true);
  assert.equal((await find("2026-11-19", "Math and Science Club Meeting")).signups.some((x) => x.id === r.id), false);
});

test("sign-up validation", async () => {
  const nov = await find("2026-11-19", "Math and Science Club Meeting");
  const oct = await find("2026-10-15", "Math and Science Club Meeting");
  const grad = await find("2026-12-10", "Fall Graduation");
  assert.equal((await rpc("club_signup", { p_event_id: nov.id, p_entry: { slot: "Side", item: "Chips" } })).error, "no_name");
  assert.equal((await rpc("club_signup", { p_event_id: nov.id, p_entry: { name: "X", slot: "Side" } })).error, "no_item");
  const any = await rpc("club_signup", { p_event_id: nov.id, p_entry: { name: "X", slot: "Lobster", item: "y" } });
  assert.equal(any.ok, true, "food has no categories, so any slot sent is ignored");
  assert.equal((await rpc("club_signup_remove", { p_id: any.id, p_token: any.token })).ok, true);
  assert.equal((await rpc("club_signup", { p_event_id: grad.id, p_entry: { name: "X", slot: "Side", item: "y" } })).error, "no_signup");
  // October meeting is in the past (today fixed at 2026-11-05); enabling sign-up there must still refuse
  const saved = await admin("save_event", { ...oct, signup_enabled: true });
  assert.equal(saved.ok, true);
  assert.equal((await rpc("club_signup", { p_event_id: oct.id, p_entry: { name: "X", slot: "Food or drink", item: "y" } })).error, "event_past");
  await admin("save_event", { ...oct, signup_enabled: false });
});

test("work this event: STEAM Day volunteers (no item; shifts; a shift closes when full)", async () => {
  let steam = await find("2027-03-05", "STEAM Day Somerset 2027");
  assert.ok(steam, "STEAM Day seeded by 003");
  assert.deepEqual([steam.kind, steam.signup_enabled, steam.signup_kind], ["event", true, "work"]);
  assert.deepEqual(steam.slots.map((s) => s.label), ["Setup", "Activity tables", "Cleanup"]);
  assert.match(steam.signup_note, /S-STEM scholars/);
  assert.equal((await rpc("club_signup", { p_event_id: steam.id, p_entry: { name: "Vol A." } })).error, "bad_slot", "a shift is required");
  const a = await rpc("club_signup", { p_event_id: steam.id, p_entry: { name: "Vol A.", slot: "Setup", item: "ignored" } });
  assert.equal(a.ok, true, "no item needed");
  assert.equal((await rpc("club_signup", { p_event_id: steam.id, p_entry: { name: "vol a.", slot: "Setup" } })).error, "duplicate");
  const a2 = await rpc("club_signup", { p_event_id: steam.id, p_entry: { name: "Vol A.", slot: "Cleanup" } });
  assert.equal(a2.ok, true, "same person, another shift");
  steam = await find("2027-03-05", "STEAM Day Somerset 2027");
  assert.equal(steam.signups.find((x) => x.id === a.id).item, "", "item not stored for work sign-ups");
  // officer sets Setup to need 1 person: it is full now; moving into a full shift is refused too
  assert.equal((await admin("save_event", { ...steam, slots: [{ label: "Setup", needed: 1 }, { label: "Activity tables" }, { label: "Cleanup" }] })).ok, true);
  assert.equal((await rpc("club_signup", { p_event_id: steam.id, p_entry: { name: "Vol B.", slot: "Setup" } })).error, "slot_full");
  const b = await rpc("club_signup", { p_event_id: steam.id, p_entry: { name: "Vol B.", slot: "Activity tables", note: "can stay late" } });
  assert.equal(b.ok, true);
  assert.equal((await rpc("club_signup_update", { p_id: b.id, p_token: b.token, p_entry: { slot: "Setup" } })).error, "slot_full");
  assert.equal((await rpc("club_signup_update", { p_id: a.id, p_token: a.token, p_entry: { name: "Vol A. Smith" } })).ok, true, "editing within a full shift is fine");
  // an old page that doesn't send signup_kind keeps the kind
  assert.equal((await admin("save_event", { ...steam, signup_kind: undefined })).ok, true);
  steam = await find("2027-03-05", "STEAM Day Somerset 2027");
  assert.equal(steam.signup_kind, "work");
  for (const x of [a, a2, b]) assert.equal((await rpc("club_signup_remove", { p_id: x.id, p_token: x.token })).ok, true);
  assert.equal((await admin("save_event", { ...steam, slots: [{ label: "Setup" }, { label: "Activity tables" }, { label: "Cleanup" }] })).ok, true);
});

test("who's going: a trip with a number of spots", async () => {
  const add = await admin("save_event", { starts_on: "2027-04-09", title: "Test Campus Trip", kind: "campus-tour", signup_enabled: true,
    signup_kind: "going", slots: [{ label: "Going", needed: 2 }] });
  assert.equal(add.ok, true);
  const ev = (await events()).find((e) => e.id === add.id);
  assert.equal(ev.signup_kind, "going");
  const one = await rpc("club_signup", { p_event_id: ev.id, p_entry: { name: "Trip A.", slot: "Going" } });
  const two = await rpc("club_signup", { p_event_id: ev.id, p_entry: { name: "Trip B.", slot: "Going" } });
  assert.deepEqual([one.ok, two.ok], [true, true]);
  assert.equal((await rpc("club_signup", { p_event_id: ev.id, p_entry: { name: "Trip C.", slot: "Going" } })).error, "slot_full");
  assert.equal((await rpc("club_signup", { p_event_id: ev.id, p_entry: { name: "Trip A.", slot: "Going" } })).error, "slot_full");
  assert.equal((await rpc("club_signup_remove", { p_id: two.id, p_token: two.token })).ok, true);
  assert.equal((await rpc("club_signup", { p_event_id: ev.id, p_entry: { name: "trip a.", slot: "Going" } })).error, "duplicate");
  assert.equal((await rpc("club_signup", { p_event_id: ev.id, p_entry: { name: "Trip C.", slot: "Going" } })).ok, true, "a spot opened up");
  assert.equal((await admin("save_event", { starts_on: "2027-04-10", title: "Bad kind of sign-up", signup_kind: "potluck" })).error, "bad_value");
  assert.equal((await admin("delete_event", { id: ev.id })).ok, true);
});

test("no Competition type (Spades is a Social); Postponed closes sign-up", async () => {
  const spades = await find("2026-09-23", "Spades Competition");
  assert.equal(spades.kind, "social", "004 moved competition events to social");
  assert.equal((await admin("save_event", { starts_on: "2027-02-01", title: "Old type", kind: "competition" })).error, "bad_value");
  let dec = await find("2026-12-03", "Math and Science Club Holiday Party");
  assert.equal((await admin("save_event", { ...dec, status: "postponed" })).ok, true);
  dec = await find("2026-12-03", "Math and Science Club Holiday Party");
  assert.equal(dec.status, "postponed");
  assert.equal((await rpc("club_signup", { p_event_id: dec.id, p_entry: { name: "P.", slot: "Side", item: "Rolls" } })).error, "no_signup");
  assert.equal((await admin("save_event", { ...dec, status: "maybe" })).error, "bad_value");
  assert.equal((await admin("save_event", { ...dec, status: "scheduled" })).ok, true);
  assert.equal((await find("2026-12-03", "Math and Science Club Holiday Party")).status, "scheduled");
});

test("event info pages: STEAM Day has one; officers' edits keep it", async () => {
  const all = await events();
  assert.ok(all.every((e) => "page" in e), "every event says whether it has an info page");
  assert.deepEqual(all.filter((e) => e.page).map((e) => [e.title, e.page]), [["STEAM Day Somerset 2027", "steam-day-2027"]]);
  let steam = all.find((e) => e.page === "steam-day-2027");
  assert.deepEqual([steam.start_time, steam.end_time], ["08:00", "14:00"], "volunteers: 8:00 a.m. to about 2:00 p.m.");
  // an officer renames it and moves it a day: the page stays with the event
  assert.equal((await admin("save_event", { ...steam, title: "STEAM Day 2027 (renamed)", starts_on: "2027-03-04" })).ok, true);
  steam = (await events()).find((e) => e.id === steam.id);
  assert.equal(steam.page, "steam-day-2027");
  assert.equal((await admin("save_event", { ...steam, title: "STEAM Day Somerset 2027", starts_on: "2027-03-05" })).ok, true);
  // a new event has no page
  const added = await admin("save_event", { starts_on: "2027-04-01", title: "E2E No Page", kind: "event" });
  assert.equal(added.ok, true);
  assert.equal((await events()).find((e) => e.id === added.id).page, null);
  assert.equal((await admin("delete_event", { id: added.id })).ok, true);
});

test("officer code required; wrong code rejected", async () => {
  assert.equal((await admin("check", {}, "nope")).error, "unauthorized");
  assert.equal((await admin("check")).ok, true);
});

test("officers: add, edit, cancel and delete an event; set up categories; remove a sign-up; close sign-ups", async () => {
  const add = await admin("save_event", { starts_on: "2027-01-21", start_time: "17:00", title: "Math and Science Club Meeting", kind: "meeting", theme: "  Taco night  ",
    location: "Test room", signup_enabled: true, signup_note: "Pizza provided (test)", slots: [{ label: "Drinks", needed: "3" }, { label: "drinks" }, { label: "Dessert", needed: "" }, { label: "  " }] });
  assert.equal(add.ok, true);
  let ev = (await events()).find((e) => e.id === add.id);
  assert.deepEqual(ev.slots, [{ label: "Drinks", needed: 3 }, { label: "Dessert", needed: null }]);
  assert.equal(ev.location, "Test room");
  assert.equal(ev.theme, "Taco night");
  assert.equal((await admin("save_event", { starts_on: "2027-01-21", title: "Math and Science Club Meeting" })).error, "duplicate_event");
  assert.equal((await admin("save_event", { title: "No date" })).error, "no_date");
  assert.equal((await admin("save_event", { starts_on: "2027-01-22", title: "Bad kind", kind: "rave" })).error, "bad_value");
  const s = await rpc("club_signup", { p_event_id: add.id, p_entry: { name: "Test B.", slot: "Drinks", item: "Lemonade" } });
  assert.equal(s.ok, true);
  assert.equal((await admin("remove_signup", { id: s.id })).ok, true);
  assert.equal((await admin("set_signups_open", { open: false })).ok, true);
  assert.equal((await rpc("club_signup", { p_event_id: add.id, p_entry: { name: "Test C.", slot: "Drinks", item: "Tea" } })).error, "signups_closed");
  assert.equal((await admin("set_signups_open", { open: true })).ok, true);
  assert.equal((await admin("save_event", { ...ev, status: "cancelled", tentative: true })).ok, true);
  ev = (await events()).find((e) => e.id === add.id);
  assert.deepEqual([ev.status, ev.tentative], ["cancelled", true]);
  assert.equal((await rpc("club_signup", { p_event_id: add.id, p_entry: { name: "Test D.", slot: "Drinks", item: "Tea" } })).error, "no_signup");
  assert.equal((await admin("delete_event", { id: add.id })).ok, true);
  assert.equal((await events()).some((e) => e.id === add.id), false);
});

test("changing the officer code", async () => {
  assert.equal((await admin("set_code", { new_code: "short" })).error, "code_too_short");
  assert.equal((await admin("set_code", { new_code: "temporary-code-1" })).ok, true);
  assert.equal((await admin("check")).error, "unauthorized");
  assert.equal((await admin("set_code", { new_code: CODE }, "temporary-code-1")).ok, true);
  assert.equal((await admin("check")).ok, true);
});

test("visit counter: anonymous, once per device, day and page; all traffic, officers included; totals only", async () => {
  const visit = (v, p) => rpc("club_visit", { p_visitor: v, p_page: p });
  const stats = (v = null, code = CODE) => rpc("club_stats", { p_code: code, p_visitor: v });
  assert.equal((await stats(null, "wrong-code")).error, "unauthorized");
  const before = await stats();
  const a = crypto.randomUUID(), b = crypto.randomUUID(), off = crypto.randomUUID();
  // only a browser ID and a page name of the expected shapes are accepted
  for (const [v, p] of [["not-an-id", "home"], [null, "home"], [a, "Home"], [a, "../x"], [a, ""], [a, null], [a, "a/b/c"], [a, "x".repeat(61)]]) {
    assert.equal((await visit(v, p)).error, "bad_value", `${v} ${p}`);
  }
  assert.deepEqual(await visit(a, "home"), { ok: true, counted: true });
  await visit(a, "home");
  await visit(a.toUpperCase(), "signup"); // the same browser, whatever the case
  await visit(b, "events/steam-day-2027");
  let s = await stats();
  assert.equal(s.visitors - before.visitors, 2, "two browsers");
  assert.equal(s.visitors_today - before.visitors_today, 2);
  assert.equal(s.visitors_7d - before.visitors_7d, 2);
  assert.equal(s.views - before.views, 4, "every page view adds up");
  const page = (st, p) => st.pages.find((x) => x.page === p) || { visitors: 0, views: 0 };
  assert.equal(page(s, "home").visitors - page(before, "home").visitors, 1);
  assert.equal(page(s, "home").views - page(before, "home").views, 2);
  assert.equal(page(s, "events/steam-day-2027").visitors - page(before, "events/steam-day-2027").visitors, 1);
  // all traffic counts (club_v8): an officer's browser and Officer tools itself are counted,
  // and sending a browser ID to club_stats changes nothing (it's ignored)
  await visit(off, "home");
  await visit(off, "officers");
  s = await stats(off);
  assert.equal(s.visitors - before.visitors, 3, "officers' browsers count too");
  assert.equal(page(s, "officers").visitors - page(before, "officers").visitors, 1, "Officer tools is a page");
  assert.equal((await stats()).visitors - before.visitors, 3);
  assert.equal("officer_devices" in s, false);
  // the shape officers see
  assert.equal(s.daily.length, 30);
  assert.equal(s.daily[29].day, s.today, "the last 30 days, ending today");
  assert.ok(s.since <= s.today);
  assert.ok(Number.isInteger(s.signup_people) && s.signup_people <= s.signups);
  assert.ok(s.returning <= s.visitors);
  // never a browser ID or a hash in the answer
  const txt = JSON.stringify(s);
  for (const v of [a, b, off]) assert.equal(txt.toLowerCase().includes(v.toLowerCase()), false);
  assert.doesNotMatch(txt, /[0-9a-f]{64}/);
});
