/* Club officer tools. Every change goes through public.club_admin(code, action, payload),
   which checks the officer code (or the adviser's override code, sql/009) in the database.
   The code is kept in sessionStorage (this tab only), and the tools lock themselves after
   15 minutes without activity (IDLE_MS), even if the tab was left open or reopened later. */
(function () {
  "use strict";
  var C = window.Club;
  if (!C || !document.getElementById("of-app")) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = C.esc;
  var root = document.body.getAttribute("data-club-root") || "../";
  var KEY = "club-officer-code";
  var ACTIVE_KEY = "club-officer-active"; // when this tab was last used while unlocked (ms)
  var IDLE_MS = 15 * 60 * 1000;
  var IDLE_TEXT = "Officer tools locked after 15 minutes without activity. Enter the code to unlock.";
  var shownKind = "food"; // the sign-up kind the editor shows now
  // the usual choices and editor wording for each kind of sign-up
  var KIND_SETUP = {
    food: { slots: [], title: "", hint: "", add: "", usual: "" }, // no categories for food sign-ups
    work: { slots: ["Volunteers"], title: "Volunteer list", hint: "(one list is usual: you assign places later. Add shifts or roles only if volunteers should pick one; a \"How many\" closes that list when it's full)", add: "Add a shift or role", usual: "Use one volunteer list" },
    going: { slots: ["Going"], title: "Spots", hint: "(put the number of spots in \"How many\", or leave it empty for no limit)", add: "Add an option", usual: "Use one \"Going\" list" }
  };
  function defaultSlots(kind) { return KIND_SETUP[kind].slots.map(function (l) { return { label: l, needed: null }; }); }
  // the usual sign-up for a new event of this type (trips: who's going; otherwise food)
  function kindFor(type) { return type === "campus-tour" || type === "conference" ? "going" : "food"; }
  var kindTouched = false; // the officer picked the sign-up kind in this editor
  function sameLabels(a, b) { return a.length === b.length && a.every(function (s, i) { return s.label === b[i]; }); }
  function showKind(kind) {
    var k = KIND_SETUP[kind];
    $("of-slots-title").textContent = k.title; $("of-slots-hint").textContent = k.hint;
    $("of-slot-add").textContent = k.add; $("of-slot-default").textContent = k.usual;
    $("of-slots-setup").hidden = kind === "food"; // food: name, item and note only
  }
  var code = null, data = null, editing = null, settings = null;
  // unlocked: the code was accepted (only then does the idle lock watch the clock).
  // attempt: bumped by every unlock and lock, so a lock made while a check is still on its
  // way cancels that check instead of leaving the tools open without a code.
  var unlocked = false, attempt = 0;

  function msg(id, text, kind) { var el = $(id); el.textContent = text || ""; el.className = "club-msg" + (kind ? " is-" + kind : ""); }
  function status(text, warn) { $("of-status").innerHTML = text ? '<div class="club-banner' + (warn ? " club-banner--warn" : "") + '"><p>' + esc(text) + "</p></div>" : ""; }
  function admin(action, payload) { return C.rpc("club_admin", { p_code: code, p_action: action, p_payload: payload || {} }); }

  Object.keys(C.KINDS).forEach(function (k) { $("of-kind").insertAdjacentHTML("beforeend", '<option value="' + k + '">' + esc(C.KINDS[k]) + "</option>"); });

  // ------------------------------------------------------------ unlock / lock
  function unlock(c, quiet) {
    var mine = ++attempt;
    unlocked = false;
    code = c;
    if (!quiet) msg("of-signin-msg", "Checking…");
    return admin("check").then(function (r) {
      if (mine !== attempt) return; // locked (or another unlock started) meanwhile
      if (!r.ok) {
        code = null;
        try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
        $("of-signin").hidden = false; $("of-app").hidden = true;
        msg("of-signin-msg", C.errorText(r), "error");
        return;
      }
      try { sessionStorage.setItem(KEY, c); } catch (e) { /* ignore */ }
      unlocked = true;
      touch(true);
      $("of-code").value = "";
      msg("of-signin-msg", "");
      settings = r;
      $("of-signin").hidden = true; $("of-app").hidden = false;
      showOpen();
      loadStats();
      return load();
    });
  }
  $("of-signin-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var c = $("of-code").value;
    if (!c) { msg("of-signin-msg", "Enter the officer code.", "error"); return; }
    unlock(c);
  });
  function lock(note) {
    attempt++; // a check still on its way is ignored when it comes back
    unlocked = false;
    code = null;
    try { sessionStorage.removeItem(KEY); sessionStorage.removeItem(ACTIVE_KEY); } catch (e) { /* ignore */ }
    closeEditor();
    $("of-app").hidden = true; $("of-signin").hidden = false;
    msg("of-signin-msg", note || "", note ? "error" : "");
    $("of-code").focus();
  }
  $("of-signout").addEventListener("click", function () { lock(""); });

  // ------------------------------------------------------------ auto-lock
  // Any click, key, touch or scroll while unlocked counts as activity. Every 20 seconds, and
  // whenever the tab comes back into view, the tools lock if the last activity was more
  // than 15 minutes ago (timers sleep in background tabs, so the time is checked, not counted).
  var lastTouch = 0;
  function lastActive() { var t = 0; try { t = +sessionStorage.getItem(ACTIVE_KEY) || 0; } catch (e) { /* ignore */ } return t || lastTouch; }
  function touch(force) {
    if (!unlocked) return;
    var now = Date.now();
    if (!force && now - lastTouch < 5000) return;
    lastTouch = now;
    try { sessionStorage.setItem(ACTIVE_KEY, String(now)); } catch (e) { /* ignore */ }
  }
  function idle() { return Date.now() - lastActive() > IDLE_MS; }
  function checkIdle() { if (unlocked && idle()) lock(IDLE_TEXT); }
  ["pointerdown", "keydown", "touchstart", "scroll", "input"].forEach(function (ev) {
    document.addEventListener(ev, function () { checkIdle(); touch(false); }, { capture: true, passive: true });
  });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) checkIdle(); });
  window.addEventListener("focus", checkIdle);
  setInterval(checkIdle, 20000);

  // ------------------------------------------------------------ open / closed
  // the site-wide switch (settings.signups_open): closes every event at once, STEAM Day
  // included. Each event also has its own Open / Close button in the list below (sql/010).
  function showOpen() {
    $("of-open-text").innerHTML = settings.signups_open
      ? "<strong>Open.</strong> Anyone with the link or QR code can sign up for any event whose own sign-up is open. To close just one event, use its <strong>Close sign-up</strong> button below."
      : "<strong>Closed.</strong> Nobody can sign up for any event, or change a sign-up, until it is reopened. This closes every event, STEAM Day included.";
    $("of-toggle-open").textContent = settings.signups_open ? "Close all sign-up" : "Reopen all sign-up";
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
    var n = (e.signups || []).length, past = C.isPast(e, data.today), open = C.signupOpen(e);
    var name = esc(e.title + ", " + C.shortDate(e.starts_on));
    // Open / Close sign-up for this one event (sql/010), for upcoming events that have a sign-up
    var toggle = e.signup_enabled && !past
      ? '<button type="button" class="club-btn club-btn--ghost club-btn--small" data-signup-open="' + (open ? "false" : "true") + '" data-event="' + esc(e.id) + '">' +
        (open ? "Close sign-up" : "Open sign-up") + '<span class="visually-hidden"> for ' + name + "</span></button>"
      : "";
    return '<li class="' + (past ? "is-past" : "") + '"><div><p><strong>' + esc(C.shortDate(e.starts_on)) + "</strong> · " + esc(C.timeLabel(e)) + " · " + esc(e.title) +
      (e.kind === "meeting" ? ' <span class="club-chip club-chip--meeting">Club meeting</span>' : "") +
      (e.tentative ? ' <span class="club-chip club-chip--tentative">Tentative</span>' : "") + (e.status === "postponed" ? ' <span class="club-chip club-chip--postponed">Postponed</span>' : "") + (e.status === "cancelled" ? ' <span class="club-chip club-chip--cancelled">Cancelled</span>' : "") + "</p>" +
      (e.signup_enabled || e.theme ? '<p class="club-hint">' + [e.theme ? "Food theme: " + esc(e.theme) : "",
        e.signup_enabled ? (open ? "Sign-up open: " : "<strong>Sign-up closed:</strong> ") + C.signupSpec(e).short + " · " + n + (n === 1 ? " sign-up" : " sign-ups") : ""].filter(Boolean).join(" · ") + "</p>" : "") +
      '</div><span class="club-actions club-officer-btns">' + toggle +
      '<button type="button" class="club-btn club-btn--ghost club-btn--small" data-edit="' + esc(e.id) + '">Edit<span class="visually-hidden"> ' + name + "</span></button></span></li>";
  }
  // ---------------------------------------------------------------- flyer library
  function flyerItem(f, today) {
    var pdf = esc(root + "flyers/" + f.pdf), name = esc(f.title), when = "";
    if (f.event_date) when = C.flyerCurrent(f, today) ? " On the club home page through " + C.longDate(f.event_date, true) + "." : " Event: " + C.longDate(f.event_date, true) + ".";
    return '<li class="club-flyer-item">' +
      '<a class="club-flyer-thumb" href="' + pdf + '" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true"><img src="' + esc(root + "flyers/" + f.preview) + '" width="612" height="792" alt="" loading="lazy"></a>' +
      '<div><h3>' + name + "</h3>" + (f.about ? "<p>" + esc(f.about) + "</p>" : "") +
      '<p class="club-hint">Made ' + esc(C.plainDate(f.made)) + "." + esc(when) + "</p>" +
      '<p class="club-actions"><a class="club-btn club-btn--ghost club-btn--small" href="' + pdf + '" target="_blank" rel="noopener">View or print<span class="visually-hidden"> the ' + name + " flyer (PDF, opens in a new tab)</span></a>" +
      '<a class="club-btn club-btn--ghost club-btn--small" href="' + pdf + '" download="' + esc(f.download) + '">Download<span class="visually-hidden"> the ' + name + " flyer (PDF)</span></a></p></div></li>";
  }
  var flyers = null;
  function showFlyers(today) {
    (flyers ? Promise.resolve(flyers) : C.loadFlyers(root)).then(function (list) {
      flyers = list;
      var cur = list.filter(function (f) { return C.flyerCurrent(f, today); }), old = list.filter(function (f) { return !C.flyerCurrent(f, today); });
      $("of-flyers").innerHTML = cur.length ? cur.map(function (f) { return flyerItem(f, today); }).join("") : "<li>No current flyers.</li>";
      $("of-flyers-archive").innerHTML = old.length ? old.map(function (f) { return flyerItem(f, today); }).join("") : "<li>No archived flyers yet.</li>";
      $("of-flyers-archive-count").textContent = old.length;
    });
  }

  // ------------------------------------------------------------ site engagement
  // public.club_stats (sql/007_club_visits.sql, 008): totals only, all traffic.
  var stats = null;
  function people(n, one, many) { return n === 1 ? "1 " + one : n + " " + many; }
  function pageName(p) {
    if (p === "home") return "Home page";
    if (p === "schedule") return "Schedule";
    if (p === "event") return "Event pages";
    if (p === "signup") return "Sign-up page";
    if (p === "officers") return "Officer tools";
    var m = /^events\/(.+)$/.exec(p);
    if (m) {
      var e = data && data.events.filter(function (x) { return x.page === m[1]; })[0];
      return "Event page: " + (e ? e.title : m[1]);
    }
    return p;
  }
  function showStats() {
    var s = stats;
    if (!s) return;
    $("of-stat-count").textContent = "(" + people(s.visitors, "visitor", "visitors") + ")"; // shows while collapsed
    $("of-stat-headline").innerHTML = s.visitors
      ? "<strong>" + s.visitors + "</strong> " + (s.visitors === 1 ? "person has" : "people have") + " visited the club website"
      : "Nobody has visited the club website yet";
    $("of-stat-since").textContent = s.since ? "Counting since " + C.longDate(s.since, true) + "." : "Counting starts with the next visit.";
    var tiles = [
      [s.visitors_today, "today"], [s.visitors_7d, "in the last 7 days"], [s.visitors_30d, "in the last 30 days"],
      [s.returning, "came back on another day"],
      [s.signup_people, s.signup_people === 1 ? "person signed up for something" : "people signed up for something"],
      [s.views, s.views === 1 ? "page view" : "page views"]
    ];
    $("of-stat-tiles").innerHTML = tiles.map(function (t) {
      return '<li><span class="club-stat-n">' + esc(t[0]) + '</span> <span class="club-stat-l">' + esc(t[1]) + "</span></li>";
    }).join("");
    var days = s.daily || [], max = Math.max.apply(null, days.map(function (x) { return x.visitors; }).concat([1]));
    var top = days.reduce(function (a, x) { return x.visitors > (a ? a.visitors : -1) ? x : a; }, null);
    $("of-stat-chart").innerHTML = days.map(function (x) {
      var h = x.visitors ? Math.max(6, Math.round(100 * x.visitors / max)) : 0;
      return '<span class="' + (x.visitors ? "" : "is-zero") + '" style="height:' + (h || 3) + '%" title="' + esc(C.shortDate(x.day) + ": " + people(x.visitors, "visitor", "visitors")) + '"></span>';
    }).join("");
    $("of-stat-chart").setAttribute("aria-label", "Visitors each day for the last 30 days. " +
      (top && top.visitors ? "Busiest day: " + C.shortDate(top.day) + " with " + people(top.visitors, "visitor", "visitors") + ". " : "") +
      "Today: " + people(s.visitors_today, "visitor", "visitors") + ".");
    $("of-stat-chart-from").textContent = days.length ? C.shortDate(days[0].day) : "";
    $("of-stat-chart-box").hidden = !days.length;
    $("of-stat-pages").innerHTML = (s.pages || []).map(function (p) {
      return "<tr><td>" + esc(pageName(p.page)) + "</td><td>" + esc(p.visitors) + "</td><td>" + esc(p.views) + "</td></tr>";
    }).join("");
    $("of-stat-pages-box").hidden = !(s.pages || []).length;
  }
  function loadStats() {
    msg("of-stat-msg", "");
    return C.rpc("club_stats", { p_code: code }).then(function (r) {
      if (!r.ok) { $("of-stat-headline").textContent = "Site engagement isn't available right now."; msg("of-stat-msg", C.errorText(r), "error"); return; }
      stats = r;
      showStats();
    });
  }

  function load(keepId) {
    msg("of-list-msg", "Loading…");
    return C.load(root).then(function (d) {
      showFlyers(d.today);
      if (!d.live) { msg("of-list-msg", "The club database could not be reached. Reload to try again.", "error"); return; }
      data = d;
      showStats();
      msg("of-list-msg", "");
      var up = C.upcoming(d), past = d.events.filter(function (e) { return C.isPast(e, d.today); }).reverse();
      $("of-upcoming").innerHTML = up.length ? up.map(row).join("") : "<li>No upcoming events.</li>";
      $("of-past").innerHTML = past.length ? past.map(row).join("") : "<li>No past events.</li>";
      if (keepId) { var e = d.events.filter(function (x) { return x.id === keepId; })[0]; if (e && $("of-editor").open) fillSignups(e); }
    });
  }
  [$("of-upcoming"), $("of-past")].forEach(function (ul) {
    ul.addEventListener("click", function (ev) {
      var t = ev.target.closest("[data-signup-open]");
      if (t) { setEventOpen(t.getAttribute("data-event"), t.getAttribute("data-signup-open") === "true"); return; }
      var b = ev.target.closest("[data-edit]");
      if (!b) return;
      openEditor(data.events.filter(function (e) { return e.id === b.getAttribute("data-edit"); })[0], b);
    });
  });
  // one event's Open / Close sign-up button (club_admin set_event_signup_open, sql/010)
  function setEventOpen(id, open) {
    var e = data.events.filter(function (x) { return x.id === id; })[0];
    if (!e) return;
    msg("of-list-msg", (open ? "Opening" : "Closing") + " sign-up…");
    admin("set_event_signup_open", { id: id, open: open }).then(function (r) {
      if (!r.ok) { msg("of-list-msg", C.errorText(r), "error"); return; }
      load().then(function () {
        msg("of-list-msg", "Sign-up " + (open ? "open" : "closed") + ": " + e.title + " (" + C.shortDate(e.starts_on) + ")." +
          (open && !settings.signups_open ? " Sign-up for all events is still closed above." : ""), "ok");
        // keep keyboard focus on the same event's button (it now says the opposite)
        var again = document.querySelector('[data-event="' + id + '"]');
        if (again) again.focus();
      });
    });
  }

  // ------------------------------------------------------------ editor
  var opener = null;
  function slotRow(label, needed, i) {
    return '<div class="club-slot-row" data-slot-row>' +
      '<div class="club-field"><label for="of-slot-' + i + '">' + esc(C.SIGNUP[shownKind].slot) + '</label><input id="of-slot-' + i + '" type="text" maxlength="60" value="' + esc(label || "") + '" data-slot-label></div>' +
      '<div class="club-field"><label for="of-slot-n-' + i + '">How many</label><input id="of-slot-n-' + i + '" type="number" min="1" max="999" inputmode="numeric" value="' + (needed || "") + '" data-slot-needed></div>' +
      '<button type="button" class="club-btn club-btn--ghost club-btn--small" data-slot-remove>Remove<span class="visually-hidden"> ' + esc(C.SIGNUP[shownKind].slot.toLowerCase() + " " + (label || "")) + "</span></button></div>";
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
      return "<li><p>" + esc(s.name) + (s.item ? ": " + esc(s.item) : "") + (C.signupKind(e) === "food" ? "" : " (" + esc(s.slot) + ")") + (s.note ? ' <span class="club-hint">' + esc(s.note) + "</span>" : "") + "</p>" +
        '<button type="button" class="club-btn club-btn--danger club-btn--small" data-remove-signup="' + esc(s.id) + '">Remove<span class="visually-hidden"> ' + esc(s.name + "'s " + (s.item || s.slot)) + "</span></button></li>";
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
    $("of-theme").value = e && e.theme || "";
    $("of-kind").value = e ? e.kind : "meeting";
    $("of-location").value = e && e.location || "";
    $("of-details").value = e && e.details || "";
    $("of-tentative").checked = !!(e && e.tentative);
    $("of-cancelled").checked = !!(e && e.status === "cancelled");
    $("of-postponed").checked = !!(e && e.status === "postponed");
    // a new event takes sign-ups, and its sign-up is open, unless the officer unticks it
    // (Justin, 2026-11-19: "the default should be open")
    $("of-signup").checked = e ? !!e.signup_enabled : true;
    $("of-signup-open").checked = e ? C.signupOpen(e) : true;
    $("of-signup-note").value = e && e.signup_note || "";
    kindTouched = false;
    $("of-signup-kind").value = e ? C.signupKind(e) : kindFor($("of-kind").value);
    showKind($("of-signup-kind").value);
    shownKind = $("of-signup-kind").value;
    setSlots(e && e.slots && e.slots.length ? e.slots : defaultSlots($("of-signup-kind").value));
    toggleSignupSetup();
    $("of-delete").hidden = !e;
    fillSignups(e);
    msg("of-form-msg", "");
    if ($("of-editor").showModal) $("of-editor").showModal(); else $("of-editor").setAttribute("open", "");
    $("of-title").focus();
  }
  function closeEditor() { if ($("of-editor").open) $("of-editor").close(); }
  $("of-editor").addEventListener("close", function () {
    editing = null;
    var target = opener && document.body.contains(opener) ? opener : opener && document.querySelector('[data-edit="' + opener.getAttribute("data-edit") + '"]');
    (target || $("of-add")).focus();
  });
  $("of-add").addEventListener("click", function () { openEditor(null, this); });
  $("of-close").addEventListener("click", closeEditor);
  $("of-close-x").addEventListener("click", closeEditor);
  $("of-signup").addEventListener("change", toggleSignupSetup);
  // postponed and cancelled can't both be on
  $("of-postponed").addEventListener("change", function () { if (this.checked) $("of-cancelled").checked = false; });
  $("of-cancelled").addEventListener("change", function () { if (this.checked) $("of-postponed").checked = false; });
  $("of-slot-add").addEventListener("click", function () {
    $("of-slots").insertAdjacentHTML("beforeend", slotRow("", null, slotCounter++));
    var inputs = document.querySelectorAll("[data-slot-label]");
    inputs[inputs.length - 1].focus();
  });
  $("of-slot-default").addEventListener("click", function () { setSlots(defaultSlots($("of-signup-kind").value)); });
  // switching the kind swaps in its usual choices, unless the officer already changed them
  function switchKind(kind) {
    var current = readSlots();
    var swap = !current.length || sameLabels(current, KIND_SETUP[shownKind].slots);
    shownKind = kind;
    setSlots(swap ? defaultSlots(kind) : current);
    showKind(kind);
  }
  $("of-signup-kind").addEventListener("change", function () { kindTouched = true; switchKind(this.value); });
  // a new event's sign-up follows its type until the officer picks one: trips (campus
  // tours, conferences) get "Who's going", everything else "Bring food"
  $("of-kind").addEventListener("change", function () {
    if (editing || kindTouched) return;
    var kind = kindFor(this.value);
    if (kind === $("of-signup-kind").value) return;
    $("of-signup-kind").value = kind;
    switchKind(kind);
  });
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
      start_time: $("of-start").value, end_time: $("of-end").value, title: $("of-title").value.trim(), theme: $("of-theme").value.trim(),
      kind: $("of-kind").value, location: $("of-location").value.trim(), details: $("of-details").value.trim(),
      tentative: $("of-tentative").checked, status: $("of-cancelled").checked ? "cancelled" : $("of-postponed").checked ? "postponed" : "scheduled",
      signup_enabled: $("of-signup").checked, signup_open: $("of-signup-open").checked, signup_kind: $("of-signup-kind").value,
      signup_note: $("of-signup-note").value.trim(), slots: $("of-signup-kind").value === "food" ? [] : readSlots()
    };
    if (!p.starts_on) { msg("of-form-msg", "Choose a date.", "error"); $("of-date").focus(); return; }
    if (!p.title) { msg("of-form-msg", "Give the event a title.", "error"); $("of-title").focus(); return; }
    if (p.ends_on && p.ends_on < p.starts_on) { msg("of-form-msg", "The last day must be on or after the first day.", "error"); $("of-end-date").focus(); return; }
    if (p.signup_enabled && p.signup_kind !== "food" && !p.slots.length) { msg("of-form-msg", "Add at least one choice for people to sign up for, or turn sign-up off.", "error"); $("of-slot-add").focus(); return; }
    if (editing && editing.signup_enabled && p.signup_kind !== "food" && (editing.signups || []).length) {
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
        opener = document.querySelector('[data-edit="' + id + '"]') || opener;
        closeEditor();
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
      opener = null;
      closeEditor();
      load().then(function () { msg("of-list-msg", "Deleted: " + title + ".", "ok"); });
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
      touch(true);
      $("of-newcode").value = "";
      msg("of-newcode-msg", "Officer code changed. Share the new code with the other officers.", "ok");
    });
  });

  // ------------------------------------------------------------ start
  if (!C.live()) {
    status("Officer tools work once the club database is switched on.", true);
    return;
  }
  if (C.isLocal()) status("Local test database (tools/msclub/local-api.mjs).");
  $("of-signin").hidden = false;
  var saved = null;
  try { saved = sessionStorage.getItem(KEY); } catch (e) { /* ignore */ }
  // reopened or reloaded after more than 15 minutes away: locked
  if (saved && idle()) { saved = null; lock(IDLE_TEXT); }
  if (saved) unlock(saved, true);
})();
