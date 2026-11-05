/* Freshwater Ecology & Watershed Research — shared page behavior.
   Progressive enhancement only: every page is complete without this file. */
(function () {
  "use strict";
  var doc = document.documentElement;

  /* ---------- storage that never throws ---------- */
  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { if (v === null) window.localStorage.removeItem(k); else window.localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };

  /* ---------- mobile menu ---------- */
  var toggle = document.querySelector(".fw-menu-toggle");
  var nav = document.getElementById("fw-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      nav.classList.toggle("is-open", !open);
    });
  }

  /* ---------- theme toggle: auto -> light -> dark -> auto ---------- */
  var themeBtn = document.querySelector("[data-theme-toggle]");
  function applyTheme(t) {
    if (t === "light" || t === "dark") doc.setAttribute("data-theme", t); else doc.removeAttribute("data-theme");
    if (themeBtn) {
      var label = t === "light" ? "Light" : t === "dark" ? "Dark" : "Auto";
      themeBtn.textContent = "Theme: " + label;
      themeBtn.setAttribute("aria-label", "Color theme: " + label.toLowerCase() + ". Activate to change.");
    }
    document.dispatchEvent(new CustomEvent("fw:themechange"));
  }
  if (themeBtn) {
    applyTheme(store.get("fw-theme"));
    themeBtn.addEventListener("click", function () {
      var cur = store.get("fw-theme");
      var next = cur === "light" ? "dark" : cur === "dark" ? null : "light";
      store.set("fw-theme", next);
      applyTheme(next);
    });
  }

  /* ---------- chapter list collapses on small screens ---------- */
  var chNav = document.querySelector(".fw-chapter-nav");
  if (chNav && window.matchMedia("(max-width: 899px)").matches) chNav.removeAttribute("open");

  /* ---------- on-page contents highlight ---------- */
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll(".fw-toc a"));
  if (tocLinks.length && "IntersectionObserver" in window) {
    var byId = {};
    tocLinks.forEach(function (a) { byId[decodeURIComponent(a.hash.slice(1))] = a; });
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && byId[e.target.id]) {
          tocLinks.forEach(function (a) { a.classList.remove("is-current"); a.removeAttribute("aria-current"); });
          byId[e.target.id].classList.add("is-current");
          byId[e.target.id].setAttribute("aria-current", "location");
        }
      });
    }, { rootMargin: "0px 0px -70% 0px" });
    Object.keys(byId).forEach(function (id) { var h = document.getElementById(id); if (h) obs.observe(h); });
  }

  /* ---------- filterable lists ----------
     <div class="fw-filters" data-filter-for="NAME">
       <input data-filter-search>
       <button class="fw-chip-btn" data-filter-key="category" data-filter-value="all|value" aria-pressed>
       <p class="fw-result-count" aria-live="polite">
     Items: children of [data-filter-list="NAME"] carrying data-text and data-<key>. */
  Array.prototype.forEach.call(document.querySelectorAll(".fw-filters[data-filter-for]"), function (panel) {
    var name = panel.getAttribute("data-filter-for");
    var lists = document.querySelectorAll('[data-filter-list="' + name + '"]');
    var items = [];
    Array.prototype.forEach.call(lists, function (l) { items = items.concat(Array.prototype.slice.call(l.children)); });
    var input = panel.querySelector("[data-filter-search]");
    var count = panel.querySelector(".fw-result-count");
    var chips = Array.prototype.slice.call(panel.querySelectorAll("[data-filter-key]"));
    var noun = panel.getAttribute("data-filter-noun") || "items";

    function state() {
      var s = { q: input ? input.value.trim().toLowerCase() : "", keys: {} };
      chips.forEach(function (c) {
        if (c.getAttribute("aria-pressed") === "true" && c.getAttribute("data-filter-value") !== "all") s.keys[c.getAttribute("data-filter-key")] = c.getAttribute("data-filter-value");
      });
      return s;
    }
    function run() {
      var s = state(), shown = 0;
      var terms = s.q ? s.q.split(/\s+/) : [];
      items.forEach(function (it) {
        var text = it.getAttribute("data-text") || it.textContent.toLowerCase();
        var ok = terms.every(function (t) { return text.indexOf(t) !== -1; });
        Object.keys(s.keys).forEach(function (k) {
          var vals = (it.getAttribute("data-" + k) || "").split(/\s+/);
          if (vals.indexOf(s.keys[k]) === -1) ok = false;
        });
        if (ok) { it.removeAttribute("data-filter-hidden"); shown++; } else it.setAttribute("data-filter-hidden", "");
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-filter-section="' + name + '"]'), function (sec) {
        var any = sec.querySelector('[data-filter-list="' + name + '"] > :not([data-filter-hidden])');
        sec.hidden = !any;
      });
      if (count) count.textContent = shown === items.length ? "Showing all " + items.length + " " + noun + "." : "Showing " + shown + " of " + items.length + " " + noun + ".";
    }
    chips.forEach(function (c) {
      c.addEventListener("click", function () {
        var key = c.getAttribute("data-filter-key");
        chips.forEach(function (o) { if (o.getAttribute("data-filter-key") === key) o.setAttribute("aria-pressed", String(o === c)); });
        run();
      });
    });
    if (input) input.addEventListener("input", run);
    var reset = panel.querySelector("[data-filter-reset]");
    if (reset) reset.addEventListener("click", function () {
      if (input) input.value = "";
      chips.forEach(function (c) { c.setAttribute("aria-pressed", String(c.getAttribute("data-filter-value") === "all")); });
      run();
    });
    // initial state from the query string (?q=...&category=...)
    var params = new URLSearchParams(window.location.search);
    if (input && params.get("q")) input.value = params.get("q");
    chips.forEach(function (c) {
      var v = params.get(c.getAttribute("data-filter-key"));
      if (v) { if (c.getAttribute("data-filter-value") === v) chips.forEach(function (o) { if (o.getAttribute("data-filter-key") === c.getAttribute("data-filter-key")) o.setAttribute("aria-pressed", String(o === c)); }); }
    });
    run();
    // a deep link (#res-..., #paper-..., #term-...) must never land on a hidden card
    function reveal() {
      var t = window.location.hash && document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
      if (t && t.hasAttribute("data-filter-hidden") && reset) { reset.click(); t.scrollIntoView(); }
    }
    window.addEventListener("hashchange", reveal);
    reveal();
  });
})();
