/* Freshwater portal — student field observations: configuration and API client.
   Shared by observations/submit/ (student form), observations/review/ (faculty),
   the Observations page and the map's observation layer.

   The Supabase URL and "publishable" key are public by design: the key only reaches the
   public.fw_* functions in research/freshwater/sql/001_field_submissions.sql, which check
   the class upload code or the instructor key themselves. No secrets here. */
(function () {
  "use strict";

  var CONFIG = {
    // OFF until the database migration above has been applied with faculty approval.
    // While false, students can fill in the form to practice (photos are read and
    // checked on the phone) but nothing is sent, and public pages show only the
    // published records committed in data/observations.json.
    enabled: false,
    supabaseUrl: "https://efxymeviokaocosmpqwf.supabase.co",
    supabaseKey: "sb_publishable_xoPXCFR7FN5X6as1E1tYAg_bmSpYMHE",
    // Stable address that the printed and on-screen QR codes point at.
    submitUrl: "https://justin83.github.io/biology-at-scc/research/freshwater/observations/submit/"
  };

  // Local testing only: open any portal page with ?api=http://127.0.0.1:8788 to use
  // tools/freshwater-portal/local-api.mjs instead of the real database. Loopback
  // addresses only, so a link can never redirect uploads to another server.
  var localApi = null;
  try {
    var q = new URLSearchParams(location.search).get("api");
    if (q === "off") sessionStorage.removeItem("fw-local-api");
    var cand = (q && q !== "off") ? q : sessionStorage.getItem("fw-local-api");
    if (cand) {
      var u = new URL(cand);
      if ((u.hostname === "127.0.0.1" || u.hostname === "localhost") && (u.protocol === "http:" || u.protocol === "https:")) {
        localApi = u.origin;
        sessionStorage.setItem("fw-local-api", localApi);
      }
    }
  } catch (e) { /* storage blocked or bad URL: ignore */ }

  var SITES = [
    ["allen-branch", "Allen Branch"],
    ["agricultural-pond", "Agricultural pond"],
    ["lake-cumberland-pitman", "Lake Cumberland — Pitman Creek embayment"],
    ["lake-linville", "Lake Linville"],
    ["other", "Other site"]
  ];
  // Same parameters, units and plausible ranges as fieldobs.param_spec() in the SQL.
  var PARAMS = [
    { id: "water_temperature", label: "Water temperature", unit: "°C", min: -5, max: 45 },
    { id: "ph", label: "pH", unit: "pH units", min: 0, max: 14 },
    { id: "specific_conductance", label: "Specific conductance", unit: "µS/cm", min: 0, max: 20000 },
    { id: "dissolved_oxygen", label: "Dissolved oxygen", unit: "mg/L", min: 0, max: 30 },
    { id: "turbidity", label: "Turbidity", unit: "NTU", min: 0, max: 4000 },
    { id: "transparency_tube", label: "Transparency tube", unit: "cm", min: 0, max: 200 },
    { id: "nitrate_n", label: "Nitrate", unit: "mg/L as N", min: 0, max: 100 },
    { id: "orthophosphate_p", label: "Orthophosphate", unit: "mg/L as P", min: 0, max: 50 }
  ];
  var LABELS = {
    flow: { dry: "Dry", pooled: "Pooled, not flowing", trickle: "Trickle", low: "Low", moderate: "Moderate", high: "High", flood: "Flood" },
    biofilm: { none: "None", thin: "Thin film", thick: "Thick film", mat: "Mat", floating: "Floating" },
    substrate: { bedrock: "Bedrock", boulder: "Boulder", cobble: "Cobble", gravel: "Gravel", sand: "Sand", "silt-clay": "Silt / clay", wood: "Wood", "leaf-litter": "Leaf litter", vegetation: "Vegetation", concrete: "Concrete" },
    status: { uploading: "Uploading (not finished)", submitted: "Waiting for review", changes_requested: "Changes requested", approved: "Approved (public)", rejected: "Rejected", archived: "Archived" },
    source: { photo: "from photo", device: "from this device", manual: "entered by hand", map: "placed on the map", none: "not recorded" }
  };

  var ERRORS = {
    not_open: "Submissions are closed right now. Your draft is saved on this device — submit it when your instructor opens the form.",
    bad_code: "That class code was not accepted. Check it with your instructor (or scan the class QR code).",
    bad_entry: "Part of the entry could not be read. Check the date, numbers and site, then try again.",
    already_submitted: "This entry was already received.",
    bad_time: "The date and time must be within the last 400 days and not in the future.",
    bad_location: "The location must be in or near Kentucky (latitude 36–40 °N, longitude 81–90 °W). Check it, or clear it.",
    no_observer: "Enter at least one observer's name.",
    out_of_range: "A measurement is outside the plausible range for its unit.",
    bad_number: "A number could not be read. Use digits and a decimal point only.",
    bad_parameter: "Unknown measurement parameter. Reload the page and try again.",
    too_many_measurements: "Too many measurements in one entry.",
    bad_token: "The upload window for this entry has closed (2 hours). Your text was saved; ask your instructor about adding photos.",
    bad_image: "A photo could not be read. Remove it and attach it again.",
    image_too_large: "A photo was still too large after compression. Remove it and try a different photo.",
    storage_full: "Photo storage for the class is full. Tell your instructor; the rest of the entry is saved.",
    too_many_photos: "This entry already has the maximum number of photos.",
    unauthorized: "Instructor key not accepted.",
    not_found: "That record no longer exists.",
    bad_status: "Unknown review status.",
    code_too_short: "Choose a class code with at least 6 characters.",
    key_too_short: "Choose an instructor key with at least 12 characters.",
    unknown_action: "Unknown instructor action.",
    network: "Could not reach the server. Check your connection and try again.",
    disabled: "Online submission is not switched on yet."
  };

  function live() { return CONFIG.enabled || !!localApi; }
  function base() { return localApi || CONFIG.supabaseUrl; }

  function rpc(fn, args) {
    if (!live()) return Promise.resolve({ ok: false, error: "disabled" });
    return fetch(base() + "/rest/v1/rpc/" + fn, {
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
    if (ERRORS[r.error]) return ERRORS[r.error] + (r.error === "out_of_range" && r.field ? " (" + paramLabel(r.field) + ")" : "");
    if (r.error && r.error.indexOf("http_") === 0) return "Server error (" + r.error.slice(5) + ")" + (r.detail ? ": " + r.detail : "") + ".";
    return r.error || "Unknown error.";
  }

  function paramLabel(id) { for (var i = 0; i < PARAMS.length; i++) if (PARAMS[i].id === id) return PARAMS[i].label; return id; }
  function siteName(id, other) {
    if (id === "other") return other ? "Other: " + other : "Other site";
    for (var i = 0; i < SITES.length; i++) if (SITES[i][0] === id) return SITES[i][1];
    return id;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function fmtWhen(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  function fmtCoord(lat, lon, acc) {
    if (lat == null || lon == null || lat === "" || lon === "") return "";
    var s = Number(lat).toFixed(5) + ", " + Number(lon).toFixed(5);
    if (acc != null && acc !== "") s += " (± " + Math.round(Number(acc)) + " m)";
    return s;
  }

  // Approved observations (cached per page) and approved photos as data: URLs.
  var pubCache = null, photoCache = {};
  function publicObservations() {
    if (!pubCache) pubCache = rpc("fw_public_observations", {});
    return pubCache;
  }
  function photoUrl(id, size, instructorKey) {
    var k = id + ":" + (size || "thumb") + (instructorKey ? ":i" : "");
    if (!photoCache[k]) {
      photoCache[k] = (instructorKey ? rpc("fw_instructor", { p_key: instructorKey, p_action: "photo", p_payload: { id: id } })
                                     : rpc("fw_public_photo", { p_id: id, p_size: size || "thumb" }))
        .then(function (r) { if (!r.ok) { delete photoCache[k]; throw new Error(r.error); } return "data:image/jpeg;base64," + r.image_b64; });
    }
    return photoCache[k];
  }

  window.FWObs = {
    config: CONFIG, live: live, isLocal: function () { return !!localApi; }, rpc: rpc, errorText: errorText,
    SITES: SITES, PARAMS: PARAMS, LABELS: LABELS, siteName: siteName, paramLabel: paramLabel,
    esc: esc, fmtWhen: fmtWhen, fmtCoord: fmtCoord, publicObservations: publicObservations, photoUrl: photoUrl
  };
})();
