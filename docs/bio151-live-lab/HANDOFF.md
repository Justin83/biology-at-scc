# HANDOFF — BIO 151 Live Lab

**Deadline:** Tuesday, October 27, 2026, 11:00 AM ET lab.
**Last updated:** 2026-10-27 ~02:45 ET by the Claude Code build session.

## Where the code is

- Repository: `https://github.com/Justin83/biology-at-scc` (local checkout `C:\Projects\biology-at-scc`)
- Branch: `feature/bio151-live-lab` (branched from `main` at `8ce077e`)
- Latest commit: see `git log -1` on the branch; the hash is recorded at the bottom of this file after each commit.
- Pull request: https://github.com/Justin83/biology-at-scc/pull/8

## Status by component

| Component | State | Evidence |
|---|---|---|
| Database schema + 5 RPC functions (`sql/001_livelab.sql`) | **Deployed and verified** on Supabase `efxymeviokaocosmpqwf` as migration `livelab_bio151_v1` | 6/6 API tests pass against the live endpoint (2026-10-27 02:33 ET) |
| Instructor key hash in `livelab.settings` | **Deployed and verified** | live instructor tests pass; plain key held outside the repo (see below) |
| Seeded experiment `bio151-chlorophyll`, 4 groups, 10 wavelengths | **Deployed and verified; data is empty** | `lab_dashboard` shows 0/10 for all groups, no PINs set |
| Student form `labs/bio151-spectro/index.html` | **Implemented and tested** in headless Chrome (phone viewport) against the live backend, served from a local static server | 17/17 e2e checks pass |
| Dashboard `labs/bio151-spectro/dashboard/index.html` | **Implemented and tested** the same way (1920×1080) | chart shows 4 series, gaps not interpolated, names hidden until unlock |
| Instructor tools (names, CSV, wavelengths, close/open, reset PIN, clear group) | Names/unlock/wavelength editor **tested in browser**; CSV download, close/open and reset/clear **tested at the API level only** (buttons exercised by code review, not clicked) | api-test.mjs |
| GitHub Pages deployment of the new pages | **Not deployed.** The entire Pages site currently returns 404 (no deploy since Aug 30). Branch not yet merged. | `curl https://justin83.github.io/biology-at-scc/` → 404 on 10/26 |
| Access from a real phone over the internet | **Not verified** (blocked on the deploy above). Backend reachability from outside is verified. | — |
| QR code (`qr-student-form.svg/.png`) + LaTeX snippet | **Generated** for the final URL; not yet scanned with a phone | `docs/bio151-live-lab/qr-latex-snippet.tex` |
| Printed packet update in Overleaf | **Awaiting instructor** (paste the snippet) | — |
| Wavelength list / decimal precision | **Awaiting instructor confirmation** in the lab; editable from the dashboard | EXPERIMENT.md |
| DPIP experiment | **Planned, not implemented as data**; create with `create_experiment` if reagents check out | EXPERIMENT.md |

## Blockers

1. **Deploy to GitHub Pages needs a human action.** Merging the PR (or any push
   to `main`, or `gh workflow run pages.yml --ref main`) was classified as a
   production deploy and denied for the autonomous session. Until then the QR
   code points at a 404.
2. The **instructor key** is not in the repo (by design). It was generated on
   the build machine and left in the session scratchpad:
   `C:\Users\justi\AppData\Local\Temp\claude\C--Projects-biology-at-scc\af31c699-eea4-48b8-94a2-1af45f4575d3\scratchpad\instructor_key.txt`.
   Copy it somewhere durable **now**; if it is lost, set a new one with the SQL
   in DEPLOYMENT.md (takes 10 seconds).

## Exact next actions (in order)

1. `gh pr merge <PR#> --squash` (or merge in the GitHub UI). Wait for the
   *Deploy GitHub Pages* run to finish.
2. Open `https://justin83.github.io/biology-at-scc/labs/bio151-spectro/dashboard/`
   on the classroom computer. Confirm the chart loads with four empty groups.
3. Scan `docs/bio151-live-lab/qr-student-form.png` (or the dashboard's *Show QR
   for students*) with a phone; join Group 1 with a throw-away PIN, save one
   value, press *Refresh now* on the dashboard, see the point. Then *Instructor
   tools → Clear group data* for group 1.
4. Confirm the wavelength list against the instrument dial; edit in *Instructor
   tools* if needed.
5. Paste `qr-latex-snippet.tex` into the Overleaf packet, recompile, check the
   QR scans to the live form, print.

## Restart procedure for the next Claude Code session

1. Read this file, then `docs/bio151-live-lab/README.md` and `EXPERIMENT.md`.
2. `git status`, `git branch --show-current`, `git log --oneline -5`,
   `git fetch && git status -sb` (remote sync).
3. Start the app locally: `node <scratchpad>/tools/local-server.mjs 8787`
   (embedded Postgres + static files; see DECISIONS D8) **or** simply serve the
   repo root with any static server and use the live backend — `config.js`
   already points at it.
4. Confirm persistence: run the API suite against live (DEPLOYMENT.md →
   Verification commands).
5. Confirm the chart: open the dashboard, save a reading from the form, refresh.
6. Verify the phone URL (step 2–3 above) and that the QR decodes to it.
7. Adjust wavelengths / `y_decimals` as the instructor directs.
8. Update the Overleaf packet with the verified URL.

Resume prompt for a fresh session:

> Read docs/bio151-live-lab/HANDOFF.md in C:\Projects\biology-at-scc and
> continue the BIO 151 live lab: finish the GitHub Pages deploy, verify the
> student form and dashboard on the live URLs, then help me adjust wavelengths
> and update the Overleaf packet before the 11:00 AM lab.

## Test results (latest)

- `node --test labs/bio151-spectro/tests/api-test.mjs` against local PGlite harness: **6 pass / 0 fail** (2026-10-27 02:30 ET)
- Same suite against live Supabase (`LAB_API_URL=https://efxymeviokaocosmpqwf.supabase.co`): **6 pass / 0 fail** (02:33 ET)
- Headless-Chrome e2e (phone form → save → reload → dashboard → instructor unlock), local harness: 16/17 then **17/17** after fixing a favicon 404; live backend: **17/17** (02:34 ET)
- Synthetic data used by the live e2e run (Group 4) was cleared afterwards; live experiment is empty.

## Files added/modified on this branch

```
labs/bio151-spectro/index.html
labs/bio151-spectro/dashboard/index.html
labs/bio151-spectro/config.js
labs/bio151-spectro/lab-api.js
labs/bio151-spectro/lab.css
labs/bio151-spectro/qr-student-form.svg
labs/bio151-spectro/sql/001_livelab.sql
labs/bio151-spectro/tests/api-test.mjs
labs/vendor/chart.umd.min.js
docs/bio151-live-lab/README.md, HANDOFF.md, DECISIONS.md, EXPERIMENT.md, DEPLOYMENT.md
docs/bio151-live-lab/qr-latex-snippet.tex, qr-student-form.png
README.md (site structure section)
```

## Commit / PR record

- Commits on branch: 7ae1a1b (feature), f215a5f (README fix); this file updated in the following commit — run git log -1 for the current hash
- PR: https://github.com/Justin83/biology-at-scc/pull/8 (open, not merged — merging = deploy)
