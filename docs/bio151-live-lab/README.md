# BIO 151 Live Lab — live spectrophotometry data collection

Students in BIO 151 (Somerset Community College) read absorbance values off a
manual spectrophotometer, type them into a phone form, and the whole class
watches an absorbance-versus-wavelength graph build up on the classroom TV.
First use: **Tuesday, October 27, 2026, 11:00 AM lab** (chlorophyll absorption
spectrum).

## Documentation index

| File | What it holds |
|---|---|
| [HANDOFF.md](HANDOFF.md) | Current state, what is tested vs. not, blockers, exact next actions, restart procedure |
| [DECISIONS.md](DECISIONS.md) | Why GitHub Pages + Supabase RPC, cost, security model, assumptions |
| [EXPERIMENT.md](EXPERIMENT.md) | Protocol, wavelengths, data fields, instrument limits, configurable parameters |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Hosting, URLs, database, env/config names, verification, rollback, key rotation |
| [qr-latex-snippet.tex](qr-latex-snippet.tex) | Overleaf-ready QR block with a single `\LabFormURL` macro |
| [qr-student-form.png](qr-student-form.png) | QR image (same URL) for non-LaTeX use |

## Architecture in one paragraph

The site is static HTML on GitHub Pages (no build step). Two new pages under
`labs/bio151-spectro/` call five PostgreSQL functions over Supabase's REST
endpoint (PostgREST) with the public *publishable* key. The functions live in
the `public` schema of the existing **SyllaBased** Supabase project and are
`SECURITY DEFINER`; the tables live in a private `livelab` schema that the API
never exposes. A group edits only its own row set after presenting the PIN the
group chose when it first joined; student names are returned only to callers
holding the instructor key. The dashboard draws the chart with a vendored copy
of Chart.js and polls every 12 s.

```
phone  ──HTTPS──▶ GitHub Pages: labs/bio151-spectro/            (student form)
TV     ──HTTPS──▶ GitHub Pages: labs/bio151-spectro/dashboard/  (instructor dashboard)
   both ──HTTPS──▶ https://efxymeviokaocosmpqwf.supabase.co/rest/v1/rpc/lab_*
                        └─ public.lab_* (SECURITY DEFINER) ─▶ livelab.* tables
```

## Routes

| URL | Purpose | Who |
|---|---|---|
| `https://justin83.github.io/biology-at-scc/labs/bio151-spectro/` | Data-entry form (QR target) | students |
| `https://justin83.github.io/biology-at-scc/labs/bio151-spectro/dashboard/` | Chart, status cards, table, instructor tools | instructor / TV |
| either page + `?exp=<slug>` | Same pages for another experiment | — |

## Repository layout for this feature

```
labs/
├── bio151-spectro/
│   ├── index.html            student form
│   ├── dashboard/index.html  classroom dashboard + instructor tools
│   ├── config.js             Supabase URL, publishable key, experiment slug, form URL, refresh seconds
│   ├── lab-api.js            fetch wrapper for the lab_* RPCs, error texts, number parsing
│   ├── lab.css               mobile-first styles (shares the site's color tokens)
│   ├── qr-student-form.svg   QR shown on the dashboard ("Show QR for students")
│   ├── sql/001_livelab.sql   the database migration (applied as livelab_bio151_v1)
│   └── tests/api-test.mjs    node --test contract suite (local harness or live)
└── vendor/chart.umd.min.js   Chart.js 4.5.0 (vendored so the TV never depends on a CDN)
docs/bio151-live-lab/         this folder
```

## Status (as of 2026-10-27 ~02:40 ET)

Implemented, tested locally and against the live database. **Not yet deployed to
the public URL**: the branch must be merged to `main` (or the Pages workflow
re-run) and the live URLs verified. See HANDOFF.md.
