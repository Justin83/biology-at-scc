/* Math & Science Club — configuration, API client and date helpers.
   Shared by the club home page, the food sign-up page and the officer tools.

   The Supabase URL and "publishable" key are public by design: the key only reaches the
   public.club_* functions in math-science-club/sql/001_club.sql. Officer actions check the
   officer code inside the database. No secrets here. */
(function () {
  "use strict";

  var CONFIG = {
    // ON since 2026-11-05 (migration club_v1 applied with Justin's approval). When
    // false, or when the database cannot be reached, the pages show the printed Fall
    // 2026 schedule from data/events.json and food sign-up is unavailable.
    enabled: true,
    supabaseUrl: "https://efxymeviokaocosmpqwf.supabase.co",
    supabaseKey: "sb_publishable_xoPXCFR7FN5X6as1E1tYAg_bmSpYMHE",
    homeUrl: "https://justin83.github.io/biology-at-scc/math-science-club/",
    signupUrl: "https://justin83.github.io/biology-at-scc/math-science-club/signup/",
    meetingRule: "the third Thursday of every month at 5:00 PM"
  };

  // Local testing only: ?api=http://127.0.0.1:8789 (loopback addresses only) points the
  // pages at tools/math-science-club/local-api.mjs. ?api=off clears it.
  var localApi = null;
  try {
    var q = new URLSearchParams(location.search).get("api");
    if (q === "off") sessionStorage.removeItem("club-local-api");
    var cand = (q && q !== "off") ? q : sessionStorage.getItem("club-local-api");
    if (cand) {
      var u = new URL(cand);
      if ((u.hostname === "127.0.0.1" || u.hostname === "localhost") && (u.protocol === "http:" || u.protocol === "https:")) {
        localApi = u.origin;
        sessionStorage.setItem("club-local-api", localApi);
      }
    }
  } catch (e) { /* storage blocked or bad URL */ }

  var KINDS = {
    meeting: "Club meeting", social: "Social", astronomy: "Astronomy", "campus-tour": "Campus tour",
    conference: "Conference", competition: "Competition", event: "Event", graduation: "Graduation"
  };
  var ERRORS = {
    signups_closed: "Food sign-up is closed right now. Ask a club officer.",
    no_signup: "Food sign-up is not set up for this event.",
    event_past: "This event has already happened, so sign-up is closed.",
    no_name: "Enter your name.",
    no_item: "Say what you're bringing.",
    bad_slot: "Choose one of the categories.",
    full: "This sign-up list is full. Ask a club officer.",
    duplicate: "That exact sign-up is already on the list.",
    not_yours: "This sign-up can only be changed from the device that made it. Ask a club officer.",
    unauthorized: "Officer code not accepted.",
    no_title: "Give the event a title.",
    no_date: "Choose a date.",
    bad_value: "One of the values could not be saved. Check the date, times and type.",
    duplicate_event: "An event with this title is already on that date.",
    code_too_short: "Use at least 8 characters for the officer code.",
    not_found: "That event no longer exists. Reload the page.",
    unknown_action: "Unknown action.",
    network: "Could not reach the club database. Check your connection and try again.",
    disabled: "Online sign-up is not switched on yet."
  };

  function live() { return CONFIG.enabled || !!localApi; }
  function rpc(fn, args) {
    if (!live()) return Promise.resolve({ ok: false, error: "disabled" });
    return fetch((localApi || CONFIG.supabaseUrl) + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "apikey": CONFIG.supabaseKey, "Authorization": "Bearer " + CONFIG.supabaseKey },
      body: JSON.stringify(args || {})
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (body) {
        if (!res.ok) return { ok: false, error: "http_" + res.status, detail: body && (body.message || body.hint) };
        if (!body || typeof body !== "object") return { ok: false, error: "bad_response" };
        return body;
      });
    }, function (e) { return { ok: false, error: "network", detail: String(e) }; });
  }
  function errorText(r) {
    if (!r) return ERRORS.network;
    if (ERRORS[r.error]) return ERRORS[r.error];
    if (r.error && r.error.indexOf("http_") === 0) return "Server error (" + r.error.slice(5) + ")" + (r.detail ? ": " + r.detail : "") + ".";
    return r.error || "Something went wrong.";
  }

  // ---------------------------------------------------------------- dates (local wall clock, Somerset KY)
  var DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function todayISO() {
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
    catch (e) { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function parts(iso) { var m = /^(\d{4})-(\d\d)-(\d\d)/.exec(iso || ""); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; }
  function dow(iso) { var p = parts(iso); return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); }
  function longDate(iso, withYear) { var p = parts(iso); return DOW[dow(iso)] + ", " + MON[p.m - 1] + " " + p.d + (withYear ? ", " + p.y : ""); }
  function shortDate(iso) { var p = parts(iso); return DOW[dow(iso)].slice(0, 3) + ", " + MON[p.m - 1].slice(0, 3) + " " + p.d; }
  function monthKey(iso) { return iso.slice(0, 7); }
  function monthLabel(key) { var p = parts(key + "-01"); return MON[p.m - 1] + " " + p.y; }
  function clock(t) {
    if (!t) return "";
    var m = /^(\d\d):(\d\d)/.exec(t), h = +m[1], mm = m[2];
    return ((h % 12) || 12) + ":" + mm + " " + (h < 12 ? "AM" : "PM");
  }
  function timeLabel(e) {
    if (!e.start_time) return "All day";
    return clock(e.start_time) + (e.end_time ? " – " + clock(e.end_time) : "");
  }
  function dateLabel(e, withYear) {
    if (e.ends_on && e.ends_on !== e.starts_on) return shortDate(e.starts_on) + " – " + shortDate(e.ends_on) + (withYear ? ", " + parts(e.ends_on).y : "");
    return longDate(e.starts_on, withYear);
  }
  function thirdThursday(y, m) { // m = 1..12; returns YYYY-MM-DD
    var first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    var day = 1 + ((4 - first + 7) % 7) + 14;
    return y + "-" + pad(m) + "-" + pad(day);
  }
  function daysBetween(a, b) { var A = parts(a), B = parts(b); return Math.round((Date.UTC(B.y, B.m - 1, B.d) - Date.UTC(A.y, A.m - 1, A.d)) / 864e5); }
  function relDays(today, iso) {
    var n = daysBetween(today, iso);
    return n === 0 ? "today" : n === 1 ? "tomorrow" : n > 1 ? "in " + n + " days" : "";
  }
  function isPast(e, today) { return (e.ends_on || e.starts_on) < today; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }

  // ---------------------------------------------------------------- schedule
  // { live, today, signups_open, events, error }  — falls back to data/events.json.
  function load(root) {
    var fallback = function (why) {
      return fetch((root || "./") + "data/events.json").then(function (r) { return r.json(); }).then(function (d) {
        return { live: false, today: todayISO(), signups_open: false, events: d.events, footnotes: d.flyer_footnotes, error: why };
      });
    };
    if (!live()) return fallback(null);
    return rpc("club_events", {}).then(function (r) {
      if (!r.ok) return fallback(r);
      return { live: true, today: r.today || todayISO(), signups_open: !!r.signups_open, events: r.events || [] };
    });
  }
  function upcoming(data) {
    return data.events.filter(function (e) { return !isPast(e, data.today); });
  }
  function nextGathering(data) {
    // the next scheduled club meeting, or failing that the next event with food sign-up
    var up = upcoming(data).filter(function (e) { return e.status !== "cancelled"; });
    return up.filter(function (e) { return e.kind === "meeting"; })[0] || up.filter(function (e) { return e.signup_enabled; })[0] || null;
  }

  window.Club = {
    config: CONFIG, live: live, isLocal: function () { return !!localApi; }, rpc: rpc, errorText: errorText,
    KINDS: KINDS, todayISO: todayISO, parts: parts, longDate: longDate, shortDate: shortDate, monthKey: monthKey,
    monthLabel: monthLabel, timeLabel: timeLabel, dateLabel: dateLabel, clock: clock, thirdThursday: thirdThursday,
    relDays: relDays, isPast: isPast, esc: esc, load: load, upcoming: upcoming, nextGathering: nextGathering, MON: MON, DOW: DOW
  };
})();
