/* Freshwater portal — student field-observation form (observations/submit/).
   Photos: read EXIF time/GPS/camera on the device (exifr), then re-encode each photo
   through a canvas (≤1600 px, ≤700 KB, plus a ≤400 px thumbnail). The canvas copy has
   no embedded metadata; time, position and camera travel as separate fields instead.
   Upload: fw_submit (text) → fw_add_photo (one call per photo) → fw_finish.
   Needs assets/fieldobs.js; exifr and map.js are optional (the form works without them). */
(function () {
  "use strict";
  var O = window.FWObs;
  var form = document.getElementById("fo-form");
  if (!O || !form) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = O.esc;

  var LIMITS = { photos: 6, photoBytes: 716800, thumbBytes: 81920, edge: 1600, thumbEdge: 400 };
  var BOUNDS = { latMin: 36, latMax: 40, lonMin: -90, lonMax: -81 }; // same as the database check
  var DRAFT_KEY = "fw-obs-draft-v1";
  var photos = [];        // { key, blob, thumb, url, w, h, meta: { taken, lat, lon, acc, camera }, caption, name }
  var loc = null;         // { lat, lon, acc, source: photo|device|map|manual }
  var whenSource = "device";
  var clientId = uuid();
  var pending = null;     // after fw_submit: { id, token, receipt, sent }
  var busy = false, map = null, pin = null, nextKey = 1;

  // ------------------------------------------------------------ build the dynamic fields
  O.SITES.forEach(function (s) { $("fo-site").insertAdjacentHTML("beforeend", '<option value="' + s[0] + '">' + esc(s[1]) + "</option>"); });
  Object.keys(O.LABELS.flow).forEach(function (k) { $("fo-flow").insertAdjacentHTML("beforeend", '<option value="' + k + '">' + esc(O.LABELS.flow[k]) + "</option>"); });
  $("fo-substrate").innerHTML = Object.keys(O.LABELS.substrate).map(function (k) {
    return '<div class="fw-checkbox"><input type="checkbox" name="substrate" id="fo-sub-' + k + '" value="' + k + '"><label for="fo-sub-' + k + '">' + esc(O.LABELS.substrate[k]) + "</label></div>";
  }).join("");
  $("fo-biofilm").innerHTML = Object.keys(O.LABELS.biofilm).map(function (k) {
    return '<div class="fw-checkbox"><input type="radio" name="visible_biofilm" id="fo-bio-' + k + '" value="' + k + '"><label for="fo-bio-' + k + '">' + esc(O.LABELS.biofilm[k]) + "</label></div>";
  }).join("");
  $("fo-measurements").innerHTML = O.PARAMS.map(function (p) {
    var id = "fo-m-" + p.id;
    return '<fieldset class="fw-measure" data-param="' + p.id + '"><legend>' + esc(p.label) + ' <span class="fw-muted">(' + esc(p.unit) + ")</span></legend>" +
      '<div class="fw-field"><label for="' + id + '-v">Value</label><input id="' + id + '-v" type="text" inputmode="decimal" autocomplete="off" data-m="value"></div>' +
      '<div class="fw-field"><label for="' + id + '-method">Method or kit</label><input id="' + id + '-method" type="text" maxlength="120" autocomplete="off" data-m="method"></div>' +
      '<div class="fw-checkbox"><input type="checkbox" id="' + id + '-bdl" data-m="bdl"><label for="' + id + '-bdl">Below detection limit</label></div></fieldset>';
  }).join("");
  var observerCount = 0;
  function addObserver(name, pub) {
    if (observerCount >= 8) return;
    observerCount++;
    var n = observerCount;
    $("fo-observers").insertAdjacentHTML("beforeend",
      '<div class="fw-observer" data-observer="' + n + '"><div class="fw-field"><label for="fo-obs-' + n + '">Name ' + n + (n === 1 ? ' <span class="fw-req">(required)</span>' : "") + "</label>" +
      '<input id="fo-obs-' + n + '" type="text" maxlength="60" autocomplete="' + (n === 1 ? "name" : "off") + '" data-obs="name"></div>' +
      '<div class="fw-checkbox"><input type="checkbox" id="fo-obs-' + n + '-pub" data-obs="public"><label for="fo-obs-' + n + '-pub">Show this name on the website</label></div></div>');
    if (name) $("fo-obs-" + n).value = name;
    if (pub) $("fo-obs-" + n + "-pub").checked = true;
    $("fo-add-observer").hidden = observerCount >= 8;
  }
  addObserver(); addObserver();
  $("fo-add-observer").addEventListener("click", function () { addObserver(); $("fo-obs-" + observerCount).focus(); });
  Array.prototype.forEach.call(document.querySelectorAll("[data-fo-max-photos]"), function (el) { el.textContent = LIMITS.photos; });

  // ------------------------------------------------------------ status banner
  function setStatus(kind, title, text) {
    var el = $("fo-status");
    el.className = "fw-callout " + (kind === "ok" ? "fw-callout--kentucky" : kind === "info" ? "fw-callout--local" : "fw-callout--caution");
    el.innerHTML = '<span class="fw-callout-title">' + esc(title) + "</span><p>" + esc(text) + "</p>";
  }
  function initStatus() {
    if (!O.live()) {
      setStatus("caution", "Practice mode — uploads are not open yet",
        "The class database for this form has not been switched on. You can fill in the form to practice: your photos are read and checked on this phone, but nothing is sent.");
      $("fo-send").textContent = "Check my entry";
      return;
    }
    setStatus("info", "Checking the form…", "Connecting to the observation database.");
    O.rpc("fw_status", {}).then(function (r) {
      var local = O.isLocal() ? " (Local test database.)" : "";
      if (!r.ok) { setStatus("caution", "The observation database could not be reached", O.errorText(r) + " Your entry is saved on this device as you type." + local); return; }
      LIMITS.photos = r.max_photos || LIMITS.photos;
      LIMITS.photoBytes = r.max_photo_bytes || LIMITS.photoBytes;
      LIMITS.thumbBytes = r.max_thumb_bytes || LIMITS.thumbBytes;
      Array.prototype.forEach.call(document.querySelectorAll("[data-fo-max-photos]"), function (el) { el.textContent = LIMITS.photos; });
      if (!r.open) setStatus("caution", "Submissions are closed right now", "Your instructor has not opened the form. You can still fill it in — it is saved on this device until you send it." + local);
      else setStatus("ok", "Submissions are open", (r.photo_space_left ? "Fill in what you observed, then send it for review." : "Photo storage is nearly full: your entry can still be sent, but photos may not be accepted.") + local);
    });
  }

  // ------------------------------------------------------------ photos
  function msg(id, text, isError) { var el = $(id); el.textContent = text || ""; el.classList.toggle("is-error", !!isError); }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); crypto.getRandomValues(b); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }
  function exifDate(s, off) {
    var m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(s || ""));
    if (!m) return null;
    var d = (off && /^[+-]\d{2}:\d{2}$/.test(off))
      ? new Date(m[1] + "-" + m[2] + "-" + m[3] + "T" + m[4] + ":" + m[5] + ":" + m[6] + off)
      : new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]); // no offset saved: camera clock, taken as this device's time zone
    return isNaN(d) || d.getFullYear() < 2000 ? null : d;
  }
  function readMeta(file) {
    if (!window.exifr) return Promise.resolve({});
    return window.exifr.parse(file, { tiff: true, exif: true, gps: true, xmp: false, icc: false, iptc: false, jfif: false, ihdr: false, reviveValues: false, translateValues: false })
      .then(function (t) {
        t = t || {};
        var out = {};
        var taken = exifDate(t.DateTimeOriginal || t.CreateDate, t.OffsetTimeOriginal || t.OffsetTimeDigitized);
        if (taken) out.taken = taken;
        if (typeof t.latitude === "number" && typeof t.longitude === "number" && isFinite(t.latitude) && isFinite(t.longitude) &&
            Math.abs(t.latitude) <= 90 && Math.abs(t.longitude) <= 180 && !(t.latitude === 0 && t.longitude === 0)) {
          out.lat = t.latitude; out.lon = t.longitude;
          if (typeof t.GPSHPositioningError === "number" && isFinite(t.GPSHPositioningError)) out.acc = t.GPSHPositioningError;
        }
        var make = String(t.Make || "").trim(), model = String(t.Model || "").trim();
        var cam = model.toLowerCase().indexOf(make.toLowerCase()) === 0 ? model : (make + " " + model).trim();
        if (cam) out.camera = cam.slice(0, 120);
        return out;
      }).catch(function () { return {}; });
  }
  function decode(file) {
    var viaImg = function () {
      return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(file), img = new Image();
        img.onload = function () { resolve({ src: img, w: img.naturalWidth, h: img.naturalHeight, done: function () { URL.revokeObjectURL(url); } }); };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("decode")); };
        img.src = url;
      });
    };
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: "from-image" }).then(function (bm) {
        return { src: bm, w: bm.width, h: bm.height, done: function () { if (bm.close) bm.close(); } };
      }, viaImg);
    }
    return viaImg();
  }
  function toBlob(canvas, q) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) { if (b) resolve(b); else reject(new Error("encode")); }, "image/jpeg", q);
    });
  }
  function encode(im, edge, maxBytes, q0) {
    var scale = Math.min(1, edge / Math.max(im.w, im.h));
    var cw = Math.max(1, Math.round(im.w * scale)), ch = Math.max(1, Math.round(im.h * scale));
    var c = document.createElement("canvas"); c.width = cw; c.height = ch;
    var ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(im.src, 0, 0, cw, ch);
    var q = q0;
    var attempt = function () {
      return toBlob(c, q).then(function (b) {
        if (b.size <= maxBytes) { c.width = c.height = 0; return { blob: b, w: cw, h: ch }; }
        if (q > 0.55) { q = Math.round((q - 0.1) * 100) / 100; return attempt(); }
        c.width = c.height = 0;
        if (edge > 700) return encode(im, Math.round(edge * 0.8), maxBytes, q0);
        throw new Error("too_large");
      });
    };
    return attempt();
  }
  function processFile(file) {
    return Promise.all([readMeta(file), decode(file)]).then(function (res) {
      var meta = res[0], im = res[1];
      return encode(im, LIMITS.edge, LIMITS.photoBytes, 0.85).then(function (full) {
        return encode(im, LIMITS.thumbEdge, LIMITS.thumbBytes, 0.75).then(function (th) {
          im.done();
          return { key: nextKey++, blob: full.blob, thumb: th.blob, url: URL.createObjectURL(th.blob), w: full.w, h: full.h, meta: meta, caption: "", name: file.name || "" };
        });
      }, function (e) { im.done(); throw e; });
    });
  }
  function inBounds(lat, lon) { return lat >= BOUNDS.latMin && lat <= BOUNDS.latMax && lon >= BOUNDS.lonMin && lon <= BOUNDS.lonMax; }
  function kb(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.round(n / 1024) + " KB"; }

  function addFiles(list) {
    var files = Array.prototype.slice.call(list || []);
    if (!files.length || busy) return;
    var room = LIMITS.photos - photos.length;
    var skipped = Math.max(0, files.length - room);
    files = files.slice(0, Math.max(0, room));
    if (!files.length) { msg("fo-photo-msg", "This entry already has " + LIMITS.photos + " photos. Remove one to add another.", true); return; }
    var problems = [];
    var chain = Promise.resolve();
    files.forEach(function (f, i) {
      chain = chain.then(function () {
        msg("fo-photo-msg", "Preparing photo " + (i + 1) + " of " + files.length + "…");
        return processFile(f).then(function (p) { photos.push(p); renderPhotos(); applyPhotoMeta(p); }, function (e) {
          var heic = /hei[cf]$/i.test(f.name || "") || /hei[cf]/i.test(f.type || "");
          problems.push((f.name || "A file") + ": " + (heic
            ? "this browser cannot open HEIC photos. On an iPhone use Safari, or set Settings → Camera → Formats → Most Compatible."
            : e && e.message === "too_large" ? "the photo could not be made small enough." : "it could not be opened as a photo."));
        });
      });
    });
    chain.then(function () {
      var parts = [];
      var added = files.length - problems.length;
      if (added) parts.push(added + (added === 1 ? " photo" : " photos") + " ready.");
      if (skipped) parts.push(skipped + " not added (limit " + LIMITS.photos + " per entry).");
      msg("fo-photo-msg", parts.concat(problems).join(" "), problems.length > 0 || skipped > 0);
      saveDraftSoon();
    });
  }
  function photoAlt(p, i) { return "Photo " + (i + 1) + (p.caption ? ": " + p.caption : ""); }
  function renderPhotos() {
    $("fo-photos").innerHTML = photos.map(function (p, i) {
      var m = p.meta, id = "fo-cap-" + p.key;
      var gps = m.lat != null ? O.fmtCoord(m.lat, m.lon, m.acc) + (inBounds(m.lat, m.lon) ? "" : " — outside the Kentucky area, not used") : "Not in this photo";
      return '<li class="fw-photo" data-key="' + p.key + '">' +
        '<img src="' + p.url + '" alt="' + esc(photoAlt(p, i)) + '" width="' + Math.round(p.w * 400 / Math.max(p.w, p.h)) + '" height="' + Math.round(p.h * 400 / Math.max(p.w, p.h)) + '">' +
        '<div class="fw-photo-body"><p class="fw-photo-title">Photo ' + (i + 1) + ' <span class="fw-muted">· ' + p.w + "×" + p.h + " · " + kb(p.blob.size) + "</span></p>" +
        '<dl class="fw-photo-meta"><dt>Taken</dt><dd>' + (m.taken ? esc(O.fmtWhen(m.taken.toISOString())) : "Not in this photo") + "</dd>" +
        "<dt>GPS</dt><dd>" + esc(gps) + "</dd>" + (m.camera ? "<dt>Camera</dt><dd>" + esc(m.camera) + "</dd>" : "") + "</dl>" +
        '<div class="fw-field"><label for="' + id + '">Caption</label><input id="' + id + '" type="text" maxlength="300" data-caption="' + p.key + '" placeholder="e.g., looking upstream from the culvert" value="' + esc(p.caption) + '"></div>' +
        '<button type="button" class="fw-btn fw-btn--ghost fw-btn--small" data-remove="' + p.key + '">Remove photo ' + (i + 1) + "</button></div></li>";
    }).join("");
    var withGps = photos.filter(function (p) { return p.meta.lat != null && inBounds(p.meta.lat, p.meta.lon); });
    $("fo-loc-photo").disabled = !withGps.length;
  }
  function applyPhotoMeta(p) {
    if (p.meta.taken && whenSource !== "manual" && whenSource !== "photo") {
      setWhen(p.meta.taken, "photo", "From the timestamp in photo " + (photos.indexOf(p) + 1) + ". Change it if it is wrong.");
    }
    if (p.meta.lat != null && inBounds(p.meta.lat, p.meta.lon) && !loc) {
      setLoc(p.meta.lat, p.meta.lon, p.meta.acc, "photo");
    } else if (p.meta.lat == null && !loc) {
      msg("fo-loc-msg", "No GPS position in the photo. If you are at the site, use your current location; otherwise tap the map.");
    }
  }
  $("fo-photos").addEventListener("input", function (e) {
    var k = e.target.getAttribute("data-caption");
    if (!k) return;
    photos.forEach(function (p, i) { if (String(p.key) === k) { p.caption = e.target.value; var img = e.target.closest(".fw-photo").querySelector("img"); img.alt = photoAlt(p, i); } });
  });
  $("fo-photos").addEventListener("click", function (e) {
    var k = e.target.getAttribute("data-remove");
    if (!k || busy) return;
    var idx = -1;
    photos.forEach(function (p, i) { if (String(p.key) === k) idx = i; });
    if (idx < 0) return;
    URL.revokeObjectURL(photos[idx].url);
    var gone = photos.splice(idx, 1)[0];
    renderPhotos();
    if (loc && loc.source === "photo" && gone.meta.lat === loc.lat && gone.meta.lon === loc.lon) {
      var other = photos.filter(function (p) { return p.meta.lat != null && inBounds(p.meta.lat, p.meta.lon); })[0];
      if (other) setLoc(other.meta.lat, other.meta.lon, other.meta.acc, "photo"); else clearLoc();
    }
    msg("fo-photo-msg", "Photo removed. " + photos.length + " attached.");
    var next = $("fo-photos").querySelector("[data-remove]");
    (next || $("fo-library")).focus();
  });
  ["fo-camera", "fo-library"].forEach(function (id) {
    $(id).addEventListener("change", function (e) { addFiles(e.target.files); e.target.value = ""; });
  });

  // ------------------------------------------------------------ when
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function localValue(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function setWhen(d, source, hint) { $("fo-when").value = localValue(d); whenSource = source; $("fo-when-src").textContent = hint; }
  $("fo-when").addEventListener("input", function () { whenSource = "manual"; $("fo-when-src").textContent = "Entered by you."; });

  // ------------------------------------------------------------ where
  function setLoc(lat, lon, acc, source) {
    loc = { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6, acc: acc == null || !isFinite(acc) ? null : Math.round(acc * 10) / 10, source: source };
    $("fo-loc-text").textContent = O.fmtCoord(loc.lat, loc.lon, loc.acc);
    $("fo-loc-src").textContent = "(" + O.LABELS.source[source] + ")";
    msg("fo-loc-msg", "");
    drawPin();
    saveDraftSoon();
  }
  function clearLoc() {
    loc = null;
    $("fo-loc-text").textContent = "No location yet.";
    $("fo-loc-src").textContent = "";
    if (pin && map) { map.removeLayer(pin); pin = null; }
    saveDraftSoon();
  }
  function drawPin() {
    if (!map || !window.L) return;
    var ll = window.L.latLng(loc.lat, loc.lon);
    if (!pin) {
      pin = window.L.marker(ll, { draggable: true, keyboard: true, title: "Observation location", zIndexOffset: 2000,
        icon: window.L.divIcon({ className: "fw-pin", iconSize: [28, 40], iconAnchor: [14, 39],
          html: '<svg width="28" height="40" viewBox="0 0 28 40" aria-hidden="true"><path d="M14 1C7 1 1.5 6.4 1.5 13.3 1.5 22.5 14 39 14 39s12.5-16.5 12.5-25.7C26.5 6.4 21 1 14 1z" fill="#c76b1e" stroke="#fff" stroke-width="2"/><circle cx="14" cy="13.5" r="4.5" fill="#fff"/></svg>' }) }).addTo(map);
      pin.on("dragend", function () { var p = pin.getLatLng(); trySetLoc(p.lat, p.lng, null, "map"); });
    } else pin.setLatLng(ll);
    if (!map.getBounds().pad(-0.1).contains(ll)) map.setView(ll, Math.max(map.getZoom(), 15));
  }
  function trySetLoc(lat, lon, acc, source) {
    if (!isFinite(lat) || !isFinite(lon) || !inBounds(lat, lon)) {
      msg("fo-loc-msg", "That point is outside the Kentucky area this form accepts (latitude 36–40 °N, longitude 81–90 °W).", true);
      if (loc) drawPin(); else if (pin && map) { map.removeLayer(pin); pin = null; }
      return false;
    }
    setLoc(lat, lon, acc, source);
    return true;
  }
  $("fo-loc-photo").addEventListener("click", function () {
    var p = photos.filter(function (x) { return x.meta.lat != null && inBounds(x.meta.lat, x.meta.lon); })[0];
    if (p) setLoc(p.meta.lat, p.meta.lon, p.meta.acc, "photo");
  });
  $("fo-loc-device").addEventListener("click", function () {
    if (!navigator.geolocation) { msg("fo-loc-msg", "This browser cannot share its location. Tap the map instead.", true); return; }
    msg("fo-loc-msg", "Finding your location… (allow location access if your phone asks)");
    navigator.geolocation.getCurrentPosition(function (pos) {
      if (trySetLoc(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, "device") && pos.coords.accuracy > 100) {
        msg("fo-loc-msg", "Location found, but only to about " + Math.round(pos.coords.accuracy) + " m. Drag the pin if you know the exact spot.");
      }
    }, function (err) {
      msg("fo-loc-msg", err.code === 1 ? "Location permission was denied. Allow it in your browser's site settings, or tap the map." : "Your location could not be found. Try again outside, or tap the map.", true);
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
  $("fo-loc-clear").addEventListener("click", function () { clearLoc(); msg("fo-loc-msg", "Location cleared."); });
  function num(v) {
    var t = String(v == null ? "" : v).trim().replace(",", ".");
    if (t === "") return null;
    if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
    return Number(t);
  }
  $("fo-loc-typed").addEventListener("click", function () {
    var lat = num($("fo-lat").value), lon = num($("fo-lon").value);
    if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) { msg("fo-loc-msg", "Enter both latitude and longitude as decimal degrees (e.g., 37.06 and -84.62).", true); return; }
    if (lon > 0 && inBounds(lat, -lon)) lon = -lon; // west longitudes are negative; accept 84.62 as -84.62
    if (trySetLoc(lat, lon, null, "manual")) msg("fo-loc-msg", "Coordinates set.");
  });
  var mapEl = $("fo-map");
  if (mapEl) mapEl.addEventListener("fw:mapready", function (e) {
    map = e.detail.map;
    map.on("click", function (ev) { trySetLoc(ev.latlng.lat, ev.latlng.lng, null, "map"); });
    if (loc) drawPin();
  });

  // ------------------------------------------------------------ site
  $("fo-site").addEventListener("change", function () { $("fo-site-other-wrap").hidden = this.value !== "other"; });

  // ------------------------------------------------------------ collect + validate
  function val(id) { return $(id).value.trim(); }
  function collect() {
    var errors = [];
    var need = function (cond, id, text) { if (!cond) errors.push({ id: id, text: text }); };
    var numberField = function (id, label, min, max) {
      var v = num($(id).value);
      if (v === null) return null;
      if (isNaN(v)) { errors.push({ id: id, text: label + ": use digits and a decimal point only." }); return null; }
      if (v < min || v > max) { errors.push({ id: id, text: label + " must be between " + min + " and " + max + "." }); return null; }
      return v;
    };
    var site = $("fo-site").value;
    need(site, "fo-site", "Choose a site.");
    if (site === "other") need(val("fo-site-other"), "fo-site-other", "Name the other site.");
    var whenV = $("fo-when").value, when = whenV ? new Date(whenV) : null;
    need(when && !isNaN(when), "fo-when", "Enter the date and time you observed.");
    if (when && !isNaN(when)) {
      need(when.getTime() <= Date.now() + 864e5, "fo-when", "The date and time cannot be in the future.");
      need(when.getTime() >= Date.now() - 400 * 864e5, "fo-when", "The date must be within the last 400 days.");
    }
    var air = numberField("fo-air", "Air temperature", -30, 50);
    var depth = numberField("fo-depth", "Water depth", 0, 1000);
    var canopy = numberField("fo-canopy", "Canopy cover", 0, 100);
    var measurements = [];
    Array.prototype.forEach.call(document.querySelectorAll(".fw-measure"), function (fs) {
      var p = O.PARAMS.filter(function (x) { return x.id === fs.getAttribute("data-param"); })[0];
      var vIn = fs.querySelector('[data-m="value"]'), bdl = fs.querySelector('[data-m="bdl"]').checked;
      var v = numberField(vIn.id, p.label, p.min, p.max);
      if (v === null && !bdl) return;
      measurements.push({ parameter: p.id, value: v, unit: p.unit, method: fs.querySelector('[data-m="method"]').value.trim(), below_detection: bdl });
    });
    var observers = [];
    Array.prototype.forEach.call(document.querySelectorAll(".fw-observer"), function (row) {
      var name = row.querySelector('[data-obs="name"]').value.trim();
      if (name) observers.push({ name: name, public: row.querySelector('[data-obs="public"]').checked });
    });
    need(observers.length, "fo-obs-1", "Enter at least one observer's name.");
    need(val("fo-code"), "fo-code", "Enter the class code.");
    need($("fo-ok-own").checked, "fo-ok-own", "Confirm the entry and photos are your own.");
    if (photos.length) need($("fo-ok-faces").checked, "fo-ok-faces", "Confirm that no faces, license plates or homes can be recognized.");
    need($("fo-ok-publish").checked, "fo-ok-publish", "Confirm you understand the review and publication rules.");
    var substrate = Array.prototype.map.call(document.querySelectorAll('input[name="substrate"]:checked'), function (x) { return x.value; });
    var bio = document.querySelector('input[name="visible_biofilm"]:checked');
    var entry = {
      client_id: clientId, site_id: site, site_other: site === "other" ? val("fo-site-other") : "", station: val("fo-station"),
      observed_at: when && !isNaN(when) ? when.toISOString() : null, observed_at_source: whenSource,
      latitude: loc ? loc.lat : null, longitude: loc ? loc.lon : null, gps_accuracy_m: loc ? loc.acc : null, location_source: loc ? loc.source : "none",
      weather: val("fo-weather"), air_temperature_c: air, rain_note: val("fo-rain"),
      measurements: measurements, water_depth_cm: depth,
      flow_observation: $("fo-flow").value, canopy_cover_pct: canopy, canopy_method: val("fo-canopy-method"),
      substrate: substrate, visible_biofilm: bio ? bio.value : "",
      suspected_organisms: val("fo-organisms"), notes: val("fo-notes"), observers: observers
    };
    return { entry: entry, errors: errors };
  }
  function showErrors(errors, intro) {
    var box = $("fo-errors");
    if (!errors.length) { box.hidden = true; box.innerHTML = ""; return; }
    box.innerHTML = "<p><strong>" + esc(intro || "Please fix these before sending:") + "</strong></p><ul>" +
      errors.map(function (e) { return e.id ? '<li><a href="#' + e.id + '">' + esc(e.text) + "</a></li>" : "<li>" + esc(e.text) + "</li>"; }).join("") + "</ul>";
    box.hidden = false;
    box.focus();
  }
  $("fo-errors").addEventListener("click", function (e) {
    var a = e.target.closest("a[href^='#']");
    if (!a) return;
    e.preventDefault();
    var t = $(a.getAttribute("href").slice(1));
    if (!t) return;
    var d = t.closest("details");
    if (d) d.open = true;
    t.focus(); t.scrollIntoView({ block: "center" });
  });

  // ------------------------------------------------------------ send
  function b64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(",")[1]); };
      r.onerror = function () { reject(r.error); };
      r.readAsDataURL(blob);
    });
  }
  function progress(label, pct) {
    $("fo-progress-wrap").hidden = false;
    $("fo-progress-label").textContent = label;
    $("fo-progress").value = pct;
  }
  function lockForm(lock) {
    Array.prototype.forEach.call(form.querySelectorAll("input, select, textarea, button"), function (el) {
      if (el.id === "fo-send") return;
      if (lock) { if (!el.disabled) { el.disabled = true; el.setAttribute("data-locked", ""); } }
      else if (el.hasAttribute("data-locked")) { el.disabled = false; el.removeAttribute("data-locked"); }
    });
    if (!lock) renderPhotos();
  }
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy) return;
    if (pending) { uploadPhotos(); return; }
    var c = collect();
    if (c.errors.length) { showErrors(c.errors); return; }
    if (!O.live()) {
      showErrors([{ text: "Uploads are not open yet, so nothing was sent. Your entry is saved on this device." }], "Everything needed is filled in.");
      $("fo-errors").classList.add("is-ok");
      return;
    }
    $("fo-errors").classList.remove("is-ok");
    showErrors([]);
    busy = true; $("fo-send").disabled = true;
    progress("Sending the entry…", 5);
    O.rpc("fw_submit", { p_code: val("fo-code"), p_entry: c.entry }).then(function (r) {
      if (r.ok) {
        pending = { id: r.submission_id, token: r.upload_token, receipt: r.receipt, sent: 0, skipped: [] };
        lockForm(true);
        return uploadPhotos(true);
      }
      busy = false; $("fo-send").disabled = false; $("fo-progress-wrap").hidden = true;
      if (r.error === "already_submitted") { finished(r.receipt, "This entry had already been received, so it was not sent twice."); return; }
      var field = { bad_code: "fo-code", bad_time: "fo-when", no_observer: "fo-obs-1", bad_location: "fo-loc-device" }[r.error];
      showErrors([{ id: field, text: O.errorText(r) }], "The entry was not sent.");
    });
  });
  function uploadPhotos(continuing) {
    busy = true; $("fo-send").disabled = true;
    var total = photos.length;
    var step = function () {
      if (pending.sent >= total) return finish();
      var i = pending.sent, p = photos[i];
      progress("Uploading photo " + (i + 1) + " of " + total + "…", 10 + Math.round(85 * i / Math.max(total, 1)));
      return Promise.all([b64(p.blob), b64(p.thumb)]).then(function (data) {
        return O.rpc("fw_add_photo", { p_submission_id: pending.id, p_token: pending.token, p_photo: {
          image_b64: data[0], thumb_b64: data[1], caption: p.caption,
          taken_at: p.meta.taken ? p.meta.taken.toISOString() : null,
          latitude: p.meta.lat == null ? null : p.meta.lat, longitude: p.meta.lon == null ? null : p.meta.lon,
          gps_accuracy_m: p.meta.acc == null ? null : p.meta.acc, camera: p.meta.camera || null, width: p.w, height: p.h } });
      }).then(function (r) {
        if (r.ok) { pending.sent++; return step(); }
        if (r.error === "storage_full" || r.error === "too_many_photos" || r.error === "image_too_large" || r.error === "bad_image") {
          pending.skipped.push("Photo " + (i + 1) + ": " + O.errorText(r)); pending.sent++; return step();
        }
        if (r.error === "bad_token") { return finished(pending.receipt, O.errorText(r)); }
        busy = false; $("fo-send").disabled = false;
        $("fo-send").textContent = "Finish sending";
        showErrors([{ text: O.errorText(r) + " Tap “Finish sending” to continue from photo " + (i + 1) + "." }],
          "Your entry was received (receipt " + pending.receipt + "), but " + (total - i) + " photo" + (total - i === 1 ? "" : "s") + " did not upload yet.");
      });
    };
    if (!continuing) showErrors([]);
    return step();
  }
  function finish() {
    progress("Finishing…", 97);
    return O.rpc("fw_finish", { p_submission_id: pending.id, p_token: pending.token }).then(function (r) {
      if (!r.ok && r.error !== "bad_token") {
        busy = false; $("fo-send").disabled = false; $("fo-send").textContent = "Finish sending";
        showErrors([{ text: O.errorText(r) }], "Almost done — the last step did not go through (receipt " + pending.receipt + ").");
        return;
      }
      var n = r.ok ? r.photos : pending.sent - pending.skipped.length;
      finished(pending.receipt, (n === 1 ? "1 photo" : n + " photos") + " attached." + (pending.skipped.length ? " Not attached — " + pending.skipped.join(" ") : ""));
    });
  }
  function finished(receipt, detail) {
    busy = false;
    $("fo-receipt").textContent = receipt || "";
    $("fo-done-detail").textContent = detail || "";
    form.hidden = true;
    $("fo-done").hidden = false;
    $("fo-done").focus();
    $("fo-done").scrollIntoView({ block: "start" });
    try {
      localStorage.removeItem(DRAFT_KEY);
      var list = JSON.parse(localStorage.getItem("fw-obs-receipts") || "[]");
      list.unshift({ receipt: receipt, at: new Date().toISOString() });
      localStorage.setItem("fw-obs-receipts", JSON.stringify(list.slice(0, 20)));
    } catch (e) { /* storage blocked */ }
  }
  function resetAll() {
    photos.forEach(function (p) { URL.revokeObjectURL(p.url); });
    photos = []; pending = null; clientId = uuid();
    var code = $("fo-code").value;
    form.reset();
    $("fo-code").value = code;
    lockForm(false);
    $("fo-site-other-wrap").hidden = true;
    $("fo-measure-details").open = false;
    clearLoc(); renderPhotos();
    setWhen(new Date(), "device", "Set to now. Change it if you are entering an earlier visit.");
    ["fo-photo-msg", "fo-loc-msg"].forEach(function (id) { msg(id, ""); });
    showErrors([]);
    $("fo-progress-wrap").hidden = true;
    $("fo-send").disabled = false;
    $("fo-send").textContent = O.live() ? "Send for review" : "Check my entry";
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
  }
  $("fo-another").addEventListener("click", function () {
    resetAll();
    $("fo-done").hidden = true; form.hidden = false;
    document.querySelector("main h1").scrollIntoView();
    $("fo-camera").focus();
  });
  $("fo-reset").addEventListener("click", function () {
    if (busy) return;
    if (window.confirm("Clear everything in this form, including attached photos?")) { resetAll(); $("fo-draft-msg").textContent = "Form cleared."; }
  });

  // ------------------------------------------------------------ draft (text only; photos are not stored)
  var draftTimer = null;
  function saveDraftSoon() { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 600); }
  function saveDraft() {
    if (pending) return;
    var fields = {};
    Array.prototype.forEach.call(form.querySelectorAll("input[id], select[id], textarea[id]"), function (el) {
      if (el.type === "file" || el.id === "fo-code" || el.hasAttribute("data-caption")) return;
      fields[el.id] = (el.type === "checkbox" || el.type === "radio") ? el.checked : el.value;
    });
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ saved: new Date().toISOString(), client_id: clientId, when_source: whenSource, loc: loc, observers: observerCount, fields: fields }));
      $("fo-draft-msg").textContent = "Draft saved on this device" + (photos.length ? " (photos are not saved in drafts)." : ".");
    } catch (e) { /* storage full or blocked */ }
  }
  function restoreDraft() {
    var d;
    try { d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch (e) { d = null; }
    if (!d || !d.fields) return false;
    while (observerCount < Math.min(8, d.observers || 0)) addObserver();
    Object.keys(d.fields).forEach(function (id) {
      var el = $(id);
      if (!el || el.type === "file") return;
      if (el.type === "checkbox" || el.type === "radio") el.checked = !!d.fields[id]; else el.value = d.fields[id];
    });
    if (d.client_id) clientId = d.client_id;
    whenSource = d.when_source || "manual";
    $("fo-when-src").textContent = whenSource === "photo" ? "From a photo's timestamp (restored draft)." : whenSource === "device" ? "Time the draft was started." : "Entered by you.";
    $("fo-site-other-wrap").hidden = $("fo-site").value !== "other";
    $("fo-measure-details").open = Array.prototype.some.call(document.querySelectorAll(".fw-measure input"), function (el) { return el.type === "checkbox" ? el.checked : !!el.value; });
    if (d.loc && isFinite(d.loc.lat)) setLoc(d.loc.lat, d.loc.lon, d.loc.acc, d.loc.source);
    $("fo-draft-msg").textContent = "Restored your unsent draft from " + O.fmtWhen(d.saved) + ". Photos are not kept in drafts — attach them again.";
    return true;
  }
  form.addEventListener("input", function (e) { if (!e.target.hasAttribute("data-caption")) saveDraftSoon(); });
  form.addEventListener("change", saveDraftSoon);

  // ------------------------------------------------------------ start
  if (!restoreDraft()) setWhen(new Date(), "device", "Set to now. Change it if you are entering an earlier visit.");
  try {
    var params = new URLSearchParams(location.search);
    var code = params.get("code");
    if (code) {
      // from the class QR code: fill it in, remember it on this device, and take it out of the address bar
      $("fo-code").value = code.slice(0, 100);
      params.delete("code");
      var rest = params.toString();
      history.replaceState(null, "", location.pathname + (rest ? "?" + rest : "") + location.hash);
      localStorage.setItem("fw-obs-code", $("fo-code").value);
    } else {
      $("fo-code").value = localStorage.getItem("fw-obs-code") || "";
    }
  } catch (e) { /* old browser or storage blocked */ }
  $("fo-code").addEventListener("change", function () { try { localStorage.setItem("fw-obs-code", this.value.trim()); } catch (e) { /* ignore */ } });
  initStatus();
})();
