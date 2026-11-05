/* Freshwater portal — interactive map (Leaflet 1.9.4, vendored).
   Markup:
     <div class="fw-map" data-fw-map="full|mini" data-root="../" data-panel="layer-panel-id"
          data-layers="id,id"   (mini only: which layers to show)
          aria-label="..."></div>
   Layer definitions and provenance come from data/map-layers.json; nothing here
   invents coordinates — the only local geometries are the extracts in data/geo/. */
(function () {
  "use strict";
  if (!window.L) return;
  var L = window.L;

  /* ArcGIS MapServer "export" as one image per view (dynamic services). One image avoids
     labels repeating on every tile and keeps requests to one per pan/zoom. */
  var ArcGISDynamic = L.Layer.extend({
    initialize: function (url, opts) { this._svc = url.replace(/\/$/, ""); L.setOptions(this, opts); },
    onAdd: function (map) { this._map = map; map.on("moveend", this._update, this); this._update(); },
    onRemove: function (map) {
      map.off("moveend", this._update, this);
      if (this._img) map.removeLayer(this._img);
      if (this._next) map.removeLayer(this._next);
      this._img = this._next = null;
    },
    getAttribution: function () { return this.options.attribution; },
    setZIndex: function (z) { this.options.zIndex = z; return this; },
    _update: function () {
      var map = this._map; if (!map) return;
      var b = map.getBounds(), size = map.getSize();
      var sw = L.CRS.EPSG3857.project(b.getSouthWest()), ne = L.CRS.EPSG3857.project(b.getNorthEast());
      var q = "bbox=" + [sw.x, sw.y, ne.x, ne.y].map(function (v) { return v.toFixed(2); }).join(",") +
        "&bboxSR=3857&imageSR=3857&size=" + size.x + "," + size.y + "&format=png32&transparent=true&dpi=96&f=image";
      if (this.options.layersParam) q += "&layers=" + encodeURIComponent(this.options.layersParam);
      var self = this, next = L.imageOverlay(this._svc + "/export?" + q, b, { opacity: this.options.opacity, interactive: false, className: "fw-dynamic-layer", pane: "fwDynamic" });
      if (this._next) map.removeLayer(this._next);
      this._next = next;
      next.once("load", function () {
        if (self._next !== next) return;
        if (self._img) map.removeLayer(self._img);
        self._img = next; self._next = null;
      });
      next.once("error", function () { self.fire("tileerror"); if (self._next === next) { map.removeLayer(next); self._next = null; } });
      next.addTo(map);
    }
  });

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function bearing(a, b) {
    var toR = Math.PI / 180, y = Math.sin((b[0] - a[0]) * toR) * Math.cos(b[1] * toR);
    var x = Math.cos(a[1] * toR) * Math.sin(b[1] * toR) - Math.sin(a[1] * toR) * Math.cos(b[1] * toR) * Math.cos((b[0] - a[0]) * toR);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  function flowArrows(coords, every) {
    var out = [], acc = 0;
    for (var i = 1; i < coords.length; i++) {
      var a = coords[i - 1], b = coords[i];
      var d = L.latLng(a[1], a[0]).distanceTo(L.latLng(b[1], b[0]));
      acc += d;
      if (acc >= every) {
        acc = 0;
        var deg = bearing(a, b);
        out.push(L.marker([(a[1] + b[1]) / 2, (a[0] + b[0]) / 2], {
          interactive: false, keyboard: false,
          icon: L.divIcon({ className: "fw-flow-arrow", iconSize: [16, 16], iconAnchor: [8, 8],
            html: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" style="transform:rotate(' + deg.toFixed(0) + 'deg)"><path d="M8 1 L13 13 L8 10 L3 13 Z" fill="#0b5fa5" stroke="#fff" stroke-width="1.2"/></svg>' })
        }));
      }
    }
    return out;
  }

  function streamLayer(geo) {
    var group = L.featureGroup();
    L.geoJSON(geo, {
      style: function (f) {
        return f.properties.role === "study_stream"
          ? { color: "#ffffff", weight: 9, opacity: 0.9 }
          : { color: "#ffffff", weight: 6, opacity: 0.7 };
      },
      interactive: false
    }).addTo(group);
    L.geoJSON(geo, {
      style: function (f) {
        return f.properties.role === "study_stream"
          ? { color: "#0b5fa5", weight: 5, opacity: 1 }
          : { color: "#3b82c4", weight: 3, opacity: 0.95, dashArray: "8 6" };
      },
      onEachFeature: function (f, layer) {
        var p = f.properties;
        layer.bindPopup('<div class="fw-popup"><h3>' + esc(p.name) + "</h3><p>" + esc(p.fcode_description) + " · " + esc(p.length_km) +
          " km mapped</p><p>GNIS " + esc(p.gnis_id) + " · reach " + esc(p.reachcode) + "</p><p><strong>Evidence:</strong> Mapped (USGS NHD) — not field-verified" +
          (p.role === "study_stream" ? "" : "<br>Part of the mapped downstream path") + "</p></div>");
      }
    }).addTo(group);
    geo.features.forEach(function (f) {
      if (f.properties.role === "study_stream") flowArrows(f.geometry.coordinates, 350).forEach(function (m) { m.addTo(group); });
    });
    return group;
  }
  function stationLayer(geo) {
    return L.geoJSON(geo, {
      pointToLayer: function (f, ll) { return L.circleMarker(ll, { radius: 7, color: "#ffffff", weight: 2, fillColor: "#1c6e73", fillOpacity: 1 }); },
      onEachFeature: function (f, layer) {
        var p = f.properties;
        layer.bindPopup('<div class="fw-popup"><h3>' + esc(p.location_name) + "</h3><p>" + esc(p.location_id) + " · " + esc(p.location_type) + "</p><p>" + esc(p.organization_name || p.organization) +
          '</p><p>Registered in the Water Quality Portal. Not on Allen Branch.</p></div>');
      }
    });
  }
  function referenceLayer(geo) {
    return L.geoJSON(geo, {
      pointToLayer: function (f, ll) {
        return L.marker(ll, { keyboard: true, title: f.properties.name, icon: L.divIcon({ className: "", iconSize: [22, 22], iconAnchor: [11, 11],
          html: '<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><rect x="3" y="3" width="16" height="16" rx="3" fill="#13294b" stroke="#fff" stroke-width="2"/><path d="M7 15V9l4-3 4 3v6z" fill="#fff"/></svg>' }) });
      },
      onEachFeature: function (f, layer) {
        layer.bindPopup('<div class="fw-popup"><h3>Somerset Community College</h3><p>Geocoded street address: ' + esc(f.properties.matched_address) +
          "</p><p><strong>Approximate.</strong> U.S. Census address-range interpolation — not the creek access point and not a sampling station.</p></div>");
      }
    });
  }
  function observationLayer(data) {
    var recs = (data && data.records) || [];
    return L.geoJSON({ type: "FeatureCollection", features: recs.filter(function (r) { return r.latitude && r.longitude; }).map(function (r) {
      return { type: "Feature", geometry: { type: "Point", coordinates: [r.longitude, r.latitude] }, properties: r };
    }) }, {
      pointToLayer: function (f, ll) { return L.circleMarker(ll, { radius: 7, color: "#fff", weight: 2, fillColor: "#c76b1e", fillOpacity: 1 }); },
      onEachFeature: function (f, layer) { layer.bindPopup('<div class="fw-popup"><h3>Field observation</h3><p>' + esc(f.properties.observed_at) + "</p></div>"); }
    });
  }

  function makeLayer(def, root, cache) {
    var attr = esc(def.attribution || def.provider);
    switch (def.service_type) {
      case "xyz_tiles":
        return Promise.resolve(L.tileLayer(def.service_url, { maxNativeZoom: def.max_native_zoom || 18, maxZoom: 19, opacity: def.opacity == null ? 1 : def.opacity, attribution: attr, crossOrigin: false }));
      case "arcgis_export":
        return Promise.resolve(new ArcGISDynamic(def.service_url, { layersParam: def.layers_param, opacity: def.opacity == null ? 1 : def.opacity, attribution: attr }));
      case "geojson":
      case "observations":
        return fetch(root + def.service_url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (geo) {
          cache[def.id] = geo;
          var lyr = def.service_type === "observations" ? observationLayer(geo)
            : def.style === "stream" ? streamLayer(geo)
            : def.style === "stations" ? stationLayer(geo)
            : referenceLayer(geo);
          lyr.options = lyr.options || {}; lyr.options.attribution = attr;
          if (lyr.getAttribution === undefined) lyr.getAttribution = function () { return attr; };
          return lyr;
        });
    }
    return Promise.reject(new Error("unknown service type " + def.service_type));
  }

  function provenance(def) {
    return '<dl><dt>Provider</dt><dd>' + esc(def.provider) + '</dd><dt>Dataset</dt><dd>' + esc(def.dataset) + '</dd><dt>Version</dt><dd>' + esc(def.version) +
      '</dd><dt>Resolution</dt><dd>' + esc(def.resolution) + '</dd><dt>Coverage</dt><dd>' + esc(def.coverage) + '</dd><dt>Limitations</dt><dd>' + esc(def.limitations) + "</dd></dl>";
  }

  function init(el) {
    var mode = el.getAttribute("data-fw-map") || "full";
    var root = el.getAttribute("data-root") || "./";
    var only = (el.getAttribute("data-layers") || "").split(",").filter(Boolean);
    var panelEl = el.getAttribute("data-panel") && document.getElementById(el.getAttribute("data-panel"));
    var statusEl = el.getAttribute("data-status") && document.getElementById(el.getAttribute("data-status"));
    var setStatus = function (t) { if (statusEl) statusEl.textContent = t; };
    el.innerHTML = "";

    fetch(root + "data/map-layers.json").then(function (r) { return r.json(); }).then(function (cfg) {
      var v = cfg.default_view;
      var map = L.map(el, { center: v.center, zoom: mode === "mini" ? v.zoom - 1 : v.zoom, scrollWheelZoom: mode !== "mini", keyboard: true, zoomControl: true });
      var pane = map.createPane("fwDynamic"); pane.style.zIndex = 350; pane.style.pointerEvents = "none";
      L.control.scale({ metric: true, imperial: true }).addTo(map);
      map.attributionControl.setPrefix('<a href="https://leafletjs.com" rel="noopener">Leaflet</a>');
      var defs = cfg.records.filter(function (d) { return mode === "full" || only.indexOf(d.id) !== -1; });
      var cache = {}, layers = {}, failed = {};
      var bases = defs.filter(function (d) { return d.group === "base"; });
      var overlays = defs.filter(function (d) { return d.group !== "base"; });

      Promise.all(defs.map(function (d) {
        return makeLayer(d, root, cache).then(function (l) { layers[d.id] = l; }, function () { failed[d.id] = true; });
      })).then(function () {
        var base = bases.filter(function (d) { return d.default_on; })[0] || bases[0];
        if (base && layers[base.id]) layers[base.id].addTo(map);
        overlays.forEach(function (d) { if (layers[d.id] && (d.default_on || mode === "mini")) layers[d.id].addTo(map); });
        Object.keys(layers).forEach(function (id) {
          var l = layers[id];
          if (l.on) l.on("tileerror", function () {
            if (!failed[id]) { failed[id] = true; var d = defs.filter(function (x) { return x.id === id; })[0]; setStatus((d ? d.name : id) + ": the provider's service did not respond for some tiles. Other layers are unaffected."); markFailed(id); }
          });
        });
        if (layers["allen-branch"] && layers["allen-branch"].getBounds) {
          map.fitBounds(layers["allen-branch"].getBounds().pad(mode === "mini" ? 0.15 : 0.35));
        }
        if (panelEl) buildPanel(panelEl, cfg, map, layers, bases, overlays, failed, base);
        var obs = cache["field-observations"];
        setStatus(obs && obs.records && obs.records.length === 0 ? "No field observations have been recorded yet, so the observation layer is empty." : "");
      });
    }).catch(function () {
      el.innerHTML = '<p class="fw-map-fallback">The map could not load. The same information is listed in the tables on this page.</p>';
    });
  }

  function markFailed(id) {
    var lab = document.querySelector('[data-layer-label="' + id + '"]');
    if (lab && !lab.querySelector(".fw-badge")) lab.insertAdjacentHTML("beforeend", ' <span class="fw-badge fw-badge--unavailable">not responding</span>');
  }

  function buildPanel(panel, cfg, map, layers, bases, overlays, failed, base) {
    var html = '<h2 id="layer-panel-title">Map layers</h2>';
    html += '<fieldset><legend>' + esc(cfg.groups.base) + "</legend>";
    bases.forEach(function (d) {
      html += item(d, "radio", d === base);
    });
    html += "</fieldset>";
    var groups = Object.keys(cfg.groups).filter(function (g) { return g !== "base"; });
    groups.forEach(function (g) {
      var ds = overlays.filter(function (d) { return d.group === g; });
      if (!ds.length) return;
      html += "<fieldset><legend>" + esc(cfg.groups[g]) + "</legend>";
      ds.forEach(function (d) { html += item(d, "checkbox", !!d.default_on); });
      html += "</fieldset>";
    });
    panel.innerHTML = html;
    function item(d, type, checked) {
      var id = "lyr-" + d.id;
      return '<div class="fw-layer-item"><input type="' + type + '" id="' + id + '" name="' + (type === "radio" ? "fw-base" : id) + '" value="' + esc(d.id) + '"' + (checked ? " checked" : "") + (failed[d.id] ? " disabled" : "") +
        '><label for="' + id + '" data-layer-label="' + esc(d.id) + '">' + esc(d.name) + (failed[d.id] ? ' <span class="fw-badge fw-badge--unavailable">unavailable</span>' : "") +
        '</label><button type="button" class="fw-layer-info" aria-expanded="false" aria-controls="' + id + '-prov">About<span class="visually-hidden"> ' + esc(d.name) + "</span></button>" +
        '<div class="fw-layer-prov" id="' + id + '-prov" hidden>' + provenance(d) + "</div></div>";
    }
    panel.addEventListener("change", function (e) {
      var t = e.target, l = layers[t.value];
      if (!l) return;
      if (t.type === "radio") {
        bases.forEach(function (d) { if (layers[d.id] && map.hasLayer(layers[d.id])) map.removeLayer(layers[d.id]); });
        l.addTo(map); if (l.bringToBack) l.bringToBack();
      } else if (t.checked) l.addTo(map); else map.removeLayer(l);
    });
    panel.addEventListener("click", function (e) {
      var b = e.target.closest(".fw-layer-info");
      if (!b) return;
      var box = document.getElementById(b.getAttribute("aria-controls"));
      var open = b.getAttribute("aria-expanded") === "true";
      b.setAttribute("aria-expanded", String(!open));
      box.hidden = open;
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll("[data-fw-map]"), init);
})();
