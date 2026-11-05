/* Freshwater portal — client-side search over data/search-index.json.
   Used only on research/freshwater/search/. Results are ranked by where the terms
   match (title > keywords > description > page text). */
(function () {
  "use strict";
  var form = document.getElementById("fw-search-form");
  var input = document.getElementById("fw-search-input");
  var out = document.getElementById("fw-search-results");
  var status = document.getElementById("fw-search-status");
  if (!form || !input || !out) return;
  var root = form.getAttribute("data-root") || "../";
  var KIND = { page: "Page", section: "Section", glossary: "Glossary", organism: "Organism", resource: "Resource", paper: "Paper", question: "Research question" };
  var index = null;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function mark(text, terms) {
    var h = esc(text);
    terms.forEach(function (t) { if (t.length > 1) h = h.replace(new RegExp("(" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"), "<mark>$1</mark>"); });
    return h;
  }
  function score(it, terms) {
    var t = (it.t || "").toLowerCase(), d = (it.d || "").toLowerCase(), x = (it.x || "").toLowerCase(), s = 0;
    for (var i = 0; i < terms.length; i++) {
      var q = terms[i], hit = 0;
      if (t.indexOf(q) !== -1) hit += t.indexOf(q) === 0 ? 12 : 8;
      if (d.indexOf(q) !== -1) hit += 3;
      if (x.indexOf(q) !== -1) hit += 1;
      if (!hit) return 0;
      s += hit;
    }
    if (it.k === "page") s += 2;
    if (it.k === "glossary" || it.k === "organism") s += 1;
    return s;
  }
  function run(q) {
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) { out.innerHTML = ""; status.textContent = "Type a word or phrase, for example microcystin, heterocyte, karst or StreamStats."; return; }
    var hits = index.items.map(function (it) { return { it: it, s: score(it, terms) }; }).filter(function (h) { return h.s > 0; })
      .sort(function (a, b) { return b.s - a.s; }).slice(0, 60);
    status.textContent = hits.length ? hits.length + (hits.length === 60 ? "+" : "") + " result" + (hits.length === 1 ? "" : "s") + " for “" + q + "”." : "No results for “" + q + "”. Try a shorter or more general term.";
    out.innerHTML = hits.map(function (h) {
      var it = h.it;
      return '<li><span class="fw-search-kind">' + esc(KIND[it.k] || it.k) + '</span><a href="' + esc(root + it.u) + '">' + mark(it.t, terms) + "</a>" +
        (it.d ? "<p>" + mark(it.d.length > 220 ? it.d.slice(0, 217) + "…" : it.d, terms) + "</p>" : "") + "</li>";
    }).join("");
  }
  var q = new URLSearchParams(window.location.search).get("q") || "";
  input.value = q;
  status.textContent = "Loading search index…";
  fetch(root + "data/search-index.json").then(function (r) { return r.json(); }).then(function (data) {
    index = data; run(input.value);
  }).catch(function () { status.textContent = "Search could not load. Use the navigation above or the glossary instead."; });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!index) return;
    var v = input.value.trim();
    history.replaceState(null, "", "?q=" + encodeURIComponent(v));
    run(v);
  });
})();
