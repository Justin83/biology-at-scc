/* BIO 151 Mitosis Lab: student form. First and last name, a counting table per region with
   a live "n / 25" total, and Save. The device makes the editing token for the first save
   (so a first save whose answer was lost can be sent again without making a second
   submission) and keeps it in localStorage; later saves send the token. A name never
   unlocks a submission. */
(function () {
  "use strict";
  const A = window.MitosisAPI;
  const $ = (id) => document.getElementById(id);
  const slug = A.slug;
  let exp = null, tables = null, own = A.loadOwn(slug), dirty = false, busy = false, booting = true;

  function msg(text, kind) { const el = $("boot-msg"); el.textContent = text || ""; el.className = "msg " + (kind || "warn") + (text ? "" : " hidden"); }
  function state(text, kind) { const el = $("save-state"); el.textContent = text; el.className = "state" + (kind ? " " + kind : ""); }
  function refreshButton() { $("save-btn").disabled = booting || busy || !exp || !exp.is_open || !tables || !tables.valid(); }
  function markDirty() { dirty = true; if (!busy) state("Unsaved changes", "warn"); refreshButton(); }
  const snapshot = () => JSON.stringify([$("first").value.trim(), $("last").value.trim(), tables.get()]);

  // A recovery link from the instructor: #recover=<submission id>.<token>. The part after #
  // never reaches a server; the page reads it once and removes it from the address bar.
  // If the server can't be reached, the link's credentials are kept for this tab only (in
  // memory and sessionStorage, never the address bar), so Try again or a reload can finish
  // the recovery instead of the student starting a second submission by mistake.
  const PENDING = `mitosis-recovering:${slug}`;
  let pendingCred = null;
  function setPending(cred) {
    pendingCred = cred;
    try { cred ? sessionStorage.setItem(PENDING, JSON.stringify(cred)) : sessionStorage.removeItem(PENDING); } catch (_) { /* memory only */ }
  }
  function getPending() {
    if (pendingCred) return pendingCred;
    try { const s = JSON.parse(sessionStorage.getItem(PENDING)); return s && s.id && s.token ? s : null; } catch (_) { return null; }
  }
  async function takeRecoveryLink() {
    const m = /^#recover=([0-9a-f-]{36})\.([0-9a-f]{64})$/.exec(location.hash);
    const cred = m ? { id: m[1], token: m[2] } : getPending();
    if (!cred) return null;
    if (m) { try { history.replaceState(null, "", location.pathname + location.search); } catch (_) { location.hash = ""; } }
    const r = await A.getOwn(cred.id, cred.token);
    if (!r.ok && r.error !== "not_yours") {
      setPending(cred);
      return { retry: true, error: `${A.errorText(r)} Your recovery link couldn't be opened yet.` };
    }
    setPending(null);
    if (!r.ok) return { error: "That recovery link is no longer valid. Ask your instructor for a new one." };
    if (r.experiment.slug !== slug) return { error: `That link is for a different lab (${r.experiment.title}, ${r.experiment.term}).` };
    own = cred;
    A.storeOwn(slug, own);
    return { ok: true, sub: r.submission };
  }

  function fill(sub) {
    $("first").value = sub.first_name;
    $("last").value = sub.last_name;
    tables.set(sub.counts);
    dirty = false;
    state(`Saved ${A.fmtTime(sub.last_saved_at)}` + (sub.complete ? " · complete" : ""), "ok");
    $("new-btn").classList.remove("hidden");
    refreshButton();
  }

  async function boot() {
    const rec = await takeRecoveryLink();
    const r = await A.getExperiment(slug);
    if (!r.ok) { $("title").textContent = "Mitosis Lab"; msg(A.errorText(r), "err"); $("retry").classList.remove("hidden"); return; }
    exp = r.experiment;
    $("title").textContent = exp.title;
    $("course").textContent = [exp.course, exp.term, `count ${exp.cells_per_region} cells in each region`].filter(Boolean).join(" · ");
    document.title = `${exp.title} · Enter Counts`;
    tables = A.countTables($("tables"), exp, "c", markDirty);
    if (A.isLocal) msg("Local test database (tools/bio151-mitosis/local-api.mjs).", "ok");
    if (rec && rec.retry) { msg(rec.error, "err"); $("retry").classList.remove("hidden"); return; } // form stays closed
    if (rec && rec.error) msg(rec.error, "err");
    if (rec && rec.ok) {
      fill(rec.sub);
      msg("Your submission is on this device now. Keep editing it here.", "ok");
    } else if (own) {
      const g = await A.getOwn(own.id, own.token);
      if (g.ok) fill(g.submission);
      else if (g.error === "not_yours") {
        A.storeOwn(slug, null);
        own = null;
        msg("This device can no longer edit your earlier submission (it may have moved to another device). Saving now starts a new one; ask your instructor if you need the earlier one.", "warn");
      } else {
        // couldn't load the saved counts (network or server): keep the form closed, so a
        // blank form can never be saved over the real submission
        msg(`${A.errorText(g)} Your saved counts couldn't be loaded.`, "err");
        $("retry").classList.remove("hidden");
        return;
      }
    }
    // only now: nothing typed or saved before this point could be overwritten by the restore
    booting = false;
    $("form").classList.remove("hidden");
    $("savebar").classList.remove("hidden");
    if (!exp.is_open) {
      tables.disable(true);
      $("first").disabled = $("last").disabled = true;
      $("new-btn").classList.add("hidden");
      msg("Data entry for this lab is closed." + (own ? " Your saved counts are shown below." : ""), "warn");
      state("Closed", "");
    }
    refreshButton();
  }

  $("form").addEventListener("input", (ev) => { if (ev.target.id === "first" || ev.target.id === "last") markDirty(); });
  $("form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (booting || busy || !exp || !exp.is_open) return;
    const first = $("first").value.trim(), last = $("last").value.trim();
    if (!first || !last) { state("Enter your first and last name.", "err"); (first ? $("last") : $("first")).focus(); return; }
    if (!tables.valid()) { state(`A region adds up to more than ${exp.cells_per_region}.`, "err"); return; }
    busy = true;
    refreshButton();
    state("Saving…", "");
    const counts = tables.get();
    const sent = snapshot();
    const r = own ? await A.update(own.id, own.token, first, last, counts) : await A.save(slug, first, last, counts, A.firstToken(slug));
    busy = false;
    if (!r.ok) {
      if (r.error === "not_yours") { A.storeOwn(slug, null); own = null; $("new-btn").classList.add("hidden"); }
      state(A.errorText(r), "err");
      refreshButton();
      return;
    }
    if (r.token) {
      own = { id: r.submission_id, token: r.token };
      A.clearFirstToken(slug);
      if (!A.storeOwn(slug, own)) msg("This browser won't let the page remember you, so you can't come back to edit on this device. Your counts are saved.", "warn");
    }
    if (snapshot() === sent) fill(r.submission);
    else { // typed something while saving: keep it, and say it still needs saving
      $("new-btn").classList.remove("hidden");
      dirty = true;
      state(`Saved ${A.fmtTime(r.submission.last_saved_at)} · newer changes not saved yet`, "warn");
      refreshButton();
    }
  });
  $("retry-btn").addEventListener("click", () => { $("retry").classList.add("hidden"); msg("Trying again…", "warn"); boot(); });
  $("new-btn").addEventListener("click", () => {
    if (busy) return; // not while a save is on its way
    if (!confirm("Start a new submission on this device? Your saved counts stay with your instructor, but this device won't be able to edit them anymore.")) return;
    A.storeOwn(slug, null);
    A.clearFirstToken(slug);
    own = null;
    $("first").value = "";
    $("last").value = "";
    tables.set({});
    dirty = false;
    $("new-btn").classList.add("hidden");
    state("Not saved yet", "");
    msg("", "");
    refreshButton();
    $("first").focus();
  });
  window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
  boot();
})();
