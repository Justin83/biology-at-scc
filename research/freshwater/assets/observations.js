/* Freshwater portal — approved field observations on public pages.
   <div data-fw-obs data-root="../" [data-site="allen-branch"] [data-limit="3"] [data-compact]>
     …static content (shown when the database is off, unreachable or has no approved entries)…
   </div>
   Only fw_public_observations / fw_public_photo are used: approved entries only, observer
   names only where the student agreed, no review notes and no per-photo GPS. */
(function () {
  "use strict";
  var O = window.FWObs;
  var boxes = document.querySelectorAll("[data-fw-obs]");
  var counts = document.querySelectorAll("[data-fw-obs-count]");
  if (!O || !O.live() || (!boxes.length && !counts.length)) return;
  var esc = O.esc, dialog = null;

  function kv(label, value) { return value === null || value === undefined || value === "" ? "" : "<dt>" + esc(label) + "</dt><dd>" + value + "</dd>"; }
  function measurements(list) {
    if (!list || !list.length) return "";
    return '<div class="fw-table-scroll" role="region" aria-label="Measurements" tabindex="0"><table class="fw-measure-table"><thead><tr><th scope="col">Measurement</th><th scope="col">Value</th><th scope="col">Method</th></tr></thead><tbody>' +
      list.map(function (m) {
        return "<tr><td>" + esc(O.paramLabel(m.parameter)) + "</td><td>" + (m.below_detection ? "below detection limit" : esc(m.value) + " " + esc(m.unit)) + "</td><td>" + esc(m.method || "not recorded") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }
  function photos(o, max) {
    var ps = (o.photos || []).slice(0, max || 99);
    if (!ps.length) return "";
    return '<ul class="fw-obs-photos" aria-label="Photos">' + ps.map(function (p, i) {
      var label = "Photo " + (i + 1) + (p.caption ? ": " + p.caption : "");
      return '<li><button type="button" data-photo="' + esc(p.id) + '" data-cap="' + esc(p.caption || "") + '" aria-label="' + esc("Enlarge " + label) + '">' +
        '<img data-thumb="' + esc(p.id) + '" alt="' + esc(label) + '" width="' + (p.width || 4) + '" height="' + (p.height || 3) + '"></button>' +
        (p.caption ? '<p class="fw-cap">' + esc(p.caption) + "</p>" : "") + "</li>";
    }).join("") + "</ul>";
  }
  function card(o, root, compact, isHere, level) {
    var h = "h" + level;
    var title = esc(O.siteName(o.site_id, o.site_other)) + (o.station ? " · " + esc(o.station) : "");
    var names = (o.observers || []).join(", ");
    var link = isHere ? "" : '<p><a href="' + root + "observations/#obs-" + esc(o.receipt) + '">Full record ' + esc(o.receipt) + "</a></p>";
    if (compact) {
      var bits = (o.measurements || []).slice(0, 3).map(function (m) { return esc(O.paramLabel(m.parameter)) + " " + (m.below_detection ? "below detection" : esc(m.value) + " " + esc(m.unit)); });
      return '<article class="fw-obs"><' + h + ">" + title + "</" + h + '><p class="fw-muted">' + esc(O.fmtWhen(o.observed_at)) + (o.weather ? " · " + esc(o.weather) : "") + "</p>" +
        (bits.length ? "<p>" + bits.join(" · ") + "</p>" : "") + photos(o, 3) + link + "</article>";
    }
    return '<article class="fw-card fw-obs" id="obs-' + esc(o.receipt) + '"><' + h + ">" + title + "</" + h + ">" +
      '<p class="fw-muted">' + esc(O.fmtWhen(o.observed_at)) + " · record " + esc(o.receipt) + " · faculty-reviewed</p>" +
      '<dl class="fw-kv">' +
      kv("Location", o.latitude != null ? esc(O.fmtCoord(o.latitude, o.longitude, o.gps_accuracy_m)) : "") +
      kv("Observers", names ? esc(names) : "SCC Biology students") +
      kv("Weather", esc(o.weather)) +
      kv("Air temperature", o.air_temperature_c != null ? esc(o.air_temperature_c) + " °C" : "") +
      kv("Recent rain", esc(o.rain_note)) +
      kv("Flow", esc(O.LABELS.flow[o.flow_observation] || o.flow_observation)) +
      kv("Water depth", o.water_depth_cm != null ? esc(o.water_depth_cm) + " cm" : "") +
      kv("Canopy cover", o.canopy_cover_pct != null ? esc(o.canopy_cover_pct) + " %" + (o.canopy_method ? " (" + esc(o.canopy_method) + ")" : "") : "") +
      kv("Stream bed", (o.substrate || []).map(function (x) { return esc(O.LABELS.substrate[x] || x); }).join(", ")) +
      kv("Visible biofilm", esc(O.LABELS.biofilm[o.visible_biofilm] || o.visible_biofilm)) +
      kv("Suspected organisms", o.suspected_organisms ? esc(o.suspected_organisms) + ' <span class="fw-muted">(provisional field identification)</span>' : "") +
      kv("Notes", esc(o.notes)) + "</dl>" + measurements(o.measurements) + photos(o) + "</article>";
  }
  function loadThumbs(scope) {
    var imgs = scope.querySelectorAll("img[data-thumb]");
    var load = function (img) {
      if (img.src) return;
      O.photoUrl(img.getAttribute("data-thumb"), "thumb").then(function (src) { img.src = src; }, function () { img.alt += " (unavailable)"; });
    };
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); load(e.target); } });
      }, { rootMargin: "300px" });
      Array.prototype.forEach.call(imgs, function (img) { io.observe(img); });
    } else Array.prototype.forEach.call(imgs, load);
  }
  function showFull(id, caption, opener) {
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.className = "fw-photo-dialog";
      dialog.setAttribute("aria-label", "Enlarged photo");
      dialog.innerHTML = '<form method="dialog"><button class="fw-btn fw-btn--ghost fw-btn--small">Close</button></form><img alt=""><p></p>';
      document.body.appendChild(dialog);
    }
    var img = dialog.querySelector("img");
    img.removeAttribute("src"); img.alt = caption || "Field photo";
    dialog.querySelector("p").textContent = caption ? caption + " — SCC Biology students, faculty-reviewed" : "SCC Biology students, faculty-reviewed";
    dialog.onclose = function () { if (opener) opener.focus(); };
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "");
    O.photoUrl(id, "full").then(function (src) { img.src = src; }, function () { dialog.querySelector("p").textContent = "The photo could not be loaded."; });
  }

  O.publicObservations().then(function (r) {
    if (!r.ok) return; // keep the static content
    var all = r.observations || [];
    Array.prototype.forEach.call(counts, function (el) { el.textContent = all.length; });
    Array.prototype.forEach.call(boxes, function (box) {
      var site = box.getAttribute("data-site"), limit = +box.getAttribute("data-limit") || 0;
      var list = all.filter(function (o) { return !site || o.site_id === site; });
      if (limit) list = list.slice(0, limit);
      if (!list.length) return;
      var root = box.getAttribute("data-root") || "./";
      var compact = box.hasAttribute("data-compact");
      var isHere = /\/observations\/?(index\.html)?$/.test(location.pathname);
      var level = +box.getAttribute("data-heading") || 3;
      box.innerHTML = '<div class="fw-obs-list">' + list.map(function (o) { return card(o, root, compact, isHere, level); }).join("") + "</div>";
      loadThumbs(box);
      box.addEventListener("click", function (e) {
        var b = e.target.closest("[data-photo]");
        if (b) showFull(b.getAttribute("data-photo"), b.getAttribute("data-cap"), b);
      });
    });
    if (location.hash && /^#obs-/.test(location.hash)) {
      var t = document.getElementById(location.hash.slice(1));
      if (t) t.scrollIntoView();
    }
  });
})();
