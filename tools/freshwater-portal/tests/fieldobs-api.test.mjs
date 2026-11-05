// Contract tests for the field-submission API (research/freshwater/sql/001_field_submissions.sql).
// Run against the local stand-in (never production):
//   FW_UPLOAD_CODE=class-test-code node tools/freshwater-portal/local-api.mjs &
//   node --test tools/freshwater-portal/tests/*.test.mjs
// Environment: FW_API_URL (default http://127.0.0.1:8788), FW_INSTRUCTOR_KEY (default local-instructor-key),
// FW_UPLOAD_CODE (default class-test-code).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const API = (process.env.FW_API_URL || "http://127.0.0.1:8788").replace(/\/$/, "");
const IKEY = process.env.FW_INSTRUCTOR_KEY || "local-instructor-key";
const CODE = process.env.FW_UPLOAD_CODE || "class-test-code";
const JPEG = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAEAAQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDkKKKKk+UP/9k=";

async function rpc(fn, args = {}) {
  const r = await fetch(`${API}/rest/v1/rpc/${fn}`, { method: "POST", headers: { "content-type": "application/json", apikey: "local" }, body: JSON.stringify(args) });
  const body = await r.json();
  if (!r.ok) throw new Error(`${fn} HTTP ${r.status}: ${JSON.stringify(body)}`);
  return body;
}
const ins = (action, payload = {}) => rpc("fw_instructor", { p_key: IKEY, p_action: action, p_payload: payload });
const entry = (over = {}) => ({
  client_id: randomUUID(), site_id: "allen-branch", station: "AB-1",
  observed_at: new Date(Date.now() - 3600e3).toISOString(), observed_at_source: "photo",
  latitude: 37.0612, longitude: -84.6201, gps_accuracy_m: 6, location_source: "photo",
  weather: "Overcast, cool", air_temperature_c: 14,
  measurements: [{ parameter: "water_temperature", value: 12.4, method: "Thermometer" }, { parameter: "ph", value: 7.6, method: "Meter" }],
  flow_observation: "low", canopy_cover_pct: 80, substrate: ["cobble", "gravel", "nonsense"], visible_biofilm: "thin",
  suspected_organisms: "Possible filamentous green algae", notes: "SELF-TEST synthetic entry",
  observers: [{ name: "Test Student A.", public: true }, { name: "Test Student B.", public: false }],
  ...over });

test("status reports open with limits", async () => {
  const s = await rpc("fw_status");
  assert.equal(s.ok, true); assert.equal(s.open, true); assert.equal(s.max_photos, 6);
});

test("wrong class code and bad instructor key are rejected", async () => {
  assert.equal((await rpc("fw_submit", { p_code: "nope", p_entry: entry() })).error, "bad_code");
  assert.equal((await rpc("fw_instructor", { p_key: "wrong", p_action: "summary", p_payload: {} })).error, "unauthorized");
});

test("closing submissions blocks new entries; reopening allows them", async () => {
  assert.equal((await ins("set_open", { open: false })).ok, true);
  assert.equal((await rpc("fw_submit", { p_code: CODE, p_entry: entry() })).error, "not_open");
  assert.equal((await rpc("fw_status")).open, false);
  assert.equal((await ins("set_open", { open: true })).ok, true);
});

test("validation: location, time, ranges, observers, parameters", async () => {
  const bad = async (over) => (await rpc("fw_submit", { p_code: CODE, p_entry: entry(over) }));
  assert.equal((await bad({ latitude: 47.6, longitude: -122.3 })).error, "bad_location");
  assert.equal((await bad({ latitude: 37.06, longitude: null })).error, "bad_location");
  assert.equal((await bad({ observed_at: new Date(Date.now() + 5 * 86400e3).toISOString() })).error, "bad_time");
  const ph = await bad({ measurements: [{ parameter: "ph", value: 19 }] });
  assert.equal(ph.error, "out_of_range"); assert.equal(ph.field, "ph");
  assert.equal((await bad({ measurements: [{ parameter: "lead", value: 1 }] })).error, "bad_parameter");
  assert.equal((await bad({ observers: [{ name: "  " }] })).error, "no_observer");
  assert.equal((await bad({ site_id: "mars" })).error, "bad_entry");
});

test("full flow: submit, photos, finish, review, publish, privacy", async () => {
  const e = entry();
  const s = await rpc("fw_submit", { p_code: CODE, p_entry: e });
  assert.equal(s.ok, true, JSON.stringify(s)); assert.match(s.receipt, /^FW-[0-9A-F]{6}$/);
  assert.equal((await rpc("fw_submit", { p_code: CODE, p_entry: e })).error, "already_submitted");

  const photo = (over = {}) => ({ image_b64: JPEG, thumb_b64: JPEG, caption: "Riffle", taken_at: e.observed_at, latitude: 37.0612, longitude: -84.6201, camera: "Test Cam", width: 4, height: 4, ...over });
  assert.equal((await rpc("fw_add_photo", { p_submission_id: s.submission_id, p_token: "wrong", p_photo: photo() })).error, "bad_token");
  assert.equal((await rpc("fw_add_photo", { p_submission_id: s.submission_id, p_token: s.upload_token, p_photo: photo({ image_b64: Buffer.from("not a jpeg").toString("base64") }) })).error, "bad_image");
  const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(800 * 1024)]).toString("base64");
  assert.equal((await rpc("fw_add_photo", { p_submission_id: s.submission_id, p_token: s.upload_token, p_photo: photo({ image_b64: big }) })).error, "image_too_large");
  for (let i = 1; i <= 6; i++) {
    const r = await rpc("fw_add_photo", { p_submission_id: s.submission_id, p_token: s.upload_token, p_photo: photo() });
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.count, i);
  }
  assert.equal((await rpc("fw_add_photo", { p_submission_id: s.submission_id, p_token: s.upload_token, p_photo: photo() })).error, "too_many_photos");
  const f = await rpc("fw_finish", { p_submission_id: s.submission_id, p_token: s.upload_token });
  assert.equal(f.ok, true); assert.equal(f.photos, 6);
  assert.equal((await rpc("fw_add_photo", { p_submission_id: s.submission_id, p_token: s.upload_token, p_photo: photo() })).error, "bad_token");

  // nothing public before review
  let pub = await rpc("fw_public_observations");
  assert.ok(!pub.observations.some((o) => o.id === s.submission_id));
  const got = await ins("get", { id: s.submission_id });
  assert.equal(got.ok, true); assert.equal(got.photos.length, 6); assert.ok(got.photos[0].thumb_b64);
  assert.equal(got.submission.observers.length, 2, "faculty sees all observers");
  assert.deepEqual(got.submission.substrate, ["cobble", "gravel"], "unknown substrate values dropped");
  assert.equal((await rpc("fw_public_photo", { p_id: got.photos[0].id, p_size: "thumb" })).ok, false);

  // approve -> public, names only with consent, photos available
  assert.equal((await ins("review", { id: s.submission_id, status: "approved", note: "Looks good" })).ok, true);
  pub = await rpc("fw_public_observations");
  const o = pub.observations.find((x) => x.id === s.submission_id);
  assert.ok(o, "approved entry is public");
  assert.deepEqual(o.observers, ["Test Student A."]);
  assert.ok(!("review_note" in o), "review notes stay private");
  assert.equal(o.photos.length, 6);
  const t = await rpc("fw_public_photo", { p_id: o.photos[0].id, p_size: "thumb" });
  assert.equal(t.ok, true); assert.equal(t.image_b64.replace(/\s/g, ""), JPEG);

  // removing a photo deletes its bytes and hides it
  assert.equal((await ins("remove_photo", { id: o.photos[0].id })).ok, true);
  assert.equal((await rpc("fw_public_photo", { p_id: o.photos[0].id })).ok, false);
  pub = await rpc("fw_public_observations");
  assert.equal(pub.observations.find((x) => x.id === s.submission_id).photos.length, 5);

  // un-approving hides it again
  assert.equal((await ins("review", { id: s.submission_id, status: "changes_requested", note: "Add station code" })).ok, true);
  pub = await rpc("fw_public_observations");
  assert.ok(!pub.observations.some((x) => x.id === s.submission_id));
  const sum = await ins("summary");
  assert.equal(sum.ok, true); assert.ok(sum.photo_bytes_used > 0);
});

test("class code can be changed by faculty", async () => {
  assert.equal((await ins("set_upload_code", { code: "abc" })).error, "code_too_short");
  assert.equal((await ins("set_upload_code", { code: "new-class-code" })).ok, true);
  assert.equal((await rpc("fw_submit", { p_code: CODE, p_entry: entry() })).error, "bad_code");
  assert.equal((await rpc("fw_submit", { p_code: "new-class-code", p_entry: entry() })).ok, true);
  assert.equal((await ins("set_upload_code", { code: CODE })).ok, true);
});
