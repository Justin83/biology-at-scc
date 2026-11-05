#!/usr/bin/env node
// Freshwater Ecology & Watershed Research portal — in-place page generator.
//
//   node tools/freshwater-portal/build.mjs          rewrite generated regions in place
//   node tools/freshwater-portal/build.mjs --check  fail (exit 1) if any page is stale or invalid
//
// The site has no build step: GitHub Pages publishes the repository as-is. This script
// only rewrites the regions between markers such as
//     <!-- fw:header --> ... <!-- /fw:header -->
// inside research/freshwater/**/index.html, from the JSON in research/freshwater/data/.
// Everything outside the markers is hand-written and never touched. Run it after editing
// any data file or page, and commit its output. No dependencies; Node 18+.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORTAL = path.join(ROOT, "research/freshwater");
const DATA = path.join(PORTAL, "data");
const CHECK = process.argv.includes("--check");

const problems = [];
const warn = (msg) => problems.push(msg);

// ---------------------------------------------------------------- data
const load = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
const D = {
  articles: load("articles.json"),
  glossary: load("glossary.json"),
  layers: load("map-layers.json"),
  organisms: load("organisms.json"),
  questions: load("research-questions.json"),
  references: load("references.json"),
  resources: load("resources.json"),
  sites: load("sites.json"),
  observations: load("observations.json"),
  projects: load("projects.json"),
};
const REF = new Map(D.references.records.map((r) => [r.id, r]));
const CHAPTERS = D.articles.records.slice().sort((a, b) => a.chapter_number - b.chapter_number);

// ---------------------------------------------------------------- helpers
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// Links that leave the site open in a new tab; screen-reader users are told so.
const ext = (url, text, cls = "") =>
  `<a${cls ? ` class="${cls}"` : ""} href="${esc(url)}" target="_blank" rel="noopener">${text}<span class="visually-hidden"> (external site, opens in a new tab)</span></a>`;

const NAV = [
  ["", "Research Home", "home"],
  ["learn/", "Learn", "learn"],
  ["learn/cyanobacteria/", "Cyanobacteria", "cyanobacteria"],
  ["maps/", "Watersheds &amp; Maps", "maps"],
  ["sites/allen-branch/", "Allen Branch", "allen-branch"],
  ["organisms/", "Organism Atlas", "organisms"],
  ["methods/", "Field Methods", "methods"],
  ["resources/", "Resource Library", "resources"],
  ["projects/", "Research Projects", "projects"],
  ["observations/", "Observations", "observations"],
];

const BADGE = {
  unverified: ["Unverified", "○"],
  mapped: ["Mapped", "◆"],
  field_confirmed: ["Field confirmed", "✓"],
  lab_confirmed: ["Laboratory confirmed", "■"],
  not_started: ["Not started", "–"],
  in_progress: ["In progress", "▸"],
  complete: ["Complete", "✓"],
  blocked: ["Blocked", "!"],
  proposed: ["Proposed", "○"],
  planning: ["Planning", "▸"],
  active: ["Active", "●"],
  analysis: ["Analysis", "▸"],
  completed: ["Completed", "✓"],
  archived: ["Archived", "–"],
  outline: ["Outline", "▸"],
  planned: ["Planned", "–"],
  ok: ["Link OK", "✓"],
  redirected: ["Redirects", "▸"],
  blocked_automated_check: ["Needs review", "!"],
  unavailable: ["Unavailable", "!"],
};
const badge = (key, label) => {
  const [text, glyph] = BADGE[key] || [key, "•"];
  return `<span class="fw-badge fw-badge--${esc(key.replace(/_/g, "-"))}"><span aria-hidden="true">${glyph}</span> ${esc(label || text)}</span>`;
};

// Author list "Family, Given" -> "Family, G. G."
function fmtAuthor(a) {
  let ed = "";
  if (/\(ed\.\)/.test(a)) { ed = " (Ed.)"; a = a.replace(/\s*\(ed\.\)/, ""); }
  if (!a.includes(", ")) return esc(a) + ed;
  const [fam, giv] = a.split(", ");
  const initials = giv.split(/[\s.]+/).filter(Boolean).map((p) => p.split("-").map((q) => q[0] + ".").join("-")).join(" ");
  return `${esc(fam)}, ${esc(initials)}${ed}`;
}
function fmtAuthors(r) {
  const list = r.authors || [];
  const n = r.author_count || list.length;
  if (!list.length) return "";
  const shown = list.slice(0, 7).map(fmtAuthor);
  if (n > 7) return shown.join(", ") + ", et al.";
  if (shown.length === 1) return shown[0];
  return shown.slice(0, -1).join(", ") + ", &amp; " + shown[shown.length - 1];
}
function fmtReference(r) {
  const parts = [];
  parts.push(`${fmtAuthors(r)} (${r.year ?? "n.d."}).`);
  const title = esc(r.title).replace(/\.$/, "");
  if (r.reference_type === "journal_article") {
    parts.push(`${title}.`);
    let src = `<cite>${esc(r.container)}</cite>`;
    if (r.volume) src += `, <i>${esc(r.volume)}</i>`;
    if (r.issue) src += `(${esc(r.issue)})`;
    if (r.pages) src += `, ${esc(r.pages)}`;
    parts.push(src + ".");
  } else if (r.reference_type === "book" ) {
    parts.push(`<cite>${title}</cite>.`);
    if (r.publisher) parts.push(`${esc(r.publisher)}.`);
  } else if (r.reference_type === "book_chapter") {
    parts.push(`${title}.`);
    if (r.container) parts.push(`In <cite>${esc(r.container)}</cite>${r.pages ? ` (pp. ${esc(r.pages)})` : ""}.`);
    if (r.publisher) parts.push(`${esc(r.publisher)}.`);
  } else if (r.reference_type === "government_report") {
    parts.push(`<cite>${title}</cite>.`);
    if (r.container) parts.push(`${esc(r.container)}.`);
  } else {
    parts.push(`<cite>${title}</cite>.`);
    if (r.container) parts.push(`${esc(r.container)}.`);
  }
  if (r.doi) parts.push(ext(`https://doi.org/${r.doi}`, `https://doi.org/${esc(r.doi)}`));
  else if (r.url) parts.push(ext(r.url, esc(r.url)) + (r.reference_type === "web_page" || r.reference_type === "dataset" ? ` (accessed ${esc(r.verified_at)})` : ""));
  if (r.note) parts.push(`<span class="fw-ref-note">${esc(r.note)}</span>`);
  return parts.join(" ");
}

// ---------------------------------------------------------------- page context
function pageContext(file, html) {
  const rel = path.relative(PORTAL, path.dirname(file)).split(path.sep).filter(Boolean);
  const depth = rel.length;
  const toPortal = depth ? "../".repeat(depth) : "./";
  const toSite = "../".repeat(depth + 2);
  const meta = (name) => (html.match(new RegExp(`<meta name="${name}" content="([^"]*)"`)) || [])[1];
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1];
  // Titles come from HTML (meta attributes or the h1), so decode entities here; they are
  // escaped again when written into breadcrumbs. Without this, "&amp;" renders as "&amp;amp;".
  const decode = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  const short = decode(meta("fw:short") || (h1 ? h1.replace(/<[^>]+>/g, "").trim() : ""));
  return { file, rel, depth, toPortal, toSite, relPath: rel.length ? rel.join("/") + "/" : "", section: meta("fw:section") || "", short, html };
}

const SHORT = new Map(); // relPath -> short title (filled in a first pass)

// ---------------------------------------------------------------- generators
function genHeader(ctx) {
  const items = NAV.map(([href, label, key]) => {
    const current = ctx.relPath === href;
    const active = !current && ctx.section === key;
    return `<li><a href="${ctx.toPortal}${href}"${current ? ' aria-current="page"' : ""}${active ? ' class="is-active"' : ""}>${label}</a></li>`;
  }).join("\n        ");
  // breadcrumbs
  const crumbs = [`<li><a href="${ctx.toSite}index.html">Biology at SCC</a></li>`];
  const trail = [""];
  for (let i = 0; i < ctx.rel.length; i++) trail.push(ctx.rel.slice(0, i + 1).join("/") + "/");
  trail.forEach((p, i) => {
    const label = i === 0 ? "Freshwater Research" : SHORT.get(p) || p;
    if (p === ctx.relPath) crumbs.push(`<li><a href="${ctx.toPortal}${p}" aria-current="page">${esc(label)}</a></li>`);
    else if (SHORT.has(p) || i === 0) crumbs.push(`<li><a href="${ctx.toPortal}${p}">${esc(label)}</a></li>`);
  });
  return `
<script>(function(){var d=document.documentElement;d.classList.add("js");try{var t=localStorage.getItem("fw-theme");if(t==="light"||t==="dark")d.setAttribute("data-theme",t);}catch(e){}})();</script>
<a class="skip-link" href="#main">Skip to main content</a>
<header class="site-header">
  <div class="wrap">
    <a class="site-title" href="${ctx.toSite}index.html">Biology <span>at SCC</span></a>
    <nav aria-label="Biology at SCC">
      <ul>
        <li><a href="${ctx.toSite}departments/">Departments</a></li>
        <li><a href="${ctx.toSite}honors-symposium/">Honors Symposium</a></li>
        <li><a href="${ctx.toSite}posters-presentations/">Posters &amp; Presentations</a></li>
        <li><a href="${ctx.toSite}archive/">Archive</a></li>
        <li><a href="${ctx.toSite}labs/">Lab</a></li>
        <li><a href="${ctx.toPortal}" class="is-active">Research</a></li>
      </ul>
    </nav>
  </div>
</header>
<div class="fw-bar">
  <div class="fw-bar-inner">
    <a class="fw-brand" href="${ctx.toPortal}"><span class="fw-brand-mark" aria-hidden="true"></span><span>Freshwater Ecology <span class="fw-brand-amp">&amp; Watershed Research</span></span></a>
    <form class="fw-search" role="search" action="${ctx.toPortal}search/" method="get">
      <label class="visually-hidden" for="fw-q">Search the research portal</label>
      <input id="fw-q" name="q" type="search" placeholder="Search topics, organisms, resources…" autocomplete="off">
      <button type="submit">Search</button>
    </form>
    <div class="fw-bar-tools">
      <button type="button" class="fw-theme-toggle" data-theme-toggle aria-label="Color theme: automatic">Theme: Auto</button>
      <button type="button" class="fw-menu-toggle" aria-expanded="false" aria-controls="fw-nav">Menu</button>
    </div>
  </div>
  <nav id="fw-nav" class="fw-nav" aria-label="Research portal">
    <ul>
        ${items}
    </ul>
  </nav>
</div>
<nav class="fw-breadcrumbs" aria-label="Breadcrumb">
  <ol>
    ${crumbs.join("\n    ")}
  </ol>
</nav>
`;
}

function genFooter(ctx) {
  return `
<footer class="site-footer fw-footer">
  <div class="wrap">
    <div class="fw-footer-grid">
      <div>
        <p class="fw-footer-title">Freshwater Ecology &amp; Watershed Research</p>
        <p>An undergraduate research and learning portal of Biology at SCC, focused on Allen Branch and the freshwater systems of south-central Kentucky.</p>
      </div>
      <div>
        <p class="fw-footer-title">Evidence &amp; sources</p>
        <ul>
          <li><a href="${ctx.toPortal}standards/">Evidence labels &amp; citation standards</a></li>
          <li><a href="${ctx.toPortal}resources/literature/">Research paper library</a></li>
          <li><a href="${ctx.toPortal}learn/glossary/">Glossary</a></li>
        </ul>
      </div>
      <div>
        <p class="fw-footer-title">Safety</p>
        <p>Before visiting any lake, pond or stream, check current <a href="https://eec.ky.gov/Environmental-Protection/Water/Monitor/Pages/HABS.aspx" target="_blank" rel="noopener">Kentucky harmful algal bloom advisories<span class="visually-hidden"> (opens in a new tab)</span></a>. When in doubt, stay out.</p>
      </div>
    </div>
    <p>Biology at SCC &middot; Somerset Community College &middot; content licensed <a href="${ctx.toSite}LICENSE">CC BY 4.0</a> unless noted &middot; map data &copy; their providers as credited on each layer</p>
    <p>Questions about this site? Contact <a href="mailto:justin.howard@kctcs.edu">justin.howard@kctcs.edu</a>.</p>
  </div>
</footer>
<script src="${ctx.toPortal}assets/portal.js" defer></script>
`;
}

function genChapterNav(ctx) {
  const unit = D.articles.units[0];
  const items = CHAPTERS.map((c) => {
    const current = ctx.relPath === c.path;
    return `<li><a href="${ctx.toPortal}${c.path}"${current ? ' aria-current="page"' : ""}><span class="fw-chnum">${c.chapter_number}</span> <span>${esc(c.short_title)}</span>${c.status !== "complete" ? ' <span class="fw-chstatus">outline</span>' : ""}</a></li>`;
  }).join("\n      ");
  const overviewCurrent = ctx.relPath === unit.path;
  return `
<details class="fw-chapter-nav" open>
  <summary>Chapters</summary>
  <nav aria-label="Cyanobacteria chapters">
    <p class="fw-chapter-nav-unit"><a href="${ctx.toPortal}${unit.path}"${overviewCurrent ? ' aria-current="page"' : ""}>Overview</a></p>
    <ol>
      ${items}
    </ol>
    <p class="fw-chapter-nav-extra"><a href="${ctx.toPortal}learn/glossary/">Glossary</a></p>
  </nav>
</details>
`;
}

function genPrevNext(ctx) {
  const unit = D.articles.units[0];
  const seq = [{ path: unit.path, title: "Overview", n: null }, ...CHAPTERS.map((c) => ({ path: c.path, title: c.title, n: c.chapter_number }))];
  const i = seq.findIndex((s) => s.path === ctx.relPath);
  if (i < 0) { warn(`${rel(ctx.file)}: fw:prev-next on a page that is not in the chapter sequence`); return ""; }
  const prev = seq[i - 1], next = seq[i + 1];
  const link = (s, dir) => s ? `<a class="fw-pn fw-pn--${dir}" href="${ctx.toPortal}${s.path}"><span class="fw-pn-dir">${dir === "prev" ? "Previous" : "Next"}</span><span class="fw-pn-title">${s.n ? `Chapter ${s.n}: ` : ""}${esc(s.title)}</span></a>` : "<span></span>";
  return `\n<nav class="fw-prev-next" aria-label="Chapter navigation">\n  ${link(prev, "prev")}\n  ${link(next, "next")}\n</nav>\n`;
}

function genChapters(ctx) {
  return `\n<ol class="fw-chapter-cards">\n${CHAPTERS.map((c) => `  <li class="fw-chapter-card">
    <a href="${ctx.toPortal}${c.path}">
      <span class="fw-chapter-card-num">Chapter ${c.chapter_number}</span>
      <span class="fw-chapter-card-title">${esc(c.title)}</span>
    </a>
    <p>${esc(c.summary)}</p>
    <p class="fw-chapter-card-meta">${c.status === "complete" ? badge("complete", "Full text") : badge("outline", "Outline · full text in Phase 2")} <span>${c.learning_objectives.length} learning objectives</span></p>
  </li>`).join("\n")}\n</ol>\n`;
}

function genObjectives(ctx) {
  const c = CHAPTERS.find((x) => x.path === ctx.relPath);
  if (!c) { warn(`${rel(ctx.file)}: fw:objectives outside a chapter`); return ""; }
  return `\n<section class="fw-objectives" aria-labelledby="objectives-title">
  <h2 id="objectives-title">Learning objectives</h2>
  <p>After studying this chapter, you should be able to:</p>
  <ol>
${c.learning_objectives.map((o) => `    <li>${esc(o)}</li>`).join("\n")}
  </ol>
</section>\n`;
}

const GEO_LABEL = { kentucky: "Kentucky", regional: "Regional", national: "National", global: "Global" };
const TYPE_LABEL = { agency_portal: "Agency portal", gis_application: "Map application", dataset: "Dataset", database: "Database", software: "Software", guidance: "Guidance", search_tool: "Search tool" };
function resourceCard(r, ctx, headingLevel = 3) {
  const chk = r.check_status || "unchecked";
  const text = [r.title, r.organization, r.category, r.description, r.primary_use, GEO_LABEL[r.geographic_relevance]].join(" ").toLowerCase();
  let note = "";
  if (chk === "redirected") note = `<p class="fw-linkcheck">Redirects to ${ext(r.final_url, esc(r.final_url))} (checked ${esc(r.last_checked)}).</p>`;
  else if (chk === "blocked_automated_check" || chk === "unavailable") note = `<p class="fw-linkcheck fw-linkcheck--warn"><strong>Needs administrator review:</strong> ${esc(r.check_detail || "automated check failed")} (checked ${esc(r.last_checked)}). The link has not been changed.</p>`;
  const h = `h${headingLevel}`;
  return `<article class="fw-resource" id="res-${esc(r.id)}" data-category="${esc(slug(r.category))}" data-geo="${esc(r.geographic_relevance)}" data-text="${esc(text)}">
  <div class="fw-resource-top"><span class="fw-chip fw-chip--${esc(slug(r.category))}">${esc(r.category)}</span><span class="fw-geo fw-geo--${esc(r.geographic_relevance)}">${esc(GEO_LABEL[r.geographic_relevance])}</span></div>
  <${h} class="fw-resource-title">${ext(r.url, esc(r.title))}</${h}>
  <p class="fw-resource-org">${esc(r.organization)}</p>
  <p class="fw-resource-desc">${esc(r.description)}</p>
  <dl class="fw-meta">
    <div><dt>Primary use</dt><dd>${esc(r.primary_use)}</dd></div>
    <div><dt>Source type</dt><dd>${esc(TYPE_LABEL[r.source_type] || r.source_type)}</dd></div>
    <div><dt>Published / updated</dt><dd>${esc(r.publication_date || "Not stated by source")}</dd></div>
    <div><dt>Link checked</dt><dd>${r.last_checked ? `${esc(r.last_checked)} ${badge(chk)}` : "Not yet checked"}</dd></div>
  </dl>
  ${note}
</article>`;
}
function genResources(ctx, attrs) {
  let recs = D.resources.records;
  if (attrs.featured === "true") recs = recs.filter((r) => r.featured);
  if (attrs.category) recs = recs.filter((r) => r.category === attrs.category);
  if (attrs.limit) recs = recs.slice(0, +attrs.limit);
  const level = attrs.heading ? +attrs.heading : 3;
  return `\n<div class="fw-resource-grid"${attrs.featured ? "" : ' data-filter-list="resources"'}>\n${recs.map((r) => resourceCard(r, ctx, level)).join("\n")}\n</div>\n`;
}

function genLiterature(ctx) {
  const topics = D.references.topics;
  const recs = D.references.records.filter((r) => r.in_library).sort((a, b) => (b.year || 0) - (a.year || 0));
  return `\n<div class="fw-paper-list" data-filter-list="papers">\n${recs.map((r) => {
    const text = [r.title, (r.authors || []).join(" "), r.container, r.year, r.geographic_scope, (r.organisms || []).join(" "), r.summary, (r.topics || []).map((t) => topics[t]).join(" ")].join(" ").toLowerCase();
    const related = (r.related_articles || []).map((p) => {
      const c = CHAPTERS.find((x) => x.path === "learn/cyanobacteria/" + p + "/");
      return c ? `<a href="${ctx.toPortal}${c.path}">Ch. ${c.chapter_number}: ${esc(c.short_title)}</a>` : "";
    }).filter(Boolean).join(", ");
    return `<article class="fw-paper" id="paper-${esc(r.id)}" data-topics="${esc((r.topics || []).join(" "))}" data-ky="${/kentucky|tennessee|cumberland|ohio river/i.test(r.geographic_scope || "") ? "1" : "0"}" data-text="${esc(text)}">
  <p class="fw-paper-topics">${(r.topics || []).map((t) => `<span class="fw-chip">${esc(topics[t])}</span>`).join(" ")}</p>
  <h3 class="fw-paper-title">${esc(r.title)}</h3>
  <p class="fw-paper-cite">${fmtAuthors(r)} (${esc(r.year)}). ${r.container ? `<cite>${esc(r.container)}</cite>` : ""}${r.volume ? `, ${esc(r.volume)}` : ""}${r.issue ? `(${esc(r.issue)})` : ""}${r.pages ? `, ${esc(r.pages)}` : ""}.</p>
  <p class="fw-paper-summary">${esc(r.summary)}</p>
  <details class="fw-paper-details">
    <summary>Study details</summary>
    <dl class="fw-meta fw-meta--stack">
      <div><dt>Geographic scope</dt><dd>${esc(r.geographic_scope)}</dd></div>
      ${r.organisms && r.organisms.length ? `<div><dt>Organisms</dt><dd>${esc(r.organisms.join("; "))}</dd></div>` : ""}
      <div><dt>Methodology</dt><dd>${esc(r.methodology)}</dd></div>
      <div><dt>Key findings</dt><dd>${esc(r.key_findings)}</dd></div>
      <div><dt>Limitations</dt><dd>${esc(r.limitations)}</dd></div>
      <div><dt>Full text</dt><dd>${esc({ open_access: "Open access", subscription: "Subscription (check SCC library access)", unknown: "Not determined" }[r.full_text] || "Not determined")}</dd></div>
      ${related ? `<div><dt>Related chapters</dt><dd>${related}</dd></div>` : ""}
      <div><dt>Summary status</dt><dd>${esc(r.summary_status)}</dd></div>
    </dl>
  </details>
  <p class="fw-paper-link">${r.doi ? ext("https://doi.org/" + r.doi, "DOI: " + esc(r.doi)) : ext(r.url, "Open source record")} <span class="fw-verified">Metadata verified with ${esc(r.verified_with === "crossref" ? "Crossref" : r.verified_with === "pubmed" ? "PubMed" : "the source page")} on ${esc(r.verified_at)}</span></p>
</article>`;
  }).join("\n")}\n</div>\n`;
}

function genGlossary(ctx) {
  const recs = D.glossary.records.slice().sort((a, b) => a.term.localeCompare(b.term));
  const byId = new Map(recs.map((g) => [g.id, g]));
  return `\n<dl class="fw-glossary" data-filter-list="glossary">\n${recs.map((g) => {
    const see = (g.see_also || []).map((id) => byId.get(id) ? `<a href="#term-${esc(id)}">${esc(byId.get(id).term)}</a>` : (warn(`glossary ${g.id}: see_also ${id} missing`), "")).join(", ");
    return `<div class="fw-term" id="term-${esc(g.id)}" data-text="${esc((g.term + " " + g.definition).toLowerCase())}">
  <dt>${esc(g.term)}</dt>
  <dd>${esc(g.definition)}${g.article ? ` <a class="fw-term-more" href="${ctx.toPortal}${esc(g.article)}">Read more<span class="visually-hidden"> about ${esc(g.term)}</span></a>` : ""}${see ? `<span class="fw-term-see">See also: ${see}</span>` : ""}</dd>
</div>`;
  }).join("\n")}\n</dl>\n`;
}

function refLink(ctx, key) {
  const r = REF.get(key);
  if (!r) { warn(`${rel(ctx.file)}: unknown reference key "${key}"`); return esc(key); }
  const label = `${esc((r.authors && r.authors[0] ? r.authors[0].split(", ")[0] : "Source"))}${(r.author_count || (r.authors || []).length) > 2 ? " et al." : (r.authors || []).length === 2 ? " &amp; " + esc(r.authors[1].split(", ")[0]) : ""} (${esc(r.year ?? "n.d.")})`;
  if (r.in_library) return `<a href="${ctx.toPortal}resources/literature/#paper-${esc(key)}">${label}</a>`;
  return r.doi ? ext("https://doi.org/" + r.doi, label) : ext(r.url, label);
}

function genOrganisms(ctx) {
  const cats = D.organisms.categories;
  return "\n" + cats.map((cat) => {
    const recs = D.organisms.records.filter((o) => o.group === cat.id);
    return `<section class="fw-atlas-group" aria-labelledby="cat-${esc(cat.id)}"${recs.length ? ' data-filter-section="organisms"' : ""}>
  <h2 id="cat-${esc(cat.id)}">${esc(cat.name)}</h2>
  <p class="fw-atlas-group-summary">${esc(cat.summary)} <span class="fw-muted">${esc(cat.status)}.</span></p>
  ${recs.length ? `<div class="fw-atlas-grid" data-filter-list="organisms">\n${recs.map((o) => {
      const text = [o.scientific_name, o.common_name, o.former_names.join(" "), o.growth_form, o.typical_habitat, o.diagnostic_morphology.join(" "), cat.name].join(" ").toLowerCase();
      const tax = Object.entries(o.taxonomy).map(([k, v]) => `<span><span class="fw-tax-rank">${esc(k)}</span> ${esc(v)}</span>`).join(" › ");
      return `<article class="fw-organism" id="org-${esc(o.id)}" data-text="${esc(text)}">
  <div class="fw-organism-media" role="img" aria-label="No image yet for ${esc(o.scientific_name)}"><span>Image pending</span><span class="fw-muted">SCC photomicrograph or licensed image to be added</span></div>
  <h3><i>${esc(o.scientific_name)}</i>${o.authority ? ` <span class="fw-authority">${esc(o.authority)}</span>` : ""}</h3>
  <p class="fw-taxonomy">${tax}</p>
  <p class="fw-organism-form"><strong>Growth form:</strong> ${esc(o.growth_form)}${o.common_name ? ` · <strong>Common name:</strong> ${esc(o.common_name)}` : ""}${o.former_names.length ? ` · <strong>Formerly:</strong> ${esc(o.former_names.join("; "))}` : ""}</p>
  <h4>Diagnostic morphology</h4>
  <ul>${o.diagnostic_morphology.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>
  <details>
    <summary>Habitat, look-alikes, limits and toxins</summary>
    <dl class="fw-meta fw-meta--stack">
      <div><dt>Typical habitat</dt><dd>${esc(o.typical_habitat)}</dd></div>
      <div><dt>Ecological function</dt><dd>${esc(o.ecological_function)}</dd></div>
      <div><dt>Similar-looking organisms</dt><dd>${esc(o.similar_taxa.join("; "))}</dd></div>
      <div><dt>Identification limitations</dt><dd>${esc(o.identification_limits)}</dd></div>
      ${o.toxin_associations.length ? `<div><dt>Reported toxin associations</dt><dd>${o.toxin_associations.map((t) => `<strong>${esc(t.toxin)}:</strong> ${esc(t.note)}`).join("<br>")} <em>Toxin production cannot be determined by looking at cells.</em></dd></div>` : ""}
      <div><dt>Local observations</dt><dd>None recorded yet.</dd></div>
      <div><dt>References</dt><dd>${o.references.map((k) => refLink(ctx, k)).join("; ")}</dd></div>
    </dl>
  </details>
  <p class="fw-organism-status">${badge("unverified", "Reference entry — no local record")} <span class="fw-muted">${esc(o.status_note)}</span></p>
</article>`;
    }).join("\n")}\n</div>` : `<p class="fw-empty">No entries yet in this category.</p>`}
</section>`;
  }).join("\n") + "\n";
}

function genQuestions(ctx, attrs) {
  let recs = D.questions.records;
  if (attrs.site) recs = recs.filter((q) => q.sites.includes(attrs.site));
  const compact = attrs.compact === "true";
  return `\n<ul class="fw-question-list${compact ? " fw-question-list--compact" : ""}">\n${recs.map((q) => `  <li class="fw-question" id="q-${esc(q.id)}">
    <p class="fw-question-theme">${esc(q.theme)} ${badge(q.status)}</p>
    <p class="fw-question-text">${esc(q.question)}</p>
    ${compact ? "" : `<p class="fw-question-links"><span>Background:</span> ${q.related_articles.map((p) => { const c = CHAPTERS.find((x) => x.path === p); return c ? `<a href="${ctx.toPortal}${p}">Ch. ${c.chapter_number} ${esc(c.short_title)}</a>` : (warn(`question ${q.id}: unknown article ${p}`), ""); }).join(", ")}
      · <span>Methods:</span> ${q.related_methods.map((m) => `<a href="${ctx.toPortal}${m}">${esc(m.split("#")[1].replace(/-/g, " "))}</a>`).join(", ")}
      · <span>Start reading:</span> ${q.references.map((k) => refLink(ctx, k)).join("; ")}</p>`}
  </li>`).join("\n")}\n</ul>\n`;
}

function genFacts(ctx, attrs) {
  const site = D.sites.records.find((s) => s.id === (attrs.site || "allen-branch"));
  return `\n<div class="fw-fact-table-wrap"><table class="fw-fact-table">
  <caption>${esc(site.name)}: what is known, how it is known, and how sure we are</caption>
  <thead><tr><th scope="col">Attribute</th><th scope="col">Value</th><th scope="col">Evidence</th><th scope="col">Source &amp; notes</th></tr></thead>
  <tbody>
${site.facts.map((f) => `    <tr>
      <th scope="row">${esc(f.label)}</th>
      <td>${esc(f.value)}</td>
      <td>${badge(f.evidence_status)}</td>
      <td>${f.source_url ? ext(f.source_url, esc(f.source)) : esc(f.source)}${f.retrieved_at ? ` <span class="fw-muted">(checked ${esc(f.retrieved_at)})</span>` : ""}${f.notes ? `<br><span class="fw-fact-note">${esc(f.notes)}</span>` : ""}</td>
    </tr>`).join("\n")}
  </tbody>
</table></div>\n`;
}

function genChecklist(ctx, attrs) {
  const site = D.sites.records.find((s) => s.id === (attrs.site || "allen-branch"));
  return `\n<ol class="fw-checklist">\n${site.investigation_tasks.map((t) => `  <li class="fw-check fw-check--${esc(t.status.replace(/_/g, "-"))}" id="task-${esc(t.id)}">
    <div class="fw-check-head"><span class="fw-check-task">${esc(t.task)}</span> ${badge(t.status)}</div>
    <p>${esc(t.summary)}</p>
    ${t.documentation.length ? `<p class="fw-check-docs">Documentation: ${t.documentation.map((d) => d.url.startsWith("#") ? `<a href="${esc(d.url)}">${esc(d.label)}</a>` : ext(d.url, esc(d.label))).join(", ")}</p>` : ""}
  </li>`).join("\n")}\n</ol>\n`;
}

function genSites(ctx) {
  return `\n<div class="fw-site-grid">\n${D.sites.records.map((s) => {
    const href = s.id === "allen-branch" ? `${ctx.toPortal}sites/allen-branch/` : s.link ? `${ctx.toPortal}${s.link}` : null;
    const st = s.sampling_status;
    return `<article class="fw-site-card${s.is_featured ? " fw-site-card--featured" : ""}" id="site-${esc(s.id)}">
  <p class="fw-site-type">${esc(s.environment)} · ${esc(s.region)}</p>
  <h3>${href ? `<a href="${esc(href)}">${esc(s.name)}</a>` : esc(s.name)}</h3>
  <p>${esc(s.habitat_summary)}</p>
  <dl class="fw-meta">
    <div><dt>Watershed status</dt><dd>${esc(s.watershed_status)}</dd></div>
    <div><dt>Sampling status</dt><dd>${esc(st)}</dd></div>
  </dl>
  ${s.access_notes && !s.is_featured ? `<p class="fw-muted">${esc(s.access_notes)}</p>` : ""}
</article>`;
  }).join("\n")}\n</div>\n`;
}

const GROUP_ORDER = ["base", "hydrology", "land", "karst", "infrastructure", "monitoring", "portal"];
function genLayers(ctx) {
  const L = D.layers;
  const rows = GROUP_ORDER.flatMap((g) => L.records.filter((r) => r.group === g)).map((r) => `    <tr id="layer-${esc(r.id)}">
      <th scope="row">${esc(r.name)}<br><span class="fw-muted">${esc(L.groups[r.group])}</span></th>
      <td>${esc(r.provider)}<br><span class="fw-muted">${esc(r.dataset)}</span></td>
      <td>${esc(r.version)}</td>
      <td>${esc(r.resolution)}</td>
      <td>${esc(r.coverage)}</td>
      <td>${esc(r.limitations)}</td>
      <td>${r.check_status === "ok" ? badge("ok", "Responding") : badge("unavailable")} <span class="fw-muted">${esc(r.checked_at)}</span></td>
    </tr>`).join("\n");
  return `\n<div class="fw-table-scroll" tabindex="0" role="region" aria-label="Map layer provenance table"><table class="fw-layer-table">
  <caption>Provenance of every map layer</caption>
  <thead><tr><th scope="col">Layer</th><th scope="col">Provider &amp; dataset</th><th scope="col">Date / version</th><th scope="col">Resolution</th><th scope="col">Coverage</th><th scope="col">Known limitations</th><th scope="col">Service check</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table></div>
<h3 id="not-available">Not available yet</h3>
<ul class="fw-not-available">
${L.not_available.map((n) => `  <li><strong>${esc(n.layer)}.</strong> ${esc(n.reason)}</li>`).join("\n")}
</ul>\n`;
}

function genToc(ctx, html) {
  const withoutToc = html.replace(/<!-- fw:toc -->[\s\S]*?<!-- \/fw:toc -->/, "");
  const mainPart = (withoutToc.match(/<main id="main"[^>]*>([\s\S]*?)<\/main>/) || [])[1] || withoutToc;
  const hs = [...mainPart.matchAll(/<h2 id="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => [m[1], m[2].replace(/<[^>]+>/g, "").trim()]);
  if (!hs.length) return "";
  return `\n<nav class="fw-toc" aria-label="On this page">\n  <p class="fw-toc-title">On this page</p>\n  <ol>\n${hs.map(([id, t]) => `    <li><a href="#${esc(id)}">${esc(t)}</a></li>`).join("\n")}\n  </ol>\n</nav>\n`;
}

function genCounts(ctx) {
  const lib = D.references.records.filter((r) => r.in_library).length;
  const c = [
    [D.resources.records.length, "curated resources", "resources/"],
    [lib, "papers in the library", "resources/literature/"],
    [D.glossary.records.length, "glossary terms", "learn/glossary/"],
    [D.questions.records.length, "open research questions", "projects/"],
    [D.observations.records.length, "published field observations", "observations/"],
  ];
  return `\n<ul class="fw-stats">\n${c.map(([n, l, href]) => `  <li><a href="${ctx.toPortal}${href}"><span class="fw-stat-n">${n}</span> <span class="fw-stat-l">${esc(l)}</span></a></li>`).join("\n")}\n</ul>\n`;
}

// ---------------------------------------------------------------- citations
function processCitations(ctx, html) {
  const order = [];
  html = html.replace(/<span class="cite" data-refs="([^"]+)">[\s\S]*?<\/span>/g, (m, keys) => {
    const ks = keys.split(/[\s,]+/).filter(Boolean);
    const nums = ks.map((k) => {
      if (!REF.has(k)) warn(`${rel(ctx.file)}: unknown citation key "${k}"`);
      let i = order.indexOf(k);
      if (i < 0) { order.push(k); i = order.length - 1; }
      return `<a href="#ref-${esc(k)}" aria-label="Reference ${i + 1}">${i + 1}</a>`;
    });
    return `<span class="cite" data-refs="${esc(ks.join(" "))}">[${nums.join(", ")}]</span>`;
  });
  return { html, order };
}
function genReferences(ctx, order) {
  if (!order.length) return `\n<p class="fw-empty">No sources are cited on this page.</p>\n`;
  return `\n<ol class="fw-references">\n${order.map((k) => {
    const r = REF.get(k);
    return `  <li id="ref-${esc(k)}">${r ? fmtReference(r) : `<strong>Missing reference: ${esc(k)}</strong>`}</li>`;
  }).join("\n")}\n</ol>\n`;
}

// ---------------------------------------------------------------- region replacement
const GENERATORS = {
  header: genHeader, footer: genFooter, "chapter-nav": genChapterNav, "prev-next": genPrevNext, chapters: genChapters,
  objectives: genObjectives, resources: genResources, literature: genLiterature, glossary: genGlossary, organisms: genOrganisms,
  questions: genQuestions, facts: genFacts, checklist: genChecklist, sites: genSites, layers: genLayers, counts: genCounts,
};
const parseAttrs = (s) => Object.fromEntries([...(s || "").matchAll(/([a-z-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
function replaceRegions(ctx, html) {
  return html.replace(/<!-- fw:([a-z-]+)((?: [a-z-]+="[^"]*")*) -->[\s\S]*?<!-- \/fw:\1 -->/g, (m, name, attrStr) => {
    if (name === "references" || name === "toc") return m; // done later
    const gen = GENERATORS[name];
    if (!gen) { warn(`${rel(ctx.file)}: unknown region fw:${name}`); return m; }
    return `<!-- fw:${name}${attrStr} -->${gen(ctx, parseAttrs(attrStr))}<!-- /fw:${name} -->`;
  });
}

// ---------------------------------------------------------------- validation
const rel = (f) => path.relative(ROOT, f);
function validatePage(ctx, html) {
  const r = rel(ctx.file);
  if ((html.match(/<h1[\s>]/g) || []).length !== 1) warn(`${r}: must have exactly one <h1>`);
  if (!/<title>[^<]+<\/title>/.test(html)) warn(`${r}: missing <title>`);
  if (!/<meta name="description" content="[^"]+"/.test(html)) warn(`${r}: missing meta description`);
  if (!/<main id="main"/.test(html)) warn(`${r}: missing <main id="main">`);
  if (html.includes("&amp;amp;")) warn(`${r}: double-escaped ampersand ("&amp;amp;")`);
  for (const m of html.matchAll(/<a\b[^>]*\bhref="https?:\/\/[^"]*"[^>]*>/g)) {
    if (!/\btarget="_blank"/.test(m[0])) warn(`${r}: external link without target="_blank": ${m[0].slice(0, 90)}`);
  }
  for (const name of ["header", "footer"]) if (!html.includes(`<!-- fw:${name} -->`)) warn(`${r}: missing fw:${name} region`);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dup.length) warn(`${r}: duplicate id(s): ${[...new Set(dup)].join(", ")}`);
  const idset = new Set(ids);
  for (const m of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const u = m[1];
    if (/^(https?:|mailto:|data:|javascript:)/.test(u)) continue;
    if (u.startsWith("#")) { if (u.length > 1 && !idset.has(u.slice(1))) warn(`${r}: in-page link to missing id ${u}`); continue; }
    const [p, hash] = u.split("#");
    if (!p) continue;
    let target = path.resolve(path.dirname(ctx.file), p.split("?")[0]);
    if (p.endsWith("/") || (fs.existsSync(target) && fs.statSync(target).isDirectory())) target = path.join(target, "index.html");
    if (!fs.existsSync(target)) { warn(`${r}: broken link ${u}`); continue; }
    if (hash && target.endsWith(".html") && target.startsWith(PORTAL)) {
      const other = target === ctx.file ? html : fs.readFileSync(target, "utf8");
      if (!other.includes(`id="${hash}"`)) warn(`${r}: link ${u} points to a missing anchor`);
    }
  }
  for (const m of html.matchAll(/<img\s[^>]*>/g)) if (!/\salt="/.test(m[0])) warn(`${r}: <img> without alt`);
}
function validateData() {
  const need = (file, recs, fields) => {
    const seen = new Set();
    for (const rec of recs) {
      for (const f of fields) if (rec[f] === undefined || rec[f] === null || rec[f] === "") warn(`data/${file}: ${rec.id || "?"} missing ${f}`);
      if (seen.has(rec.id)) warn(`data/${file}: duplicate id ${rec.id}`);
      seen.add(rec.id);
    }
  };
  need("resources.json", D.resources.records, ["id", "title", "organization", "category", "description", "geographic_relevance", "primary_use", "url", "source_type"]);
  for (const r of D.resources.records) {
    if (!/^https:\/\//.test(r.url)) warn(`data/resources.json: ${r.id} url is not https`);
    if (!D.resources.categories.includes(r.category)) warn(`data/resources.json: ${r.id} unknown category ${r.category}`);
  }
  need("references.json", D.references.records, ["id", "reference_type", "title", "authors", "verified_with", "verified_at"]);
  for (const r of D.references.records) {
    if (!r.doi && !r.url) warn(`data/references.json: ${r.id} has neither DOI nor URL`);
    if (r.in_library) for (const f of ["summary", "summary_status", "geographic_scope", "topics", "methodology", "key_findings", "limitations"]) if (!r[f]) warn(`data/references.json: library record ${r.id} missing ${f}`);
  }
  need("glossary.json", D.glossary.records, ["id", "term", "definition"]);
  need("organisms.json", D.organisms.records, ["id", "scientific_name", "group", "diagnostic_morphology", "identification_limits", "references"]);
  for (const o of D.organisms.records) for (const k of o.references) if (!REF.has(k)) warn(`data/organisms.json: ${o.id} unknown reference ${k}`);
  need("research-questions.json", D.questions.records, ["id", "question", "status", "references"]);
  for (const q of D.questions.records) for (const k of q.references) if (!REF.has(k)) warn(`data/research-questions.json: ${q.id} unknown reference ${k}`);
  need("map-layers.json", D.layers.records, ["id", "name", "group", "provider", "dataset", "version", "resolution", "coverage", "limitations", "service_url", "service_type"]);
  need("sites.json", D.sites.records, ["id", "name", "site_type", "environment", "watershed_status", "sampling_status"]);
  for (const s of D.sites.records) for (const f of s.facts) {
    if (!BADGE[f.evidence_status] || !["unverified", "mapped", "field_confirmed", "lab_confirmed"].includes(f.evidence_status)) warn(`data/sites.json: ${s.id} fact "${f.label}" bad evidence_status`);
  }
  need("articles.json", D.articles.records, ["id", "chapter_number", "title", "short_title", "path", "status", "summary", "learning_objectives"]);
  if (D.observations.records.length) need("observations.json", D.observations.records, ["id", "site_id", "observed_at", "review_status"]);
  for (const o of D.observations.records) if (o.review_status !== "published") warn(`data/observations.json: ${o.id} is not published — unpublished records must not be committed`);
}

// ---------------------------------------------------------------- search index
const strip = (s) => s.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ").trim();
function buildSearchIndex(pages) {
  const items = [];
  for (const { ctx, html } of pages) {
    if (ctx.relPath === "search/") continue;
    const title = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || ctx.short;
    const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
    const main = (html.match(/<main id="main"[^>]*>([\s\S]*?)<\/main>/) || [])[1] || "";
    const heads = [...main.matchAll(/<h[23] id="([^"]+)"[^>]*>([\s\S]*?)<\/h[23]>/g)];
    items.push({ k: "page", t: strip(title), u: ctx.relPath, d: desc, x: strip(main.replace(/<!-- fw:(resources|literature|glossary|organisms|references|layers)[\s\S]*?<!-- \/fw:\1 -->/g, " ")).slice(0, 4000).toLowerCase() });
    for (const h of heads) items.push({ k: "section", t: strip(h[2]), u: ctx.relPath + "#" + h[1], d: strip(title) });
  }
  for (const g of D.glossary.records) items.push({ k: "glossary", t: g.term, u: "learn/glossary/#term-" + g.id, d: g.definition });
  for (const o of D.organisms.records) items.push({ k: "organism", t: o.scientific_name, u: "organisms/#org-" + o.id, d: `${o.growth_form}; ${o.typical_habitat}`, x: [o.common_name, ...o.former_names].join(" ").toLowerCase() });
  for (const r of D.resources.records) items.push({ k: "resource", t: r.title, u: "resources/#res-" + r.id, d: `${r.organization} — ${r.description}`, x: r.category.toLowerCase() });
  for (const r of D.references.records.filter((x) => x.in_library)) items.push({ k: "paper", t: r.title, u: "resources/literature/#paper-" + r.id, d: `${(r.authors[0] || "").split(", ")[0]}${r.authors.length > 1 ? " et al." : ""} (${r.year}). ${r.summary}`, x: (r.topics || []).join(" ") });
  for (const q of D.questions.records) items.push({ k: "question", t: q.question, u: "projects/#q-" + q.id, d: q.theme });
  return JSON.stringify({ generated: "by tools/freshwater-portal/build.mjs", items });
}

// ---------------------------------------------------------------- main
function findPages(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "data" || e.name === "assets") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...findPages(p));
    else if (e.name === "index.html") out.push(p);
  }
  return out;
}

validateData();
const files = findPages(PORTAL).sort();
const ctxs = files.map((f) => pageContext(f, fs.readFileSync(f, "utf8")));
for (const c of ctxs) SHORT.set(c.relPath, c.short);

let stale = 0;
const results = [];
for (const ctx of ctxs) {
  let html = replaceRegions(ctx, ctx.html);
  const cit = processCitations(ctx, html);
  html = cit.html.replace(/<!-- fw:references -->[\s\S]*?<!-- \/fw:references -->/, `<!-- fw:references -->${genReferences(ctx, cit.order)}<!-- /fw:references -->`);
  html = html.replace(/<!-- fw:toc -->[\s\S]*?<!-- \/fw:toc -->/, (m) => `<!-- fw:toc -->${genToc(ctx, html)}<!-- /fw:toc -->`);
  if (cit.order.length && !html.includes("<!-- fw:references -->")) warn(`${rel(ctx.file)}: cites sources but has no fw:references region`);
  results.push({ ctx, html });
  if (html !== ctx.html) {
    stale++;
    if (CHECK) warn(`${rel(ctx.file)}: generated regions are out of date — run node tools/freshwater-portal/build.mjs`);
    else fs.writeFileSync(ctx.file, html);
  }
}
for (const { ctx, html } of results) validatePage(ctx, html);

const indexPath = path.join(DATA, "search-index.json");
const index = buildSearchIndex(results);
const oldIndex = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf8") : "";
if (index !== oldIndex) {
  if (CHECK) warn("research/freshwater/data/search-index.json is out of date — run the build");
  else fs.writeFileSync(indexPath, index);
}

if (problems.length) {
  console.error(`freshwater portal: ${problems.length} problem(s)\n  - ` + problems.join("\n  - "));
  process.exit(1);
}
console.log(`freshwater portal: ${files.length} pages OK${CHECK ? " (check mode)" : `, ${stale} updated`}`);
