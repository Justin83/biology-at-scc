# BIO 151 Mitosis Lab — implementation plan

**Status:** plan of record, 2026-11-10. Not built yet. No database objects or pages exist
for it. This plan records Justin's decisions of 2026-11-10 (D1–D11 below), including the
change from initials to first and last names. No earlier written plan was found in
this repository, so this file is the starting point.

## Summary

Students count onion-root-tip cells (or a similar specimen) by mitotic stage in **two
regions, 25 cells per region**, and enter their counts on their phones. The classroom
screen shows the class totals and graphs, **with no student names anywhere in public**.
The instructor signs in to a separate dashboard. It shows each student's full name,
counts, completion status, mitotic indices and last-saved time, and lets the instructor
correct a record, recover a student's access and export a named CSV.

It follows the same pattern as the BIO 151 spectrophotometry lab
(`labs/bio151-spectro/`, `docs/bio151-live-lab/`):
- static pages on GitHub Pages;
- the SyllaBased Supabase project as the database;
- a private schema reached only through `SECURITY DEFINER` functions.

It is a **separate feature**, with its own schema, tables, functions and pages.

## Decisions (2026-11-10)

| # | Decision |
|---|---|
| D1 | **New dedicated tables** for mitosis experiments, student submissions and region-specific stage counts, in their own private schema `mitosislab`. Do not reuse the spectrophotometer tables (`livelab.*`), and do not change or touch the historical chlorophyll records. |
| D2 | **No PINs and no group selection.** Students work individually. Each submission carries the student's **First Name** and **Last Name** (both required), stored in the submissions table. *(Amended 2026-11-10: this replaces the earlier proposal of first and last initials.)* |
| D3 | On the **first save**, the server generates a **random editing token**, stores **only its hash**, and returns the token once; the student's device keeps it. Every later edit requires the token. **A name never authorizes editing**, and no function looks a submission up by name. |
| D4 | **Duplicate names are allowed.** Each submission gets its own anonymous submission ID (a UUID) and its own token, so two students with the same name never collide. |
| D5 | **Minimal student screen:** First Name, Last Name, two region-specific counting tables, a live total "n / 25" under each table, and **Save**. |
| D6 | **Instructor-only:** names (identifying information), the CSV export, corrections to submissions, and opening/closing data entry. |
| D7 | **Public classroom dashboard:** aggregate counts and graphs only. No names, initials or submission IDs, **in the page or in any public API response**. |
| D8 | **Authorization and validation live in the database** (dedicated functions). The browser can't update a table directly, and anonymous callers can't change a submitted record without its token. |
| D9 | **Instructor recovery** for a student who loses the original device: the instructor issues a new token for that submission, the old one stops working, and the student continues on the new device. |
| D10 | **One experiment per semester** (for example `bio151-mitosis-2026fa`, then `bio151-mitosis-2027sp`). A later class writes to its own experiment and can't overwrite Fall 2026. |
| D11 | **Instructor sign-in is separate from student access.** The instructor key and the student editing tokens are different credentials, checked by different functions. Neither can be used for the other's actions. |

## Architecture

```
phone ──▶ labs/bio151-mitosis/               student form (First, Last, two tables, Save)
TV    ──▶ labs/bio151-mitosis/dashboard/     public classroom dashboard (aggregates only)
laptop──▶ labs/bio151-mitosis/instructor/    instructor dashboard (key required; noindex)
   all ──HTTPS──▶ SyllaBased Supabase /rest/v1/rpc/mitosis_*
                    └─ public.mitosis_* (SECURITY DEFINER, search_path = '') ─▶ mitosislab.*
```

- `mitosislab` is not an exposed schema. RLS is on with no policies, and `anon` and
  `authenticated` have no rights on it. The only way in is the functions below.
- `config.js` holds the Supabase URL, the publishable key and the **current semester's
  experiment slug**. The printed QR code points at the stable form URL, so it never
  changes between semesters.
- The Labs page (`labs/index.html`) gets a card for the new lab.

## Data model (schema `mitosislab`)

```sql
experiments (
  id uuid pk, slug text unique,             -- e.g. 'bio151-mitosis-2026fa'; never reused
  title text, course text, term text,       -- term: 'Fall 2026'
  regions jsonb,                            -- ordered: [{key:'r1', label:'…'}, {key:'r2', label:'…'}]
  stages  jsonb,                            -- ordered: [{key:'interphase', label:'Interphase', mitotic:false},
                                            --           {key:'prophase', …, mitotic:true}, …]
  cells_per_region int default 25 check (between 1 and 200),
  is_open boolean default true,
  created_at, updated_at timestamptz
)
submissions (
  id uuid pk default gen_random_uuid(),     -- the anonymous submission ID
  experiment_id uuid fk -> experiments,
  first_name text not null,                 -- 1–40 characters after trimming
  last_name  text not null,                 -- 1–40 characters after trimming
  token_hash text not null,                 -- sha256 hex of the current editing token
  token_issued_at timestamptz,              -- first save or last recovery
  created_at, last_saved_at timestamptz,
  instructor_note text                      -- optional, instructor only
)                                           -- no unique constraint on names (D4)
stage_counts (
  submission_id uuid fk -> submissions on delete cascade,
  region_key text, stage_key text,
  count int not null check (count between 0 and 200),
  primary key (submission_id, region_key, stage_key)
)
settings (key text pk, value text)          -- 'instructor_key_hash' = bcrypt (pgcrypto crypt/gen_salt('bf'))
audit (                                     -- instructor corrections and recoveries
  id bigserial pk, at timestamptz, action text, experiment_id uuid, submission_id uuid,
  detail jsonb                              -- e.g. old and new counts; never a token
)
```

**Proposed default stages** (to confirm): Interphase, Prophase, Metaphase, Anaphase,
Telophase. All but Interphase count as mitotic. **Region labels** are set per experiment
(to confirm; for example the root-tip region and a region farther back). Stages and
regions are **data, not code**. The instructor can adjust them before the first student
saves, and they are then frozen for that experiment.

## Database functions

All are `SECURITY DEFINER`, `set search_path = ''`, revoked from `public`, and granted to
`anon, authenticated`.

| Function | Who | Checks | Returns | Never returns |
|---|---|---|---|---|
| `mitosis_get_experiment(slug)` | anyone | none | title, term, regions, stages, cells per region, open/closed | any submission data |
| `mitosis_dashboard(slug)` | anyone (classroom TV) | none | submissions count; complete count; totals per region × stage; pooled mitotic index per region; the **list of individual mitotic indices per region, unordered and without IDs** (for a dot plot or histogram) | names, submission IDs, per-student timestamps |
| `mitosis_save(slug, first, last, counts)` | student, first save | experiment open; validation below | `{ok, submission_id, token}` (the token appears **once**) | — |
| `mitosis_update(submission_id, token, first, last, counts)` | student, later saves | token hash matches; experiment open; validation | `{ok, last_saved_at}` | — |
| `mitosis_get_own(submission_id, token)` | student, return visit | token hash matches | that submission's names and counts | anyone else's data |
| `mitosis_instructor(key, action, slug, payload)` | instructor | instructor key (bcrypt) | see actions | tokens or token hashes |

**Instructor actions:**
- `check`.
- `list`: full name, short ID, counts per region, completion, mitotic index per region,
  last saved.
- `export`: the same rows for the named CSV.
- `update_submission`: correct names or counts, audited.
- `recover_access`: rotate the token, audited.
- `set_open`.
- `create_experiment`: fails if the slug exists.
- `update_experiment`: labels and stages, only while there are no submissions.
- `set_key`: change the instructor key.

**Validation in the database:**
- names are trimmed and 1–40 characters of letters, spaces, hyphens, apostrophes and
  periods;
- counts are whole numbers ≥ 0, keys match the experiment's regions and stages, and each
  region totals no more than `cells_per_region`;
- the experiment is open, for student writes;
- a cap on submissions per experiment (for example 300) and on request size.

**Partial saves are allowed** (a student can save 12 of 25 and finish later). A
submission is **complete** when every region totals exactly `cells_per_region`.

## Editing token lifecycle

1. **First save:** `mitosis_save` creates the submission. It generates a 256-bit random
   token (`extensions.gen_random_bytes(32)`) and stores `sha256(token)`. It returns the
   ID and token once. The page keeps `{submission_id, token}` in `localStorage`, keyed by
   the experiment slug. The token is never put in a URL query string or the database in
   plain form.
2. **Return visit (same device):** the page finds the stored pair, calls
   `mitosis_get_own` and shows the saved counts. Save calls `mitosis_update` with the token.
3. **Wrong or missing token:** the request is refused ("This device can't edit that
   submission; ask your instructor"). Typing the same name makes a **new** submission and
   never opens the old one (D3, D4).
4. **Recovery (D9):**
   - On the instructor dashboard, the instructor clicks **Recover access** on the
     student's row.
   - The server rotates the token: a new random token is issued, its hash replaces the
     old one, and the change is written to the audit table. The old token stops working.
   - The dashboard shows the new token once, as a link and a QR code. The link puts the
     token in the URL fragment, which is never sent to a server:
     `…/labs/bio151-mitosis/#recover=<submission_id>.<token>`.
   - The student scans or opens it on the new device. The page stores the pair, removes
     the fragment from the address bar, and loads the submission.
   - Alternatively, the instructor can just enter the counts for the student with
     **Edit**.
5. **End of semester:** closing the experiment rejects every student write, with or
   without a token.

## Pages

**Student form** (`labs/bio151-mitosis/`), phone first:
- First Name and Last Name (required);
- two tables, one per region, each with one row per stage: a number field with − and +
  buttons;
- a live **"n / 25"** under each table. It is marked done at 25, and the total can't go
  over 25;
- **Save**, which confirms with "Saved 10:42 AM"; on a return visit it loads the saved
  counts;
- nothing else: no groups, PINs, graphs or mitotic index.

**Public classroom dashboard** (`labs/bio151-mitosis/dashboard/`), refreshing about every
12 s:
- for each region, a bar chart of the class totals per stage;
- the class mitotic index for each region;
- how many students have saved and how many are complete;
- a dot plot of the individual mitotic indices per region, with no labels;
- a QR code for the form;
- built only from `mitosis_dashboard`, so the response carries no names or IDs.

**Instructor dashboard** (`labs/bio151-mitosis/instructor/`, `noindex`):
- key sign-in, kept for the browser tab only;
- a table with one row per submission:
  - full name and a short ID (to tell duplicate names apart);
  - Region 1 counts and Region 2 counts;
  - completion (complete / partial, n/25 + n/25);
  - mitotic index for Region 1 and Region 2;
  - last saved;
- **Edit** (names and counts), **Recover access**, **Open/Close data entry**, and
  **Download CSV (named)**, saved as `bio151-mitosis-<term>-named.csv` with one row per
  submission and every count, total and index;
- the CSV has names, so it never goes in this repository.

## Calculations

- **Total per region** = the sum of that region's stage counts. It must not exceed 25,
  and the submission is complete at exactly 25 in each region.
- **Mitotic index (per student, per region)** = (cells in stages marked mitotic) ÷ (cells
  counted in that region), shown as a percentage. It is computed in the database for the
  instructor list and the CSV, so the page and the export always agree.
- **Class mitotic index (public)** = pooled across complete submissions: the sum of
  mitotic cells ÷ the sum of cells counted, per region. The dashboard also shows the
  spread of individual indices.

## Semester separation and historical data (D1, D10)

- Each semester is a new experiment, created with `create_experiment`, with a slug like
  `bio151-mitosis-2026fa`. `config.js` names the current one.
- Old experiments are closed, never reused and never deleted. A student token belongs to
  one submission, in one experiment, so it can't write anywhere else.
- Nothing in `livelab` (the spectrophotometer lab, including the Fall 2026 chlorophyll
  records) is altered by this feature. `mitosis_v1` creates only new objects.
- Combining years later (like the spectrophotometer "All years" item in `TODO.md`) can
  read across experiments with the same stages and regions.

## Security and privacy checklist

- [ ] Private schema; RLS on with no policies; the schema isn't exposed; functions are
  the only way in.
- [ ] Every function is `SECURITY DEFINER` with `search_path = ''`, revoked from
  `public`, and granted only as listed.
- [ ] Tokens: 256-bit random, sha256 stored, compared by hash, returned only at creation
  or recovery, never logged or audited.
- [ ] The instructor key is a bcrypt hash in `mitosislab.settings`. It is separate from
  the spectrophotometer key, though the instructor may choose the same phrase.
- [ ] Public functions never select `first_name` or `last_name`. A contract test checks
  that the public responses contain none of the test names and no submission IDs.
- [ ] No table grants to `anon`; no update path except through the token or instructor
  functions.
- [ ] Rate and size limits as above.
- [ ] Names are student records. They are kept in the database for the semester, and the
  named CSV is kept off the repository. The plan for after grading is an open question
  below.
- [ ] Run the Supabase security advisors after the migration; only the expected notices
  (RLS without policies, SECURITY DEFINER functions callable by anon) should remain.

## Testing plan

- **Database contract tests** (`node --test`) against a local PGlite stand-in, as with
  the club and the spectrophotometer lab. They check that:
  - a first save returns a token;
  - an update needs it, and a wrong token or a name alone is refused;
  - duplicate names create separate submissions;
  - more than 25 in a region is refused, partial saves are allowed, and complete is
    reached at 25 + 25;
  - a closed experiment refuses student writes;
  - the instructor key is required and a wrong key is refused;
  - recovery rotates the token (the old one fails, the new one works) and is audited;
  - the public responses contain no names or IDs;
  - Fall's data is unchanged after writes to a Spring experiment;
  - mitotic indices are correct.
- **Browser tests** (Playwright):
  - the phone flow: save, reload, edit, and a duplicate name on a second device;
  - the recovery link;
  - the public dashboard's text and network responses contain no names;
  - the instructor table, Edit, Recover, CSV and Close.
- **Accessibility:** axe-core on all three pages, light and dark, phone and desktop.

## Delivery steps

1. `labs/bio151-mitosis/sql/001_mitosis.sql` (migration `mitosis_v1`) and the contract
   tests, run locally.
2. The student form and the public dashboard.
3. The instructor dashboard.
4. With Justin's go-ahead:
   - apply `mitosis_v1` to SyllaBased and set the instructor key;
   - create `bio151-mitosis-2026fa`;
   - deploy the pages and add the Labs card;
   - make the QR code;
   - run a live smoke test with throw-away names, then remove them.

## Open questions for Justin

1. **Stages:** Interphase, Prophase, Metaphase, Anaphase, Telophase. Is Cytokinesis
   counted separately, or with Telophase?
2. **The two regions:** what should each table be called?
3. **25 cells per region** for every student: confirm.
4. **Date and sections** of the Fall 2026 mitosis lab (the deadline for steps 1–4).
5. **After grading:** keep names in the database, or blank them after the semester (the
   counts stay)?
6. **Instructor key:** a new phrase, or the same one as the spectrophotometer lab?
