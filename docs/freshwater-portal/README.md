# Freshwater Ecology & Watershed Research portal — operations

The portal lives at `research/freshwater/` and is published with the rest of the site by
GitHub Pages. Public URL once merged to `main`:
`https://justin83.github.io/biology-at-scc/research/freshwater/`.

| Document | Holds |
|---|---|
| [PLAN.md](PLAN.md) | Page hierarchy, component architecture, visual design, reuse, phases, open decisions |
| [DATA_MODEL.md](DATA_MODEL.md) | Entities, fields, roles and permissions |
| [schema/001_freshwater_portal.sql](schema/001_freshwater_portal.sql) | Draft Phase 4 schema — **not applied** |
| [VERIFICATION.md](VERIFICATION.md) | What was verified for the first release, how, and what still needs a person |
| [FIELD_SUBMISSIONS.md](FIELD_SUBMISSIONS.md) | Student observation form with photos (EXIF time/GPS, QR codes), faculty review, privacy, storage, and the go-live steps — **not live yet** |

## Layout

```
research/freshwater/
├── index.html, learn/, maps/, sites/, organisms/, methods/, resources/, projects/,
│   observations/, standards/, search/          pages (finished static HTML)
│   observations/submit/, observations/review/  student form and faculty review (see FIELD_SUBMISSIONS.md)
├── sql/001_field_submissions.sql               observation database (Supabase) — not applied yet
├── data/                                       seed data, one JSON file per future table
│   └── geo/                                    small GeoJSON extracts (Allen Branch NHD, stations, campus point)
└── assets/
    ├── portal.css, portal.js                   design system and shared behavior
    ├── map.js, search.js, atlas.js             map, portal search, atlas comparison
    ├── fieldobs.js                             observation database config (enabled: false) + API client
    ├── submit.js, review.js, observations.js   student form, faculty review, public display
    ├── qr-submit.svg                           QR code for the form (make-qr.mjs)
    └── vendor/                                 Leaflet 1.9.4 (BSD-2-Clause), exifr 7.1.3 (MIT),
                                                qrcode-generator 1.4.4 (MIT), vendored with licenses
tools/freshwater-portal/
├── build.mjs              in-place generator + validator
├── check-links.mjs        re-checks every Resource Library link, records results
├── verify-references.mjs  re-checks every DOI against Crossref (read-only)
├── make-qr.mjs            regenerates assets/qr-submit.svg (--check to verify)
├── local-api.mjs          local stand-in for the observation database (PGlite), for tests
└── tests/                 database contract tests, browser end-to-end test, EXIF fixture
```

## Everyday commands (Node 18+, no `npm install`)

```bash
node tools/freshwater-portal/build.mjs            # regenerate shared regions after any edit
node tools/freshwater-portal/build.mjs --check    # CI-style check: stale pages, broken links, bad citations
node tools/freshwater-portal/check-links.mjs      # refresh link-check fields in data/resources.json, then build
node tools/freshwater-portal/verify-references.mjs
```

Preview locally: `python3 -m http.server` from the repository root, then open
`http://localhost:8000/research/freshwater/`. Pages must be served over HTTP (not opened
as files) because the map and search load JSON.

## How the generator works

Each page is complete HTML. Shared parts sit between markers such as
`<!-- fw:header --> … <!-- /fw:header -->`; `build.mjs` rewrites only those regions.
Regions: `header`, `footer`, `chapter-nav`, `prev-next`, `toc`, `objectives`,
`chapters`, `references`, `resources`, `literature`, `glossary`, `organisms`,
`questions`, `facts`, `checklist`, `sites`, `layers`, `counts` (some take attributes,
e.g. `<!-- fw:resources featured="true" limit="6" -->`).

Citations: write `<span class="cite" data-refs="key1 key2"></span>` where `key` is an
`id` in `data/references.json`. The build numbers them in order of first use and fills
the page's `fw:references` list. An unknown key fails the build.

## Common tasks

- **Add a resource:** append a record to `data/resources.json` (fields in DATA_MODEL.md),
  run `check-links.mjs`, then `build.mjs`.
- **Add a reference:** look the DOI up on Crossref and copy the metadata exactly (or
  extend the generator script pattern used for the first release); never type author
  lists or page numbers from memory. Run `verify-references.mjs`, then `build.mjs`.
  Set `in_library: true` and fill the library fields to show it in the Research Paper
  Library, with an honest `summary_status`.
- **Add a chapter page:** copy an existing chapter, change the `fw:short` meta and
  content, add it to `data/articles.json`, run `build.mjs`.
- **Change a site fact:** edit `data/sites.json`; every fact needs `evidence_status`,
  `source`, `source_url` and `retrieved_at`. Never upgrade evidence without new evidence.
- **Publish an observation:** once the observation database is live, students submit with
  the form and faculty approve on the review page — nothing is committed. Before that,
  only faculty-approved records go in `data/observations.json`
  (`review_status: "published"`); the build refuses anything else. Never commit drafts,
  exports or student contact details — this repository is public.

## Deployment

Nothing in this folder deploys by itself. Merging to `main` triggers the existing Pages
workflow (`.github/workflows/pages.yml`), which publishes the whole site. That is a
production deploy and needs Justin's go-ahead.
