/* BIO 151 Mitosis Lab: instructor dashboard. Every call goes through mitosis_instructor with
   the instructor key (kept in sessionStorage for this tab only). Student editing tokens are
   never shown here, except a new one created by "Recover access", shown once. */
(function () {
  "use strict";
  const A = window.MitosisAPI;
  const $ = (id) => document.getElementById(id);
  const slug = A.slug;
  const KEY_STORE = "mitosis-instructor-key";
  let key = null, exp = null, rows = [], editing = null, editTables = null, recovering = null;

  const getKey = () => { try { return sessionStorage.getItem(KEY_STORE); } catch (_) { return null; } };
  const keepKey = (k) => { try { k ? sessionStorage.setItem(KEY_STORE, k) : sessionStorage.removeItem(KEY_STORE); } catch (_) { /* tab-only */ } };
  const admin = (action, payload, s) => A.instructor(key, action, s || slug, payload);
  function msg(id, text, kind) { const el = $(id); el.textContent = text || ""; el.className = "msg " + (kind || "warn") + (text ? "" : " hidden"); }
  const nameOf = (r) => `${r.first_name} ${r.last_name}`;
  const shortId = (id) => id.slice(0, 6);
  const findRow = (id) => rows.find((r) => r.id === id);

  // ---------------------------------------------------------------- sign in
  async function unlock(k, quiet) {
    key = k;
    const r = await admin("check");
    if (!r.ok) {
      key = null;
      keepKey(null);
      $("signin").classList.remove("hidden");
      $("app").classList.add("hidden");
      if (!quiet) msg("signin-msg", A.errorText(r), "err");
      return;
    }
    keepKey(k);
    $("key").value = "";
    msg("signin-msg", "");
    $("signin").classList.add("hidden");
    $("app").classList.remove("hidden");
    if (A.isLocal) msg("msg", "Local test database (tools/bio151-mitosis/local-api.mjs).", "ok");
    await load();
  }
  function lock() {
    key = null;
    keepKey(null);
    $("app").classList.add("hidden");
    $("signin").classList.remove("hidden");
    $("key").focus();
  }
  $("signin-form").addEventListener("submit", (e) => { e.preventDefault(); unlock($("key").value, false); });
  $("lock-btn").addEventListener("click", lock);

  // ---------------------------------------------------------------- roster
  async function load() {
    const r = await admin("list");
    if (!r.ok) { msg("msg", A.errorText(r), "err"); if (r.error === "unauthorized") lock(); return; }
    exp = r.experiment;
    rows = r.submissions;
    render();
  }
  // a region still being counted: its index is provisional, so say how many cells it is based on
  const miCell = (r, g) => (r.totals[g.key] === exp.cells_per_region ? A.pct(r.mitotic_index[g.key])
    : r.totals[g.key] > 0 ? `<span class="muted" title="Provisional: based on ${r.totals[g.key]} of ${exp.cells_per_region} cells">${A.pct(r.mitotic_index[g.key])} (of ${r.totals[g.key]})</span>` : "–");
  const countsLine = (r, region) => exp.stages.map((s) => `${A.esc(s.label.slice(0, 3))} ${r.counts[region.key][s.key]}`).join(" · ");
  function render() {
    $("title").textContent = `${exp.title} · Instructor`;
    $("course").textContent = [exp.course, exp.term, exp.slug].filter(Boolean).join(" · ");
    const done = rows.filter((r) => r.complete).length;
    $("summary").textContent = `${rows.length} ${rows.length === 1 ? "student" : "students"} · ${done} complete · data entry ${exp.is_open ? "open" : "closed"}`;
    $("toggle-open").textContent = exp.is_open ? "Close data entry" : "Reopen data entry";
    const N = exp.cells_per_region;
    const head = `<thead><tr><th scope="col">Student</th>${exp.regions.map((g) => `<th scope="col">${A.esc(g.label)}</th>`).join("")}` +
      `<th scope="col">Status</th>${exp.regions.map((g) => `<th scope="col">MI · ${A.esc(g.label)}</th>`).join("")}<th scope="col">Last saved</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead>`;
    const body = rows.length ? rows.map((r) => {
      const status = r.complete ? '<span class="badge ok">Complete</span>'
        : `<span class="badge part">Partial</span><div class="muted small">${exp.regions.map((g) => `${r.totals[g.key]}/${N}`).join(" · ")}</div>`;
      return `<tr><td><strong>${A.esc(r.last_name)}, ${A.esc(r.first_name)}</strong><div class="short-id">#${shortId(r.id)}</div>` +
        (r.instructor_note ? `<div class="muted small">${A.esc(r.instructor_note)}</div>` : "") + "</td>" +
        exp.regions.map((g) => `<td><div class="counts-line">${countsLine(r, g)}</div><div class="muted small">${r.totals[g.key]} / ${N}</div></td>`).join("") +
        `<td>${status}</td>` +
        exp.regions.map((g) => `<td class="num">${miCell(r, g)}</td>`).join("") +
        `<td>${A.esc(A.fmtWhen(r.last_saved_at))}${r.last_saved_by === "instructor" ? ' <span class="badge inst">by you</span>' : ""}</td>` +
        `<td class="actions"><button type="button" data-edit="${r.id}">Edit<span class="visually-hidden"> ${A.esc(nameOf(r))}</span></button> ` +
        `<button type="button" data-recover="${r.id}">Recover access<span class="visually-hidden"> for ${A.esc(nameOf(r))}</span></button></td></tr>`;
    }).join("") : `<tr><td colspan="${4 + 2 * exp.regions.length}">No submissions yet.</td></tr>`;
    $("roster").innerHTML = head + `<tbody>${body}</tbody>`;
    // experiment settings form
    $("exp-title").value = exp.title;
    $("exp-term").value = exp.term || "";
    $("exp-regions").innerHTML = exp.regions.map((g, i) => `<div><label for="exp-r-${i}">Region ${i + 1} label</label><input id="exp-r-${i}" type="text" maxlength="40" value="${A.esc(g.label)}"${rows.length ? " disabled" : ""}></div>`).join("");
    $("exp-regions-note").textContent = rows.length ? "Region labels are fixed now that students have saved." : "Region labels can change until the first student saves.";
  }
  $("refresh-btn").addEventListener("click", () => load());
  $("toggle-open").addEventListener("click", async () => {
    const r = await admin("set_open", { is_open: !exp.is_open });
    if (!r.ok) return msg("msg", A.errorText(r), "err");
    await load();
    msg("msg", r.experiment.is_open ? "Data entry reopened." : "Data entry closed. Students can see their counts but not save.", "ok");
  });

  // ---------------------------------------------------------------- CSV (has names: keep it off shared drives and out of the repository)
  function csvCell(v) {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // keep spreadsheets from treating a value as a formula
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  $("csv-btn").addEventListener("click", async () => {
    const r = await admin("export");
    if (!r.ok) return msg("msg", A.errorText(r), "err");
    const e = r.experiment;
    const header = ["Last name", "First name", "Submission ID", "Complete"];
    e.regions.forEach((g) => {
      e.stages.forEach((s) => header.push(`${g.label}: ${s.label}`));
      header.push(`${g.label}: total`, `${g.label}: mitotic cells`, `${g.label}: mitotic index (%)`);
    });
    header.push("Last saved", "Saved by", "Created", "Instructor note");
    const lines = [header.map(csvCell).join(",")];
    r.submissions.forEach((x) => {
      const row = [x.last_name, x.first_name, x.id, x.complete ? "yes" : "no"];
      e.regions.forEach((g) => {
        e.stages.forEach((s) => row.push(x.counts[g.key][s.key]));
        row.push(x.totals[g.key], x.mitotic[g.key], x.mitotic_index[g.key] == null ? "" : x.mitotic_index[g.key]);
      });
      row.push(x.last_saved_at, x.last_saved_by, x.created_at, x.instructor_note || "");
      lines.push(row.map(csvCell).join(","));
    });
    const blob = new Blob(["﻿" + lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${e.slug}-named.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    msg("msg", `Downloaded ${a.download} (${r.submissions.length} ${r.submissions.length === 1 ? "row" : "rows"}). It has student names.`, "ok");
  });

  // ---------------------------------------------------------------- edit a submission
  $("roster").addEventListener("click", (ev) => {
    const ed = ev.target.closest("[data-edit]"), rc = ev.target.closest("[data-recover]");
    if (ed) openEdit(findRow(ed.dataset.edit), ed);
    if (rc) openRecover(findRow(rc.dataset.recover), rc);
  });
  let opener = null;
  function openEdit(r, from) {
    if (!r) return;
    editing = r;
    opener = from;
    $("edit-title").textContent = `Edit: ${nameOf(r)}`;
    $("ed-first").value = r.first_name;
    $("ed-last").value = r.last_name;
    $("ed-note").value = r.instructor_note || "";
    editTables = A.countTables($("edit-tables"), exp, "ed", () => { $("ed-save").disabled = !editTables.valid(); });
    editTables.set(r.counts);
    lockEditor(false);
    msg("edit-msg", "");
    $("edit-dialog").showModal();
    $("ed-first").focus();
  }
  // while a save or delete is on its way, nothing in the editor can change (so nothing typed
  // after Save can be lost when the dialog closes)
  function lockEditor(on) {
    $("edit-form").querySelectorAll("input, textarea, button").forEach((el) => { el.disabled = on; });
    if (!on && editTables) $("ed-save").disabled = !editTables.valid();
  }
  $("edit-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if ($("ed-save").disabled) return;
    lockEditor(true);
    msg("edit-msg", "Saving…", "warn");
    const r = await admin("update_submission", { id: editing.id, first_name: $("ed-first").value, last_name: $("ed-last").value,
      counts: editTables.get(), instructor_note: $("ed-note").value });
    lockEditor(false);
    if (!r.ok) return msg("edit-msg", A.errorText(r), "err");
    $("edit-dialog").close();
    await load();
    msg("msg", `Saved changes for ${nameOf(r.submission)}.`, "ok");
  });
  $("ed-cancel").addEventListener("click", () => $("edit-dialog").close());
  $("ed-delete").addEventListener("click", async () => {
    if (!confirm(`Delete ${nameOf(editing)}'s submission? This can't be undone.`)) return;
    lockEditor(true);
    const r = await admin("delete_submission", { id: editing.id, confirm: "DELETE" });
    lockEditor(false);
    if (!r.ok) return msg("edit-msg", A.errorText(r), "err");
    const gone = nameOf(editing);
    $("edit-dialog").close();
    await load();
    msg("msg", `Deleted ${gone}'s submission.`, "ok");
  });
  $("edit-dialog").addEventListener("close", () => { if (opener && document.body.contains(opener)) opener.focus(); });

  // ---------------------------------------------------------------- recover access
  function openRecover(r, from) {
    if (!r) return;
    recovering = r;
    opener = from;
    $("recover-title").textContent = `Recover access: ${nameOf(r)}`;
    $("recover-text").textContent = `This makes a new link for ${nameOf(r)} (#${shortId(r.id)}) to keep editing on another device. The device they used before will stop working for this submission.`;
    $("recover-step1").classList.remove("hidden");
    $("recover-result").classList.add("hidden");
    $("recover-qr").innerHTML = "";
    $("recover-link").value = "";
    msg("recover-msg", "");
    $("recover-dialog").showModal();
    $("recover-go").focus();
  }
  $("recover-go").addEventListener("click", async () => {
    if ($("recover-go").disabled) return;
    $("recover-go").disabled = true; // one recovery per click: a second would replace this link
    const r = await admin("recover_access", { id: recovering.id });
    $("recover-go").disabled = false;
    if (!r.ok) return msg("recover-msg", A.errorText(r), "err");
    const form = new URL("../", location.href);
    if (exp.slug !== A.config.EXPERIMENT_SLUG) form.searchParams.set("exp", exp.slug);
    form.hash = `recover=${r.submission_id}.${r.token}`; // after #: never sent to a server
    const link = form.toString();
    $("recover-link").value = link;
    if (window.qrcode) {
      const q = qrcode(0, "M");
      q.addData(link);
      q.make();
      $("recover-qr").innerHTML = q.createSvgTag({ cellSize: 4, margin: 4, scalable: true, alt: `Recovery QR code for ${nameOf(recovering)}`, title: "Recovery QR code" });
    }
    $("recover-step1").classList.add("hidden");
    $("recover-result").classList.remove("hidden");
    load();
  });
  $("recover-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("recover-link").value); msg("recover-msg", "Link copied.", "ok"); }
    catch (_) { $("recover-link").select(); msg("recover-msg", "Select the link and copy it.", "warn"); }
  });
  function forgetRecoveryLink() { $("recover-qr").innerHTML = ""; $("recover-link").value = ""; } // shown only once
  $("recover-dialog").addEventListener("click", (ev) => { if (ev.target.closest("[data-close]")) { forgetRecoveryLink(); $("recover-dialog").close(); } });
  $("recover-dialog").addEventListener("close", () => {
    forgetRecoveryLink(); // also when closed with Esc
    if (opener && document.body.contains(opener)) opener.focus();
  });

  // ---------------------------------------------------------------- settings, new semester, key
  $("exp-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const payload = { title: $("exp-title").value, term: $("exp-term").value };
    if (!rows.length) {
      const regions = exp.regions.map((g, i) => ({ key: g.key, label: ($(`exp-r-${i}`).value || "").trim() || g.label }));
      if (regions.some((g, i) => g.label !== exp.regions[i].label)) payload.regions = regions;
    }
    const r = await admin("update_experiment", payload);
    if (!r.ok) return msg("exp-msg", A.errorText(r), "err");
    await load();
    msg("exp-msg", "Settings saved.", "ok");
  });
  $("new-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const name = $("new-slug").value.trim().toLowerCase();
    const r = await admin("create_experiment", { title: exp.title, course: exp.course, term: $("new-term").value,
      regions: exp.regions, stages: exp.stages, cells_per_region: exp.cells_per_region }, name);
    if (!r.ok) return msg("new-msg", A.errorText(r), "err");
    msg("new-msg", `Created ${r.experiment.slug}. Point EXPERIMENT_SLUG in config.js at it before the lab (or use ?exp=${r.experiment.slug}).`, "ok");
  });
  $("key-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const next = $("new-key").value;
    const r = await admin("set_key", { new_key: next });
    if (!r.ok) return msg("key-msg", A.errorText(r), "err");
    key = next;
    keepKey(next);
    $("new-key").value = "";
    msg("key-msg", "Instructor key changed. Use the new key from now on.", "ok");
  });

  // ---------------------------------------------------------------- start
  const saved = getKey();
  if (saved) unlock(saved, true);
  else { $("signin").classList.remove("hidden"); $("key").focus(); }
})();
