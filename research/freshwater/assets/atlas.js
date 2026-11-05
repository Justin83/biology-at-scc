/* Organism Atlas — side-by-side comparison of two entries (text now; photomicrographs
   with scale bars will appear here as they are added and reviewed). */
(function () {
  "use strict";
  var box = document.getElementById("fw-compare");
  if (!box) return;
  var root = box.getAttribute("data-root") || "../";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  fetch(root + "data/organisms.json").then(function (r) { return r.json(); }).then(function (data) {
    var recs = data.records;
    var opts = recs.map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(o.scientific_name) + "</option>"; }).join("");
    box.innerHTML =
      '<div class="fw-filter-row"><label class="fw-filter-search">First organism<select id="cmp-a">' + opts + '</select></label>' +
      '<label class="fw-filter-search">Second organism<select id="cmp-b">' + opts + "</select></label></div>" +
      '<div class="fw-table-scroll" tabindex="0" role="region" aria-label="Comparison table"><table id="cmp-table"></table></div>';
    var a = document.getElementById("cmp-a"), b = document.getElementById("cmp-b");
    a.value = "microcystis"; b.value = recs.length > 1 ? "dolichospermum" : recs[0].id;
    function row(label, fa, fb) { return "<tr><th scope=\"row\">" + label + "</th><td>" + fa + "</td><td>" + fb + "</td></tr>"; }
    function render() {
      var x = recs.filter(function (o) { return o.id === a.value; })[0], y = recs.filter(function (o) { return o.id === b.value; })[0];
      var list = function (arr) { return "<ul>" + arr.map(function (d) { return "<li>" + esc(d) + "</li>"; }).join("") + "</ul>"; };
      document.getElementById("cmp-table").innerHTML =
        "<caption>Side-by-side comparison</caption><thead><tr><th scope=\"col\">Feature</th><th scope=\"col\"><i>" + esc(x.scientific_name) + "</i></th><th scope=\"col\"><i>" + esc(y.scientific_name) + "</i></th></tr></thead><tbody>" +
        row("Photomicrograph", "Pending — will show a scale bar and magnification", "Pending — will show a scale bar and magnification") +
        row("Growth form", esc(x.growth_form), esc(y.growth_form)) +
        row("Diagnostic morphology", list(x.diagnostic_morphology), list(y.diagnostic_morphology)) +
        row("Typical habitat", esc(x.typical_habitat), esc(y.typical_habitat)) +
        row("Similar-looking", esc(x.similar_taxa.join("; ")), esc(y.similar_taxa.join("; "))) +
        row("Identification limits", esc(x.identification_limits), esc(y.identification_limits)) +
        "</tbody>";
    }
    a.addEventListener("change", render); b.addEventListener("change", render); render();
  }).catch(function () { box.innerHTML = '<p class="fw-empty">The comparison tool could not load. The full entries are listed below.</p>'; });
})();
