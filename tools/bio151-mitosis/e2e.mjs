#!/usr/bin/env node
// Browser test for the BIO 151 Mitosis Lab pages (Playwright), against the local stand-in
// database, never production:
//   node tools/bio151-mitosis/local-api.mjs &
//   NODE_PATH=$(npm root -g) node tools/bio151-mitosis/e2e.mjs
// Environment: MITOSIS_API_URL (default http://127.0.0.1:8790), MITOSIS_INSTRUCTOR_KEY.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const API = (process.env.MITOSIS_API_URL || "http://127.0.0.1:8790").replace(/\/$/, "");
const KEY = process.env.MITOSIS_INSTRUCTOR_KEY || "local-instructor-key";
const RUN = Array.from(crypto.randomBytes(4), (b) => String.fromCharCode(97 + (b % 26))).join("");
const FIRST = `Ana${RUN}`, LAST = `Lee${RUN}`, NAME = `${LAST}, ${FIRST}`;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const SITE = `http://127.0.0.1:${server.address().port}/labs/bio151-mitosis/`;
const Q = `?api=${encodeURIComponent(API)}`;
const text = (page, sel) => page.innerText(sel).then((t) => t.replace(/\s+/g, " ").trim());
const rpc = async (fn, args) => (await fetch(`${API}/rest/v1/rpc/${fn}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(args) })).json();

let browser;
try {
  browser = await chromium.launch();
  const errors = [];
  const watch = (p) => { p.on("pageerror", (e) => errors.push(String(e))); p.on("dialog", (d) => d.accept()); return p; };
  const phone = async () => watch(await (await browser.newContext({ ...devices["Pixel 7"] })).newPage());
  const desktop = async (opts = {}) => watch(await (await browser.newContext({ viewport: { width: 1366, height: 900 }, ...opts })).newPage());
  const setCount = (page, region, stage, v) => page.fill(`#c-${region}-${stage}`, String(v));
  const before = await rpc("mitosis_dashboard", { p_slug: "bio151-mitosis-2026fa" });

  // ---------------------------------------------------------------- a student, first save
  const a = await phone();
  await a.goto(SITE + Q);
  await a.waitForSelector("#form:not(.hidden) #c-r1-interphase");
  assert.equal(await a.textContent("h1"), "Mitosis: Counting Cell-Cycle Stages");
  assert.deepEqual(await a.$$eval("section.count-region h2", (h) => h.map((x) => x.textContent)), ["Region 1", "Region 2"]);
  assert.deepEqual(await a.$$eval("#tables section:first-child tbody th", (h) => h.map((x) => x.textContent)), ["Interphase", "Prophase", "Metaphase", "Anaphase", "Telophase"]);
  assert.equal(await a.isVisible("input[type=password]"), false, "no PIN");
  assert.equal(await text(a, "#c-r1-total"), "0 / 25");
  // + and − buttons, and typing
  await a.click('button[data-for="c-r1-prophase"][data-step="1"]');
  await a.click('button[data-for="c-r1-prophase"][data-step="1"]');
  await a.click('button[data-for="c-r1-prophase"][data-step="-1"]');
  assert.equal(await a.inputValue("#c-r1-prophase"), "1");
  await setCount(a, "r1", "interphase", 20);
  assert.equal(await text(a, "#c-r1-total"), "21 / 25");
  // over 25 blocks Save
  await setCount(a, "r1", "metaphase", 5);
  assert.match(await text(a, "#c-r1-total"), /26 \/ 25 \(over by 1\)/);
  assert.equal(await a.isDisabled("#save-btn"), true, "can't save over 25");
  await setCount(a, "r1", "metaphase", 2);
  // names required
  await a.click("#save-btn");
  assert.match(await text(a, "#save-state"), /Enter your first and last name/);
  await a.fill("#first", FIRST);
  await a.fill("#last", LAST);
  await a.click("#save-btn");
  await a.waitForFunction(() => /^Saved/.test(document.getElementById("save-state").textContent));
  const own = await a.evaluate(() => JSON.parse(localStorage.getItem("mitosis-own:bio151-mitosis-2026fa")));
  assert.match(own.token, /^[0-9a-f]{64}$/, "the editing token stays on the device");
  assert.equal(new URL(a.url()).hash, "", "the token is never in the address");
  // come back later: the saved counts load, and the form stays closed until they have, so
  // nothing typed or saved in the meantime can be overwritten
  await a.route("**/rest/v1/rpc/mitosis_get_own", async (route) => { await new Promise((r) => setTimeout(r, 900)); await route.continue(); });
  await a.reload();
  await a.waitForFunction(() => document.getElementById("title").textContent !== "Loading…");
  assert.equal(await a.isVisible("#form"), false, "the form waits for the saved counts");
  assert.equal(await a.isVisible("#save-btn"), false, "no Save until the saved counts are back");
  await a.waitForFunction(() => /^Saved/.test(document.getElementById("save-state").textContent));
  await a.unroute("**/rest/v1/rpc/mitosis_get_own");
  assert.equal(await a.inputValue("#first"), FIRST);
  assert.equal(await a.inputValue("#c-r1-interphase"), "20");
  // if the saved counts can't be loaded (server or network trouble), the form stays closed:
  // a blank form must never be saveable over the real submission. Try again recovers.
  await a.route("**/rest/v1/rpc/mitosis_get_own", (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  await a.reload();
  await a.waitForFunction(() => /couldn't be loaded/.test(document.getElementById("boot-msg").textContent));
  assert.equal(await a.isVisible("#form"), false, "no form when the restore failed");
  assert.equal(await a.isVisible("#save-btn"), false, "no Save when the restore failed");
  assert.equal(await a.isVisible("#retry-btn"), true, "a way to try again");
  assert.ok(await a.evaluate((k) => localStorage.getItem(k), "mitosis-own:bio151-mitosis-2026fa"), "the device keeps its token");
  await a.unroute("**/rest/v1/rpc/mitosis_get_own");
  await a.click("#retry-btn");
  await a.waitForFunction(() => /^Saved/.test(document.getElementById("save-state").textContent));
  assert.equal(await a.isVisible("#retry-btn"), false);
  assert.equal(await a.inputValue("#c-r1-interphase"), "20", "the saved counts are back after trying again");
  // finish both regions: complete
  await setCount(a, "r1", "anaphase", 1);
  await setCount(a, "r1", "telophase", 1);       // r1: 20 + 1 + 2 + 1 + 1 = 25 (MI 20%)
  await setCount(a, "r2", "interphase", 24);
  await setCount(a, "r2", "prophase", 1);        // r2: 25 (MI 4%)
  assert.match(await text(a, "#c-r1-total"), /25 \/ 25 ✓/);
  assert.match(await text(a, "#save-state"), /Unsaved changes/);
  await a.click("#save-btn");
  await a.waitForFunction(() => /Saved .* complete/.test(document.getElementById("save-state").textContent));
  // typing while a save is still in flight is kept, not overwritten when the save returns
  await a.route("**/rest/v1/rpc/mitosis_update", async (route) => { await new Promise((r) => setTimeout(r, 900)); await route.continue(); });
  await a.click("#save-btn");
  await a.waitForFunction(() => /Saving/.test(document.getElementById("save-state").textContent));
  await setCount(a, "r1", "interphase", 19);
  await a.waitForFunction(() => /newer changes not saved yet/.test(document.getElementById("save-state").textContent));
  assert.equal(await a.inputValue("#c-r1-interphase"), "19", "the newer edit survives the slow save");
  await a.unroute("**/rest/v1/rpc/mitosis_update");
  await setCount(a, "r1", "interphase", 20);
  await a.click("#save-btn");
  await a.waitForFunction(() => /Saved .* complete/.test(document.getElementById("save-state").textContent));

  // ---------------------------------------------------------------- another student with the same name
  const b = await phone();
  await b.goto(SITE + Q);
  await b.waitForSelector("#form:not(.hidden) #c-r1-interphase");
  assert.equal(await b.inputValue("#first"), "", "a new device starts empty: a name never opens a submission");
  await b.fill("#first", FIRST);
  await b.fill("#last", LAST);
  await setCount(b, "r1", "interphase", 10);
  await b.click("#save-btn");
  await b.waitForFunction(() => /^Saved/.test(document.getElementById("save-state").textContent));
  const ownB = await b.evaluate(() => JSON.parse(localStorage.getItem("mitosis-own:bio151-mitosis-2026fa")));
  assert.notEqual(ownB.id, own.id, "duplicate names are separate submissions");

  // ---------------------------------------------------------------- public classroom dashboard: no names anywhere
  const d = await desktop();
  const bodies = [];
  d.on("response", async (r) => { if (r.url().includes("/rest/v1/rpc/")) { try { bodies.push(await r.text()); } catch (_) { /* ignore */ } } });
  await d.goto(SITE + "dashboard/" + Q);
  await d.waitForFunction(() => /students? (has|have) saved/.test(document.getElementById("status").textContent));
  assert.match(await text(d, "#status"), new RegExp(`${before.submissions + 2} students have saved · ${before.complete + 1} complete`));
  assert.match(await text(d, "#mi-cards"), /Region 1 .*% class mitotic index/);
  assert.match(await text(d, "#totals-table"), /Interphase/);
  await d.click("#qr-btn");
  assert.equal(await d.isVisible("#qr svg"), true, "QR for students");
  const pageText = await d.innerText("body") + await d.content();
  for (const s of [RUN, own.id, ownB.id]) assert.equal(pageText.includes(s), false, `dashboard page contains ${s}`);
  assert.ok(bodies.length >= 1);
  for (const body of bodies) for (const s of [RUN, own.id, ownB.id, "first_name", "last_name"]) assert.equal(body.includes(s), false, `public API response contains ${s}`);
  // the QR on a dashboard showing another semester sends students to that semester
  const d2 = await desktop();
  await d2.goto(SITE + "dashboard/" + Q + "&exp=bio151-mitosis-2099sp");
  await d2.click("#qr-btn");
  assert.match(await text(d2, "#qr-url"), /labs\/bio151-mitosis\/\?exp=bio151-mitosis-2099sp$/);
  assert.equal(await text(d, "#qr-url"), "biologyatscc.com/labs/bio151-mitosis/", "the default semester's QR has no ?exp=");

  // ---------------------------------------------------------------- instructor
  const t = await desktop({ acceptDownloads: true });
  await t.goto(SITE + "instructor/" + Q);
  await t.waitForSelector("#signin:not(.hidden)");
  await t.fill("#key", "wrong-key");
  await t.click("#signin-form button[type=submit]");
  await t.waitForFunction(() => /not accepted/.test(document.getElementById("signin-msg").textContent));
  await t.fill("#key", KEY);
  await t.click("#signin-form button[type=submit]");
  await t.waitForSelector(`#roster tr:has-text("${NAME}")`);
  const mine = t.locator(`#roster tr:has(.short-id:text-is("#${own.id.slice(0, 6)}"))`);
  const theirs = t.locator(`#roster tr:has(.short-id:text-is("#${ownB.id.slice(0, 6)}"))`);
  assert.equal(await t.locator(`#roster tr:has-text("${NAME}")`).count(), 2, "both students with the same name are listed");
  assert.match(await text(t, `#roster tr:has(.short-id:text-is("#${own.id.slice(0, 6)}"))`), /Complete 20\.0% 4\.0%/);
  assert.match(await text(t, `#roster tr:has(.short-id:text-is("#${ownB.id.slice(0, 6)}"))`), /Partial 10\/25 · 0\/25/);
  // the editor can be opened again and again: − still takes away exactly one
  for (let i = 0; i < 3; i++) {
    await mine.locator("[data-edit]").click();
    await t.waitForSelector("#edit-dialog[open]");
    await t.click("#ed-cancel");
  }
  // a correction
  await mine.locator("[data-edit]").click();
  await t.waitForSelector("#edit-dialog[open]");
  await t.click('#edit-tables button[data-for="ed-r1-interphase"][data-step="-1"]');
  assert.equal(await t.inputValue("#ed-r1-interphase"), "19", "one click of − takes one away, however often the editor was opened");
  await t.fill("#ed-r1-prophase", "3");
  await t.fill("#ed-r1-interphase", "18");     // r1 MI now 28%
  await t.fill("#ed-note", "recounted slide 2");
  // while the correction is on its way, the editor is locked, so nothing typed after Save
  // can be thrown away when the dialog closes
  await t.route("**/rest/v1/rpc/mitosis_instructor", async (route) => { await new Promise((r) => setTimeout(r, 900)); await route.continue(); });
  await t.click("#ed-save");
  await t.waitForFunction(() => /Saving/.test(document.getElementById("edit-msg").textContent));
  for (const sel of ["#ed-first", "#ed-note", "#ed-r1-interphase", "#ed-save", "#ed-delete", '#edit-tables button[data-step="1"]']) {
    assert.equal(await t.locator(sel).first().isDisabled(), true, `${sel} is locked while saving`);
  }
  await t.waitForFunction(() => /Saved changes/.test(document.getElementById("msg").textContent));
  await t.unroute("**/rest/v1/rpc/mitosis_instructor");
  assert.match(await text(t, `#roster tr:has(.short-id:text-is("#${own.id.slice(0, 6)}"))`), /recounted slide 2 .*28\.0% 4\.0% .*by you/);
  // recover access: a one-time link moves editing to a new device
  await mine.locator("[data-recover]").click();
  await t.waitForSelector("#recover-dialog[open]");
  await t.click("#recover-go");
  await t.waitForSelector("#recover-result:not(.hidden) #recover-qr svg");
  const link = await t.inputValue("#recover-link");
  assert.match(link, /\/labs\/bio151-mitosis\/#recover=[0-9a-f-]{36}\.[0-9a-f]{64}$/);
  await t.click('#recover-result [data-close]');
  assert.equal(await t.inputValue("#recover-link"), "", "the link is shown only once");
  const c = await phone();
  await c.goto(SITE + Q);  // sets the local database for this tab
  // the server can't be reached when the link is opened: the form stays closed (no second
  // submission by mistake), and Try again or a reload finishes the recovery later
  await c.route("**/rest/v1/rpc/mitosis_get_own", (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  await c.goto(link.replace(/^https?:\/\/[^/]+\/labs\/bio151-mitosis\//, SITE));
  await c.waitForFunction(() => /recovery link couldn't be opened/.test(document.getElementById("boot-msg").textContent));
  assert.equal(new URL(c.url()).hash, "", "the token is out of the address bar even when recovery fails");
  assert.equal(await c.isVisible("#form"), false, "no form while the recovery is unfinished");
  assert.equal(await c.isVisible("#save-btn"), false);
  await c.click("#retry-btn");   // still failing: still closed
  await c.waitForFunction(() => /recovery link couldn't be opened/.test(document.getElementById("boot-msg").textContent) && !document.getElementById("retry").classList.contains("hidden"));
  assert.equal(await c.isVisible("#form"), false);
  await c.unroute("**/rest/v1/rpc/mitosis_get_own");
  await c.reload();             // the link is gone from the address bar; the tab still remembers it
  await c.waitForFunction(() => /on this device now/.test(document.getElementById("boot-msg").textContent));
  assert.equal(await c.evaluate(() => sessionStorage.getItem("mitosis-recovering:bio151-mitosis-2026fa")), null, "the pending recovery is cleared once it worked");
  assert.equal(new URL(c.url()).hash, "", "the token is removed from the address bar");
  assert.equal(await c.inputValue("#last"), LAST);
  assert.equal(await c.inputValue("#c-r1-prophase"), "3", "the instructor's correction is there");
  // the old device can no longer edit
  await a.reload();
  await a.waitForFunction(() => /can no longer edit/.test(document.getElementById("boot-msg").textContent));
  // named CSV
  const [dl] = await Promise.all([t.waitForEvent("download"), t.click("#csv-btn")]);
  assert.equal(dl.suggestedFilename(), "bio151-mitosis-2026fa-named.csv");
  const csv = fs.readFileSync(await dl.path(), "utf8");
  assert.match(csv, /^﻿Last name,First name,Submission ID,Complete,Region 1: Interphase/);
  assert.ok(csv.includes(`${LAST},${FIRST},${own.id},yes,18,3,2,1,1,25,7,28`), "named row with counts, total, mitotic cells, index");
  // close data entry: students can't save
  await t.click("#toggle-open");
  await t.waitForFunction(() => /Data entry closed/.test(document.getElementById("msg").textContent));
  await c.reload();
  await c.waitForFunction(() => /closed/.test(document.getElementById("boot-msg").textContent));
  assert.equal(await c.isDisabled("#save-btn"), true);
  assert.equal(await c.isDisabled("#c-r1-interphase"), true);
  await t.click("#toggle-open");
  await t.waitForFunction(() => /reopened/.test(document.getElementById("msg").textContent));
  // delete (the duplicate test entry), then the other one
  await theirs.locator("[data-edit]").click();
  await t.waitForSelector("#edit-dialog[open]");
  await t.click("#ed-delete");
  await t.waitForFunction(() => /Deleted/.test(document.getElementById("msg").textContent));
  assert.equal(await t.locator(`#roster tr:has-text("${NAME}")`).count(), 1);
  await mine.locator("[data-edit]").click();
  await t.waitForSelector("#edit-dialog[open]");
  await t.click("#ed-delete");
  await mine.waitFor({ state: "detached" }); // same name as the first deletion's message, so wait for the row itself
  assert.equal(await t.locator(`#roster tr:has-text("${NAME}")`).count(), 0);

  assert.deepEqual(errors, [], "no page errors");
  console.log("PASS mitosis lab pages end-to-end");
} catch (e) {
  console.error("FAIL", e.message, (e.stack || "").split("\n").find((l) => l.includes("e2e.mjs")) || "");
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.close();
}
