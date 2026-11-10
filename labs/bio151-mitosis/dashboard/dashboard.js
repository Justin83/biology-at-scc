/* BIO 151 Mitosis Lab: classroom dashboard. Built only from mitosis_dashboard, which returns
   aggregates (class totals, the class mitotic index and the sorted list of individual
   indices) and never names, submission IDs or per-student times. */
(function () {
  "use strict";
  const A = window.MitosisAPI;
  const $ = (id) => document.getElementById(id);
  const slug = A.slug;
  let totalsChart = null, miChart = null, timer = null;

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const color = (i) => css(`--s${(i % 8) + 1}`) || "#2a78d6";
  function msg(text, kind) { const el = $("msg"); el.textContent = text || ""; el.className = "msg " + (kind || "warn") + (text ? "" : " hidden"); }

  function render(d) {
    const e = d.experiment;
    $("title").textContent = e.title;
    $("course").textContent = [e.course, e.term, e.is_open ? "data entry open" : "data entry CLOSED"].filter(Boolean).join(" · ");
    $("status").textContent = `${d.submissions} ${d.submissions === 1 ? "student has" : "students have"} saved · ${d.complete} complete · updated ${new Date(d.server_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}`;

    // mitotic index cards
    $("mi-cards").innerHTML = e.regions.map((r, i) => {
      const n = (d.individual_mitotic_index[r.key] || []).length;
      return `<div class="mi-card" style="border-left-color:${color(i)}"><div class="label">${A.esc(r.label)}</div>` +
        `<div class="value">${A.pct(d.class_mitotic_index[r.key])}</div>` +
        `<div class="note">class mitotic index · ${n} complete ${n === 1 ? "submission" : "submissions"}</div></div>`;
    }).join("");

    // totals table: cells per stage, and the share of the region's cells
    const regionSum = {};
    e.regions.forEach((r) => { regionSum[r.key] = e.stages.reduce((a, s) => a + (d.totals[r.key][s.key] || 0), 0); });
    $("totals-table").innerHTML = `<thead><tr><th scope="col">Stage</th>${e.regions.map((r) => `<th scope="col">${A.esc(r.label)}</th>`).join("")}</tr></thead><tbody>` +
      e.stages.map((s) => `<tr><th scope="row">${A.esc(s.label)}${s.mitotic ? "" : " <span class=\"muted small\">(not mitotic)</span>"}</th>` +
        e.regions.map((r) => {
          const v = d.totals[r.key][s.key] || 0, t = regionSum[r.key];
          return `<td>${v}${t ? ` <span class="muted small">(${(100 * v / t).toFixed(1)}%)</span>` : ""}</td>`;
        }).join("") + "</tr>").join("") +
      `<tr><th scope="row">All cells counted</th>${e.regions.map((r) => `<td><strong>${regionSum[r.key]}</strong></td>`).join("")}</tr></tbody>`;

    // bar chart: class totals per stage, one dataset per region
    const totalsData = {
      labels: e.stages.map((s) => s.label),
      datasets: e.regions.map((r, i) => ({ label: r.label, data: e.stages.map((s) => d.totals[r.key][s.key] || 0), backgroundColor: color(i) }))
    };
    if (!totalsChart) {
      totalsChart = new Chart($("totals-chart"), {
        type: "bar", data: totalsData,
        options: { responsive: true, maintainAspectRatio: false, animation: false,
          scales: { y: { beginAtZero: true, title: { display: true, text: "Cells (class total)" }, ticks: { precision: 0 } } },
          plugins: { legend: { position: "top" } } }
      });
    } else { totalsChart.data = totalsData; totalsChart.update(); }

    // dot plot: individual indices (spread out a little so dots don't stack) and a bar at the class index
    const datasets = [];
    e.regions.forEach((r, i) => {
      const x0 = i + 1, pts = (d.individual_mitotic_index[r.key] || []).map((v, j) => ({ x: x0 + (((j * 7) % 9) - 4) * 0.05, y: Number(v) }));
      datasets.push({ type: "scatter", label: `${r.label}: students`, data: pts, backgroundColor: color(i), pointRadius: 6, pointHoverRadius: 7 });
      const c = d.class_mitotic_index[r.key];
      if (c != null) datasets.push({ type: "line", label: `${r.label}: class`, data: [{ x: x0 - 0.32, y: Number(c) }, { x: x0 + 0.32, y: Number(c) }],
        borderColor: css("--fg") || "#1a1f16", borderWidth: 4, pointRadius: 0, showLine: true });
    });
    const maxV = Math.max(10, ...e.regions.flatMap((r) => (d.individual_mitotic_index[r.key] || []).map(Number)));
    const miOptions = { responsive: true, maintainAspectRatio: false, animation: false,
      scales: {
        x: { type: "linear", min: 0.4, max: e.regions.length + 0.6, grid: { display: false },
             ticks: { stepSize: 1, callback: (v) => (Number.isInteger(v) && e.regions[v - 1] ? e.regions[v - 1].label : "") } },
        y: { beginAtZero: true, suggestedMax: Math.min(100, Math.ceil(maxV / 10) * 10 + 10), title: { display: true, text: "Mitotic index (%)" } }
      },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y.toFixed(1)}%` } } } };
    if (!miChart) miChart = new Chart($("mi-chart"), { data: { datasets }, options: miOptions });
    else { miChart.data = { datasets }; miChart.options = miOptions; miChart.update(); }
  }

  async function refresh() {
    clearTimeout(timer);
    const d = await A.dashboard(slug);
    if (d.ok) { msg(A.isLocal ? "Local test database (tools/bio151-mitosis/local-api.mjs)." : "", "ok"); render(d); }
    else msg(A.errorText(d), "err");
    timer = setTimeout(refresh, (A.config.REFRESH_SECONDS || 12) * 1000);
  }

  $("refresh-btn").addEventListener("click", refresh);
  $("qr-btn").addEventListener("click", () => {
    const panel = $("qr-panel"), show = panel.classList.contains("hidden");
    if (show && !$("qr").innerHTML && window.qrcode) {
      const url = A.config.STUDENT_FORM_URL;
      const q = qrcode(0, "M"); q.addData(url); q.make();
      $("qr").innerHTML = q.createSvgTag({ cellSize: 8, margin: 4, scalable: true, alt: "QR code linking to the student form", title: "QR code: " + url });
      $("qr-url").textContent = url.replace(/^https:\/\//, "");
    }
    panel.classList.toggle("hidden", !show);
    $("qr-btn").setAttribute("aria-expanded", String(show));
    $("qr-btn").textContent = show ? "Hide QR" : "Show QR for students";
  });
  refresh();
})();
