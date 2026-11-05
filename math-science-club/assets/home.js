/* Club home page: next meeting card and the schedule, grouped by month. */
(function () {
  "use strict";
  var C = window.Club;
  if (!C) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = C.esc;
  var root = document.body.getAttribute("data-club-root") || "./";

  function signupSummary(e) {
    if (!e.signup_enabled) return "";
    var n = (e.signups || []).length;
    var url = root + "signup/?event=" + encodeURIComponent(e.id);
    return '<p class="club-event-more"><a href="' + url + '">Food sign-up' + (e.signups ? " — " + (n === 0 ? "nobody signed up yet" : n === 1 ? "1 person signed up" : n + " people signed up") : "") + '<span class="visually-hidden"> for ' + esc(e.title) + "</span></a></p>";
  }
  function chips(e) {
    return '<span class="club-chip' + (e.kind === "meeting" ? " club-chip--meeting" : "") + '">' + esc(C.KINDS[e.kind] || "Event") + "</span>" +
      (e.tentative ? ' <span class="club-chip club-chip--tentative">Tentative</span>' : "") +
      (e.status === "cancelled" ? ' <span class="club-chip club-chip--cancelled">Cancelled</span>' : "");
  }
  function item(e, nextId) {
    var p = C.parts(e.starts_on);
    return '<li class="club-event' + (e.id === nextId ? " is-next" : "") + (e.status === "cancelled" ? " is-cancelled" : "") + '">' +
      '<div class="club-date" aria-hidden="true"><span class="dow">' + C.DOW[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()].slice(0, 3) + '</span><span class="day">' + p.d +
      '</span><span class="mon">' + C.MON[p.m - 1].slice(0, 3) + "</span></div>" +
      '<div><p class="club-event-title">' + esc(e.title) + " " + chips(e) + "</p>" +
      '<p class="club-event-meta">' + esc(C.dateLabel(e)) + " · " + esc(C.timeLabel(e)) + (e.location ? " · " + esc(e.location) : "") + "</p>" +
      (e.details ? '<p class="club-event-more">' + esc(e.details) + "</p>" : "") + signupSummary(e) + "</div></li>";
  }
  function agenda(list, nextId) {
    var out = "", month = null;
    list.forEach(function (e) {
      var k = C.monthKey(e.starts_on);
      if (k !== month) {
        if (month) out += "</ol>";
        out += '<h3 class="club-month">' + esc(C.monthLabel(k)) + '</h3><ol class="club-events">';
        month = k;
      }
      out += item(e, nextId);
    });
    return out + (month ? "</ol>" : "");
  }
  function nextCard(data) {
    var e = C.nextGathering(data);
    if (!e) {
      $("club-next-body").innerHTML = '<p class="club-next-date">No meeting on the schedule yet</p><p class="club-next-meta">Meetings are usually ' + esc(C.config.meetingRule) + ". Check back soon.</p>";
      return null;
    }
    var p = C.parts(e.starts_on), third = C.thirdThursday(p.y, p.m);
    var check = e.kind !== "meeting" ? ""
      : e.starts_on === third ? '<span class="club-check"><span aria-hidden="true">✓</span> Third Thursday of ' + esc(C.MON[p.m - 1]) + "</span>"
      : '<span class="club-check club-check--warn">Not the usual third Thursday (' + esc(C.shortDate(third)) + ")</span>";
    var n = (e.signups || []).length;
    $("next-title").textContent = e.kind === "meeting" ? "Next meeting" : "Next get-together";
    $("club-next-body").innerHTML =
      '<p class="club-next-date">' + esc(C.dateLabel(e, true)) + "</p>" +
      '<p class="club-next-meta">' + esc(C.timeLabel(e)) + " · " + esc(e.title) + (e.location ? " · " + esc(e.location) : "") +
      (C.relDays(data.today, e.starts_on) ? " · " + esc(C.relDays(data.today, e.starts_on)) : "") + "</p>" + check +
      (e.signup_enabled
        ? '<p class="club-actions"><a class="club-btn" href="' + root + "signup/?event=" + encodeURIComponent(e.id) + '">Sign up to bring food</a>' +
          (data.live ? '<span class="club-event-meta" style="align-self:center">' + (n === 0 ? "Nobody has signed up yet." : n === 1 ? "1 person has signed up." : n + " people have signed up.") + "</span>" : "") + "</p>"
        : "");
    return e.id;
  }

  C.load(root).then(function (data) {
    var nextId = nextCard(data);
    var up = C.upcoming(data), past = data.events.filter(function (e) { return C.isPast(e, data.today); });
    $("club-upcoming").innerHTML = up.length ? agenda(up, nextId) : "<p>No upcoming events are on the schedule yet.</p>";
    if (past.length) {
      $("club-past-wrap").hidden = false;
      $("club-past-count").textContent = past.length;
      $("club-past").innerHTML = agenda(past, null);
    }
    if (!data.live && C.config.enabled) {
      $("club-status").innerHTML = '<div class="club-banner club-banner--warn"><p>The live schedule could not be loaded, so this is the printed Fall 2026 schedule. Food sign-up needs a connection — try again shortly.</p></div>';
    } else if (C.isLocal()) {
      $("club-status").innerHTML = '<div class="club-banner"><p>Local test database (tools/math-science-club/local-api.mjs).</p></div>';
    }
  }, function () {
    $("club-upcoming").innerHTML = "<p>The schedule could not be loaded. Reload the page to try again.</p>";
  });
})();
