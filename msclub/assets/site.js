/* The club site's pages (adopted from the layout preview, November 2026):
     home      (index.html)         Up next (the next meeting, once, with its flyer), the
                                    next three events as cards, the full-schedule link,
                                    and recaps of past events when there are any;
     schedule  (schedule/)          every event, as a List by date or as Cards (remembered
                                    per browser), with filters, and earlier events;
     event     (event/?id=<id>)     one event: details, sign-up button, who's signed up,
                                    its flyer, and a recap afterwards;
     signup    (signup/?event=<id>) the sign-up form for one event (signup-form.js); with
                                    no event named, the events taking sign-ups.
   Which one is chosen by <body data-page>. An event's own text (a line for the cards, a
   few paragraphs for its page, a recap afterwards) comes from data/pages.json, keyed
   "<date>|<title>"; events without an entry just show their details. */
(function () {
  "use strict";
  var C = window.Club;
  var $ = function (id) { return document.getElementById(id); };
  var esc = C.esc;
  var body = document.body;
  var page = body.getAttribute("data-page");     // home | schedule | event | signup
  var root = body.getAttribute("data-club-root") || "./";  // msclub/
  var data = null, texts = {}, flyers = [];
  var VIEW_KEY = "club-schedule-view";

  // ------------------------------------------------------------ helpers
  function key(e) { return e.starts_on + "|" + e.title; }
  function text(e) { return texts[key(e)] || null; }
  // an event with its own info page (msclub/events/<page>/, e.g. STEAM Day) goes there, title
  // and sign-up button alike; every other event has a page at event/?id=<id>
  function eventUrl(e) { return C.pageUrl(root, e) || root + "event/?id=" + encodeURIComponent(e.id); }
  // open for sign-up: the event takes sign-ups and officers haven't closed sign-up site-wide
  function takesSignUps(e) { return data.live && e.signup_enabled && e.status === "scheduled" && !C.isPast(e, data.today); }
  function canSignUp(e) { return takesSignUps(e) && data.signups_open; }
  function closedNote(e) { return takesSignUps(e) && !data.signups_open ? '<span class="club-hint">Sign-up is closed right now.</span>' : ""; }
  function signupUrl(e) { return root + "signup/?event=" + encodeURIComponent(e.id); }
  function signupButton(e, cls) {
    return '<a class="club-btn' + (cls ? " " + cls : "") + '" href="' + esc(C.pageUrl(root, e) || signupUrl(e)) + '">' + esc(C.signupSpec(e).button) + "</a>";
  }
  function chips(e) {
    var t = text(e);
    return '<span class="club-chip' + (e.kind === "meeting" ? " club-chip--meeting" : "") + '">' + esc(C.KINDS[e.kind] || "Event") + "</span>" +
      (canSignUp(e) ? ' <span class="club-chip site-chip-open">Sign-up open</span>' : "") +
      (e.tentative ? ' <span class="club-chip club-chip--tentative">Tentative</span>' : "") +
      (e.status === "postponed" ? ' <span class="club-chip club-chip--postponed">Postponed</span>' : "") +
      (e.status === "cancelled" ? ' <span class="club-chip club-chip--cancelled">Cancelled</span>' : "") +
      (C.isPast(e, data.today) && t && t.recap ? ' <span class="club-chip site-chip-recap">Recap</span>' : "");
  }
  function dateBlock(e) {
    var p = C.parts(e.starts_on);
    return '<div class="club-date" aria-hidden="true"><span class="dow">' + C.DOW[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()].slice(0, 3) +
      '</span><span class="day">' + p.d + '</span><span class="mon">' + C.MON[p.m - 1].slice(0, 3) + "</span></div>";
  }
  function meta(e) { return C.dateLabel(e) + " · " + C.timeLabel(e) + (e.location ? " · " + e.location : ""); }
  function summary(e) {
    var t = text(e);
    if (!t) return "";
    var s = C.isPast(e, data.today) ? t.recap_summary : t.summary;
    return s ? '<p class="site-summary">' + esc(s) + "</p>" : "";
  }
  function themeLine(e) { var th = C.themeText(e); return th ? '<p class="club-theme">Food theme: <strong>' + esc(th) + "</strong></p>" : ""; }
  function flyerFor(e) { return flyers.filter(function (f) { return f.event_date === e.starts_on && !f.archived; })[0] || null; }
  function flyerBox(f) {
    return '<a class="club-flyer site-flyer" href="' + esc(root + "flyers/" + f.pdf) + '" target="_blank" rel="noopener">' +
      '<img src="' + esc(root + "flyers/" + f.preview) + '" width="612" height="792" alt="" loading="lazy">' +
      '<span class="club-flyer-name">' + esc(f.title) + "</span>" +
      '<span class="club-flyer-hint">View or print (PDF)<span class="visually-hidden">, opens in a new tab</span></span></a>';
  }
  function byMonth(list, render, wrapCls) {
    var out = "", month = null;
    list.forEach(function (e) {
      var k = C.monthKey(e.starts_on);
      if (k !== month) {
        if (month) out += "</div>";
        out += '<h3 class="club-month">' + esc(C.monthLabel(k)) + '</h3><div class="' + wrapCls + '">';
        month = k;
      }
      out += render(e);
    });
    return out + (month ? "</div>" : "");
  }

  // a card: same look as the live site; the title opens the event's page
  function card(e) {
    return '<article class="club-card' + (e.status === "cancelled" ? " is-cancelled" : "") + '">' +
      '<div class="club-card-top">' + dateBlock(e) +
      '<div><h4 class="club-card-title"><a href="' + esc(eventUrl(e)) + '">' + esc(e.title) + '</a></h4><p class="club-card-chips">' + chips(e) + "</p></div></div>" +
      '<p class="club-card-meta">' + esc(meta(e)) + "</p>" + themeLine(e) + summary(e) +
      (canSignUp(e) ? '<div class="club-card-actions">' + signupButton(e) + '<span class="club-hint">' + esc(C.signupCount(e, true)) + "</span></div>"
        : closedNote(e) ? '<div class="club-card-actions">' + closedNote(e) + "</div>" : "") +
      "</article>";
  }
  // a list row (the by-date view): date, title, one line from the event's page, button
  function row(e) {
    return '<article class="site-row' + (e.status === "cancelled" ? " is-cancelled" : "") + '">' + dateBlock(e) +
      '<div class="site-row-main"><h4 class="site-row-title"><a href="' + esc(eventUrl(e)) + '">' + esc(e.title) + "</a></h4>" +
      '<p class="club-card-chips">' + chips(e) + "</p>" +
      '<p class="club-card-meta">' + esc(meta(e)) + "</p>" + themeLine(e) + summary(e) + "</div>" +
      '<div class="site-row-act">' + (canSignUp(e) ? signupButton(e, "club-btn--small") + '<span class="club-hint">' + esc(C.signupCount(e, true)) + "</span>"
        : closedNote(e) + '<a class="club-btn club-btn--ghost club-btn--small" href="' + esc(eventUrl(e)) + '">' + (C.isPast(e, data.today) && text(e) && text(e).recap ? "Read the recap" : "Details") + "</a>") +
      "</div></article>";
  }

  // ------------------------------------------------------------ home
  function renderHome() {
    var next = C.nextGathering(data), up = C.upcoming(data);
    var box = $("site-next");
    if (next) {
      var f = flyerFor(next), bring = next.signup_enabled && (next.signups || []).length;
      $("site-next-label").textContent = next.kind === "meeting" ? "Next meeting" : "Up next";
      box.classList.toggle("has-flyer", !!f);
      box.innerHTML = '<div class="site-next-info">' +
        '<p class="club-next-date"><a href="' + esc(eventUrl(next)) + '">' + esc(C.dateLabel(next, true)) + "</a></p>" +
        '<p class="club-next-meta">' + esc(C.timeLabel(next)) + " · " + esc(next.title) + (next.location ? " · " + esc(next.location) : "") +
        (C.relDays(data.today, next.starts_on) ? " · " + esc(C.relDays(data.today, next.starts_on)) : "") + "</p>" +
        (C.themeText(next) ? '<p class="club-theme club-theme--big">Food theme: <strong>' + esc(C.themeText(next)) + "</strong></p>" : "") +
        (canSignUp(next) ? '<p class="club-actions">' + signupButton(next) + "</p>" : closedNote(next) ? "<p>" + closedNote(next) + "</p>" : "") +
        '<p class="club-hint">' + (next.signup_enabled ? esc(C.signupCount(next, true)) + " " : "") +
        '<a href="' + esc(eventUrl(next)) + '">' + (bring ? "See " + esc(C.signupSpec(next).list.toLowerCase()) : "Details") + " →</a></p></div>" +
        (f ? flyerBox(f) : "");
    } else {
      box.innerHTML = '<p class="club-next-date">No meeting on the schedule yet</p><p class="club-next-meta">Check back soon.</p>';
    }
    var rest = up.filter(function (e) { return !next || e.id !== next.id; });
    var shown = rest.slice(0, 3), more = rest.length - shown.length;
    var past = data.events.filter(function (e) { return C.isPast(e, data.today); });
    $("site-coming").innerHTML = shown.length ? '<div class="club-cards">' + shown.map(card).join("") + "</div>" : "<p>Nothing else is on the schedule yet.</p>";
    $("site-more").innerHTML = '<a href="' + esc(root + "schedule/") + '">See the full schedule' +
      (more > 0 ? ": " + more + " more coming up" : "") + (past.length ? (more > 0 ? ", " : ": ") + past.length + " earlier this semester" : "") + " →</a>";
    // recaps: the two newest past events that have one
    var recaps = past.filter(function (e) { var t = text(e); return t && t.recap; }).reverse().slice(0, 2);
    $("site-news-wrap").hidden = !recaps.length;
    $("site-news").innerHTML = recaps.map(function (e) {
      return '<article class="club-card"><p class="club-card-meta">Recap · ' + esc(C.dateLabel(e, true)) + "</p>" +
        '<h4 class="club-card-title"><a href="' + esc(eventUrl(e)) + '">' + esc(e.title) + "</a></h4>" + summary(e) + "</article>";
    }).join("");
  }

  // ------------------------------------------------------------ schedule
  var filter = "all", view = "list";
  try { view = localStorage.getItem(VIEW_KEY) === "cards" ? "cards" : "list"; } catch (e) { /* storage blocked */ }
  var FILTERS = {
    all: function () { return true; },
    signup: function (e) { return canSignUp(e); },
    meetings: function (e) { return e.kind === "meeting"; },
    other: function (e) { return e.kind !== "meeting"; }
  };
  function renderSchedule() {
    var up = C.upcoming(data).filter(FILTERS[filter]);
    var past = data.events.filter(function (e) { return C.isPast(e, data.today); }).filter(FILTERS[filter]).reverse();
    var cards = view === "cards";
    $("site-upcoming").innerHTML = up.length ? byMonth(up, cards ? card : row, cards ? "club-cards" : "site-rows") : "<p>No upcoming events match.</p>";
    $("site-past-count").textContent = past.length;
    $("site-past-wrap").hidden = !past.length;
    $("site-past").innerHTML = byMonth(past, cards ? card : row, cards ? "club-cards" : "site-rows");
    document.querySelectorAll("[data-view]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-view") === view)); });
    document.querySelectorAll("[data-filter]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-filter") === filter)); });
  }
  function wireSchedule() {
    document.querySelectorAll("[data-view]").forEach(function (b) {
      b.addEventListener("click", function () {
        view = b.getAttribute("data-view");
        try { localStorage.setItem(VIEW_KEY, view); } catch (e) { /* storage blocked */ }
        renderSchedule();
      });
    });
    document.querySelectorAll("[data-filter]").forEach(function (b) {
      b.addEventListener("click", function () { filter = b.getAttribute("data-filter"); renderSchedule(); });
    });
  }

  // ------------------------------------------------------------ event page
  function renderEvent() {
    var id = new URLSearchParams(location.search).get("id");
    var e = data.events.filter(function (x) { return x.id === id; })[0];
    if (!e) {
      $("ev-title").textContent = "Event not found";
      $("site-event").innerHTML = '<p>This event isn\'t on the schedule. <a href="' + esc(root + "schedule/") + '">See the full schedule</a>.</p>';
      return;
    }
    document.title = e.title + " · Math & Science Club · Biology at SCC";
    var past = C.isPast(e, data.today), t = text(e), f = flyerFor(e);
    $("ev-kicker").textContent = (C.KINDS[e.kind] || "Event") + (past ? (t && t.recap ? " · Recap" : " · Past event") : canSignUp(e) ? " · Sign-up open" : "");
    $("ev-title").textContent = e.title;
    var html = '<p class="club-event-when">' + esc(C.dateLabel(e, true)) + " · " + esc(C.timeLabel(e)) + (e.location ? " · " + esc(e.location) : "") + "</p>" +
      '<p class="club-card-chips">' + chips(e) + "</p>" + themeLine(e);
    if (e.status === "postponed") html += '<div class="club-banner club-banner--warn"><p>Postponed. A new date will be announced.</p></div>';
    if (e.status === "cancelled") html += '<div class="club-banner club-banner--warn"><p>Cancelled.</p></div>';
    if (!past && canSignUp(e)) html += '<div class="club-event-cta">' + signupButton(e) + '<p class="club-hint">' + esc(C.signupCount(e, true)) + "</p></div>";
    else if (closedNote(e)) html += '<p class="club-event-cta">' + closedNote(e) + "</p>";
    var paras = past ? (t && t.recap) : (t && t.body);
    if (paras && paras.length) html += paras.map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("");
    if (e.details) html += "<p>" + esc(e.details) + "</p>";
    if (t && t.full_page) html += '<p><a href="' + esc(root + t.full_page) + '">More about ' + esc(e.title) + " →</a></p>";
    if (e.signup_enabled && (e.signups || []).length) {
      html += '<section class="club-bring-panel site-bring" aria-labelledby="site-bring-title"><h2 id="site-bring-title">' + esc(C.signupSpec(e).list) + "</h2>" +
        '<div class="club-bring">' + C.bringList(e, "h3") + "</div></section>";
    }
    if (f) html += '<div class="site-event-flyer">' + flyerBox(f) + "</div>";
    html += '<p class="club-actions"><a class="club-btn club-btn--ghost" href="' + esc(root + "schedule/") + '">← Full schedule</a></p>';
    $("site-event").innerHTML = html;
  }

  // ------------------------------------------------------------ sign-up page
  // The form for one event (signup-form.js), with a link back to the event's page. With no
  // event named (or one that isn't taking sign-ups), the events that are, as list rows.
  function renderChoose(note) {
    var open = C.upcoming(data).filter(takesSignUps);
    $("site-signup-h1").className = "site-page-title";
    $("site-choose").innerHTML = (note ? '<div class="club-banner"><p>' + note + "</p></div>" : "") +
      (!open.length ? '<p>No event is taking sign-ups right now. <a href="' + esc(root + "schedule/") + '">See the schedule</a>.</p>'
        : (data.signups_open ? "" : "<p><strong>Sign-up is closed right now.</strong> Ask a club officer.</p>") +
          '<div class="site-rows">' + open.map(row).join("") + "</div>");
    $("site-choose").hidden = false;
  }
  function renderSignup() {
    if (!data.live) return; // the banner says why (see start)
    var id = new URLSearchParams(location.search).get("event");
    var e = id && data.events.filter(function (x) { return x.id === id; })[0];
    if (!e || !takesSignUps(e)) {
      renderChoose(id ? (e ? esc(e.title) + " isn't taking sign-ups." : "That event isn't on the schedule.") : "");
      return;
    }
    document.title = C.signupSpec(e).button + ": " + e.title + " · Math & Science Club · Biology at SCC";
    $("site-signup-back").innerHTML = '<a href="' + esc(eventUrl(e)) + '">← ' + esc(e.title) + " details</a>";
    var form = C.signupForm($("site-signup"), { idPrefix: "su", headingLevel: 2, onEventPage: true, onChange: function (d) { data = d; } });
    $("site-signup").hidden = false;
    form.show(data, e);
  }

  // ------------------------------------------------------------ start
  // an old link to the schedule on the home page (msclub/#schedule) goes to the schedule page
  if (page === "home" && location.hash === "#schedule") { location.replace(root + "schedule/"); return; }
  function status(html) { var el = $("site-status"); if (el) el.innerHTML = html; }
  Promise.all([
    C.load(root),
    fetch(root + "data/pages.json").then(function (r) { return r.ok ? r.json() : { pages: {} }; }, function () { return { pages: {} }; }),
    C.loadFlyers(root)
  ]).then(function (res) {
    data = res[0]; texts = res[1].pages || {}; flyers = res[2] || [];
    if (!data.live && C.config.enabled) {
      status('<div class="club-banner club-banner--warn"><p>' + (page === "signup"
        ? "<strong>Online sign-up isn't working right now.</strong> The club database couldn't be reached. Try again in a minute."
        : "We couldn't load the live schedule, so this is the printed Fall 2026 schedule. Sign-up needs a connection. Try again in a few minutes.") + "</p></div>");
    } else if (!data.live && page === "signup") {
      status('<div class="club-banner club-banner--warn"><p><strong>Online sign-up isn\'t working right now.</strong> It opens soon.</p></div>');
    } else if (C.isLocal()) {
      status('<div class="club-banner"><p>Local test database (tools/msclub/local-api.mjs).</p></div>');
    }
    if (page === "home") renderHome();
    if (page === "schedule") { wireSchedule(); renderSchedule(); }
    if (page === "event") renderEvent();
    if (page === "signup") renderSignup();
  }, function () {
    status('<div class="club-banner club-banner--warn"><p>The schedule could not be loaded. Reload the page to try again.</p></div>');
  });
})();
