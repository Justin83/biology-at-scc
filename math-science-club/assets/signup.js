/* Food sign-up page (the QR target): pick the get-together, then the shared form in
   signup-form.js. ?event=<id> preselects one; otherwise the next one with sign-up. */
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
  function pick(id) {
    var e = data.events.filter(function (x) { return x.id === id; })[0] || eligible(data)[0];
    if (!form) form = C.signupForm($("su-app"), { idPrefix: "su", headingLevel: 2, onChange: function (d) { data = d; } });
    $("su-app").hidden = false;
    form.show(data, e);
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
    $("su-event-wrap").hidden = list.length < 2;
    $("su-event").innerHTML = list.map(function (e) {
      return '<option value="' + esc(e.id) + '">' + esc(C.shortDate(e.starts_on) + ": " + e.title + (e.theme ? " (" + e.theme + ")" : "")) + "</option>";
    }).join("");
    var want = new URLSearchParams(location.search).get("event");
    if (want && list.some(function (e) { return e.id === want; })) $("su-event").value = want;
    pick($("su-event").value);
  }, function () { status('<div class="club-banner club-banner--warn"><p>The sign-up list could not be loaded. Reload to try again.</p></div>'); });

  $("su-event").addEventListener("change", function () { pick(this.value); });
})();
