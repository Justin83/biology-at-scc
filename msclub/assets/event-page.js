/* An event's info page (msclub/events/<page>/). The page names its event in
   <body data-event-page="...">, matched against the event's "page" in the schedule (see
   sql/006_club_event_pages.sql), so it survives officers changing the title or date.
   The date, time, place, sign-up count and buttons come from the live schedule; the sign-up
   buttons open the same sign-up form as the home page, in a pop-up.
   <body data-end-approx="true"> words the time as "8:00 AM to about 2:00 PM". */
(function () {
  "use strict";
  var C = window.Club;
  if (!C) return;
  var $ = function (id) { return document.getElementById(id); };
  var all = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };
  var root = document.body.getAttribute("data-club-root") || "../../";
  var slug = document.body.getAttribute("data-event-page");
  var approx = document.body.getAttribute("data-end-approx") === "true";
  var canModal = typeof HTMLDialogElement === "function" && !!document.createElement("dialog").showModal;
  var data = null, ev = null, form = null, opener = null;

  function find(d) { return d.events.filter(function (e) { return e.page === slug; })[0] || null; }
  function canSignUp(e) { return !!(data && data.live && e && e.signup_enabled && e.status === "scheduled" && !C.isPast(e, data.today)); }
  function whenText(e) {
    var t = !e.start_time ? "All day" : C.clock(e.start_time) + (e.end_time ? (approx ? " to about " : " – ") + C.clock(e.end_time) : "");
    return C.dateLabel(e, true) + " · " + t + (e.location ? " · " + e.location : "");
  }
  // why sign-up is closed, or "" when it's open
  function closedText(e) {
    if (!e) return "This event isn't on the club schedule right now.";
    if (e.status === "cancelled") return "This event has been cancelled.";
    if (e.status === "postponed") return "This event has been postponed. Sign-up will open again when there's a new date.";
    if (C.isPast(e, data.today)) return "This event has already happened. Thanks to everyone who helped!";
    if (!data.live) return "Sign-up isn't available right now. Try again in a few minutes.";
    if (!e.signup_enabled) return "Sign-up for this event isn't open yet.";
    return "";
  }

  function render() {
    var open = canSignUp(ev), why = open ? "" : closedText(ev);
    if (ev) $("ev-when").textContent = whenText(ev);
    all("[data-ev-signup]").forEach(function (a) {
      a.hidden = !open;
      if (ev) {
        a.textContent = C.signupSpec(ev).button;
        a.href = root + "signup/?event=" + encodeURIComponent(ev.id); // without pop-ups: the sign-up page, with this event chosen
      }
    });
    all("[data-ev-count]").forEach(function (p) { p.textContent = open ? C.signupCount(ev, true) : ""; p.hidden = !open; });
    all("[data-ev-closed]").forEach(function (p) { p.textContent = why; p.hidden = !why; });
  }

  // ---------------------------------------------------------------- sign-up pop-up
  // Fetch the latest schedule first, so the form shows sign-ups made since the page loaded.
  function openSignup(from) {
    opener = from || null;
    if (from) from.setAttribute("aria-busy", "true");
    C.load(root).then(function (d) { if (d.live) { data = d; ev = find(d) || ev; render(); } }, function () { /* keep what we have */ }).then(function () {
      if (from) from.removeAttribute("aria-busy");
      if (!canSignUp(ev)) return; // render() has said why
      if (!form) form = C.signupForm($("club-signup-body"), { idPrefix: "m", headingLevel: 3, onEventPage: true, onChange: function (d) { data = d; ev = find(d) || ev; render(); } });
      form.show(data, ev);
      $("club-modal-title").textContent = C.signupSpec(ev).button;
      $("club-signup-dialog").showModal();
      form.focusFirst();
    });
  }
  document.addEventListener("click", function (x) {
    var a = x.target.closest("[data-ev-signup]");
    if (a && canModal && canSignUp(ev)) { x.preventDefault(); openSignup(a); }
    var c = x.target.closest("[data-close]");
    if (c) c.closest("dialog").close();
  });
  $("club-signup-dialog").addEventListener("close", function () { if (opener && document.body.contains(opener)) opener.focus(); });

  // ---------------------------------------------------------------- start
  C.load(root).then(function (d) {
    data = d; ev = find(d);
    render();
    if (C.isLocal()) $("ev-status").innerHTML = '<div class="club-banner"><p>Local test database (tools/msclub/local-api.mjs).</p></div>';
  }, function () {
    data = { live: false, today: C.todayISO(), events: [] };
    render();
  });
})();
