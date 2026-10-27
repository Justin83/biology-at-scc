// API contract test for the BIO 151 Live Lab RPC functions.
// Runs against any PostgREST-compatible endpoint that has sql/001_livelab.sql applied:
//   LAB_API_URL        base URL (default: http://localhost:8787 — the local PGlite harness)
//   LAB_API_KEY        apikey header value (default: "local"; use the Supabase publishable key for live)
//   LAB_INSTRUCTOR_KEY instructor key (required)
// It creates its own throw-away experiment (slug selftest-<timestamp>) and deletes it at the end,
// so it never touches the real bio151-chlorophyll data. Run: node --test labs/bio151-spectro/tests/
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const URL_ = (process.env.LAB_API_URL || "http://localhost:8787").replace(/\/$/, "");
const KEY = process.env.LAB_API_KEY || "local";
const IKEY = process.env.LAB_INSTRUCTOR_KEY;
if (!IKEY) { console.error("LAB_INSTRUCTOR_KEY is required"); process.exit(2); }

async function rpc(fn, args) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: KEY, Authorization: "Bearer " + KEY },
    body: JSON.stringify(args)
  });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${fn} -> HTTP ${r.status}: ${JSON.stringify(body)}`);
  return body;
}
const ins = (action, slug, payload) => rpc("lab_instructor", { p_key: IKEY, p_action: action, p_slug: slug, p_payload: payload || {} });

const slug = "selftest-" + Date.now();
const XS = [420, 440, 460, 500, 540, 580, 620, 640, 660, 680];

before(async () => {
  const r = await ins("create_experiment", slug, { title: "SELF-TEST (synthetic data)", course: "TEST", x_values: XS, group_count: 4 });
  assert.equal(r.ok, true, JSON.stringify(r));
});
after(async () => {
  const r = await ins("delete_experiment", slug, { confirm: slug });
  assert.equal(r.ok, true, JSON.stringify(r));
  const gone = await rpc("lab_get_experiment", { p_slug: slug });
  assert.equal(gone.ok, false);
});

test("experiment config is served with configurable wavelengths and 4 groups", async () => {
  const r = await rpc("lab_get_experiment", { p_slug: slug });
  assert.equal(r.ok, true);
  assert.deepEqual(r.experiment.x_values.map(Number), XS);
  assert.equal(r.groups.length, 4);
  assert.equal(r.groups[0].has_pin, false);
  assert.ok(!("members" in r.groups[0]), "public payload must not include names");
});

test("unknown experiment and bad instructor key are rejected", async () => {
  assert.equal((await rpc("lab_get_experiment", { p_slug: "does-not-exist" })).error, "not_found");
  const bad = await rpc("lab_instructor", { p_key: "wrong-key", p_action: "export", p_slug: slug, p_payload: {} });
  assert.equal(bad.error, "unauthorized");
});

test("first join sets the PIN; short PIN rejected; wrong PIN rejected; partner can join with PIN", async () => {
  const short = await rpc("lab_join_group", { p_slug: slug, p_group_number: 1, p_pin: "12", p_members: ["Test Student A"] });
  assert.equal(short.error, "pin_too_short");
  const first = await rpc("lab_join_group", { p_slug: slug, p_group_number: 1, p_pin: "1234", p_members: ["Test Student A"] });
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.created_pin, true);
  assert.deepEqual(first.group.members, ["Test Student A"]);
  const wrong = await rpc("lab_join_group", { p_slug: slug, p_group_number: 1, p_pin: "9999", p_members: ["Intruder"] });
  assert.equal(wrong.error, "wrong_pin");
  const partner = await rpc("lab_join_group", { p_slug: slug, p_group_number: 1, p_pin: "1234", p_members: ["Test Student B", "Test Student A"] });
  assert.equal(partner.ok, true);
  assert.equal(partner.created_pin, false);
  assert.deepEqual(partner.group.members, ["Test Student A", "Test Student B"], "names merge without duplicates");
  const missing = await rpc("lab_join_group", { p_slug: slug, p_group_number: 9, p_pin: "1234", p_members: [] });
  assert.equal(missing.error, "no_such_group");
});

test("readings persist, blanks allowed, edits overwrite, bad input rejected", async () => {
  const s1 = await rpc("lab_save_readings", { p_slug: slug, p_group_number: 1, p_pin: "1234",
    p_readings: [{ x: 420, a: 0.81 }, { x: 440, a: 0.9 }, { x: 460, a: null }, { x: 660, a: 0.62 }], p_dilution: "1:10", p_notes: "synthetic" });
  assert.equal(s1.ok, true, JSON.stringify(s1));
  assert.equal(s1.saved, 4);
  const byX = Object.fromEntries(s1.group.readings.map(r => [Number(r.x), r.a == null ? null : Number(r.a)]));
  assert.equal(byX[420], 0.81); assert.equal(byX[460], null); assert.equal(byX[660], 0.62);
  assert.equal(s1.group.dilution, "1:10");

  // returning students see what they saved
  const back = await rpc("lab_join_group", { p_slug: slug, p_group_number: 1, p_pin: "1234", p_members: [] });
  assert.equal(Number(back.group.readings.find(r => Number(r.x) === 440).a), 0.9);

  // edit one value; others untouched; updated_at moves
  const before = back.group.readings.find(r => Number(r.x) === 420).updated_at;
  await new Promise(r => setTimeout(r, 20));
  const s2 = await rpc("lab_save_readings", { p_slug: slug, p_group_number: 1, p_pin: "1234", p_readings: [{ x: 420, a: 0.85 }] });
  assert.equal(s2.ok, true);
  const r420 = s2.group.readings.find(r => Number(r.x) === 420);
  assert.equal(Number(r420.a), 0.85);
  assert.ok(r420.updated_at > before, "updated_at should advance on edit");
  assert.equal(Number(s2.group.readings.find(r => Number(r.x) === 440).a), 0.9);
  assert.equal(s2.group.dilution, "1:10", "dilution kept when not resent");

  // wrong pin cannot write
  const w = await rpc("lab_save_readings", { p_slug: slug, p_group_number: 1, p_pin: "0000", p_readings: [{ x: 420, a: 0 }] });
  assert.equal(w.error, "wrong_pin");
  assert.equal(Number((await rpc("lab_join_group", { p_slug: slug, p_group_number: 1, p_pin: "1234", p_members: [] })).group.readings.find(r => Number(r.x) === 420).a), 0.85);

  // garbage rejected
  assert.equal((await rpc("lab_save_readings", { p_slug: slug, p_group_number: 1, p_pin: "1234", p_readings: [{ x: 420, a: "abc" }] })).error, "bad_number");
  assert.equal((await rpc("lab_save_readings", { p_slug: slug, p_group_number: 1, p_pin: "1234", p_readings: [{ x: 420, a: 42 }] })).error, "out_of_range");
  assert.equal((await rpc("lab_save_readings", { p_slug: slug, p_group_number: 1, p_pin: "1234", p_readings: { x: 1 } })).error, "bad_readings");
});

test("dashboard shows every group, real values only, completion counts, and no names", async () => {
  await rpc("lab_join_group", { p_slug: slug, p_group_number: 3, p_pin: "abcd", p_members: ["Test Student C"] });
  await rpc("lab_save_readings", { p_slug: slug, p_group_number: 3, p_pin: "abcd", p_readings: XS.map((x, i) => ({ x, a: 0.1 * i })) });
  const d = await rpc("lab_dashboard", { p_slug: slug });
  assert.equal(d.ok, true);
  assert.equal(d.groups.length, 4);
  const g1 = d.groups.find(g => g.group_number === 1), g2 = d.groups.find(g => g.group_number === 2), g3 = d.groups.find(g => g.group_number === 3);
  assert.equal(g1.complete, 3, "420, 440, 660 measured; 460 is blank");
  assert.equal(g2.complete, 0); assert.equal(g2.has_pin, false); assert.deepEqual(g2.readings, []);
  assert.equal(g3.complete, 10);
  assert.equal(JSON.stringify(d).includes("Test Student"), false, "dashboard payload must never contain student names");
  assert.ok(!("members" in g1) && !("notes" in g1));
});

test("instructor export includes names; wavelengths configurable; close/open; PIN reset; clear group; time-series experiment", async () => {
  const ex = await ins("export", slug);
  assert.equal(ex.ok, true);
  assert.deepEqual(ex.groups.find(g => g.group_number === 1).members, ["Test Student A", "Test Student B"]);
  assert.equal(ex.groups.find(g => g.group_number === 1).notes, "synthetic");

  const xv = await ins("set_x_values", slug, { x_values: [400, 450, 500, 450] });
  assert.equal(xv.ok, true);
  assert.deepEqual(xv.experiment.x_values.map(Number), [400, 450, 500], "sorted, de-duplicated");
  assert.equal((await ins("set_x_values", slug, { x_values: [] })).error, "empty_x_values");
  const d = await rpc("lab_dashboard", { p_slug: slug });
  assert.deepEqual(d.experiment.x_values.map(Number), [400, 450, 500]);
  assert.equal(d.groups.find(g => g.group_number === 3).complete, 1, "only 500 nm overlaps the new list");
  await ins("set_x_values", slug, { x_values: XS });

  const closed = await ins("update_experiment", slug, { is_open: false });
  assert.equal(closed.experiment.is_open, false);
  assert.equal((await rpc("lab_save_readings", { p_slug: slug, p_group_number: 1, p_pin: "1234", p_readings: [{ x: 420, a: 0.1 }] })).error, "closed");
  await ins("update_experiment", slug, { is_open: true });

  const rp = await ins("reset_pin", slug, { group_number: 1, new_pin: "5678" });
  assert.equal(rp.ok, true);
  assert.equal((await rpc("lab_join_group", { p_slug: slug, p_group_number: 1, p_pin: "1234", p_members: [] })).error, "wrong_pin");
  assert.equal((await rpc("lab_join_group", { p_slug: slug, p_group_number: 1, p_pin: "5678", p_members: [] })).ok, true);

  const cl = await ins("clear_group", slug, { group_number: 3, reset_pin: true });
  assert.equal(cl.ok, true);
  assert.deepEqual(cl.group.readings, []); assert.equal(cl.group.has_pin, false); assert.deepEqual(cl.group.members, []);

  const tm = await ins("create_experiment", slug + "-time", { title: "time series", x_kind: "time", x_label: "Time (min)", x_unit: "min", x_values: [0, 2, 4, 6, 8, 10], group_count: 2 });
  assert.equal(tm.ok, true); assert.equal(tm.experiment.x_kind, "time");
  assert.equal((await ins("delete_experiment", slug + "-time", { confirm: "nope" })).error, "confirm_required");
  assert.equal((await ins("delete_experiment", slug + "-time", { confirm: slug + "-time" })).ok, true);
});
