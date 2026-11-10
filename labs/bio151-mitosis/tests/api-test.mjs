// Contract tests for the BIO 151 Mitosis Lab database functions
// (labs/bio151-mitosis/sql/001_mitosis.sql; plan: docs/bio151-mitosis-lab/PLAN.md).
// Run against the local stand-in, never production:
//   node tools/bio151-mitosis/local-api.mjs &
//   node --test labs/bio151-mitosis/tests/api-test.mjs
// Environment: MITOSIS_API_URL (default http://127.0.0.1:8790),
// MITOSIS_INSTRUCTOR_KEY (default local-instructor-key).
// Each run uses its own made-up names and a throw-away experiment, so runs can repeat
// against the same database.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const API = (process.env.MITOSIS_API_URL || "http://127.0.0.1:8790").replace(/\/$/, "");
const KEY = process.env.MITOSIS_INSTRUCTOR_KEY || "local-instructor-key";
const FALL = "bio151-mitosis-2026fa";
const RUN = Array.from(crypto.randomBytes(5), (b) => String.fromCharCode(97 + (b % 26))).join(""); // e.g. "kqzra"

async function rpc(fn, args = {}) {
  const r = await fetch(`${API}/rest/v1/rpc/${fn}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(args) });
  const body = await r.json();
  if (!r.ok) throw new Error(`${fn} HTTP ${r.status}: ${JSON.stringify(body)}`);
  return body;
}
const save = (first, last, counts, slug = FALL) => rpc("mitosis_save", { p_slug: slug, p_first_name: first, p_last_name: last, p_counts: counts });
const update = (id, token, counts, first = null, last = null) => rpc("mitosis_update", { p_submission_id: id, p_token: token, p_first_name: first, p_last_name: last, p_counts: counts });
const own = (id, token) => rpc("mitosis_get_own", { p_submission_id: id, p_token: token });
const dash = (slug = FALL) => rpc("mitosis_dashboard", { p_slug: slug });
const admin = (action, payload = {}, slug = FALL, key = KEY) => rpc("mitosis_instructor", { p_key: key, p_action: action, p_slug: slug, p_payload: payload });

// a full region: 25 cells, `m` of them in mitosis
const region = (m) => ({ interphase: 25 - m, prophase: Math.ceil(m / 2), metaphase: Math.floor(m / 4), anaphase: 0, telophase: m - Math.ceil(m / 2) - Math.floor(m / 4) });
const full = (m1, m2) => ({ r1: region(m1), r2: region(m2) });

test("experiment settings are public and carry no submission data", async () => {
  const r = await rpc("mitosis_get_experiment", { p_slug: FALL });
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.experiment).sort(), ["cells_per_region", "course", "is_open", "regions", "slug", "stages", "term", "title"]);
  assert.equal(r.experiment.cells_per_region, 25);
  assert.deepEqual(r.experiment.stages.map((s) => s.key), ["interphase", "prophase", "metaphase", "anaphase", "telophase"]);
  assert.deepEqual(r.experiment.stages.filter((s) => s.mitotic).map((s) => s.key), ["prophase", "metaphase", "anaphase", "telophase"]);
  assert.equal((await rpc("mitosis_get_experiment", { p_slug: "no-such-lab" })).error, "not_found");
});

test("first save returns a token once; every later edit needs it; a name never does", async () => {
  const a = await save(`Ana${RUN}`, `Lee${RUN}`, { r1: { interphase: 10 } });
  assert.equal(a.ok, true);
  assert.match(a.token, /^[0-9a-f]{64}$/);
  assert.equal(a.submission.first_name, `Ana${RUN}`);
  assert.equal(a.submission.complete, false, "partial save");
  // wrong, missing and malformed credentials all get the same answer
  for (const [id, tok] of [[a.submission_id, "0".repeat(64)], [a.submission_id, ""], [a.submission_id, null], ["not-a-uuid", a.token], [crypto.randomUUID(), a.token]]) {
    assert.equal((await update(id, tok, { r1: { interphase: 11 } })).error, "not_yours");
    assert.equal((await own(id, tok)).error, "not_yours");
  }
  // the token works, and keeps the names unless new ones are sent
  const u = await update(a.submission_id, a.token, full(5, 2));
  assert.equal(u.ok, true);
  assert.equal(u.submission.complete, true);
  assert.equal(u.submission.first_name, `Ana${RUN}`);
  const g = await own(a.submission_id, a.token);
  assert.deepEqual(g.submission.totals, { r1: 25, r2: 25 });
  // the same name again is a new, separate submission; the first is untouched
  const b = await save(`Ana${RUN}`, `Lee${RUN}`, { r1: { interphase: 3 } });
  assert.equal(b.ok, true);
  assert.notEqual(b.submission_id, a.submission_id, "duplicate names get separate submissions");
  assert.notEqual(b.token, a.token);
  assert.equal((await update(a.submission_id, b.token, { r1: { interphase: 1 } })).error, "not_yours", "another submission's token can't edit this one");
  assert.deepEqual((await own(a.submission_id, a.token)).submission.totals, { r1: 25, r2: 25 });
  // a typo fix to the name, with the token
  assert.equal((await update(b.submission_id, b.token, null, `Anna${RUN}`)).submission.first_name, `Anna${RUN}`);
});

test("validation: names, counts, the 25-cell limit", async () => {
  for (const [first, last] of [["", "Lee"], ["   ", "Lee"], ["Ana", "x".repeat(41)], ["123", "Lee"], ["Ana\u0007", "Lee"], ["<b>", "Lee"]]) {
    assert.equal((await save(first, last, {})).error, "bad_name", JSON.stringify([first, last]));
  }
  assert.equal((await save(" Ana   Maria ", "Lee", {})).submission.first_name, "Ana Maria", "trimmed, inner spaces collapsed");
  const bad = [
    { r3: { interphase: 1 } }, { r1: { cytokinesis: 1 } }, { r1: { interphase: -1 } }, { r1: { interphase: 1.5 } },
    { r1: { interphase: "5" } }, { r1: 5 }, [1, 2]
  ];
  for (const c of bad) assert.equal((await save("Val", `Bad${RUN}`, c)).error, "bad_counts", JSON.stringify(c));
  assert.equal((await save("Val", `Over${RUN}`, { r1: { interphase: 20, prophase: 6 } })).error, "over_total");
  assert.equal((await save("Val", `Over${RUN}`, { r2: { interphase: 26 } })).error, "over_total");
  const ok = await save("Val", `Ok${RUN}`, { r1: { interphase: 25 } });
  assert.equal(ok.ok, true);
  assert.equal((await update(ok.submission_id, ok.token, { r1: { interphase: 25, prophase: 1 } })).error, "over_total");
  assert.equal((await update(ok.submission_id, ok.token, null, "")).error, "bad_name");
});

test("public dashboard: correct aggregates and no names or IDs", async () => {
  const before = await dash();
  const x = await save(`Cleo${RUN}`, `Park${RUN}`, full(5, 1));    // 20% and 4%
  const y = await save(`Dev${RUN}`, `Shah${RUN}`, full(10, 3));    // 40% and 12%
  const p = await save(`Eli${RUN}`, `Ruiz${RUN}`, { r1: { prophase: 3 } }); // partial: counted in totals, not in the indices
  const d = await dash();
  assert.equal(d.submissions - before.submissions, 3);
  assert.equal(d.complete - before.complete, 2);
  assert.equal(d.totals.r1.prophase - before.totals.r1.prophase, 3 + 3 + 5);
  assert.ok(d.individual_mitotic_index.r1.includes(20) && d.individual_mitotic_index.r1.includes(40));
  const sorted = [...d.individual_mitotic_index.r1].sort((a, b) => a - b);
  assert.deepEqual(d.individual_mitotic_index.r1, sorted, "individual indices are sorted, so order says nothing about who");
  // nothing identifying, anywhere in the public responses
  const text = JSON.stringify(d) + JSON.stringify(await rpc("mitosis_get_experiment", { p_slug: FALL }));
  for (const s of [RUN, x.submission_id, y.submission_id, p.submission_id, "first_name", "last_name", "token"]) {
    assert.equal(text.includes(s), false, `public response contains ${s}`);
  }
});

test("instructor: key required; names, completion, indices, corrections, recovery, delete", async () => {
  assert.equal((await admin("check", {}, FALL, "wrong-key")).error, "unauthorized");
  assert.equal((await admin("list", {}, FALL, "")).error, "unauthorized");
  assert.equal((await admin("check")).ok, true);
  const s = await save(`Fay${RUN}`, `Ito${RUN}`, full(6, 2));
  const list = await admin("list");
  const row = list.submissions.find((r) => r.id === s.submission_id);
  assert.equal(`${row.first_name} ${row.last_name}`, `Fay${RUN} Ito${RUN}`);
  assert.equal(row.complete, true);
  assert.deepEqual(row.mitotic_index, { r1: 24, r2: 8 });
  assert.equal(row.last_saved_by, "student");
  assert.ok(row.last_saved_at);
  assert.equal((await admin("export")).submissions.length, list.submissions.length);
  // a correction (allowed even while closed), marked as the instructor's
  await admin("set_open", { is_open: false });
  try {
    assert.equal((await save("Late", `Closed${RUN}`, {})).error, "closed");
    assert.equal((await update(s.submission_id, s.token, full(1, 1))).error, "closed");
    const c = await admin("update_submission", { id: s.submission_id, last_name: `Ito-Kim${RUN}`, counts: full(7, 2), instructor_note: "recounted" });
    assert.equal(c.ok, true);
    assert.equal(c.submission.last_name, `Ito-Kim${RUN}`);
    assert.equal(c.submission.last_saved_by, "instructor");
    assert.deepEqual(c.submission.mitotic_index, { r1: 28, r2: 8 });
    assert.equal(c.submission.instructor_note, "recounted");
    assert.equal((await admin("update_submission", { id: s.submission_id, counts: { r1: { interphase: 30 } } })).error, "over_total");
  } finally {
    assert.equal((await admin("set_open", { is_open: true })).experiment.is_open, true);
  }
  // recovery: a new token; the old one stops working
  const rec = await admin("recover_access", { id: s.submission_id });
  assert.match(rec.token, /^[0-9a-f]{64}$/);
  assert.notEqual(rec.token, s.token);
  assert.equal((await own(s.submission_id, s.token)).error, "not_yours", "old token revoked");
  assert.equal((await own(s.submission_id, rec.token)).ok, true, "new token works");
  assert.equal(JSON.stringify(await admin("list")).includes(rec.token), false, "tokens never appear in the instructor list");
  // delete needs confirmation
  assert.equal((await admin("delete_submission", { id: s.submission_id })).error, "confirm_required");
  assert.equal((await admin("delete_submission", { id: s.submission_id, confirm: "DELETE" })).ok, true);
  assert.equal((await own(s.submission_id, rec.token)).error, "not_yours");
  assert.equal((await admin("recover_access", { id: crypto.randomUUID() })).error, "no_such_submission");
});

test("each semester is its own experiment; a new one can't touch Fall 2026", async () => {
  const fall = await rpc("mitosis_get_experiment", { p_slug: FALL });
  const slug = `bio151-mitosis-t${RUN}`;
  assert.equal((await admin("create_experiment", { title: "Test term" }, FALL)).error, "exists");
  assert.equal((await admin("create_experiment", { regions: [], stages: [] }, slug)).error, "bad_layout");
  const c = await admin("create_experiment", { title: "Test term", term: "Spring 2099", regions: fall.experiment.regions, stages: fall.experiment.stages }, slug);
  assert.equal(c.ok, true);
  const fallBefore = await dash();
  const sp = await save(`Gus${RUN}`, `Ott${RUN}`, full(4, 4), slug);
  assert.equal(sp.ok, true);
  const fallAfter = await dash();
  assert.deepEqual([fallAfter.submissions, fallAfter.totals], [fallBefore.submissions, fallBefore.totals], "Fall unchanged by the new term");
  assert.equal((await dash(slug)).submissions, 1);
  // layout freezes once a student has saved; labels and term can still change
  assert.equal((await admin("update_experiment", { regions: [{ key: "r1", label: "Tip" }, { key: "r2", label: "Back" }] }, slug)).error, "has_submissions");
  assert.equal((await admin("update_experiment", { term: "Spring 2100" }, slug)).experiment.term, "Spring 2100");
  assert.equal((await admin("list", {}, slug)).submissions.length, 1);
});

test("changing the instructor key", async () => {
  const next = `local-instructor-key-${RUN}`;
  assert.equal((await admin("set_key", { new_key: "short" })).error, "key_too_short");
  assert.equal((await admin("set_key", { new_key: next })).ok, true);
  try {
    assert.equal((await admin("check")).error, "unauthorized");
    assert.equal((await admin("check", {}, FALL, next)).ok, true);
  } finally {
    assert.equal((await admin("set_key", { new_key: KEY }, FALL, next)).ok, true);
  }
});
