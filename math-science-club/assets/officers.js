/* Club officer tools. Every change goes through public.club_admin(code, action, payload),
   which checks the officer code in the database. The code is kept in sessionStorage
   (this tab only). */
(function () {
  "use strict";
  var C = window.Club;
  if (!C || !document.getElementById("of-app")) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = C.esc;
  var root = document.body.getAttribute("data-club-root") || "../";
  var KEY = "club-officer-code";
  var DEFAULT_SLOTS = ["Main dish", "Side", "Snack", "Dessert", "Drinks", "Plates, cups or napkins"];
  var code = null, data = null, editing = null, settings = null;

  function msg(id, text, kind) { var el = $(id); el.textContent = text || ""; el.className = "club-msg" + (kind ? " is-" + kind : ""); }
  function status(text, warn) { $("of-status").innerHTML = text ? '<div class="club-banner' + (warn ? " club-banner--warn" : "") + '"><p>' + esc(text) + "</p></div>" : ""; }
  function admin(action, payload) { return C.rpc("club_admin", { p_code: code, p_action: action, p_payload: payload || {} }); }

  Object.keys(C.KINDS).forEach(function (k) { $("of-kind").insertAdjacentHTML("beforeend", '<option value="' + k + '">' + esc(C.KINDS[k]) + "</option>"); });

  // ------------------------------------------------------------ unlock / lock
  function unlock(c, quiet) {
    code = c;
    if (!quiet) msg("of-signin-msg", "Checking…");
    return admin("check").then(function (r) {
      if (!r.ok) {
        code = null;
        try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
        $("of-signin").hidden = false; $("of-app").hidden = true;
        msg("of-signin-msg", C.errorText(r), "error");
        return;
      }
      try { sessionStorage.setItem(KEY, c); } catch (e) { /* ignore */ }
      $("of-code").value = "";
      msg("of-signin-msg", "");
      settings = r;
      $("of-signin").hidden = true; $("of-app").hidden = false;
      showOpen();
      return load();
    });
  }
  $("of-signin-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var c = $("of-code").value;
    if (!c) { msg("of-signin-msg", "Enter the officer code.", "error"); return; }
    unlock(c);
  });
  $("of-signout").addEventListener("click", function () {
    code = null;
    try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    $("of-app").hidden = true; $("of-signin").hidden = false; $("of-editor").hidden = true;
    $("of-code").focus();
  });

  // ------------------------------------------------------------ open / closed
  function showOpen() {
    $("of-open-text").innerHTML = settings.signups_open
      ? "<strong>Open.</strong> Anyone with the link or QR code can sign up for events that have food sign-up turned on."
      : "<strong>Closed.</strong> Nobody can add or change sign-ups until it is reopened.";
    $("of-toggle-open").textContent = settings.signups_open ? "Close food sign-up" : "Reopen food sign-up";
  }
  $("of-toggle-open").addEventListener("click", function () {
    admin("set_signups_open", { open: !settings.signups_open }).then(function (r) {
      if (!r.ok) { status(C.errorText(r), true); return; }
      settings.signups_open = !settings.signups_open;
      showOpen();
    });
  });

  // ------------------------------------------------------------ event list
  function row(e) {
    var n = (e.signups || []).length;
    return '<li class="' + (C.isPast(e, data.today) ? "is-past" : "") + '"><div><p><strong>' + esc(C.shortDate(e.starts_on)) + "</strong> · " + esc(C.timeLabel(e)) + " · " + esc(e.title) +
      (e.tentative ? ' <span class="club-chip club-chip--tentative">Tentative</span>' : "") + (e.status === "cancelled" ? ' <span class="club-chip club-chip--cancelled">Cancelled</span>' : "") + "</p>" +
      (e.signup_enabled ? '<p class="club-hint">Food sign-up on · ' + n + (n === 1 ? " sign-up" : " sign-ups") + "</p>" : "") +
      '</div><button type="button" class="club-btn club-btn--ghost club-btn--small" data-edit="' + esc(e.id) + '">Edit<span class="visually-hidden"> ' + esc(e.title + ", " + C.shortDate(e.starts_on)) + "</span></button></li>";
  }
  function load(keepId) {
    msg("of-list-msg", "Loading…");
    return C.load(root).then(function (d) {
      if (!d.live) { msg("of-list-msg", "The club database could not be reached. Reload to try again.", "error"); return; }
      data = d;
      msg("of-list-msg", "");
      var up = C.upcoming(d), past = d.events.filter(function (e) { return C.isPast(e, d.today); }).reverse();
      $("of-upcoming").innerHTML = up.length ? up.map(row).join("") : "<li>No upcoming events.</li>";
      $("of-past").innerHTML = past.length ? past.map(row).join("") : "<li>No past events.</li>";
      if (keepId) { var e = d.events.filter(function (x) { return x.id === keepId; })[0]; if (e && !$("of-editor").hidden) fillSignups(e); }
    });
  }
  [$("of-upcoming"), $("of-past")].forEach(function (ul) {
    ul.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-edit]");
      if (!b) return;
      openEditor(data.events.filter(function (e) { return e.id === b.getAttribute("data-edit"); })[0], b);
    });
  });

  // ------------------------------------------------------------ editor
  var opener = null;
  function slotRow(label, needed, i) {
    return '<div class="club-slot-row" data-slot-row>' +
      '<div class="club-field"><label for="of-slot-' + i + '">Category</label><input id="of-slot-' + i + '" type="text" maxlength="60" value="' + esc(label || "") + '" data-slot-label></div>' +
      '<div class="club-field"><label for="of-slot-n-' + i + '">How many</label><input id="of-slot-n-' + i + '" type="number" min="1" max="999" inputmode="numeric" value="' + (needed || "") + '" data-slot-needed></div>' +
      '<button type="button" class="club-btn club-btn--ghost club-btn--small" data-slot-remove>Remove<span class="visually-hidden"> category ' + esc(label || "") + "</span></button></div>";
  }
  var slotCounter = 0;
  function setSlots(slots) {
    $("of-slots").innerHTML = slots.map(function (s) { return slotRow(s.label, s.needed, slotCounter++); }).join("");
  }
  function readSlots() {
    return Array.prototype.map.call(document.querySelectorAll("[data-slot-row]"), function (r) {
      return { label: r.querySelector("[data-slot-label]").value.trim(), needed: r.querySelector("[data-slot-needed]").value.trim() };
    }).filter(function (s) { return s.label; });
  }
  function toggleSignupSetup() { $("of-signup-setup").hidden = !$("of-signup").checked; }
  function fillSignups(e) {
    var list = e && e.signups || [];
    $("of-signups-wrap").hidden = !e || !e.signup_enabled;
    $("of-signups").innerHTML = list.length ? list.map(function (s) {
      return "<li><p>" + esc(s.name) + " — " + esc(s.item) + " (" + esc(s.slot) + ")" + (s.note ? ' <span class="club-hint">' + esc(s.note) + "</span>" : "") + "</p>" +
        '<button type="button" class="club-btn club-btn--danger club-btn--small" data-remove-signup="' + esc(s.id) + '">Remove<span class="visually-hidden"> ' + esc(s.name + "'s " + s.item) + "</span></button></li>";
    }).join("") : "<li>No sign-ups yet.</li>";
  }
  function openEditor(e, from) {
    editing = e || null;
    opener = from || null;
    $("of-editor-title").textContent = e ? "Edit event" : "New event";
    $("of-date").value = e ? e.starts_on : "";
    $("of-end-date").value = e && e.ends_on ? e.ends_on : "";
    $("of-start").value = e && e.start_time ? e.start_time : "";
    $("of-end").value = e && e.end_time ? e.end_time : "";
    $("of-title").value = e ? e.title : "";
    $("of-kind").value = e ? e.kind : "meeting";
    $("of-location").value = e && e.location || "";
    $("of-details").value = e && e.details || "";
    $("of-tentative").checked = !!(e && e.tentative);
    $("of-cancelled").checked = !!(e && e.status === "cancelled");
    $("of-signup").checked = !!(e && e.signup_enabled);
    $("of-signup-note").value = e && e.signup_note || "";
    setSlots(e && e.slots && e.slots.length ? e.slots : DEFAULT_SLOTS.map(function (l) { return { label: l, needed: null }; }));
    toggleSignupSetup();
    $("of-delete").hidden = !e;
    fillSignups(e);
    msg("of-form-msg", "");
    $("of-editor").hidden = false;
    $("of-editor").scrollIntoView({ block: "start" });
    $("of-editor").focus();
  }
  function closeEditor() {
    $("of-editor").hidden = true;
    editing = null;
    if (opener && document.body.contains(opener)) opener.focus(); else $("of-add").focus();
  }
  $("of-add").addEventListener("click", function () { openEditor(null, this); $("of-date").focus(); });
  $("of-close").addEventListener("click", closeEditor);
  $("of-signup").addEventListener("change", toggleSignupSetup);
  $("of-slot-add").addEventListener("click", function () {
    $("of-slots").insertAdjacentHTML("beforeend", slotRow("", null, slotCounter++));
    var inputs = document.querySelectorAll("[data-slot-label]");
    inputs[inputs.length - 1].focus();
  });
  $("of-slot-default").addEventListener("click", function () { setSlots(DEFAULT_SLOTS.map(function (l) { return { label: l, needed: null }; })); });
  $("of-slots").addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-slot-remove]");
    if (!b) return;
    b.closest("[data-slot-row]").remove();
    $("of-slot-add").focus();
  });

  $("of-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var p = {
      id: editing ? editing.id : null, starts_on: $("of-date").value, ends_on: $("of-end-date").value,
      start_time: $("of-start").value, end_time: $("of-end").value, title: $("of-title").value.trim(),
      kind: $("of-kind").value, location: $("of-location").value.trim(), details: $("of-details").value.trim(),
      tentative: $("of-tentative").checked, status: $("of-cancelled").checked ? "cancelled" : "scheduled",
      signup_enabled: $("of-signup").checked, signup_note: $("of-signup-note").value.trim(), slots: readSlots()
    };
    if (!p.starts_on) { msg("of-form-msg", "Choose a date.", "error"); $("of-date").focus(); return; }
    if (!p.title) { msg("of-form-msg", "Give the event a title.", "error"); $("of-title").focus(); return; }
    if (p.ends_on && p.ends_on < p.starts_on) { msg("of-form-msg", "The last day must be on or after the first day.", "error"); $("of-end-date").focus(); return; }
    if (p.signup_enabled && !p.slots.length) { msg("of-form-msg", "Add at least one food category, or turn food sign-up off.", "error"); $("of-slot-add").focus(); return; }
    if (editing && editing.signup_enabled && (editing.signups || []).length) {
      var labels = p.slots.map(function (s) { return s.label; });
      var orphaned = editing.signups.filter(function (s) { return labels.indexOf(s.slot) === -1; }).length;
      if (orphaned && !window.confirm(orphaned + " existing sign-up(s) use a category you removed or renamed. They will be listed under \"Other\". Save anyway?")) return;
    }
    msg("of-form-msg", "Saving…");
    admin("save_event", p).then(function (r) {
      if (!r.ok) { msg("of-form-msg", C.errorText(r), "error"); return; }
      var id = r.id;
      load().then(function () {
        msg("of-list-msg", "Saved: " + p.title + " (" + C.shortDate(p.starts_on) + "). The club page shows the change now.", "ok");
        $("of-editor").hidden = true;
        editing = null;
        var b = document.querySelector('[data-edit="' + id + '"]');
        (b || $("of-add")).focus();
      });
    });
  });
  $("of-delete").addEventListener("click", function () {
    if (!editing) return;
    var n = (editing.signups || []).length;
    if (!window.confirm("Delete \"" + editing.title + "\" on " + C.shortDate(editing.starts_on) + "?" + (n ? " Its " + n + " food sign-up(s) will be deleted too." : "") +
      " This cannot be undone. (To keep it visible but crossed out, tick Cancelled instead.)")) return;
    admin("delete_event", { id: editing.id }).then(function (r) {
      if (!r.ok) { msg("of-form-msg", C.errorText(r), "error"); return; }
      var title = editing.title;
      $("of-editor").hidden = true; editing = null;
      load().then(function () { msg("of-list-msg", "Deleted: " + title + ".", "ok"); $("of-add").focus(); });
    });
  });
  $("of-signups").addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-remove-signup]");
    if (!b || !window.confirm("Remove this sign-up from the list?")) return;
    admin("remove_signup", { id: b.getAttribute("data-remove-signup") }).then(function (r) {
      if (!r.ok) { msg("of-form-msg", C.errorText(r), "error"); return; }
      var id = editing && editing.id;
      load(id).then(function () {
        editing = data.events.filter(function (e) { return e.id === id; })[0] || editing;
        fillSignups(editing);
        msg("of-form-msg", "Sign-up removed.", "ok");
      });
    });
  });

  // ------------------------------------------------------------ change code
  $("of-newcode-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var c = $("of-newcode").value;
    if (c.length < 8) { msg("of-newcode-msg", "Use at least 8 characters.", "error"); return; }
    admin("set_code", { new_code: c }).then(function (r) {
      if (!r.ok) { msg("of-newcode-msg", C.errorText(r), "error"); return; }
      code = c;
      try { sessionStorage.setItem(KEY, c); } catch (err) { /* ignore */ }
      $("of-newcode").value = "";
      msg("of-newcode-msg", "Officer code changed. Share the new code with the other officers.", "ok");
    });
  });

  // ------------------------------------------------------------ start
  if (!C.live()) {
    status("Officer tools work once the club database is switched on.", true);
    return;
  }
  if (C.isLocal()) status("Local test database (tools/math-science-club/local-api.mjs).");
  $("of-signin").hidden = false;
  var saved = null;
  try { saved = sessionStorage.getItem(KEY); } catch (e) { /* ignore */ }
  if (saved) unlock(saved, true);
})();
