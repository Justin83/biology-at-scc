/* Club food sign-up page. Each sign-up made here gets a private token, kept in this
   browser's localStorage, so the same device can change or remove it later. */
(function () {
  "use strict";
  var C = window.Club;
  if (!C) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = C.esc;
  var root = document.body.getAttribute("data-club-root") || "../";
  var TOKENS = "club-signup-tokens", NAME = "club-name";
  var data = null, current = null, editing = null, busy = false;

  function store(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; } }
  function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* storage blocked */ } }
  function tokens() { return store(TOKENS, {}); }
  function msg(text, kind) { var el = $("su-msg"); el.textContent = text || ""; el.className = "club-msg" + (kind ? " is-" + kind : ""); }
  function status(html) { $("su-status").innerHTML = html || ""; }

  function eligible(d) {
    return C.upcoming(d).filter(function (e) { return e.signup_enabled && e.status !== "cancelled"; });
  }
  function slotsOf(e) { return e.slots && e.slots.length ? e.slots : [{ label: "Food or drink", needed: null }]; }

  function renderEvent() {
    var e = current;
    $("su-summary").hidden = false;
    $("su-event-body").innerHTML = '<p class="club-next-date">' + esc(C.dateLabel(e, true)) + "</p>" +
      '<p class="club-next-meta">' + esc(C.timeLabel(e)) + " · " + esc(e.title) + (e.location ? " · " + esc(e.location) : "") +
      (C.relDays(data.today, e.starts_on) ? " · " + esc(C.relDays(data.today, e.starts_on)) : "") + "</p>" +
      (e.signup_note ? "<p>" + esc(e.signup_note) + "</p>" : "");
    // who's bringing what, by category
    var mine = tokens(), signups = e.signups || [];
    $("su-list-wrap").hidden = false;
    $("su-list").innerHTML = slotsOf(e).map(function (s) {
      var list = signups.filter(function (x) { return x.slot === s.label; });
      var count = s.needed ? list.length + " of " + s.needed + " needed" : list.length ? list.length + " signed up" : "nobody yet";
      return '<div><h3>' + esc(s.label) + " <span>" + esc(count) + "</span></h3>" +
        (list.length ? "<ul>" + list.map(function (x) {
          return '<li' + (mine[x.id] ? ' class="is-mine"' : "") + ">" + esc(x.name) + " — " + esc(x.item) +
            (x.note ? ' <span class="note">(' + esc(x.note) + ")</span>" : "") + (mine[x.id] ? ' <span class="note">(you)</span>' : "") + "</li>";
        }).join("") + "</ul>" : "") + "</div>";
    }).join("") + (signups.filter(function (x) { return !slotsOf(e).some(function (s) { return s.label === x.slot; }); }).length
      ? "<div><h3>Other</h3><ul>" + signups.filter(function (x) { return !slotsOf(e).some(function (s) { return s.label === x.slot; }); })
          .map(function (x) { return "<li>" + esc(x.name) + " — " + esc(x.item) + "</li>"; }).join("") + "</ul></div>" : "");
    // form categories
    var checked = editing ? editing.slot : (document.querySelector('input[name="su-slot"]:checked') || {}).value;
    $("su-slots").innerHTML = slotsOf(e).map(function (s, i) {
      return '<div class="club-choice"><input type="radio" name="su-slot" id="su-slot-' + i + '" value="' + esc(s.label) + '"' + (checked === s.label ? " checked" : "") +
        '><label for="su-slot-' + i + '">' + esc(s.label) + "</label></div>";
    }).join("");
    $("su-form-wrap").hidden = false;
    // this device's sign-ups
    var own = signups.filter(function (x) { return mine[x.id]; });
    $("su-mine-wrap").hidden = !own.length;
    $("su-mine").innerHTML = own.map(function (x) {
      return '<li><span><strong>' + esc(x.item) + "</strong> (" + esc(x.slot) + ") — " + esc(x.name) + "</span><span class=\"club-actions\" style=\"margin:0\">" +
        '<button type="button" class="club-btn club-btn--ghost club-btn--small" data-edit="' + esc(x.id) + '">Change<span class="visually-hidden"> ' + esc(x.item) + "</span></button>" +
        '<button type="button" class="club-btn club-btn--danger club-btn--small" data-remove="' + esc(x.id) + '">Remove<span class="visually-hidden"> ' + esc(x.item) + "</span></button></span></li>";
    }).join("");
  }

  function pick(id) {
    current = data.events.filter(function (e) { return e.id === id; })[0] || eligible(data)[0];
    renderEvent();
  }
  function refresh(keepId) {
    return C.load(root).then(function (d) {
      data = d;
      if (!d.live) {
        status('<div class="club-banner club-banner--warn"><p><strong>Online sign-up isn\'t available right now.</strong> ' +
          (C.config.enabled ? "The club database could not be reached — try again in a minute." : "It opens soon.") +
          ' See the <a href="' + root + '#schedule">schedule</a> for upcoming dates.</p></div>');
        return;
      }
      if (!d.signups_open) status('<div class="club-banner club-banner--warn"><p><strong>Food sign-up is closed right now.</strong> Ask a club officer.</p></div>');
      else status(C.isLocal() ? '<div class="club-banner"><p>Local test database.</p></div>' : "");
      var list = eligible(d);
      if (!list.length) {
        status('<div class="club-banner"><p><strong>No upcoming get-together has food sign-up yet.</strong> Club officers set it up for each meeting. See the <a href="' + root + '#schedule">schedule</a>.</p></div>');
        return;
      }
      $("su-event-wrap").hidden = list.length < 2;
      $("su-event").innerHTML = list.map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(C.shortDate(e.starts_on) + " — " + e.title) + "</option>"; }).join("");
      var want = keepId || new URLSearchParams(location.search).get("event");
      if (want && list.some(function (e) { return e.id === want; })) $("su-event").value = want;
      pick($("su-event").value);
      $("su-submit").disabled = !d.signups_open;
    });
  }

  $("su-event").addEventListener("change", function () { cancelEdit(); pick(this.value); });

  $("su-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (busy || !current) return;
    if ($("su-website").value) return; // filled only by bots
    var slot = (document.querySelector('input[name="su-slot"]:checked') || {}).value;
    var entry = { name: $("su-name").value.trim(), slot: slot, item: $("su-item").value.trim(), note: $("su-note").value.trim() };
    if (!entry.name) { msg("Enter your name.", "error"); $("su-name").focus(); return; }
    if (!slot) { msg("Choose a category.", "error"); var first = document.querySelector('input[name="su-slot"]'); if (first) first.focus(); return; }
    if (!entry.item) { msg("Say what you're bringing.", "error"); $("su-item").focus(); return; }
    busy = true; $("su-submit").disabled = true;
    msg(editing ? "Saving…" : "Signing you up…");
    var call = editing
      ? C.rpc("club_signup_update", { p_id: editing.id, p_token: tokens()[editing.id], p_entry: entry })
      : C.rpc("club_signup", { p_event_id: current.id, p_entry: entry });
    call.then(function (r) {
      busy = false; $("su-submit").disabled = false;
      if (!r.ok) { msg(C.errorText(r), "error"); return; }
      if (!editing) { var t = tokens(); t[r.id] = r.token; save(TOKENS, t); }
      save(NAME, entry.name);
      var was = editing;
      cancelEdit();
      $("su-item").value = ""; $("su-note").value = "";
      return refresh(current.id).then(function () {
        msg(was ? "Saved. Thanks!" : "You're signed up to bring " + entry.item + ". Thanks!", "ok");
        $("su-list-title").scrollIntoView({ block: "start" });
      });
    });
  });

  function startEdit(id) {
    var x = (current.signups || []).filter(function (s) { return s.id === id; })[0];
    if (!x) return;
    editing = x;
    $("su-name").value = x.name; $("su-item").value = x.item; $("su-note").value = x.note || "";
    Array.prototype.forEach.call(document.querySelectorAll('input[name="su-slot"]'), function (r) { r.checked = r.value === x.slot; });
    $("su-form-title").textContent = "Change your sign-up";
    $("su-submit").textContent = "Save change";
    $("su-cancel-edit").hidden = false;
    msg("");
    $("su-item").focus();
  }
  function cancelEdit() {
    editing = null;
    $("su-form-title").textContent = "Add what you're bringing";
    $("su-submit").textContent = "Sign me up";
    $("su-cancel-edit").hidden = true;
  }
  $("su-cancel-edit").addEventListener("click", function () { cancelEdit(); $("su-item").value = ""; $("su-note").value = ""; msg(""); });

  $("su-mine").addEventListener("click", function (ev) {
    var b = ev.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-edit")) { startEdit(b.getAttribute("data-edit")); return; }
    var id = b.getAttribute("data-remove");
    if (!id || !window.confirm("Remove this sign-up?")) return;
    C.rpc("club_signup_remove", { p_id: id, p_token: tokens()[id] }).then(function (r) {
      if (!r.ok) { msg(C.errorText(r), "error"); return; }
      var t = tokens(); delete t[id]; save(TOKENS, t);
      if (editing && editing.id === id) cancelEdit();
      refresh(current.id).then(function () { msg("Sign-up removed.", "ok"); $("su-form-title").focus(); });
    });
  });

  $("su-name").value = store(NAME, "") || "";
  $("su-form-title").setAttribute("tabindex", "-1");
  refresh(null).catch(function () { status('<div class="club-banner club-banner--warn"><p>The sign-up list could not be loaded. Reload to try again.</p></div>'); });
})();
