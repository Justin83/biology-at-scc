# Deployment — BIO 151 Live Lab

## Hosting

| Piece | Where | How it deploys |
|---|---|---|
| Student form + dashboard (static) | GitHub Pages, repo `Justin83/biology-at-scc`, build type *workflow* | `.github/workflows/pages.yml` runs on every push to `main` (also `workflow_dispatch`) and publishes the repo root |
| Database + API | Supabase project **SyllaBased** `efxymeviokaocosmpqwf` (us-west-2), free tier | SQL migration `livelab_bio151_v1` (file: `labs/bio151-spectro/sql/001_livelab.sql`) — **applied 2026-10-27 ~02:25 ET** |

### Live URLs

- Student form: `https://justin83.github.io/biology-at-scc/labs/bio151-spectro/`
- Dashboard: `https://justin83.github.io/biology-at-scc/labs/bio151-spectro/dashboard/`
- API base: `https://efxymeviokaocosmpqwf.supabase.co/rest/v1/rpc/`

Reachability from outside the development computer: the Supabase API **is**
public now (verified with the test suite from this machine over the internet).
The GitHub Pages URLs are public **once the branch is deployed to `main`**; on
2026-10-26 the whole Pages site returned 404 (nothing deployed since Aug 30),
so a deploy is required before the QR code works on a phone.

## Configuration names

Client (`labs/bio151-spectro/config.js`, all public values):

| Key | Value / meaning |
|---|---|
| `SUPABASE_URL` | `https://efxymeviokaocosmpqwf.supabase.co` |
| `SUPABASE_KEY` | Supabase *publishable* key `sb_publishable_…` (public by design) |
| `EXPERIMENT_SLUG` | `bio151-chlorophyll` (override per page with `?exp=`) |
| `STUDENT_FORM_URL` | printed/QR URL, shown on the dashboard QR panel |
| `REFRESH_SECONDS` | 12 |

Server (database):

| Name | Where | Meaning |
|---|---|---|
| `livelab.settings` row `instructor_key_hash` | Supabase | bcrypt hash of the instructor key. **The plain key is not in the repo.** |

Test/CI environment variables (`labs/bio151-spectro/tests/api-test.mjs`):
`LAB_API_URL`, `LAB_API_KEY`, `LAB_INSTRUCTOR_KEY`.

## Instructor key

- Generated 2026-10-27 in the build session; its bcrypt hash is in
  `livelab.settings`. The plain key was left for the instructor in the build
  machine's Claude scratchpad file `instructor_key.txt` (session-specific
  folder, see HANDOFF.md) — copy it into a password manager.
- **Rotate / set a new key** (Supabase SQL editor, replace NEW-KEY):

```sql
update livelab.settings
   set value = extensions.crypt('NEW-KEY', extensions.gen_salt('bf', 10))
 where key = 'instructor_key_hash';
```

- The dashboard keeps the key in `sessionStorage` for the tab only.

## Deployment steps (finish the deploy)

1. Open the PR for branch `feature/bio151-live-lab` and merge it into `main`
   (or push `main`). This triggers *Deploy GitHub Pages*.
2. Watch `gh run list --workflow=pages.yml --limit 1` until `completed success`
   (≈20 s historically).
3. Verify (from any network):
   ```
   curl -sI https://justin83.github.io/biology-at-scc/labs/bio151-spectro/ | head -1        # 200
   curl -sI https://justin83.github.io/biology-at-scc/labs/bio151-spectro/dashboard/ | head -1
   ```
4. Open the dashboard on the TV browser; open the form on a phone via the QR;
   join a group with a test PIN, save one reading, press **Refresh now** on the
   dashboard, confirm the point appears. Then clear that group from *Instructor
   tools* (Clear group data) so the class starts empty.

If the Pages site still 404s after a successful run: Settings → Pages in the
GitHub repo must show *Source: GitHub Actions*; re-run the workflow with
`gh workflow run pages.yml --ref main`.

## Verification commands

```
# API contract suite against live (needs the instructor key in the env):
$env:LAB_API_URL="https://efxymeviokaocosmpqwf.supabase.co"
$env:LAB_API_KEY="sb_publishable_xoPXCFR7FN5X6as1E1tYAg_bmSpYMHE"
$env:LAB_INSTRUCTOR_KEY="<instructor key>"
node --test labs/bio151-spectro/tests/api-test.mjs
```
The suite creates and deletes its own `selftest-<timestamp>` experiment and
never touches `bio151-chlorophyll`.

Quick public health check (no key):
```
curl -s -X POST https://efxymeviokaocosmpqwf.supabase.co/rest/v1/rpc/lab_dashboard \
  -H "apikey: sb_publishable_xoPXCFR7FN5X6as1E1tYAg_bmSpYMHE" -H "Content-Type: application/json" \
  -d '{"p_slug":"bio151-chlorophyll"}'
```

## Rollback

- **Site:** revert the merge commit on `main` (Pages redeploys automatically),
  or delete `labs/` and `docs/bio151-live-lab/`.
- **Database (removes all lab data):**
  ```sql
  drop function if exists public.lab_get_experiment(text);
  drop function if exists public.lab_join_group(text, int, text, text[]);
  drop function if exists public.lab_save_readings(text, int, text, jsonb, text, text);
  drop function if exists public.lab_dashboard(text);
  drop function if exists public.lab_instructor(text, text, text, jsonb);
  drop schema if exists livelab cascade;
  ```
  Export the CSV from the dashboard first if the data matters.
- **Close data entry without deleting anything:** Instructor tools → *Close
  data entry* (`update_experiment` with `is_open=false`).

## Costs and limits

- GitHub Pages: $0. Supabase free tier: $0 incremental (shared with SyllaBased;
  500 MB DB, 5 GB egress, 50k monthly active auth users — none used here,
  project pauses after 7 days without activity, SyllaBased is used daily).
- External services required at lab time: GitHub Pages (static files) and
  Supabase (API). No CDN dependency (Chart.js is vendored).
