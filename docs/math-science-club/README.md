# Math & Science Club section

Live at `https://justin83.github.io/biology-at-scc/math-science-club/`. It is the landing
page for anyone in Somerset Community College's Math & Science Club (KCTCS Somerset).

**Status (2026-11-05): live.** The club database was applied to the SyllaBased Supabase
project as migration `club_v1`, with Justin's approval. `enabled` in
`math-science-club/assets/club.js` is `true`.

## Pages

| URL (under `math-science-club/`) | For | What it does |
|---|---|---|
| `./` | everyone | Next meeting (food theme, sign-up button), the club's QR code with a **Show on the big screen** button for class, and event cards by month; food events have a **Sign up to bring food** button that opens the sign-up in a pop-up |
| `signup/` | everyone | The same sign-up as the pop-up, as its own page for phones. **Step 1 (required):** choose the get-together from large cards; nothing is preselected unless the link names one (the card buttons do). **Step 2:** who is bringing what, by category; add, change or remove your own sign-up; no account |
| `officers/` | club officers (`noindex`) | Edit dates, times, titles and food themes in a pop-up editor (two columns on a desktop); add, cancel or delete events; set up food categories; remove sign-ups; open or close sign-up; change the officer code |
| `qr/` | print | Poster with the club's QR code |

The site home page links to the club.

## For members

- The schedule comes from the printed *MSSE Scholars Proposed Activities — Fall 2026
  Schedule*. Its tentative items (marked ** on the flyer) carry a "Tentative" tag.
- There is one QR code. It opens the club website; people choose **Sign up to bring
  food** from there (on an event card, the next-meeting card, or **Food sign-up** in the
  club bar). Choose a category, type your name (first name and last initial is
  enough) and what you're bringing, and add an allergy note if needed.
- In class, **Show on the big screen** (next to the QR code on the club page) fills the
  screen with that QR code for students to scan.
  - Names and items are shown on the page so people can avoid duplicates.
  - Only the phone or computer that made a sign-up can change or remove it; it keeps a
    private token for that sign-up.
  - From another device, ask an officer to remove it.

## For officers

1. Choose **Officer tools** in the green club bar at the top of any club page, or go to
   `officers/` directly.
2. Enter the officer code. It is remembered only for that browser tab.
3. **Events:** choose **Edit** next to an event. The editor opens in a pop-up (two
   columns on a desktop, full screen on a phone). You can change:
   - its title, **food theme** (for example "Pasta" or "Tacos", shown on the card and in
     the sign-up; blank shows "to be announced"), date, last day (for multi-day events),
     start and end time, type, location or details;
   - **Tentative** marks it as may change. **Cancelled** keeps it on the page, crossed
     out. **Delete** removes it and its sign-ups.
   - **Add an event** creates a new one.
4. **Food sign-up:** tick "Members can sign up to bring food" on an event, then:
   - add a note if useful (for example, "The club is providing pizza");
   - set the categories and, optionally, how many of each are needed. "Use the usual
     categories" fills in Main dish, Side, Snack, Dessert and Drinks;
   - the November 19 meeting and the December 3 holiday party come set up this way.
5. **Remove a sign-up:** open the event in the editor; its sign-ups are listed with
   Remove buttons.
6. **Close food sign-up** stops all new sign-ups and changes until it is reopened.
7. **Change the officer code** (at least 8 characters) at the bottom of the officer
   tools. The new code works immediately, so share it with the other officers.

The officer code is stored only as a bcrypt hash. It was given to Justin directly and is
not in this repository.

## Logo

The club's shield and seal logos were provided as screenshots. They were redrawn as vector
images by `tools/math-science-club/make-logos.mjs`:
- the background changed from navy to the site's deep green (`#1a3d27`);
- the gold shield, gold ring and icon colors were kept;
- the lettering uses outlines of the open-licensed fonts Bebas Neue, Josefin Sans and
  Cinzel.

| File | What it is |
|---|---|
| `assets/logos/shield-green.svg` | The shield logo on green |
| `assets/logos/seal-green.svg` | The circular seal on green |
| `assets/logos/seal-combined.svg` | A variation combining both: the shield and its six colored icons inside the seal, with right-side-up text on the lower arc. **Used on the site** (copied to `assets/logo.svg`), chosen by Justin on 2026-11-05 |

To switch logos, copy the chosen file over `math-science-club/assets/logo.svg`. Every
club page uses that file. Because these are redraws, small details (letter shapes, icon
lines) differ from the originals. With the original image files, an exact recolor can
replace them.

## Data and privacy

- **Database:** the private schema `club` in the SyllaBased project. The browser reaches
  it only through the SECURITY DEFINER functions in
  `math-science-club/sql/001_club.sql`:
  - `club_events`, `club_signup`, `club_signup_update`, `club_signup_remove` — public;
  - `club_admin` — needs the officer code.
- **What's stored:** name, item, category and optional allergy note per sign-up. There is
  no email, phone or account.
- **Limits:** 60 sign-ups per event. Exact duplicates are refused, and sign-up closes
  once the event's date has passed.
- **When the database is off or unreachable:** the page shows the printed schedule from
  `data/events.json`, and the sign-up page says sign-up is unavailable.

## Testing (local stand-in database; never production)

```bash
npm install --no-save @electric-sql/pglite@0.5.8      # once
CLUB_TODAY=2026-11-05 node tools/math-science-club/local-api.mjs &
node --test tools/math-science-club/tests/*.test.mjs   # 7 database contract tests
NODE_PATH=$(npm root -g) node tools/math-science-club/tests/club-pages.e2e.mjs   # browser test (Playwright)
node tools/math-science-club/check.mjs                 # page checks, schedule data, QR code
node tools/math-science-club/make-qr.mjs               # regenerate the QR code
```

To try the pages against the local database, open any club page with
`?api=http://127.0.0.1:8789`; the officer code is `local-officer-code`. `?api=off` returns
to the real database.

## Go-live record (2026-11-05)

1. Applied `math-science-club/sql/001_club.sql` as migration `club_v1`. It seeded the 17
   Fall 2026 events. The security advisors show only the expected notices: RLS without
   policies on the private tables, and SECURITY DEFINER functions callable by anon.
2. Set the officer code; only the hash is stored.
3. Production smoke test through the public REST API with the publishable key:
   - the schedule loads;
   - a test sign-up was added, changed and removed with its token (a wrong token is
     refused); none remains;
   - a wrong officer code is refused;
   - the `club` schema is not exposed.
4. Set `enabled: true` in `assets/club.js`.

5. **Update 2026-11-05 (migration `club_v2`, `sql/002_club_theme.sql`):**
   - adds the food theme;
   - removes the paper plates, cups and napkins category from the seeded events.

   The page moved to event cards with a sign-up pop-up, a big-screen QR code, and a
   pop-up officer editor.

Rollback: the `drop …` statements at the end of the SQL file. Setting `enabled: false`
returns the pages to the printed schedule.
