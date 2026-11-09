/* Club home page: next meeting, event cards by month, the sign-up pop-up and the
   big-screen QR code. */
(function () {
  "use strict";
  var C = window.Club;
  if (!C) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = C.esc;
  var root = document.body.getAttribute("data-club-root") || "./";
  var data = null, form = null, opener = null;
  var canModal = typeof HTMLDialogElement === "function" && !!document.createElement("dialog").showModal;

  // ---------------------------------------------------------------- pieces
  function canSignUp(e) { return data.live && e.signup_enabled && e.status === "scheduled" && !C.isPast(e, data.today); }
  function countText(e) { return C.signupCount(e, true); }
  function signupButton(e, big) {
    if (!canSignUp(e)) return "";
    return '<a class="club-btn' + (big ? " club-btn--big" : "") + '" href="' + root + "signup/?event=" + encodeURIComponent(e.id) + '" data-signup="' + esc(e.id) + '">' +
      esc(C.signupSpec(e).button) + (big ? "" : '<span class="visually-hidden"> for ' + esc(e.title + ", " + C.shortDate(e.starts_on)) + "</span>") + "</a>";
  }
  function chips(e) {
    return '<span class="club-chip' + (e.kind === "meeting" ? " club-chip--meeting" : "") + '">' + esc(C.KINDS[e.kind] || "Event") + "</span>" +
      (e.tentative ? ' <span class="club-chip club-chip--tentative">Tentative</span>' : "") +
      (e.status === "postponed" ? ' <span class="club-chip club-chip--postponed">Postponed</span>' : "") +
      (e.status === "cancelled" ? ' <span class="club-chip club-chip--cancelled">Cancelled</span>' : "");
  }
  function card(e, nextId) {
    var p = C.parts(e.starts_on), theme = C.themeText(e);
    return '<article class="club-card' + (e.id === nextId ? " is-next" : "") + (e.status === "cancelled" ? " is-cancelled" : "") + '">' +
      '<div class="club-card-top"><div class="club-date" aria-hidden="true"><span class="dow">' + C.DOW[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()].slice(0, 3) +
      '</span><span class="day">' + p.d + '</span><span class="mon">' + C.MON[p.m - 1].slice(0, 3) + "</span></div>" +
      '<div><h4 class="club-card-title">' + esc(e.title) + '</h4><p class="club-card-chips">' + chips(e) + "</p></div></div>" +
      '<p class="club-card-meta">' + esc(C.dateLabel(e)) + " · " + esc(C.timeLabel(e)) + (e.location ? " · " + esc(e.location) : "") + "</p>" +
      (theme ? '<p class="club-theme">Food theme: <strong>' + esc(theme) + "</strong></p>" : "") +
      (e.details ? '<p class="club-card-details">' + esc(e.details) + "</p>" : "") +
      (canSignUp(e) ? '<div class="club-card-actions">' + signupButton(e) + '<span class="club-hint">' + esc(countText(e)) + "</span></div>" : "") +
      "</article>";
  }
  function cards(list, nextId) {
    var out = "", month = null;
    list.forEach(function (e) {
      var k = C.monthKey(e.starts_on);
      if (k !== month) {
        if (month) out += "</div>";
        out += '<h3 class="club-month">' + esc(C.monthLabel(k)) + '</h3><div class="club-cards">';
        month = k;
      }
      out += card(e, nextId);
    });
    return out + (month ? "</div>" : "");
  }
  function nextCard() {
    var e = C.nextGathering(data);
    if (!e) {
      $("club-next-body").innerHTML = '<p class="club-next-date">No meeting on the schedule yet</p><p class="club-next-meta">Check back soon.</p>';
      return null;
    }
    var theme = C.themeText(e);
    // who's bringing what, right on the card (beside the details on a wide screen,
    // between the details and the button on a phone)
    var bring = data.live && e.signup_enabled && e.status === "scheduled";
    $("next-title").textContent = e.kind === "meeting" ? "Next meeting" : "Next get-together";
    $("club-next-body").classList.toggle("has-bring", bring);
    $("club-next-body").innerHTML =
      '<div class="club-next-info"><p class="club-next-date">' + esc(C.dateLabel(e, true)) + "</p>" +
      '<p class="club-next-meta">' + esc(C.timeLabel(e)) + " · " + esc(e.title) + (e.location ? " · " + esc(e.location) : "") +
      (C.relDays(data.today, e.starts_on) ? " · " + esc(C.relDays(data.today, e.starts_on)) : "") + "</p>" +
      (theme ? '<p class="club-theme club-theme--big">Food theme: <strong>' + esc(theme) + "</strong></p>" : "") + "</div>" +
      (bring ? '<section class="club-next-bring club-bring-panel" aria-labelledby="next-bring-title"><h3 id="next-bring-title">' + esc(C.signupSpec(e).list) + "</h3>" +
        '<div class="club-bring">' + C.bringList(e, "h4") + "</div></section>" : "") +
      (canSignUp(e) ? '<p class="club-actions club-next-actions">' + signupButton(e, true) + '<span class="club-hint" style="align-self:center">' + esc(countText(e)) + "</span></p>" : "");
    return e;
  }
  function renderAll() {
    var next = nextCard(), nextId = next && next.id;
    var up = C.upcoming(data), past = data.events.filter(function (e) { return C.isPast(e, data.today); });
    $("club-upcoming").innerHTML = up.length ? cards(up, nextId) : "<p>No upcoming events are on the schedule yet.</p>";
    if (past.length) {
      $("club-past-wrap").hidden = false;
      $("club-past-count").textContent = past.length;
      $("club-past").innerHTML = cards(past, null);
    }
    $("club-bigqr-event").textContent = next ? "Next meeting: " + C.dateLabel(next) + " · " + C.timeLabel(next) + (next.theme ? " · Food theme: " + next.theme : "") : "";
  }

  // ---------------------------------------------------------------- sign-up pop-up
  // Fetch the latest schedule first, so the pop-up shows sign-ups other people made
  // after this page loaded (and any change an officer made to the event).
  function openSignup(id, from) {
    opener = from || null;
    if (from) from.setAttribute("aria-busy", "true");
    C.load(root).then(function (d) { if (d.live) { data = d; renderAll(); } }, function () { /* keep what we have */ }).then(function () {
      if (from) from.removeAttribute("aria-busy");
      var e = data.events.filter(function (x) { return x.id === id; })[0];
      if (!e || !canSignUp(e)) {
        $("club-status").innerHTML = '<div class="club-banner club-banner--warn"><p>Sign-up for that event isn\'t open anymore.</p></div>';
        return;
      }
      if (!form) form = C.signupForm($("club-signup-body"), { idPrefix: "m", headingLevel: 3, onChange: function (d) { data = d; renderAll(); } });
      form.show(data, e);
      $("club-modal-title").textContent = C.signupSpec(e).button;
      $("club-signup-dialog").showModal();
      form.focusFirst();
    });
  }
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest("[data-signup]");
    if (a && canModal && data && data.live) { ev.preventDefault(); openSignup(a.getAttribute("data-signup"), a); }
    var c = ev.target.closest("[data-close]");
    if (c) c.closest("dialog").close();
  });
  $("club-signup-dialog").addEventListener("close", function () {
    // focus the same button after the cards re-rendered
    var id = opener && opener.getAttribute("data-signup");
    var target = opener && document.body.contains(opener) ? opener : id && document.querySelector('[data-signup="' + id + '"]');
    if (target) target.focus();
  });

  // ---------------------------------------------------------------- big-screen QR
  $("club-bigqr-open").addEventListener("click", function () {
    if (!canModal) { location.href = root + "qr/"; return; }
    $("club-bigqr").showModal();
  });
  $("club-bigqr").addEventListener("close", function () { $("club-bigqr-open").focus(); });

  // ---------------------------------------------------------------- flyers
  // In the QR panel, which is shown on computers only: each event flyer until its date
  // passes. The picture and name open the PDF in the browser to view or print.
  function showFlyers(today) {
    C.loadFlyers(root).then(function (list) {
      var now = list.filter(function (f) { return C.flyerOnHome(f, today); })
        .sort(function (a, b) { return a.event_date < b.event_date ? -1 : a.event_date > b.event_date ? 1 : 0; });
      var box = $("club-flyers");
      box.innerHTML = now.length ? "<h3>" + (now.length > 1 ? "Flyers" : "Flyer") + "</h3>" + now.map(function (f) {
        return '<a class="club-flyer" href="' + esc(root + "flyers/" + f.pdf) + '" target="_blank" rel="noopener">' +
          '<img src="' + esc(root + "flyers/" + f.preview) + '" width="612" height="792" alt="" loading="lazy">' +
          '<span class="club-flyer-name">' + esc(f.title) + "</span>" +
          '<span class="club-flyer-hint">View or print (PDF)<span class="visually-hidden">, opens in a new tab</span></span></a>';
      }).join("") : "";
      box.hidden = !now.length;
      box.setAttribute("data-shown", String(now.length));
    });
  }

  // ---------------------------------------------------------------- start
  C.load(root).then(function (d) {
    data = d;
    renderAll();
    showFlyers(d.today);
    if (!data.live && C.config.enabled) {
      $("club-status").innerHTML = '<div class="club-banner club-banner--warn"><p>We couldn\'t load the live schedule, so this is the printed Fall 2026 schedule. Food sign-up needs a connection. Try again in a few minutes.</p></div>';
    } else if (C.isLocal()) {
      $("club-status").innerHTML = '<div class="club-banner"><p>Local test database (tools/msclub/local-api.mjs).</p></div>';
    }
  }, function () {
    $("club-upcoming").innerHTML = "<p>The schedule could not be loaded. Reload the page to try again.</p>";
    showFlyers(C.todayISO());
  });
})();
