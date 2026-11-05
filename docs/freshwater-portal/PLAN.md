# Freshwater Ecology & Watershed Research portal — implementation plan

Working title: **Biology at SCC — Freshwater Ecology & Watershed Research**
Initial field focus: **Allen Branch**, Somerset Community College, Somerset, Pulaski County, Kentucky.
Proposed home: `research/freshwater/` in this repository.

This document is the "before coding" deliverable requested in the project brief:
page hierarchy, component architecture, data model, visual design plan, reusable
components, and a phased sequence. It is written against what this repository
actually contains on 2026-11-05, not against an assumed framework.

---

## 1. What the existing site is (inspection findings)

| Area | Finding | Consequence for the portal |
|---|---|---|
| Framework / routing | Plain static HTML + one shared stylesheet (`assets/style.css`). No build step, no framework, folder-per-page routing (`/section/index.html`). | The portal is static HTML in the same style of routing: `research/freshwater/<section>/index.html`. |
| Deployment | GitHub Pages via `.github/workflows/pages.yml`, triggered by every push to `main`; uploads the repository root as-is. Public repository. | No server-side code. Anything committed is public. Merging to `main` **is** a production deploy, so this work stays on a branch/PR until Justin approves. |
| Design tokens | `assets/style.css`: `--bg`, `--fg`, `--muted`, `--accent` (#2e6b3e green), `--border`, `--card-bg`, `--max-width: 960px`; light + dark via `prefers-color-scheme`; system font stack; `.card`, `.card-grid`, `.breadcrumb`, `.placeholder`, `.lede`. | Portal stylesheet imports the site tokens, then adds navy/teal research tokens on top. Same header, footer, and card idioms so the portal reads as part of Biology at SCC. |
| Authentication | None on the public site. The BIO 151 live lab (`labs/bio151-spectro/`) uses a PIN + instructor-key model over Supabase RPC functions (`SECURITY DEFINER`, private `livelab` schema) in the existing SyllaBased Supabase project. | Phase 1 needs no accounts (acceptance criterion 1). Phase 4 CRUD needs real accounts; the PIN model is not adequate for student records. See §8 open decisions. |
| Database | Supabase project `efxymeviokaocosmpqwf` (SyllaBased), free tier, both free project slots used (`docs/bio151-live-lab/DECISIONS.md` D2). Publishable key already ships in `labs/bio151-spectro/config.js`. | Phase 1 ships seed data as versioned JSON that mirrors the future tables 1:1. A draft SQL schema is written but **not applied**. |
| Vendored libraries | `labs/vendor/chart.umd.min.js` (Chart.js 4.5.0) — vendored so classroom pages never depend on a CDN. | Same policy for the map: Leaflet 1.9.4 is vendored under `research/freshwater/assets/vendor/leaflet/`. Chart.js is reused in Phase 5 time-series charts. |
| Related content | `posters-presentations/lake-linville/` — a student freshwater water-quality poster (Rockcastle County). | Linked from the portal as an example of prior SCC student freshwater work; its findings are not re-used as portal data. |

---

## 2. Page hierarchy

All routes are relative to the site root (`https://justin83.github.io/biology-at-scc/`).

```
research/freshwater/
├── index.html                                  Research Home — dashboard
├── learn/
│   ├── index.html                              Learn — wiki hub, topic map
│   ├── glossary/index.html                     Searchable glossary
│   └── cyanobacteria/
│       ├── index.html                          Overview: "Cyanobacteria: Biology, Ecology, and Harmful Freshwater Blooms"
│       ├── what-are-cyanobacteria/             Chapter 1
│       ├── diversity-and-identification/       Chapter 2
│       ├── freshwater-ecology/                 Chapter 3
│       ├── nutrients-and-watersheds/           Chapter 4
│       ├── harmful-algal-blooms/               Chapter 5
│       ├── food-webs/                          Chapter 6
│       ├── prevention-and-control/             Chapter 7
│       ├── laboratory-methods/                 Chapter 8
│       ├── kentucky/                           Chapter 9
│       └── open-questions/                     Chapter 10
├── maps/index.html                             Watersheds & Maps — interactive map + layer provenance
├── sites/
│   ├── index.html                              Field-site inventory
│   └── allen-branch/index.html                 Allen Branch research-site profile
├── organisms/index.html                        Organism Identification Atlas
├── methods/index.html                          Field & laboratory methods, measurement dictionary, safety
├── resources/
│   ├── index.html                              Resource Library (searchable, filterable cards)
│   └── literature/index.html                   Research Paper Library (bibliographic records)
├── projects/index.html                         Research Projects + research questions
├── observations/index.html                     Field observations (empty state + data dictionary)
├── standards/index.html                        Evidence labels, citation standards, data-quality policy
├── search/index.html                           Portal-wide search
├── data/                                       Versioned seed data (JSON) mirroring the database tables
└── assets/                                     portal.css, portal.js, map.js, vendor/leaflet
```

Every page carries the site header, a persistent portal navigation bar (the ten
destinations in the brief), breadcrumbs, and the site footer. Learn pages add a
chapter sidebar, an on-page contents list, previous/next links, and related-topic
links.

---

## 3. Component architecture

The site has no build step and Pages publishes the repository as-is. The portal keeps
that property — **every page is a finished, readable HTML file in the repository** —
while avoiding hand-copying the navigation onto ~25 pages.

### 3.1 In-place generator (`tools/freshwater-portal/build.mjs`)

A dependency-free Node script (Node 22, no `npm install`) that rewrites marked regions
inside the portal's HTML files and is committed together with its output:

| Marker | Filled with |
|---|---|
| `<!-- fw:header -->…<!-- /fw:header -->` | Site header, skip link, portal bar, ten-item portal nav with `aria-current`, search form, breadcrumbs |
| `<!-- fw:footer -->…<!-- /fw:footer -->` | Portal footer (data/licensing notes) + site footer |
| `<!-- fw:chapter-nav -->` | Chapter sidebar, generated from `data/articles.json` |
| `<!-- fw:prev-next -->` | Previous/next chapter links |
| `<!-- fw:references -->` | Numbered reference list for every `<span class="cite" data-refs="…">` on the page, in order of first citation |
| `<!-- fw:resources -->`, `<!-- fw:literature -->`, `<!-- fw:glossary -->`, `<!-- fw:organisms -->`, `<!-- fw:questions -->`, `<!-- fw:checklist -->`, `<!-- fw:layers -->`, `<!-- fw:chapters -->` | Pre-rendered cards/tables from the JSON seed data |

It also writes `data/search-index.json`. `node tools/freshwater-portal/build.mjs --check`
rebuilds in memory and fails if any page is stale, a citation key is unknown, an
internal link is broken, a JSON record is missing a required field, or an id repeats.

Because cards are pre-rendered, the portal works without JavaScript and is indexable;
JavaScript only adds filtering, search, the map, and the theme toggle.

### 3.2 Browser modules (`research/freshwater/assets/`)

| File | Responsibility |
|---|---|
| `portal.css` | Research design tokens and components (portal bar, chapter layout, status badges, evidence callouts, resource cards, figures, tables, knowledge checks, print styles) |
| `portal.js` | Mobile navigation, theme toggle (auto/light/dark), list filtering (`data-filter-list`), glossary/atlas search, on-page contents highlighting |
| `search.js` | Client-side search over `data/search-index.json` (pages, chapters, glossary, organisms, resources, references) |
| `map.js` | Leaflet map: base layers, public GIS overlays, local Allen Branch extract with flow arrows, layer panel with provenance |
| `vendor/leaflet/` | Leaflet 1.9.4 (BSD-2-Clause), vendored |

Knowledge checks use native `<details>` disclosure (no JavaScript, keyboard-operable).

### 3.3 Diagrams

Original inline SVG figures (CC BY 4.0 like the rest of the site), each with a
caption, a text description for screen readers, and a "figure source" note. Phase 1
figures: cyanobacterial vs. green-algal cell; watershed nutrient pathways
(proximity vs. hydrologic connectivity, including karst). Later: N and P cycles,
food web, bloom formation.

---

## 4. Data model (summary)

Full entity definitions: [DATA_MODEL.md](DATA_MODEL.md). Draft SQL (not applied):
[schema/001_freshwater_portal.sql](schema/001_freshwater_portal.sql).

Entities: `field_sites`, `sampling_stations`, `site_investigation_tasks`,
`field_observations`, `water_quality_measurements`, `organism_taxa`,
`organism_observations`, `media_assets`, `research_references`, `resource_links`,
`wiki_articles`, `glossary_terms`, `research_projects` (+ link tables to sites,
references, questions, members), `research_questions`, `spatial_layers`,
`portal_members` (roles).

Shared columns on every record: `id`, `slug`, timestamps, `created_by`,
`updated_by`, `review_status` (draft → submitted → approved/published → archived),
`evidence_status` where it applies (unverified / mapped / field_confirmed /
lab_confirmed), and provenance (`source`, `source_url`, `retrieved_at`).

Phase 1 stores the public seed records as JSON in `research/freshwater/data/` with
**the same field names** as the tables, so the Phase 4 migration is a mechanical
load, not a redesign. No student or unpublished record is ever written to JSON in
this public repository (see `.gitignore` `exports/` precedent).

---

## 5. Visual design plan

- **Identity:** the existing Biology at SCC header and footer stay on top and bottom;
  the portal adds a deep-navy research bar beneath the site header.
- **Palette (light):** navy `#13294b` (navigation, headings), teal `#1c6e73`
  (links, interactive accents), field green `#2e6b3e` (the site's existing accent),
  white/near-white surfaces, light-gray borders. Dark mode re-maps every token
  (navy surfaces, lighter teal/green text) and follows the system setting, with a
  manual toggle.
- **Status badges** (never color-only — each has a text label and an icon glyph):
  Unverified (amber), Mapped (blue), Field confirmed (green), Laboratory confirmed
  (violet), Not started / Planned (gray).
- **Knowledge labels** for scientific statements: Established knowledge, Single
  study, Preliminary observation, Hypothesis, Speculative proposal.
- **Typography:** system sans-serif for interface; a system serif stack (Charter /
  Iowan / Georgia) for long-form chapter text at ~68 characters per line, for a
  textbook reading rhythm. No web-font downloads.
- **Layouts:** dashboard grid (home); three-column reading layout on wide screens
  (chapter list · text · on-page contents) collapsing to one column with a
  collapsible chapter list on phones; card grids for library/atlas/sites.
- **Accessibility:** skip link, landmarks, one `h1` per page, `aria-current` in
  navigation, visible focus rings, ≥4.5:1 text contrast in both themes, keyboard-
  operable filters and map, `prefers-reduced-motion` respected, figures with text
  alternatives, tables with headers and captions.

---

## 6. Existing pieces reused

| Existing | Reused as |
|---|---|
| `assets/style.css` tokens, `.card`, `.card-grid`, `.lede`, `.placeholder`, header/footer markup | Base layer of the portal; portal CSS extends rather than replaces it |
| GitHub Pages workflow | Unchanged; the portal deploys with the site when `main` is updated |
| Vendoring policy (`labs/vendor/`) | Leaflet vendored the same way |
| Supabase RPC pattern (`labs/bio151-spectro/lab-api.js`, `SECURITY DEFINER`, private schema) | Template for Phase 4 public read functions; draft schema follows the same private-schema isolation |
| Lake Linville poster page | Linked as prior student freshwater work |
| Homepage / department card idiom | One new "Freshwater Ecology & Watershed Research" card on the homepage and the Math & Natural Sciences page; nothing else on those pages changes |

---

## 7. Phased implementation sequence

| Phase | Deliverables | Status in this PR |
|---|---|---|
| **1 — Portal foundation** | Research home, portal navigation + breadcrumbs + search, wiki structure, cyanobacteria overview, resource library with filters, research-paper library, Allen Branch profile (verified facts only), maps page with provenance, standards page, generator + checks | **Delivered** |
| **2 — Educational content** | Complete Chapters 3, 4, 6, 7, 8, 9 to the depth of Chapters 1, 2 and 5; organism atlas images (licensed or SCC photomicrographs); more figures (N/P cycles, food web); glossary expansion | Chapters 1, 2, 5 and 10 written in full; Chapters 3, 4, 6–9 published as reviewed outlines with objectives, key terms and verified references; atlas seeded with eight cyanobacterial genera (text only) |
| **3 — Geography and mapping** | StreamStats delineation, field-verified access point and sampling stations, land-cover summary from real spatial data, culvert/outfall inventory | Map, public layers and the NHD-mapped flow path are live; delineation and summaries deliberately **not** computed |
| **4 — Research management** | Supabase Auth, roles, RLS, CRUD forms for projects/observations/measurements/media, faculty review queue | Draft schema + RLS design only; nothing applied |
| **5 — Advanced analysis** | Time-series charts, occurrence maps, exports, cross-project comparisons | Not started |

---

## 8. Open decisions for Justin

1. **Approve publishing.** Merging this branch to `main` deploys the portal publicly.
2. **Phase 4 backend.** Options: (a) a `freshwater` schema inside SyllaBased with
   Supabase Auth accounts for students (new for this site); (b) a separate Supabase
   project (costs money: both free slots are used); (c) keep student work in the PIN
   pattern (not recommended for multi-week records with attachments and review).
3. **Student identity on public pages.** Proposed default: publish first name + last
   initial only with written consent; never publish student emails.
4. **Allen Branch access.** The campus access point, safe access route, and any
   permission requirements need to be documented by faculty before student visits.
5. **Images.** The atlas and chapters need either SCC-taken photomicrographs or
   openly licensed images; none are copied in Phase 1.
6. **Links blocked to automated checks** (listed on the resource cards and in
   `data/resources.json`) need one manual browser check.
