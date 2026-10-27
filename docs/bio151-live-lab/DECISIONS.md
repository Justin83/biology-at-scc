# Decisions — BIO 151 Live Lab

Dated 2026-10-26/27. Each entry: decision, why, what it costs, what we assumed.

## D1. Keep the site static on GitHub Pages; add a database behind it instead of a server

- **Decision:** No application server. The two new pages are plain HTML/JS in
  the existing GitHub Pages site and talk directly to a database API.
- **Why:** The repo is a no-build static site deployed by the existing
  `pages.yml` workflow. A server would mean new hosting, secrets management and
  a deploy pipeline, none of which could be made reliable overnight.
- **Cost:** $0. GitHub Pages is free for public repos.
- **Assumption:** GitHub Pages serves over HTTPS at
  `https://justin83.github.io/biology-at-scc/` (confirmed by the Pages API;
  the site was returning 404 on the night of 10/26 because nothing had been
  deployed since Aug 30 — a fresh deploy fixes it).

## D2. Persist in the existing SyllaBased Supabase project, in a private schema

- **Decision:** Tables in schema `livelab` of Supabase project
  `efxymeviokaocosmpqwf` (the user's SyllaBased course platform), reached only
  through five `SECURITY DEFINER` functions in `public` named `lab_*`.
- **Why:** It is the only existing persistent backend with a browser-facing
  HTTPS API (PostgREST) already in place. The Supabase org is on the **free
  tier with both free project slots used** (SyllaBased, pathbuilder-portal), so a
  third project would cost money. The Neon org (free) has one unrelated project
  and no browser-facing API configured; wiring Neon's Data API would have been
  new, untested plumbing the night before class.
- **Isolation:** `livelab` is not in PostgREST's exposed schemas, so no table is
  reachable with the anon/publishable key; only the five functions are. Nothing
  in SyllaBased's own tables or functions was modified.
- **Cost:** $0 incremental. Four groups × ten readings is negligible against
  free-tier limits (500 MB database, 5 GB egress/month). Dashboard polling at
  12 s for a 2-hour lab is ~600 requests of ~3 KB.
- **Assumption:** SyllaBased project stays active (free projects pause after a
  week of inactivity; this project is in daily use).
- **Reversible:** `drop schema livelab cascade;` plus dropping the five
  `public.lab_*` functions removes everything (see DEPLOYMENT.md rollback).

## D3. Authorization = group PIN (student edits) + instructor key (names, admin)

- **Decision:** The first students to join a group choose a PIN (4–32 chars).
  Every save sends the PIN; the server bcrypt-checks it. Student names are
  stored but returned only by `lab_instructor`, which requires a separate
  random instructor key (bcrypt hash in `livelab.settings`). Public endpoints
  (`lab_get_experiment`, `lab_dashboard`) return group numbers and counts only.
- **Why:** The brief asked for a lightweight, group-specific credential rather
  than a public group number, and for names never to appear in public
  responses. Full user accounts would add sign-up friction for a 2-hour lab.
- **Trade-offs:** A classmate who learns a group's PIN can edit that group's
  data; acceptable for a classroom. There is no rate limit on PIN guesses
  (the instructor key path sleeps 0.5 s on failure). The instructor can reset
  any PIN from the dashboard.
- **Assumption:** Phones keep `localStorage`, so a student who closes the tab
  returns straight to their group without retyping the PIN.

## D4. The publishable Supabase key is embedded in `config.js`

- Supabase "publishable"/anon keys are designed to ship in browsers; the
  SyllaBased project already uses them in public embeds. Security comes from
  the function grants, not from hiding the key. The service-role key is not
  used anywhere in this feature.

## D5. Wavelengths are data, not code

- `livelab.experiments.x_values` holds the list. The form and dashboard read it
  on every load; the instructor changes it from the dashboard's "Instructor
  tools" (action `set_x_values`). Readings keep their own `x_value`, so
  changing the list never deletes data; readings at wavelengths no longer in
  the list simply stop being drawn (and still export to CSV).
- `x_kind = 'time'` plus `x_label`/`x_unit` make the same tables and pages
  serve an absorbance-versus-time experiment later (tested in the suite).

## D6. Chart.js, vendored

- Chart.js 4.5.0 (`labs/vendor/chart.umd.min.js`, 208 KB) is committed rather
  than loaded from a CDN so the classroom TV page does not depend on a third
  host. Missing readings are `null` with `spanGaps:false`, so the line breaks
  instead of interpolating; no value is ever fabricated. Each group has a fixed
  color and a distinct point shape (circle, square, triangle, diamond), so the
  legend is not color-only.

## D7. Only changed cells are sent on Save

- The form tracks dirty cells and sends just those, and re-syncs untouched cells
  from the server every 12 s. Two partners can therefore type on two phones into
  the same group without overwriting each other.

## D8. Testing approach

- `tests/api-test.mjs` exercises every RPC against **any** endpoint. Before the
  live migration was approved it ran against an embedded Postgres (PGlite)
  that executes the real migration with stand-ins for pgcrypto; after approval
  it ran unchanged against live Supabase. Browser flows were driven in headless
  Chrome (puppeteer-core) at phone and TV viewport sizes. The Claude-in-Chrome
  extension was not connected in the build session, so no manual browser
  session was used.

## D9. Things deliberately not built

- No per-student login, no e-mail, no realtime websockets (polling is enough
  for four groups), no offline queue (readings are typed one at a time; a
  failed save is reported in red and nothing is lost from the inputs), no admin
  UI for creating experiments (use `lab_instructor` with `create_experiment`
  from the test suite pattern or SQL).
