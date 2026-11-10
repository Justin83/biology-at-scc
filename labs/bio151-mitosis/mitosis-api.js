// BIO 151 Mitosis Lab: client for the mitosis_* database functions, plus the pieces the
// three pages share (device token storage, the counting tables, small formatters).
// Every call is a POST to /rest/v1/rpc/<function>; functions answer { ok: true, ... } or
// { ok: false, error: "<code>" }.
(function () {
  "use strict";
  const CFG = window.MITOSIS_CONFIG || {};

  // Local testing only: ?api=http://127.0.0.1:8790 (loopback addresses only) points the
  // pages at tools/bio151-mitosis/local-api.mjs for this browser tab; ?api=off clears it.
  let base = CFG.SUPABASE_URL;
  try {
    const q = new URLSearchParams(location.search).get("api");
    if (q === "off") sessionStorage.removeItem("mitosis-local-api");
    const cand = q && q !== "off" ? q : sessionStorage.getItem("mitosis-local-api");
    if (cand) {
      const u = new URL(cand);
      if (u.protocol === "http:" && ["127.0.0.1", "localhost"].includes(u.hostname)) {
        base = u.origin;
        sessionStorage.setItem("mitosis-local-api", u.origin);
      }
    }
  } catch (_) { /* storage blocked or bad URL: use the real database */ }
  const isLocal = base !== CFG.SUPABASE_URL;

  const ERRORS = {
    not_found: "This lab isn't set up yet. Ask your instructor.",
    closed: "Data entry for this lab is closed.",
    bad_name: "Enter your first and last name (letters; up to 40 characters each).",
    bad_token: "This device's editing key isn't valid. Reload the page and try again.",
    bad_counts: "Counts must be whole numbers of 0 or more.",
    over_total: "A region adds up to more than its cell count. Check your numbers.",
    full: "This lab has reached its limit of submissions. Ask your instructor.",
    not_yours: "This device can't edit that submission. Ask your instructor for help.",
    unauthorized: "Instructor key not accepted.",
    no_such_submission: "That submission no longer exists. Refresh the list.",
    confirm_required: "Deleting needs confirmation.",
    has_submissions: "Regions, stages and cell counts can't change once students have saved.",
    bad_layout: "Check the regions and stages.",
    bad_slug: "Use lowercase letters, numbers and hyphens (for example bio151-mitosis-2027sp).",
    exists: "An experiment with that name already exists.",
    key_too_short: "Use at least 8 characters.",
    key_too_long: "Use at most 72 characters (fewer if it has accented letters or symbols).",
    unknown_action: "Unknown instructor action.",
    network: "Could not reach the server. Check your connection and try again."
  };

  function slugFromPage() {
    const q = new URLSearchParams(location.search).get("exp");
    return q && /^[a-z0-9][a-z0-9-]{2,59}$/.test(q) ? q : CFG.EXPERIMENT_SLUG;
  }

  async function rpc(fn, args) {
    let res;
    try {
      res = await fetch(`${base}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json", "apikey": CFG.SUPABASE_KEY, "Authorization": "Bearer " + CFG.SUPABASE_KEY },
        body: JSON.stringify(args || {})
      });
    } catch (e) {
      return { ok: false, error: "network" };
    }
    let body = null;
    try { body = await res.json(); } catch (_) { /* fall through */ }
    if (!res.ok) return { ok: false, error: "http_" + res.status, detail: body && (body.message || body.hint) };
    return body && typeof body === "object" ? body : { ok: false, error: "bad_response" };
  }

  function errorText(r) {
    if (!r) return ERRORS.network;
    if (ERRORS[r.error]) return ERRORS[r.error];
    if (r.error && r.error.indexOf("http_") === 0) return `Server error (${r.error.slice(5)})${r.detail ? ": " + r.detail : ""}.`;
    return r.error || "Something went wrong.";
  }

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");
  const fmtWhen = (iso) => (iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
  const pct = (v) => (v == null ? "–" : `${Number(v).toFixed(1)}%`);

  // ---------------------------------------------------------------- this device's submission
  // { id, token } per experiment, in localStorage. The token is the only thing that lets
  // this device edit the submission; it is never put in a URL query string.
  const ownKey = (slug) => `mitosis-own:${slug}`;
  function loadOwn(slug) {
    try { const s = JSON.parse(localStorage.getItem(ownKey(slug))); return s && s.id && s.token ? s : null; } catch (_) { return null; }
  }
  function storeOwn(slug, own) {
    try { own ? localStorage.setItem(ownKey(slug), JSON.stringify({ id: own.id, token: own.token })) : localStorage.removeItem(ownKey(slug)); return true; } catch (_) { return false; }
  }

  // The editing token for a first save is made here, on the device (256 random bits), and
  // kept until the save is confirmed. If the answer to a first save is lost, saving again
  // sends the same token, and the database continues that submission instead of adding a
  // second one. Kept in localStorage so a reload still retries it; in memory if storage is
  // blocked.
  const firstKey = (slug) => `mitosis-first:${slug}`;
  const firstMem = {};
  const hexToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
  function firstToken(slug) {
    let t = firstMem[slug];
    if (!t) { try { t = localStorage.getItem(firstKey(slug)); } catch (_) { /* memory only */ } }
    if (!t || !/^[0-9a-f]{64}$/.test(t)) t = hexToken();
    firstMem[slug] = t;
    try { localStorage.setItem(firstKey(slug), t); } catch (_) { /* memory only */ }
    return t;
  }
  function clearFirstToken(slug) {
    delete firstMem[slug];
    try { localStorage.removeItem(firstKey(slug)); } catch (_) { /* nothing stored */ }
  }

  // ---------------------------------------------------------------- counting tables
  // One table per region: a row per stage with − / number / +, and a live "n / 25" total.
  // Returns { get(), set(counts), totals(), valid(), disable(bool), focusFirst() }.
  function countTables(container, exp, prefix, onChange) {
    const N = exp.cells_per_region;
    container.innerHTML = exp.regions.map((r) => {
      const rows = exp.stages.map((s) => {
        const id = `${prefix}-${r.key}-${s.key}`;
        return `<tr><th scope="row"><label for="${id}">${esc(s.label)}</label></th><td><div class="stepper">` +
          `<button type="button" class="step" data-step="-1" data-for="${id}" aria-label="One fewer, ${esc(s.label)}, ${esc(r.label)}">−</button>` +
          `<input id="${id}" type="number" inputmode="numeric" min="0" max="${N}" step="1" value="0" data-region="${esc(r.key)}" data-stage="${esc(s.key)}" autocomplete="off">` +
          `<button type="button" class="step" data-step="1" data-for="${id}" aria-label="One more, ${esc(s.label)}, ${esc(r.label)}">+</button>` +
          `</div></td></tr>`;
      }).join("");
      return `<section class="count-region" aria-labelledby="${prefix}-${r.key}-h"><h2 id="${prefix}-${r.key}-h">${esc(r.label)}</h2>` +
        `<table class="counts"><thead><tr><th scope="col">Stage</th><th scope="col">Cells</th></tr></thead><tbody>${rows}</tbody>` +
        `<tfoot><tr><th scope="row">Total</th><td><output id="${prefix}-${r.key}-total" class="total" aria-live="polite"></output></td></tr></tfoot></table></section>`;
    }).join("");
    const inputs = () => Array.from(container.querySelectorAll("input[data-region]"));
    const num = (el) => {
      const t = String(el.value).trim();
      return /^\d{1,3}$/.test(t) ? Number(t) : t === "" ? 0 : NaN;
    };
    function totals() {
      const out = {};
      exp.regions.forEach((r) => { out[r.key] = 0; });
      inputs().forEach((el) => { out[el.dataset.region] += num(el); });
      return out;
    }
    function paint() {
      const t = totals();
      exp.regions.forEach((r) => {
        const o = document.getElementById(`${prefix}-${r.key}-total`), v = t[r.key];
        o.textContent = Number.isNaN(v) ? `? / ${N}` : `${v} / ${N}` + (v === N ? " ✓" : v > N ? ` (over by ${v - N})` : "");
        o.className = "total" + (v === N ? " done" : v > N || Number.isNaN(v) ? " over" : "");
      });
      inputs().forEach((el) => el.classList.toggle("bad", Number.isNaN(num(el))));
    }
    // assigned (not added) so rebuilding the tables in the same container, as the
    // instructor's edit dialog does, replaces the handlers instead of stacking them
    container.oninput = () => { paint(); if (onChange) onChange(); };
    container.onclick = (ev) => {
      const b = ev.target.closest("button.step");
      if (!b || b.disabled) return;
      const el = document.getElementById(b.dataset.for), v = num(el), step = +b.dataset.step;
      const regionTotal = totals()[el.dataset.region];
      if (Number.isNaN(v)) return;
      if (step > 0 && regionTotal >= N) return; // a region can't go over its cell count
      el.value = Math.max(0, v + step);
      paint();
      if (onChange) onChange();
    };
    paint();
    return {
      get() {
        const out = {};
        exp.regions.forEach((r) => { out[r.key] = {}; });
        inputs().forEach((el) => { out[el.dataset.region][el.dataset.stage] = num(el); });
        return out;
      },
      set(counts) {
        inputs().forEach((el) => { el.value = (counts && counts[el.dataset.region] && counts[el.dataset.region][el.dataset.stage]) || 0; });
        paint();
      },
      totals,
      valid() { const t = totals(); return Object.keys(t).every((k) => !Number.isNaN(t[k]) && t[k] <= N); },
      disable(off) { container.querySelectorAll("input, button").forEach((el) => { el.disabled = off; }); },
      focusFirst() { const el = inputs()[0]; if (el) el.focus(); }
    };
  }

  window.MitosisAPI = {
    config: CFG, isLocal, slug: slugFromPage(), errorText, esc, fmtTime, fmtWhen, pct,
    loadOwn, storeOwn, firstToken, clearFirstToken, countTables,
    getExperiment: (slug) => rpc("mitosis_get_experiment", { p_slug: slug }),
    dashboard: (slug) => rpc("mitosis_dashboard", { p_slug: slug }),
    save: (slug, first, last, counts, token) => rpc("mitosis_save", { p_slug: slug, p_first_name: first, p_last_name: last, p_counts: counts, p_token: token }),
    update: (id, token, first, last, counts) => rpc("mitosis_update", { p_submission_id: id, p_token: token, p_first_name: first, p_last_name: last, p_counts: counts }),
    getOwn: (id, token) => rpc("mitosis_get_own", { p_submission_id: id, p_token: token }),
    instructor: (key, action, slug, payload) => rpc("mitosis_instructor", { p_key: key, p_action: action, p_slug: slug || null, p_payload: payload || {} })
  };
})();
