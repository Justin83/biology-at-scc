/* Club food sign-up form, used in the pop-up on the club home page and on the sign-up
   page. Each sign-up made here gets a private token, kept in this browser's localStorage,
   so the same device can change or remove it later.

   var form = Club.signupForm(container, { idPrefix: "m", headingLevel: 3, onChange: fn });
   form.show(data, event);   // data from Club.load(); re-renders after every change */
(function () {
  "use strict";
  var C = window.Club;
  if (!C) return;
  var esc = C.esc;
  var TOKENS = "club-signup-tokens", NAME = "club-name";

  function store(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; } }
  function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* storage blocked */ } }
  function tokens() { return store(TOKENS, {}); }
  function slotsOf(e) { return e.slots && e.slots.length ? e.slots : [{ label: "Food or drink", needed: null }]; }

  // "Who's bringing what" for one event, grouped by category. Used inside the sign-up
  // form and on the club home page's next-meeting card. h = heading tag for categories.
  C.bringList = function (e, h) {
    var signups = e.signups || [], mine = tokens(), slots = slotsOf(e);
    var known = slots.map(function (s) { return s.label; });
    var other = signups.filter(function (x) { return known.indexOf(x.slot) === -1; });
    var line = function (x) {
      return "<li" + (mine[x.id] ? ' class="is-mine"' : "") + "><strong>" + esc(x.item) + '</strong> <span class="who">· ' + esc(x.name) + "</span>" +
        (x.note ? ' <span class="note">(' + esc(x.note) + ")</span>" : "") + (mine[x.id] ? ' <span class="you">(you)</span>' : "") + "</li>";
    };
    var block = function (label, list, count) {
      return '<div class="club-bring-cat' + (list.length ? "" : " is-empty") + '"><' + h + ">" + esc(label) + " <span>" + esc(count) + "</span></" + h + ">" +
        (list.length ? "<ul>" + list.map(line).join("") + "</ul>" : "") + "</div>";
    };
    return slots.map(function (s) {
      var list = signups.filter(function (x) { return x.slot === s.label; });
      return block(s.label, list, s.needed ? list.length + " of " + s.needed + " needed" : list.length ? list.length + " signed up" : "nobody yet");
    }).join("") + (other.length ? block("Other", other, other.length + " signed up") : "");
  };

  C.themeText = function (e) {
    if (e.theme) return e.theme;
    return e.signup_enabled ? "to be announced" : "";
  };

  C.signupForm = function (container, opts) {
    opts = opts || {};
    var P = (opts.idPrefix || "su") + "-", h = "h" + (opts.headingLevel || 3);
    var root = document.body.getAttribute("data-club-root") || "./";
    var data = null, ev = null, editing = null, busy = false;
    var $ = function (id) { return document.getElementById(P + id); };

    container.innerHTML =
      '<div class="club-su-event" id="' + P + 'info"></div>' +
      '<div class="club-su-grid">' +
      '<section class="club-su-list club-bring-panel" aria-labelledby="' + P + 'list-title"><' + h + ' id="' + P + 'list-title">Who\'s bringing what</' + h + '><div id="' + P + 'list" class="club-bring"></div></section>' +
      '<section class="club-su-form" aria-labelledby="' + P + 'form-title"><' + h + ' id="' + P + 'form-title" tabindex="-1">Add what you\'re bringing</' + h + '>' +
      '<form id="' + P + 'form" novalidate>' +
      '<div class="club-field"><label for="' + P + 'name">Your name</label><input id="' + P + 'name" type="text" maxlength="60" autocomplete="name" aria-describedby="' + P + 'name-hint">' +
      '<p class="club-hint" id="' + P + 'name-hint">First name and last initial is fine. Names and items show on this page so people can plan.</p></div>' +
      '<fieldset class="club-field"><legend>Category</legend><div class="club-choices" id="' + P + 'slots"></div></fieldset>' +
      '<div class="club-field"><label for="' + P + 'item">What are you bringing?</label><input id="' + P + 'item" type="text" maxlength="120" autocomplete="off" placeholder="e.g., chocolate chip cookies"></div>' +
      '<div class="club-field"><label for="' + P + 'note">Allergy or diet note <span class="club-hint">(optional)</span></label><input id="' + P + 'note" type="text" maxlength="200" autocomplete="off" placeholder="e.g., contains peanuts, vegetarian"></div>' +
      '<div class="club-hp" aria-hidden="true"><label for="' + P + 'website">Leave this empty</label><input id="' + P + 'website" type="text" tabindex="-1" autocomplete="off"></div>' +
      '<div class="club-actions"><button type="submit" class="club-btn" id="' + P + 'submit">Sign me up</button>' +
      '<button type="button" class="club-btn club-btn--ghost" id="' + P + 'cancel" hidden>Cancel change</button></div>' +
      '<p id="' + P + 'msg" class="club-msg" role="status" aria-live="polite"></p></form>' +
      '<div id="' + P + 'mine-wrap" hidden><' + h + '>Your sign-ups on this device</' + h + '>' +
      '<p class="club-hint">You can change or remove these from this phone or computer. From another device, ask a club officer.</p>' +
      '<ul id="' + P + 'mine" class="club-mine"></ul></div></section></div>';

    function msg(text, kind) { var el = $("msg"); el.textContent = text || ""; el.className = "club-msg" + (kind ? " is-" + kind : ""); }

    function render() {
      var e = ev, signups = e.signups || [], mine = tokens(), theme = C.themeText(e);
      $("info").innerHTML = '<p class="club-su-date">' + esc(C.dateLabel(e, true)) + "</p>" +
        '<p class="club-su-meta">' + esc(C.timeLabel(e)) + " · " + esc(e.title) + (e.location ? " · " + esc(e.location) : "") +
        (C.relDays(data.today, e.starts_on) ? " · " + esc(C.relDays(data.today, e.starts_on)) : "") + "</p>" +
        (theme ? '<p class="club-theme">Food theme: <strong>' + esc(theme) + "</strong></p>" : "") +
        (e.signup_note ? "<p>" + esc(e.signup_note) + "</p>" : "");
      $("list").innerHTML = C.bringList(e, "h" + ((opts.headingLevel || 3) + 1));
      var checked = editing ? editing.slot : (container.querySelector('input[name="' + P + 'slot"]:checked') || {}).value;
      $("slots").innerHTML = slotsOf(e).map(function (s, i) {
        return '<div class="club-choice"><input type="radio" name="' + P + 'slot" id="' + P + "slot-" + i + '" value="' + esc(s.label) + '"' + (checked === s.label ? " checked" : "") +
          '><label for="' + P + "slot-" + i + '">' + esc(s.label) + "</label></div>";
      }).join("");
      var own = signups.filter(function (x) { return mine[x.id]; });
      $("mine-wrap").hidden = !own.length;
      $("mine").innerHTML = own.map(function (x) {
        return "<li><span><strong>" + esc(x.item) + "</strong> (" + esc(x.slot) + ") · " + esc(x.name) + '</span><span class="club-actions" style="margin:0">' +
          '<button type="button" class="club-btn club-btn--ghost club-btn--small" data-edit="' + esc(x.id) + '">Change<span class="visually-hidden"> ' + esc(x.item) + "</span></button>" +
          '<button type="button" class="club-btn club-btn--danger club-btn--small" data-remove="' + esc(x.id) + '">Remove<span class="visually-hidden"> ' + esc(x.item) + "</span></button></span></li>";
      }).join("");
      $("submit").disabled = !data.signups_open;
      if (!data.signups_open) msg("Food sign-up is closed right now. Ask a club officer.", "error");
    }
    function cancelEdit() {
      editing = null;
      $("form-title").textContent = "Add what you're bringing";
      $("submit").textContent = "Sign me up";
      $("cancel").hidden = true;
    }
    function reload(then) {
      return C.load(root).then(function (d) {
        data = d;
        ev = d.events.filter(function (x) { return x.id === ev.id; })[0] || ev;
        render();
        if (opts.onChange) opts.onChange(d);
        if (then) then();
      });
    }

    $("form").addEventListener("submit", function (e) {
      e.preventDefault();
      if (busy || !ev) return;
      if ($("website").value) return; // filled only by bots
      var slot = (container.querySelector('input[name="' + P + 'slot"]:checked') || {}).value;
      var entry = { name: $("name").value.trim(), slot: slot, item: $("item").value.trim(), note: $("note").value.trim() };
      if (!entry.name) { msg("Enter your name.", "error"); $("name").focus(); return; }
      if (!slot) { msg("Choose a category.", "error"); container.querySelector('input[name="' + P + 'slot"]').focus(); return; }
      if (!entry.item) { msg("Say what you're bringing.", "error"); $("item").focus(); return; }
      busy = true; $("submit").disabled = true;
      msg(editing ? "Saving…" : "Signing you up…");
      var call = editing
        ? C.rpc("club_signup_update", { p_id: editing.id, p_token: tokens()[editing.id], p_entry: entry })
        : C.rpc("club_signup", { p_event_id: ev.id, p_entry: entry });
      call.then(function (r) {
        busy = false; $("submit").disabled = false;
        if (!r.ok) { msg(C.errorText(r), "error"); return; }
        if (!editing) { var t = tokens(); t[r.id] = r.token; save(TOKENS, t); }
        save(NAME, entry.name);
        var was = editing;
        cancelEdit();
        $("item").value = ""; $("note").value = "";
        reload(function () { msg(was ? "Saved. Thanks!" : "You're signed up to bring " + entry.item + ". Thanks!", "ok"); });
      });
    });
    $("cancel").addEventListener("click", function () { cancelEdit(); $("item").value = ""; $("note").value = ""; msg(""); });
    $("mine").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      if (b.hasAttribute("data-edit")) {
        var x = (ev.signups || []).filter(function (s) { return s.id === b.getAttribute("data-edit"); })[0];
        if (!x) return;
        editing = x;
        $("name").value = x.name; $("item").value = x.item; $("note").value = x.note || "";
        Array.prototype.forEach.call(container.querySelectorAll('input[name="' + P + 'slot"]'), function (r) { r.checked = r.value === x.slot; });
        $("form-title").textContent = "Change your sign-up";
        $("submit").textContent = "Save change";
        $("cancel").hidden = false;
        msg("");
        $("item").focus();
        return;
      }
      var id = b.getAttribute("data-remove");
      if (!id || !window.confirm("Remove this sign-up?")) return;
      C.rpc("club_signup_remove", { p_id: id, p_token: tokens()[id] }).then(function (r) {
        if (!r.ok) { msg(C.errorText(r), "error"); return; }
        var t = tokens(); delete t[id]; save(TOKENS, t);
        if (editing && editing.id === id) cancelEdit();
        reload(function () { msg("Sign-up removed.", "ok"); $("form-title").focus(); });
      });
    });
    $("name").value = store(NAME, "") || "";

    return {
      show: function (d, e) {
        data = d; ev = e;
        cancelEdit(); msg("");
        $("item").value = ""; $("note").value = "";
        render();
      },
      focusFirst: function () { ($("name").value ? container.querySelector('input[name="' + P + 'slot"]') : $("name")).focus(); }
    };
  };
})();
