# BIO 151 Mitosis Lab

Students count cells in each stage of the cell cycle in **two regions, 25 cells per region**,
on their phones. The classroom screen shows the class totals and the mitotic index, with
no names. The instructor sees each student's name, counts, completion, mitotic indices
and last-saved time, can correct a record or recover a student's access, and downloads
a named CSV. Design and decisions: [PLAN.md](PLAN.md).

## Pages

| URL | Who | What |
|---|---|---|
| `https://biologyatscc.com/labs/bio151-mitosis/` | students (QR target) | First name, last name, a counting table per region (− / number / +) with a live "n / 25", and Save. Partial saves are fine; they can come back on the same device and finish. |
| `…/labs/bio151-mitosis/dashboard/` | classroom screen | Class mitotic index per region, class totals by stage (bar chart and table), a dot plot of individual indices, and a QR code for the form. **No names.** |
| `…/labs/bio151-mitosis/instructor/` | instructor (`noindex`) | Key sign-in, then the roster plus Edit, Recover access, open/close, CSV, settings, a new semester, and the key. |
| any page + `?exp=<name>` | — | The same page for another semester's experiment. |

QR codes for the form: `labs/bio151-mitosis/qr-student-form.svg` and
[`qr-student-form.png`](qr-student-form.png). Regenerate them with
`node tools/bio151-mitosis/make-qr.mjs`. The form URL never changes, so the printed QR
works every semester.

## For the instructor

- **Sign in** with the instructor key. It is the same key as the spectrophotometry lab's
  dashboard: its hash was copied, and the key itself was never seen. It is remembered
  only in that browser tab. Change it under *Change the instructor key*.
- **Roster:** one row per submission, sorted by last name. It shows:
  - the name and a short ID (`#1a2b3c`), which tells two students with the same name
    apart;
  - each region's counts and its total;
  - Complete or Partial;
  - the mitotic index per region. A region still being counted shows "(of n)", meaning
    provisional;
  - the last-saved time, marked "by you" after a correction.
- **Edit:** change names or counts, or add a note only you see. It works even after data
  entry is closed. **Delete** is for test entries and accidental duplicates.
- **Recover access** (a student lost or changed their device):
  - the page makes a new link and QR code for that student and shows it once;
  - the student opens it on the new device and keeps editing there;
  - the old device stops working for that submission.
  - Alternatively, use **Edit** and enter the counts for them.
- **Close data entry** after the lab. Students can still see their counts but can't
  save. *Reopen* undoes it.
- **Download CSV (named)** saves `bio151-mitosis-<term>-named.csv`. It has one row per
  student, with every count, the totals, mitotic cells and the index per region, and
  the last-saved time. It contains names: keep it out of this repository and off shared
  drives.

## Each semester

Each semester is its own experiment, so a new class never touches an earlier one's data.
1. On the instructor page, use *Start a new semester* with a name such as
   `bio151-mitosis-2027sp` and the term. It copies the regions and stages.
2. Set `EXPERIMENT_SLUG` in `labs/bio151-mitosis/config.js` to the new name and merge.
   Until then, the form works with `?exp=<name>`.
3. Rename the regions under *Experiment settings* before any student saves; after that
   they are fixed.

Fall 2026: `bio151-mitosis-2026fa`. Its regions are called "Region 1" and "Region 2" (rename
them before the lab), with stages Interphase, Prophase, Metaphase, Anaphase and Telophase
(mitotic = all but Interphase), 25 cells per region, open.

## How it works (short)

- Database: schema `mitosislab` in the SyllaBased Supabase project, migration
  `mitosis_v1` (`labs/bio151-mitosis/sql/001_mitosis.sql`). It is a separate schema from
  the spectrophotometry lab's `livelab`, which this feature doesn't touch.
- Tables are private (RLS with no policies, no grants). Pages call six
  `SECURITY DEFINER` functions: `mitosis_get_experiment`, `mitosis_dashboard`,
  `mitosis_save`, `mitosis_update`, `mitosis_get_own` and `mitosis_instructor`.
- A student's first save returns a random 256-bit editing token once. The database keeps
  only its sha256, and the device keeps the token in `localStorage`. Later saves need it.
  Names never unlock anything, and duplicate names are separate submissions.
- The public functions never return names, submission IDs or per-student times. The
  contract tests check this.
- The instructor key is a bcrypt hash in `mitosislab.settings`, checked only by
  `mitosis_instructor`. Corrections, recoveries, deletions and setting changes are written
  to `mitosislab.audit`, which never holds a token.

## Testing (local stand-in database; never production)

```bash
cd tools/bio151-mitosis && npm install --no-save @electric-sql/pglite@0.5.8 && cd ../..   # once
node tools/bio151-mitosis/local-api.mjs &                       # http://127.0.0.1:8790, key: local-instructor-key
node --test labs/bio151-mitosis/tests/api-test.mjs              # 7 database contract tests
NODE_PATH=$(npm root -g) node tools/bio151-mitosis/e2e.mjs      # browser test (Playwright)
node tools/bio151-mitosis/make-qr.mjs --check                   # QR codes match the form URL
```

To try the pages against the local database, open any of them with
`?api=http://127.0.0.1:8790`; `?api=off` goes back to the real one.

## Production record

See the "Production record" at the end of [PLAN.md](PLAN.md).
