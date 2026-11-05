// Contract tests for the club API (math-science-club/sql/001_club.sql).
// Run against the local stand-in (never production), with "today" fixed so the seeded
// Fall 2026 schedule has upcoming events:
//   CLUB_TODAY=2026-11-05 node tools/math-science-club/local-api.mjs &
//   node --test tools/math-science-club/tests/*.test.mjs
// Environment: CLUB_API_URL (default http://127.0.0.1:8789), CLUB_OFFICER_CODE (default local-officer-code).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
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
  const stat = JSON.parse(fs.readFileSync(path.join(ROOT, "math-science-club/data/events.json"), "utf8")).events;
  const strip = (e) => [e.starts_on, e.ends_on, e.start_time, e.end_time, e.title, e.kind, e.tentative, e.signup_enabled, JSON.stringify(e.slots)];
  const seeded = live.filter((e) => stat.some((s) => s.starts_on === e.starts_on && s.title === e.title));
  assert.equal(seeded.length, 17);
  assert.deepEqual(seeded.map(strip), stat.map(strip));
});

test("November meeting is on the third Thursday and has food sign-up", async () => {
  const nov = await find("2026-11-19", "Math and Science Club Meeting");
  assert.ok(nov);
  const d = new Date(Date.UTC(2026, 10, 19));
  assert.equal(d.getUTCDay(), 4); // Thursday
  assert.ok(d.getUTCDate() > 14 && d.getUTCDate() <= 21); // third one
  assert.equal(nov.start_time, "17:00");
  assert.equal(nov.signup_enabled, true);
  assert.equal(nov.slots.length, 6);
});

test("sign up, see it, change it, remove it (only with this device's token)", async () => {
  const nov = await find("2026-11-19", "Math and Science Club Meeting");
  const r = await rpc("club_signup", { p_event_id: nov.id, p_entry: { name: "Test A.", slot: "Dessert", item: "Brownies", note: "contains nuts" } });
  assert.equal(r.ok, true); assert.ok(r.token);
  let s = (await find("2026-11-19", "Math and Science Club Meeting")).signups.find((x) => x.id === r.id);
  assert.deepEqual([s.name, s.slot, s.item, s.note], ["Test A.", "Dessert", "Brownies", "contains nuts"]);
  assert.equal("token" in s || "token_hash" in s, false, "token never public");
  assert.equal((await rpc("club_signup", { p_event_id: nov.id, p_entry: { name: "test a.", slot: "Dessert", item: "brownies" } })).error, "duplicate");
  assert.equal((await rpc("club_signup_update", { p_id: r.id, p_token: "wrong", p_entry: { item: "Cookies" } })).error, "not_yours");
  assert.equal((await rpc("club_signup_update", { p_id: r.id, p_token: r.token, p_entry: { item: "Cookies", slot: "Snack" } })).ok, true);
  s = (await find("2026-11-19", "Math and Science Club Meeting")).signups.find((x) => x.id === r.id);
  assert.deepEqual([s.slot, s.item, s.note], ["Snack", "Cookies", "contains nuts"]);
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
  assert.equal((await rpc("club_signup", { p_event_id: nov.id, p_entry: { name: "X", slot: "Lobster", item: "y" } })).error, "bad_slot");
  assert.equal((await rpc("club_signup", { p_event_id: grad.id, p_entry: { name: "X", slot: "Side", item: "y" } })).error, "no_signup");
  // October meeting is in the past (today fixed at 2026-11-05); enabling sign-up there must still refuse
  const saved = await admin("save_event", { ...oct, signup_enabled: true });
  assert.equal(saved.ok, true);
  assert.equal((await rpc("club_signup", { p_event_id: oct.id, p_entry: { name: "X", slot: "Food or drink", item: "y" } })).error, "event_past");
  await admin("save_event", { ...oct, signup_enabled: false });
});

test("officer code required; wrong code rejected", async () => {
  assert.equal((await admin("check", {}, "nope")).error, "unauthorized");
  assert.equal((await admin("check")).ok, true);
});

test("officers: add, edit, cancel and delete an event; set up categories; remove a sign-up; close sign-ups", async () => {
  const add = await admin("save_event", { starts_on: "2027-01-21", start_time: "17:00", title: "Math and Science Club Meeting", kind: "meeting",
    location: "Test room", signup_enabled: true, signup_note: "Pizza provided (test)", slots: [{ label: "Drinks", needed: "3" }, { label: "drinks" }, { label: "Dessert", needed: "" }, { label: "  " }] });
  assert.equal(add.ok, true);
  let ev = (await events()).find((e) => e.id === add.id);
  assert.deepEqual(ev.slots, [{ label: "Drinks", needed: 3 }, { label: "Dessert", needed: null }]);
  assert.equal(ev.location, "Test room");
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
