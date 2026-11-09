/* Event sign-up page: clickable cards, club meetings (food) in one group and other events
   and trips in another. Nothing is preselected unless the link names one
   (?event=<id>, used by the buttons on the club page cards). Choosing a card opens the
   shared form in signup-form.js below the cards. */
(function () {
  "use strict";
  var C = window.Club;
  if (!C || !C.signupForm) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = C.esc;
  var root = document.body.getAttribute("data-club-root") || "../";
  var data = null, form = null;

  function status(html) { $("su-status").innerHTML = html || ""; }
  function eligible(d) { return C.upcoming(d).filter(function (e) { return e.signup_enabled && e.status !== "cancelled"; }); }
  function countText(e) { var n = (e.signups || []).length; return n === 0 ? "nobody signed up yet" : n === 1 ? "1 person signed up" : n + " people signed up"; }

  // club get-togethers (meetings and socials, where people bring food) vs. everything else
  function isMeeting(e) { return e.kind === "meeting" || e.kind === "social"; }
  function cardsHtml(list) {
    return list.map(function (e) {
      var p = C.parts(e.starts_on), id = "su-ev-" + esc(e.id), theme = C.themeText(e);
      return '<div class="club-pick-option"><input type="radio" name="su-event" id="' + id + '" value="' + esc(e.id) + '">' +
        '<label for="' + id + '"><span class="club-date" aria-hidden="true"><span class="dow">' + C.DOW[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()].slice(0, 3) +
        '</span><span class="day">' + p.d + '</span><span class="mon">' + C.MON[p.m - 1].slice(0, 3) + "</span></span>" +
        '<span><span class="club-pick-title">' + esc(e.title) + "</span>" +
        '<span class="club-pick-meta">' + esc(C.longDate(e.starts_on) + " · " + C.timeLabel(e)) + "</span>" +
        (theme ? '<span class="club-pick-meta">Food theme: ' + esc(theme) + "</span>" : "") +
        '<span class="club-pick-meta" data-count="' + esc(e.id) + '">' + esc(countText(e)) + "</span>" +
        '<span class="club-pick-check">✓ Selected</span></span></label></div>';
    }).join("");
  }
  function options(list) {
    var meetings = list.filter(isMeeting), events = list.filter(function (e) { return !isMeeting(e); });
    $("su-pick-options").innerHTML = cardsHtml(meetings);
    $("su-pick-events").innerHTML = cardsHtml(events);
    $("su-meetings").hidden = !meetings.length;
    $("su-events").hidden = !events.length;
  }
  // keep the counts on the step 1 cards current after a sign-up is added, changed or removed
  // (text only, so the selected card and keyboard focus stay as they are)
  function refreshCounts() {
    eligible(data).forEach(function (e) {
      var el = document.querySelector('[data-count="' + e.id + '"]');
      if (el) el.textContent = countText(e);
    });
  }
  function pick(id, scroll) {
    var e = data.events.filter(function (x) { return x.id === id; })[0];
    if (!e) return;
    if (!form) form = C.signupForm($("su-app"), { idPrefix: "su", headingLevel: 2, onChange: function (d) { data = d; refreshCounts(); } });
    $("su-app").hidden = false;
    form.show(data, e);
    try { // keep the choice if the page is reloaded or shared
      var u = new URL(location.href); u.searchParams.set("event", id); history.replaceState(null, "", u.pathname + u.search + u.hash);
    } catch (err) { /* old browser */ }
    if (scroll) $("su-app").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  C.load(root).then(function (d) {
    data = d;
    if (!d.live) {
      status('<div class="club-banner club-banner--warn"><p><strong>Online sign-up isn\'t working right now.</strong> ' +
        (C.config.enabled ? "The club database couldn't be reached. Try again in a minute." : "It opens soon.") +
        ' See the <a href="' + root + '#schedule">schedule</a> for upcoming dates.</p></div>');
      return;
    }
    if (C.isLocal()) status('<div class="club-banner"><p>Local test database.</p></div>');
    var list = eligible(d);
    if (!list.length) {
      status('<div class="club-banner"><p><strong>No upcoming get-together has food sign-up yet.</strong> Club officers set it up for each meeting. See the <a href="' + root + '#schedule">schedule</a>.</p></div>');
      return;
    }
    options(list);
    $("su-pick").hidden = false;
    var want = new URLSearchParams(location.search).get("event");
    if (want && list.some(function (e) { return e.id === want; })) {
      document.getElementById("su-ev-" + want).checked = true;
      pick(want, false);
    }
  }, function () { status('<div class="club-banner club-banner--warn"><p>The sign-up list could not be loaded. Reload to try again.</p></div>'); });

  $("su-pick").addEventListener("change", function (ev) {
    if (ev.target.name === "su-event") pick(ev.target.value, true);
  });
})();
