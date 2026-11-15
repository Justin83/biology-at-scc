// Unit test for the time display in lab-api.js: every time the pages show, and
// the CSV's saved_at_eastern column, must be US Eastern (EDT/EST by date),
// whatever time zone the machine running the page is set to.
// Run: node --test labs/bio151-spectro/tests/time-test.mjs   (no network needed)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("../lab-api.js", import.meta.url), "utf8");
const ctx = { window: { LAB_CONFIG: { EXPERIMENT_SLUG: "x" } }, location: { search: "" }, URLSearchParams, Intl, Date, fetch };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const A = ctx.window.LabAPI;

test("daylight time (October): UTC 16:50 is 12:50 EDT", () => {
  assert.deepEqual({ ...A.eastern("2026-10-27T16:50:44.939464+00:00") }, { datetime: "2026-10-27 12:50:44", tz: "EDT" });
});

test("standard time (November): UTC 17:04 is 12:04 EST", () => {
  assert.deepEqual({ ...A.eastern("2026-11-09T17:04:13+00:00") }, { datetime: "2026-11-09 12:04:13", tz: "EST" });
});

test("evening UTC rolls back to the previous Eastern date, midnight prints as 00", () => {
  assert.deepEqual({ ...A.eastern("2026-11-11T02:30:00Z") }, { datetime: "2026-11-10 21:30:00", tz: "EST" });
  assert.deepEqual({ ...A.eastern("2026-11-10T05:00:00Z") }, { datetime: "2026-11-10 00:00:00", tz: "EST" });
});

test("blank time stays blank", () => {
  assert.deepEqual({ ...A.eastern("") }, { datetime: "", tz: "" });
});

test("on-screen times are Eastern too", () => {
  assert.match(A.fmtTime("2026-10-27T16:50:44Z"), /12:50:44/);
});
