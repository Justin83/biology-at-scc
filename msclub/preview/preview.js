/* Layout preview (Option A of the club-site proposal): a short front page, a Schedule page
   with Cards and List views, and a page for every event. Read-only: it shows the live
   schedule, sign-ups and flyers through the same public functions as the live site, and
   its sign-up buttons open the live sign-up form. Not counted by the visit counter
   (club.js skips /msclub/preview/). Page text an officer would write comes from
   preview/data/pages.json; entries marked sample are placeholders. */
(function () {
  "use strict";
  var C = window.Club;
  var $ = function (id) { return document.getElementById(id); };
  var esc = C.esc;
  var body = document.body;
  var page = body.getAttribute("data-preview");          // home | schedule | event
  var root = body.getAttribute("data-club-root");        // the live club site (msclub/)
  var proot = body.getAttribute("data-preview-root");    // this preview (msclub/preview/)
  var data = null, texts = {}, flyers = [];
  var VIEW_KEY = "club-preview-view";

  // ------------------------------------------------------------ helpers
  function key(e) { return e.starts_on + "|" + e.title; }
  function text(e) { return texts[key(e)] || null; }
  function eventUrl(e) { return proot + "event/?id=" + encodeURIComponent(e.id); }
  // open for sign-up: the event takes sign-ups and officers haven't closed sign-up site-wide
  function takesSignUps(e) { return data.live && e.signup_enabled && e.status === "scheduled" && !C.isPast(e, data.today); }
  function canSignUp(e) { return takesSignUps(e) && data.signups_open; }
  function closedNote(e) { return takesSignUps(e) && !data.signups_open ? '<span class="club-hint">Sign-up is closed right now.</span>' : ""; }
  function signupButton(e, cls) {
    // the live sign-up form for this event (the preview itself never writes anything)
    return '<a class="club-btn' + (cls ? " " + cls : "") + '" href="' + esc(root + "signup/?event=" + encodeURIComponent(e.id)) + '">' + esc(C.signupSpec(e).button) + "</a>";
  }
  function chips(e) {
    var t = text(e);
    return '<span class="club-chip' + (e.kind === "meeting" ? " club-chip--meeting" : "") + '">' + esc(C.KINDS[e.kind] || "Event") + "</span>" +
      (canSignUp(e) ? ' <span class="club-chip pv-chip-open">Sign-up open</span>' : "") +
      (e.tentative ? ' <span class="club-chip club-chip--tentative">Tentative</span>' : "") +
      (e.status === "postponed" ? ' <span class="club-chip club-chip--postponed">Postponed</span>' : "") +
      (e.status === "cancelled" ? ' <span class="club-chip club-chip--cancelled">Cancelled</span>' : "") +
      (C.isPast(e, data.today) && t && t.recap ? ' <span class="club-chip pv-chip-recap">Recap</span>' : "");
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
    return s ? '<p class="pv-summary">' + esc(s) + (t.sample ? ' <span class="pv-sample">sample</span>' : "") + "</p>" : "";
  }
  function themeLine(e) { var th = C.themeText(e); return th ? '<p class="club-theme">Food theme: <strong>' + esc(th) + "</strong></p>" : ""; }
  function flyerFor(e) { return flyers.filter(function (f) { return f.event_date === e.starts_on && !f.archived; })[0] || null; }
  function flyerBox(f) {
    return '<a class="club-flyer pv-flyer" href="' + esc(root + "flyers/" + f.pdf) + '" target="_blank" rel="noopener">' +
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
    return '<article class="pv-row' + (e.status === "cancelled" ? " is-cancelled" : "") + '">' + dateBlock(e) +
      '<div class="pv-row-main"><h4 class="pv-row-title"><a href="' + esc(eventUrl(e)) + '">' + esc(e.title) + "</a></h4>" +
      '<p class="club-card-chips">' + chips(e) + "</p>" +
      '<p class="club-card-meta">' + esc(meta(e)) + "</p>" + themeLine(e) + summary(e) + "</div>" +
      '<div class="pv-row-act">' + (canSignUp(e) ? signupButton(e, "club-btn--small") + '<span class="club-hint">' + esc(C.signupCount(e, true)) + "</span>"
        : closedNote(e) + '<a class="club-btn club-btn--ghost club-btn--small" href="' + esc(eventUrl(e)) + '">' + (C.isPast(e, data.today) && text(e) && text(e).recap ? "Read the recap" : "Details") + "</a>") +
      "</div></article>";
  }

  // ------------------------------------------------------------ home
  function renderHome() {
    var next = C.nextGathering(data), up = C.upcoming(data);
    var box = $("pv-next");
    if (next) {
      var f = flyerFor(next), bring = next.signup_enabled && (next.signups || []).length;
      $("pv-next-label").textContent = next.kind === "meeting" ? "Next meeting" : "Up next";
      box.classList.toggle("has-flyer", !!f);
      box.innerHTML = '<div class="pv-next-info">' +
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
    $("pv-coming").innerHTML = shown.length ? '<div class="club-cards">' + shown.map(card).join("") + "</div>" : "<p>Nothing else is on the schedule yet.</p>";
    $("pv-more").innerHTML = '<a href="' + esc(proot + "schedule/") + '">See the full schedule' +
      (more > 0 ? ": " + more + " more coming up" : "") + (past.length ? (more > 0 ? ", " : ": ") + past.length + " earlier this semester" : "") + " →</a>";
    // recaps: the two newest past events that have one
    var recaps = past.filter(function (e) { var t = text(e); return t && t.recap; }).reverse().slice(0, 2);
    $("pv-news-wrap").hidden = !recaps.length;
    $("pv-news").innerHTML = recaps.map(function (e) {
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
    $("pv-upcoming").innerHTML = up.length ? byMonth(up, cards ? card : row, cards ? "club-cards" : "pv-rows") : "<p>No upcoming events match.</p>";
    $("pv-past-count").textContent = past.length;
    $("pv-past-wrap").hidden = !past.length;
    $("pv-past").innerHTML = byMonth(past, cards ? card : row, cards ? "club-cards" : "pv-rows");
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
  // New York's offset from UTC (minutes) at an instant, e.g. -300 in winter, -240 in summer
  function nyOffset(ms) {
    var g = {};
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(ms)).forEach(function (p) { g[p.type] = p.value; });
    return (Date.UTC(+g.year, +g.month - 1, +g.day, +g.hour % 24, +g.minute, +g.second) - ms) / 60000;
  }
  // a Somerset wall-clock date and time ("2026-11-19", "17:00") as an iCalendar UTC time
  function nyToUtc(date, time) {
    var p = C.parts(date), hm = time.split(":");
    var wall = Date.UTC(p.y, p.m - 1, p.d, +hm[0], +hm[1]);
    var utc = wall - nyOffset(wall) * 60000;
    utc = wall - nyOffset(utc) * 60000; // settle the offset on the event's own side of a DST change
    return new Date(utc).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  }
  function ics(e) {
    var d = e.starts_on.replace(/-/g, "");
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Math & Science Club//SCC//EN", "BEGIN:VEVENT",
      "UID:" + e.id + "@biologyatscc.com", "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")];
    if (e.start_time) {
      lines.push("DTSTART:" + nyToUtc(e.starts_on, e.start_time));
      if (e.end_time) lines.push("DTEND:" + nyToUtc(e.ends_on || e.starts_on, e.end_time));
    } else {
      var p = C.parts(e.ends_on || e.starts_on), next = new Date(Date.UTC(p.y, p.m - 1, p.d + 1)).toISOString().slice(0, 10).replace(/-/g, "");
      lines.push("DTSTART;VALUE=DATE:" + d, "DTEND;VALUE=DATE:" + next);
    }
    var clean = function (s) { return String(s).replace(/[\\,;]/g, function (c) { return "\\" + c; }).replace(/\n/g, "\\n"); };
    lines.push("SUMMARY:" + clean(e.title));
    if (e.location) lines.push("LOCATION:" + clean(e.location));
    lines.push("URL:https://biologyatscc.com/msclub/", "END:VEVENT", "END:VCALENDAR");
    return lines.join("\r\n") + "\r\n";
  }
  function renderEvent() {
    var id = new URLSearchParams(location.search).get("id");
    var e = data.events.filter(function (x) { return x.id === id; })[0];
    if (!e) {
      $("ev-title").textContent = "Event not found";
      $("pv-event").innerHTML = '<p>This event isn\'t on the schedule. <a href="' + esc(proot + "schedule/") + '">See the full schedule</a>.</p>';
      return;
    }
    document.title = e.title + " · Math & Science Club (preview)";
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
    if (paras && paras.length) {
      html += (t.sample ? '<p class="pv-sample-note">Sample text: officers would write this part in Officer tools.</p>' : "") +
        paras.map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("");
    } else if (past) {
      html += '<p class="club-hint">This event has happened. Officers can add a recap here afterwards.</p>';
    }
    if (e.details) html += "<p>" + esc(e.details) + "</p>";
    if (t && t.full_page) html += '<p><a href="' + esc(root + t.full_page) + '">Read the full STEAM Day page →</a></p>';
    if (e.signup_enabled && (e.signups || []).length) {
      html += '<section class="club-bring-panel pv-bring" aria-labelledby="pv-bring-title"><h2 id="pv-bring-title">' + esc(C.signupSpec(e).list) + "</h2>" +
        '<div class="club-bring">' + C.bringList(e, "h3") + "</div></section>";
    }
    if (f) html += '<div class="pv-event-flyer">' + flyerBox(f) + "</div>";
    html += '<p class="club-actions">' + (!past ? '<a class="club-btn club-btn--ghost" id="pv-ics" href="#">Add to my calendar</a>' : "") +
      '<a class="club-btn club-btn--ghost" href="' + esc(proot + "schedule/") + '">← Full schedule</a></p>';
    $("pv-event").innerHTML = html;
    var a = $("pv-ics");
    if (a) {
      a.href = URL.createObjectURL(new Blob([ics(e)], { type: "text/calendar" }));
      a.download = e.title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") + ".ics";
    }
  }

  window.ClubPreview = { ics: ics }; // for the browser test

  // ------------------------------------------------------------ start
  function fail() {
    var el = $("pv-status");
    if (el) el.innerHTML = '<div class="club-banner club-banner--warn"><p>The live schedule couldn\'t be loaded, so the preview shows the printed schedule. Reload to try again.</p></div>';
  }
  Promise.all([
    C.load(root),
    fetch(proot + "data/pages.json").then(function (r) { return r.ok ? r.json() : { pages: {} }; }, function () { return { pages: {} }; }),
    C.loadFlyers(root)
  ]).then(function (res) {
    data = res[0]; texts = res[1].pages || {}; flyers = res[2] || [];
    if (!data.live) fail();
    if (C.isLocal()) $("pv-status").innerHTML = '<div class="club-banner"><p>Local test database (tools/msclub/local-api.mjs).</p></div>';
    if (page === "home") renderHome();
    if (page === "schedule") { wireSchedule(); renderSchedule(); }
    if (page === "event") renderEvent();
  });
})();
