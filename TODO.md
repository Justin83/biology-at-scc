# To do

Open items for the Biology at SCC site. Add new items at the end of their section; move
finished ones to "Done" with the date.

## Math & Science Club (`msclub/`)

- [ ] **Version tags on the club pages' CSS and JS links.** Right after an update, a browser
  that visited in the last 10 minutes can show the new page with its old (cached) CSS and
  JS: a half-styled page with no events until it is refreshed (seen 2026-11-09). Add a
  `?v=<content hash>` to each stylesheet and script link, a small script that stamps them,
  and a `check.mjs` rule that fails when a tag is stale.
- [ ] **STEAM Day sign-up note says "S-STEM scholars".** The info page says "MSSE scholars".
  Justin's call; change it in Officer tools (STEAM Day → Edit → note) if wanted.
- [ ] **STEAM Day location.** The event says "North Campus"; the drafted text said "SCC
  Somerset Campus". Justin's call; change it in Officer tools if wanted.

## BIO 151 live lab (`labs/bio151-spectro/`)

The Fall 2026 chlorophyll lab is finished. Its experiment (`bio151-chlorophyll`) was
closed on 2026-11-10: 25 readings, 3 groups with PINs and names, kept as the Fall record.

- [ ] **Download the Fall 2026 data** (dashboard → Instructor tools → CSV) for your records.
  The CSV has student names, so keep it out of this repository.
- [ ] **Make sure the instructor key is somewhere safe** before next semester (the dashboard
  needs it for names, CSV, wavelengths, close/reopen and resetting a group). If it is
  lost, set a new one with the SQL in `docs/bio151-live-lab/DEPLOYMENT.md`.
- [ ] **Before next semester's lab: start a fresh experiment** rather than reopening Fall's.
  Fall's groups 1–3 keep their PINs, so new students could not join them, and the graph
  would show Fall's lines. Steps (about 5 minutes, or ask Claude):
  1. Create the new experiment with `lab_instructor(<key>, 'create_experiment', ...)`
     (see `docs/bio151-live-lab/EXPERIMENT.md`), for example `bio151-chlorophyll-2027sp`,
     with the wavelengths you'll use.
  2. Set `EXPERIMENT_SLUG` in `labs/bio151-spectro/config.js` to it and merge. The QR code
     and the printed packet do not change (they point at the page, not the experiment).
  3. Update the Fall note on `labs/index.html`; Fall's graph stays viewable at
     `labs/bio151-spectro/dashboard/?exp=bio151-chlorophyll`.
  Do this shortly before the lab: an open experiment's groups can be claimed (PIN set) by
  anyone who has the link.
- [ ] **Tidy: "Clear group data" doesn't clear the leaf type** (noted 2026-10-27 in
  `docs/bio151-live-lab/HANDOFF.md`).
- [ ] **"All years" view, so the data adds up over the years.** Every semester's run is
  kept (nothing is deleted), but the dashboard shows one run at a time. Build before
  spring, together with the fresh-experiment step above:
  - tag each run with its semester and a shared series (for example
    `bio151-chlorophyll`), in a small migration; Fall 2026 gets tagged "Fall 2026";
  - a public read function that returns every run in a series, without student names;
  - an "All years" page (or a dashboard tab): one line per semester (the class average
    at each wavelength), how many groups each semester, and one CSV of all semesters'
    readings (names stay behind the instructor key);
  - keep the wavelengths the same each semester so the years compare directly.
  Decided 2026-11-10: one run per semester (clean groups and PINs, and the classroom
  graph shows only that class) rather than adding new groups to Fall's run.

## Done

- 2026-11-10: BIO 151 Fall 2026 chlorophyll lab closed; Labs page says so.
