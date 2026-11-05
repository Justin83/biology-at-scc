/* Freshwater portal — faculty review page (observations/review/).
   Every call goes through public.fw_instructor(key, action, payload), which checks the
   instructor key in the database. The key is held in sessionStorage for this tab only. */
(function () {
  "use strict";
  var O = window.FWObs;
  if (!O || !document.getElementById("rv-app")) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = O.esc;
  var KEY_STORE = "fw-ikey";
  var key = null, summary = null, current = null, dialog = null;

  function setStatus(kind, title, text) {
    var el = $("rv-status");
    if (!title) { el.hidden = true; return; }
    el.hidden = false;
    el.className = "fw-callout " + (kind === "ok" ? "fw-callout--kentucky" : kind === "info" ? "fw-callout--local" : "fw-callout--caution");
    el.innerHTML = '<span class="fw-callout-title">' + esc(title) + "</span><p>" + esc(text) + "</p>";
  }
  function msg(id, text, isError) { var el = $(id); el.textContent = text || ""; el.classList.toggle("is-error", !!isError); }
  function call(action, payload) { return O.rpc("fw_instructor", { p_key: key, p_action: action, p_payload: payload || {} }); }
  function kb(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.round(n / 1024) + " KB"; }
  function gmaps(lat, lon) {
    return '<a href="https://www.google.com/maps/search/?api=1&amp;query=' + Number(lat).toFixed(6) + "," + Number(lon).toFixed(6) + '" target="_blank" rel="noopener">' +
      esc(O.fmtCoord(lat, lon)) + '<span class="visually-hidden"> (opens Google Maps in a new tab)</span></a>';
  }

  // ------------------------------------------------------------ sign in / out
  function signedIn(on) {
    $("rv-signin").hidden = on;
    $("rv-app").hidden = !on;
    if (!on) { $("rv-detail").hidden = true; $("rv-list").innerHTML = ""; }
  }
  function signIn(k, quiet) {
    key = k;
    if (!quiet) msg("rv-signin-msg", "Checking…");
    return call("summary").then(function (r) {
      if (!r.ok) {
        key = null;
        try { sessionStorage.removeItem(KEY_STORE); } catch (e) { /* ignore */ }
        signedIn(false);
        msg("rv-signin-msg", O.errorText(r), true);
        return;
      }
      try { sessionStorage.setItem(KEY_STORE, k); } catch (e) { /* ignore */ }
      msg("rv-signin-msg", "");
      $("rv-key").value = "";
      signedIn(true);
      showSummary(r);
      loadList();
    });
  }
  $("rv-signin-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var k = $("rv-key").value;
    if (!k) { msg("rv-signin-msg", "Enter the instructor key.", true); return; }
    signIn(k);
  });
  $("rv-signout").addEventListener("click", function () {
    key = null;
    try { sessionStorage.removeItem(KEY_STORE); } catch (e) { /* ignore */ }
    signedIn(false);
    $("rv-key").focus();
  });

  // ------------------------------------------------------------ overview
  function refreshSummary() { return call("summary").then(function (r) { if (r.ok) showSummary(r); }); }
  function showSummary(r) {
    summary = r;
    $("rv-open-text").innerHTML = r.open && r.has_upload_code
      ? "<strong>Submissions are open.</strong> Students with the class code can send entries."
      : r.open ? "<strong>Open, but no class code is set</strong> — students cannot send until you save one."
      : "<strong>Submissions are closed.</strong> The form shows students that it is closed.";
    $("rv-toggle-open").textContent = r.open ? "Close submissions" : "Open submissions";
    var c = r.counts || {};
    $("rv-counts").innerHTML = ["submitted", "changes_requested", "approved", "rejected", "archived", "uploading"].map(function (s) {
      return "<dt>" + esc(O.LABELS.status[s]) + "</dt><dd>" + (c[s] || 0) + "</dd>";
    }).join("");
    var used = r.photo_bytes_used || 0, quota = r.photo_quota_bytes || 1;
    $("rv-storage").value = Math.min(1, used / quota);
    $("rv-storage-text").textContent = kb(used) + " of " + kb(quota) + " (" + Math.round(100 * used / quota) + "%)";
  }
  $("rv-toggle-open").addEventListener("click", function () {
    var want = !(summary && summary.open);
    call("set_open", { open: want }).then(function (r) {
      if (!r.ok) { setStatus("caution", "Could not change the form", O.errorText(r)); return; }
      refreshSummary();
    });
  });
  $("rv-export").addEventListener("click", function () {
    call("export").then(function (r) {
      if (!r.ok) { setStatus("caution", "Export failed", O.errorText(r)); return; }
      var blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), submissions: r.submissions }, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "field-observations-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    });
  });

  // ------------------------------------------------------------ class code + QR
  function qrSvg(text, title) {
    var qr = window.qrcode(0, "M");
    qr.addData(text); qr.make();
    var n = qr.getModuleCount(), m = 4, size = n + 2 * m, d = "";
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (!qr.isDark(r, c)) continue;
        var w = 1;
        while (c + w < n && qr.isDark(r, c + w)) w++;
        d += "M" + (c + m) + " " + (r + m) + "h" + w + "v1h-" + w + "z";
        c += w - 1;
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + " " + size + '" shape-rendering="crispEdges" role="img" aria-label="' + esc(title) + '"><rect width="' + size + '" height="' + size + '" fill="#fff"/><path fill="#000" d="' + d + '"/></svg>';
  }
  function showQr(code) {
    if (!window.qrcode) { msg("rv-code-msg", "The QR library did not load. Reload the page.", true); return; }
    var url = O.config.submitUrl + "?code=" + encodeURIComponent(code);
    $("rv-qr").innerHTML = qrSvg(url, "QR code that opens the observation form with the class code filled in");
    $("rv-qr-code").textContent = "Class code: " + code;
    $("rv-qr-url").textContent = url;
    $("rv-qr-print").hidden = false;
    $("rv-qr-print").scrollIntoView({ block: "start" });
  }
  function codeValue() {
    var c = $("rv-code").value.trim();
    if (c.length < 6) { msg("rv-code-msg", "Use at least 6 characters.", true); $("rv-code").focus(); return null; }
    return c;
  }
  $("rv-code-save").addEventListener("click", function () {
    var c = codeValue();
    if (!c) return;
    call("set_upload_code", { code: c }).then(function (r) {
      if (!r.ok) { msg("rv-code-msg", O.errorText(r), true); return; }
      msg("rv-code-msg", "Saved. Students now need this code; the old one no longer works.");
      refreshSummary();
      showQr(c);
    });
  });
  $("rv-code-qr").addEventListener("click", function () { var c = codeValue(); if (c) { msg("rv-code-msg", "QR made (the saved code was not changed)."); showQr(c); } });
  $("rv-qr-printbtn").addEventListener("click", function () {
    document.body.classList.add("fw-printing-qr");
    window.print();
    setTimeout(function () { document.body.classList.remove("fw-printing-qr"); }, 500);
  });
  $("rv-qr-hide").addEventListener("click", function () { $("rv-qr-print").hidden = true; $("rv-code").focus(); });

  // ------------------------------------------------------------ list
  function chip(status) { return '<span class="fw-status-chip fw-status-chip--' + esc(status) + '">' + esc(O.LABELS.status[status] || status) + "</span>"; }
  function loadList() {
    var status = $("rv-filter").value;
    msg("rv-list-msg", "Loading…");
    return call("list", { status: status }).then(function (r) {
      if (!r.ok) { msg("rv-list-msg", O.errorText(r), true); return; }
      var subs = r.submissions || [];
      msg("rv-list-msg", subs.length ? subs.length + (subs.length === 1 ? " entry." : " entries.") : "No entries here.");
      $("rv-list").innerHTML = subs.map(function (s) {
        var names = (s.observers || []).map(function (o) { return o.name; }).join(", ");
        return '<li class="fw-review-item" data-id="' + esc(s.id) + '"' + (current && current.id === s.id ? ' aria-current="true"' : "") + ">" +
          "<div><p><strong>" + esc(s.receipt) + "</strong> · " + esc(O.siteName(s.site_id, s.site_other)) + (s.station ? " · " + esc(s.station) : "") + "</p>" +
          '<p class="fw-muted">' + esc(O.fmtWhen(s.observed_at)) + " · " + esc(names) + " · " + s.photo_count + (s.photo_count === 1 ? " photo" : " photos") + "</p></div>" +
          "<div>" + chip(s.status) + ' <button type="button" class="fw-btn fw-btn--ghost fw-btn--small" data-open="' + esc(s.id) + '">Open<span class="visually-hidden"> ' + esc(s.receipt) + "</span></button></div></li>";
      }).join("");
    });
  }
  $("rv-filter").addEventListener("change", loadList);
  $("rv-refresh").addEventListener("click", function () { loadList(); refreshSummary(); });
  $("rv-list").addEventListener("click", function (e) {
    var b = e.target.closest("[data-open]");
    if (b) openEntry(b.getAttribute("data-open"), true);
  });

  // ------------------------------------------------------------ detail
  function row(label, value) { return value === null || value === undefined || value === "" ? "" : "<dt>" + esc(label) + "</dt><dd>" + value + "</dd>"; }
  function openEntry(id, focus) {
    return call("get", { id: id }).then(function (r) {
      if (!r.ok) { msg("rv-list-msg", O.errorText(r), true); return; }
      var s = r.submission;
      current = s;
      Array.prototype.forEach.call(document.querySelectorAll(".fw-review-item"), function (li) {
        if (li.getAttribute("data-id") === s.id) li.setAttribute("aria-current", "true"); else li.removeAttribute("aria-current");
      });
      $("rv-detail-title").textContent = "Entry " + s.receipt;
      var obs = (s.observers || []).map(function (o) { return esc(o.name) + (o.public ? " (name may be shown)" : " (name private)"); }).join("; ");
      var meas = (s.measurements || []).length ? '<table class="fw-measure-table"><caption class="visually-hidden">Measurements</caption><thead><tr><th scope="col">Parameter</th><th scope="col">Value</th><th scope="col">Method</th></tr></thead><tbody>' +
        s.measurements.map(function (m) {
          return "<tr><td>" + esc(O.paramLabel(m.parameter)) + "</td><td>" + (m.below_detection ? "below detection" : esc(m.value) + " " + esc(m.unit)) + "</td><td>" + esc(m.method || "—") + "</td></tr>";
        }).join("") + "</tbody></table>" : "";
      $("rv-detail-body").innerHTML =
        "<p>" + chip(s.status) + " Received " + esc(O.fmtWhen(s.created_at)) + (s.reviewed_at ? " · last reviewed " + esc(O.fmtWhen(s.reviewed_at)) : "") + "</p>" +
        '<dl class="fw-kv">' +
        row("Site", esc(O.siteName(s.site_id, s.site_other)) + (s.station ? " · " + esc(s.station) : "")) +
        row("Observed", esc(O.fmtWhen(s.observed_at)) + " (" + esc(O.LABELS.source[s.observed_at_source] || s.observed_at_source) + ")") +
        row("Location", s.latitude != null ? gmaps(s.latitude, s.longitude) + (s.gps_accuracy_m != null ? " ± " + Math.round(s.gps_accuracy_m) + " m" : "") + " (" + esc(O.LABELS.source[s.location_source] || s.location_source) + ")" : "Not recorded") +
        row("Observers", obs) +
        row("Weather", esc(s.weather)) +
        row("Air temperature", s.air_temperature_c != null ? esc(s.air_temperature_c) + " °C" : "") +
        row("Recent rain", esc(s.rain_note)) +
        row("Flow", esc(O.LABELS.flow[s.flow_observation] || s.flow_observation)) +
        row("Water depth", s.water_depth_cm != null ? esc(s.water_depth_cm) + " cm" : "") +
        row("Canopy cover", s.canopy_cover_pct != null ? esc(s.canopy_cover_pct) + " %" + (s.canopy_method ? " (" + esc(s.canopy_method) + ")" : "") : "") +
        row("Stream bed", (s.substrate || []).map(function (x) { return esc(O.LABELS.substrate[x] || x); }).join(", ")) +
        row("Visible biofilm", esc(O.LABELS.biofilm[s.visible_biofilm] || s.visible_biofilm)) +
        row("Suspected organisms", esc(s.suspected_organisms)) +
        row("Notes", esc(s.notes)) +
        row("Earlier review note", esc(s.review_note)) +
        "</dl>" + meas;
      $("rv-note").value = s.review_note || "";
      $("rv-photos").innerHTML = (r.photos || []).length ? r.photos.map(function (p) {
        return "<li>" + (p.thumb_b64 ? '<img src="data:image/jpeg;base64,' + p.thumb_b64 + '" alt="' + esc("Photo " + p.position + (p.caption ? ": " + p.caption : "")) + '">' : "<p><strong>Image removed.</strong></p>") +
          "<p><strong>Photo " + p.position + "</strong>" + (p.caption ? " — " + esc(p.caption) : "") + "</p>" +
          '<p class="fw-muted">' + [p.taken_at ? "Taken " + esc(O.fmtWhen(p.taken_at)) : "No time in photo",
            p.latitude != null ? "GPS " + gmaps(p.latitude, p.longitude) : "No GPS in photo",
            p.camera ? esc(p.camera) : "", p.width ? p.width + "×" + p.height + " · " + kb(p.image_bytes) : ""].filter(Boolean).join("<br>") + "</p>" +
          (p.status !== "removed" ? '<div class="fw-form-actions"><button type="button" class="fw-btn fw-btn--ghost fw-btn--small" data-full="' + esc(p.id) + '" data-cap="' + esc(p.caption || "") + '">Full size<span class="visually-hidden"> photo ' + p.position + "</span></button>" +
            '<button type="button" class="fw-btn fw-btn--danger fw-btn--small" data-remove-photo="' + esc(p.id) + '">Remove<span class="visually-hidden"> photo ' + p.position + "</span></button></div>" : "") + "</li>";
      }).join("") : "<li>No photos.</li>";
      if (focus) msg("rv-review-msg", ""); // a refresh after an action keeps that action's message
      $("rv-detail").hidden = false;
      if (focus) { $("rv-detail").focus(); $("rv-detail").scrollIntoView({ block: "start" }); }
    });
  }
  $("rv-detail-close").addEventListener("click", function () {
    $("rv-detail").hidden = true;
    var b = current && document.querySelector('[data-open="' + current.id + '"]');
    current = null;
    if (b) b.focus();
  });
  $("rv-photos").addEventListener("click", function (e) {
    var full = e.target.closest("[data-full]"), rm = e.target.closest("[data-remove-photo]");
    if (full) showFull(full.getAttribute("data-full"), full.getAttribute("data-cap"), full);
    if (rm) {
      if (!window.confirm("Remove this photo's image permanently? It cannot be recovered. The rest of the entry is kept.")) return;
      call("remove_photo", { id: rm.getAttribute("data-remove-photo") }).then(function (r) {
        msg("rv-review-msg", r.ok ? "Photo removed." : O.errorText(r), !r.ok);
        openEntry(current.id); refreshSummary();
      });
    }
  });
  function showFull(id, caption, opener) {
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.className = "fw-photo-dialog";
      dialog.setAttribute("aria-label", "Full-size photo");
      dialog.innerHTML = '<form method="dialog"><button class="fw-btn fw-btn--ghost fw-btn--small">Close</button></form><img alt=""><p></p>';
      document.body.appendChild(dialog);
    }
    var img = dialog.querySelector("img");
    img.removeAttribute("src"); img.alt = caption || "Field photo";
    dialog.querySelector("p").textContent = caption || "";
    dialog.onclose = function () { if (opener) opener.focus(); };
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "");
    O.photoUrl(id, "full", key).then(function (src) { img.src = src; }, function () { dialog.querySelector("p").textContent = "The photo could not be loaded."; });
  }
  Array.prototype.forEach.call(document.querySelectorAll("[data-review]"), function (b) {
    b.addEventListener("click", function () {
      if (!current) return;
      var status = b.getAttribute("data-review");
      if (status === "approved" && !window.confirm("Approve " + current.receipt + "? Its data, approved photos and consented names become public on the website.")) return;
      call("review", { id: current.id, status: status, note: $("rv-note").value.trim() }).then(function (r) {
        if (!r.ok) { msg("rv-review-msg", O.errorText(r), true); return; }
        msg("rv-review-msg", current.receipt + ": " + O.LABELS.status[status] + ".");
        openEntry(current.id); loadList(); refreshSummary();
      });
    });
  });

  // ------------------------------------------------------------ change key
  $("rv-newkey-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var k = $("rv-newkey").value;
    if (k.length < 12) { msg("rv-newkey-msg", "Use at least 12 characters.", true); return; }
    call("set_instructor_key", { new_key: k }).then(function (r) {
      if (!r.ok) { msg("rv-newkey-msg", O.errorText(r), true); return; }
      key = k;
      try { sessionStorage.setItem(KEY_STORE, k); } catch (err) { /* ignore */ }
      $("rv-newkey").value = "";
      msg("rv-newkey-msg", "Instructor key changed. Use the new key from now on.");
    });
  });

  // ------------------------------------------------------------ start
  if (!O.live()) {
    setStatus("caution", "The observation database is not switched on yet",
      "Review tools work after the database for student observations has been set up and online submission is turned on. Until then, students can only practice with the form.");
    return;
  }
  setStatus(O.isLocal() ? "info" : null, O.isLocal() ? "Local test database" : "", O.isLocal() ? "This page is connected to tools/freshwater-portal/local-api.mjs, not the real database." : "");
  $("rv-signin").hidden = false;
  var saved = null;
  try { saved = sessionStorage.getItem(KEY_STORE); } catch (e) { /* ignore */ }
  if (saved) signIn(saved, true);
})();
