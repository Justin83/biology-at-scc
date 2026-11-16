# Math & Science Club section

Live at `https://biologyatscc.com/msclub/` (until the domain is set up:
`https://justin83.github.io/biology-at-scc/msclub/`). It is the landing
page for anyone in Somerset Community College's Math & Science Club (KCTCS Somerset).

**Status (2026-11-05): live.** The club database was applied to the SyllaBased Supabase
project as migration `club_v1`, with Justin's approval. `enabled` in
`msclub/assets/club.js` is `true`.

## Pages

The club pages, like the rest of biologyatscc.com, are **kept out of search engines** for now
(`noindex`; Justin's call, 2026-11-16). It may go public one day; see *Search engines* in the
repository README. People reach the club through the QR poster and shared links.

| URL (under `msclub/`) | For | What it does |
|---|---|---|
| `./` | everyone | **Up next**: the next meeting, once (date, time, food theme, the sign-up button, how many are bringing food and a link to who's bringing what), with its flyer beside it (below it on a phone); then the next three events as cards; **See the full schedule** (how many more are coming up and how many were earlier); recaps of past events once there are any. No QR code on this page. An old link to `#schedule` goes to the schedule page |
| `schedule/` | everyone | The note about the printed MSSE schedule (and MSSE attendance) right under the title; every event, as a **List** by date (default) or as **Cards**, remembered per browser; **Earlier this semester** below. The filters (**Everything**, **Sign-up open**, **Meetings**, **Other events**) are hidden for now (Justin's call, 2026-11-16): remove `hidden` from `#site-filters` in `schedule/index.html` to bring them back |
| `event/?id=<id>` | everyone | One event: date, time, place, food theme, the sign-up button and count, its own text (see [Event text](#event-text)), **who's bringing what** (each note on its own line underneath), its flyer, and a link back to the schedule. An event with an info page (below) links there instead |
| `signup/?event=<id>` | everyone | The sign-up form for one event, with a link back to its page: who's bringing what beside the form on a computer, above it on a phone; add, change or remove your own sign-up; no account. With no event named: the events taking sign-ups, with their buttons |
| `officers/` | club officers (`noindex`) | Edit dates, times, titles and food themes in a pop-up editor (two columns on a desktop); add, postpone, cancel or delete events; set up sign-up (bring food, volunteers or who's going); remove sign-ups; open or close sign-up; the **Flyer library**; change the officer code |
| `events/<page>/` | everyone | An event's info page, for a call to action such as volunteering (see [Event info pages](#event-info-pages)). Now: `events/steam-day-2027/` |
| `qr/` | print | Poster with the club's QR code, to print or show in class (**Display Website Invite Poster** in every club page's footer) |

The site home page links to the club. Club pages carry a **Back to Biology at SCC** link at
the top instead of the main site's menu; the club bar's first link is **Home** (the club
home). Every club page ends with the same bold SCC-blue footer: the club's name and **Part
of Biology at SCC**; club links (Home, Schedule, **Display Website Invite Poster**, Officer
tools); contact (justin.howard@kctcs.edu); and **Not an official KCTCS website.** The club
bar's menu is **Home · Schedule · Officer tools** (with a lock icon) on every club page. The
footer doesn't jump between pages: every page is at least as tall as the window, so a short
page keeps its footer at the bottom, and while the schedule loads the page holds the full
window height (`is-loading` on `<body>`, removed by `assets/site.js`). New
links go in the footer's Club column (or a new column) on all seven pages.

## For members

- The schedule comes from the printed *MSSE Scholars Proposed Activities — Fall 2026
  Schedule*. Its tentative items (marked ** on the flyer) carry a "Tentative" tag.
- There is one QR code, on the invite poster (**Display Website Invite Poster** in the
  footer; print it or show it in class). It opens the club website; people choose **Sign
  up to bring food** from there (in **Up next** on the home page, on an event card, a
  schedule row or an event's page), which opens that event's sign-up form. Type your name (first name and last initial is enough) and
  what you're bringing, and add an allergy note if needed.
  - Names and items are shown on the page so people can avoid duplicates.
  - Only the phone or computer that made a sign-up can change or remove it; it keeps a
    private token for that sign-up.
  - From another device, ask an officer to remove it.

## For officers

1. Choose **Officer tools** (with the lock) in the menu at the top of any club page, or in
   the footer, or go to `officers/` directly.
2. Enter the officer code. It is remembered only for that browser tab, and Officer tools
   **lock after 15 minutes without activity** (no click, key, touch or scroll), also when
   the tab was left open or is reopened later; enter the code again to unlock. Unsaved
   edits in an open editor are lost when it locks.
3. **Events:** choose **Edit** next to an event. The editor opens in a pop-up (two
   columns on a desktop, full screen on a phone). You can change:
   - its title, **food theme** (for example "Pasta" or "Tacos", shown on the card and in
     the sign-up; blank shows "to be announced"), date, last day (for multi-day events),
     start and end time, type, location or details;
   - **Tentative** marks it as may change. **Postponed** keeps it on the page with a
     Postponed pill and closes its sign-up until it's set back (new date to be
     announced). **Cancelled** keeps it on the page, crossed out. **Delete** removes it
     and its sign-ups.
   - Types: Club meeting, Social, Astronomy, Campus tour, Conference, Event, Graduation.
   - **Add an event** creates a new one.
4. **Sign-up:** tick "Members can sign up for this event", then choose what people sign
   up for:
   - **Bring food** (club meetings and socials): no categories. People give their name,
     what they're bringing and an optional allergy note; "Who's bringing what" is one
     plain list (dish · name). The November 19 meeting and the December 3 holiday party
     are set up this way.
   - **Work this event (volunteers)**: usually one "Volunteers" list (the default):
     people give their name and an optional note, and officers assign places later.
     STEAM Day Somerset 2027 (March 5, 2027) is set up this way, with the note "We'll
     assign your place near or on the date of the event. Questions? Contact
     justin.howard@kctcs.edu." Add shifts or roles (for example Setup, Activity tables,
     Cleanup) only if volunteers should pick one; a "How many" closes that list when
     it's full, and the same person can take more than one.
   - Email addresses in a note become links.
   - **Who's going (trips)**: one "Going" list; put the number of spots in "How many"
     (or leave it empty for no limit). People give their name and an optional note.
   - Add a note for people signing up if useful (shown above the sign-up), for example
     "The club is providing pizza" or the S-STEM scholar note on STEAM Day.
5. **Remove a sign-up:** open the event in the editor; its sign-ups are listed with
   Remove buttons.
6. **Close food sign-up** stops all new sign-ups and changes until it is reopened.
7. **Flyer library:** every club flyer, oldest first, with **View or print** (opens the PDF
   in the browser) and **Download**. Flyers for events that have passed are under
   **Archive**. See [Flyers](#flyers).
8. **Change the officer code** (at least 8 characters) at the bottom of the officer
   tools. The new code works immediately, so share it with the other officers.

The officer code is stored only as a bcrypt hash. It was given to Justin directly and is
not in this repository.

**Override code (the adviser's).** If a student changes the officer code, Justin can still
unlock Officer tools with his override code, then use **Change the officer code** to set a
new one; no database editing needed (migration `club_v9`, `sql/009_club_override_code.sql`).
The override works wherever the officer code does, but Officer tools can never change it,
so officers can't lock the adviser out. It is stored only as a bcrypt hash
(`override_code_hash` in `club.settings`) and is not in this repository. To change it, run
in the Supabase SQL Editor:

```sql
insert into club.settings (key, value)
values ('override_code_hash', extensions.crypt('<new override code>', extensions.gen_salt('bf', 8)))
on conflict (key) do update set value = excluded.value;
```

To turn it off: `delete from club.settings where key = 'override_code_hash';`

## Site engagement (Officer tools)

At the bottom of Officer tools, **Site engagement** (collapsed, like *Change the officer
code*; its title shows the visitor count) shows how much the site is used, so the officers
can see whether it's keeping the MSSE cohort engaged, and track it over the semesters:

- **"N people have visited the club website"**, counting since the first counted visit;
- visitors **today**, in the **last 7 days** and the **last 30 days**;
- how many **came back on another day** (visited on two or more days): a sign the site is
  part of the routine, not a one-off scan of the QR code;
- how many **people signed up for something** (food, volunteering or trips; names
  compared ignoring case and punctuation) and the total **page views**;
- a bar chart of visitors each day for the last 30 days, and **visitors by page** (home,
  schedule, event pages, sign-up, each info page, Officer tools).

**How it's counted** (`msclub/sql/007_club_visits.sql` and `008_club_visits_all_traffic.sql`,
migrations `club_v7` and `club_v8`). These notes are here, not on the card (Justin's call):
- **All traffic counts**, officers included: each club page (home, schedule, event pages,
  sign-up, info pages, Officer tools) counts one view when it opens. Only the QR poster doesn't count.
- A "visitor" is a **phone or computer (browser)**, not a person. The same student on a
  phone and a laptop counts twice, and private browsing or clearing the browser counts
  again. So treat the number as a close estimate, best for comparing over time.
- The browser keeps a random ID in `localStorage` (`club-visitor`). The database stores
  only its sha256, the day and a view count. **No cookies, IP addresses, names or
  locations** are stored.
- At most 3,000 new visitor-page rows a day are counted, so a script can't fill the table.

## Layout (November 2026) and how to roll it back

The pages above replaced the earlier layout (one long home page with every event as a
card, a sign-up pop-up, and a sign-up page that started with a grid of event cards). The
new layout was tried first as a read-only preview, revised with Justin, and published in
one change. `assets/site.js` builds the home, schedule, event and sign-up pages; its styles
are the "pages" section at the end of `assets/club.css`. The database didn't change.

**To roll back to the earlier layout,** revert that one change: on GitHub, open the pull
request named *Club site: publish the new layout* and press **Revert**, then merge the pull
request it opens (or ask Claude to). GitHub Pages republishes in about a minute. Nothing in
the database depends on the layout, so sign-ups, events and visit counts carry on either way.
To bring the new layout back, revert the revert.

### Event text

An event's own words come from `msclub/data/pages.json`, keyed `"<date>|<title>"` exactly as
on the schedule: `summary` (one line on the cards and the list), `body` (paragraphs on its
page), `recap_summary` and `recap` (shown instead after the date, and listed on the home page
under **Latest from the club**), and `full_page` (a link to the event's info page). Events
without an entry just show their details. Officers can't edit this file from Officer tools
yet; that needs a database change (a later step).

## Flyers

The club's flyers are letter-size PDFs in `msclub/flyers/`, each with a preview picture,
listed oldest first in `msclub/flyers/flyers.json`. They are made by
`tools/msclub/flyers/make-flyers.mjs`, which holds each flyer's text and design, so any
flyer can be remade or used as the starting point for a new one (for example next year's
Thanksgiving dinner).

- **Club pages:** the flyer for an event (its `event_date` is the event's date) shows in
  **Up next** on the home page while that event is next (beside the details on a computer,
  below them on a phone), and on the event's own page. Its picture and name open the PDF in
  the browser to view or print. With no flyer, the details take the full width.
- **Flyer library (Officer tools):** every flyer, oldest first, with **View or print** and
  **Download**. A flyer whose event has passed moves to **Archive**, where it can still be
  viewed and downloaded, as a record of what the club did.
- A flyer that isn't for an event (the website flyer) stays in the library's current list
  and isn't shown with any event.

| Flyer | Made | Event | File |
|---|---|---|---|
| The club has a website (for the acrylic display stand) | 2026-11-09 | none | `2026-website.pdf` |
| Thanksgiving Dinner | 2026-11-09 | 2026-11-19 | `2026-11-19-thanksgiving-dinner.pdf` |

The Thanksgiving flyer was approved before food sign-ups dropped their categories; its
checklist still says "Pick a main dish, side, dessert or drinks". The website itself no
longer asks for a category.

**To add a flyer:** add an entry at the end of `FLYERS` in `make-flyers.mjs` (id, made date,
event date or `null`, title, a one-line description, download name, text and design; copy
an earlier entry to reuse its design), then render it:

```bash
cd tools/msclub && npm install --no-save @fontsource/bebas-neue@5.1.0 @fontsource/josefin-sans@5.1.0 && cd ../..   # once
NODE_PATH=$(npm root -g) node tools/msclub/flyers/make-flyers.mjs <id>   # writes <id>.pdf, <id>.jpg and flyers.json
node tools/msclub/check.mjs                                              # checks the library matches its source
```

To take a flyer off the club pages early (or retire the website flyer when a new one
replaces it), add `archived: true` to its entry and run the script.

## Event info pages

An event can have a small info page at `msclub/events/<page>/`, for when the card alone
isn't enough, such as a call for volunteers. The event's `page` field (migration `club_v6`)
names it. When it's set:

- its title and sign-up button go straight to the info page, everywhere (home, schedule,
  the sign-up page's list), instead of to `event/?id=<id>`. A link that names the event
  (`signup/?event=<id>`, the info page's fallback for browsers without pop-ups) still opens
  its form on the sign-up page, with a link back to the info page;
- the info page reads its event from the live schedule (date, time, place, how many have
  signed up), and its **Sign up** buttons (one at the top, one after the sign-up line)
  open the same sign-up form in a pop-up;
- it finds the event by `page`, so officers can still change the title, date or time;
- if sign-up is closed, postponed, cancelled, past or the database can't be reached, the
  buttons are replaced by a short note saying why.

**STEAM Day 2027** (`events/steam-day-2027/`) is the first. Its text was drafted for Justin
(with the MSSE scholar line and the ESTEM footnote he asked for) and checked against
[SCC's 2026 STEAM Day news post](https://somerset.kctcs.edu/news/2026/03162026-steam-day.aspx)
(81 eighth graders; sessions led by SCC instructors and students), the
[AAMC premed competencies](https://students-residents.aamc.org/real-stories-demonstrating-premed-competencies/premed-competencies-entering-medical-students)
(Service Orientation) and the
[ABET engineering criteria](https://www.abet.org/accreditation/accreditation-criteria/criteria-for-accrediting-engineering-programs-2025-2026/)
(teamwork; communicating with a range of audiences). Volunteers work 8:00 a.m. to about
2:00 p.m.; the page words the event's end time as "to about".

**To add one:** copy `events/steam-day-2027/index.html` to `events/<new-page>/`, change
`data-event-page` and the text, and set the event's `page` (in SQL, for example
`update club.events set page = '<new-page>' where id = '…';`).

## Logo

The club's shield and seal logos were provided as screenshots. They were redrawn as vector
images by `tools/msclub/make-logos.mjs`:
- the background changed from navy to the site's deep green (`#1a3d27`);
- the gold shield, gold ring and icon colors were kept;
- the lettering uses outlines of the open-licensed fonts Bebas Neue, Josefin Sans and
  Cinzel.

| File | What it is |
|---|---|
| `assets/logos/shield-green.svg` | The shield logo on green |
| `assets/logos/seal-green.svg` | The circular seal on green |
| `assets/logos/seal-combined.svg` | A variation combining both: the shield and its six colored icons inside the seal, with right-side-up text on the lower arc. Chosen by Justin on 2026-11-05; used on the site until the pages moved to SCC blue and gold |
| `assets/logos/seal-combined-navy.svg` | The same combined seal on the club's original navy (`#002c52`). **Used on the site** (copied to `assets/logo.svg`) since 2026-11-09 |

To switch logos, copy the chosen file over `msclub/assets/logo.svg`. Every
club page uses that file. Because these are redraws, small details (letter shapes, icon
lines) differ from the originals. With the original image files, an exact recolor can
replace them.

## Colors

The club pages use SCC's blue and gold, taken from somerset.kctcs.edu (blue `#00467f`,
dark blue `#013057`, gold `#e7a614`), so they read as their own section rather than part
of the green biology site. `assets/club.css` redefines the site's color tokens on
`body.club`: links, buttons, headings and borders are blue (a lighter blue in dark mode),
and gold is used for the stripe under the club bar, the top of the next-meeting card, the
"Club meeting" pill (navy text on gold) and focus outlines. Gold is never used for text
on white, where it would be too hard to read.

## Data and privacy

- **Database:** the private schema `club` in the SyllaBased project. The browser reaches
  it only through the SECURITY DEFINER functions in
  `msclub/sql/001_club.sql`:
  - `club_events`, `club_signup`, `club_signup_update`, `club_signup_remove` — public;
  - `club_admin` — needs the officer code (or the adviser's override code, `009`);
  - `club_visit` (public, counts a page view) and `club_stats` (needs the officer code)
    in `msclub/sql/007_club_visits.sql` (`club_stats` redefined in `008`).
- **What's stored:** name, item (food only), list or shift (volunteers and trips) and an
  optional note per sign-up. There is
  no email, phone or account.
- **Visit counts:** the sha256 of a random per-browser ID, the day, the page and a view
  count. No cookies, IP addresses or names. See *Site engagement* above.
- **Limits:** 60 sign-ups per event. Exact duplicates are refused, and sign-up closes
  once the event's date has passed.
- **When the database is off or unreachable:** the page shows the printed schedule from
  `data/events.json`, and the sign-up page says sign-up is unavailable.

## Testing (local stand-in database; never production)

```bash
npm install --no-save @electric-sql/pglite@0.5.8      # once
CLUB_TODAY=2026-11-05 node tools/msclub/local-api.mjs &
node --test tools/msclub/tests/*.test.mjs   # 12 database contract tests
NODE_PATH=$(npm root -g) node tools/msclub/tests/club-pages.e2e.mjs   # sign-ups, officers, fallback (Playwright)
NODE_PATH=$(npm root -g) node tools/msclub/tests/site.e2e.mjs         # page layout
node tools/msclub/check.mjs                 # page checks, schedule data, QR code, flyer library
node tools/msclub/make-qr.mjs               # regenerate the QR code
```

To try the pages against the local database, open any club page with
`?api=http://127.0.0.1:8789`; the officer code is `local-officer-code`. `?api=off` returns
to the real database.

## Go-live record (2026-11-05)

1. Applied `msclub/sql/001_club.sql` as migration `club_v1`. It seeded the 17
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

6. **Update 2026-11-09 (migration `club_v3`, `sql/003_club_signup_kinds.sql`):**
   - sign-up types per event: bring food (as before), work this event (volunteer
     shifts), who's going (trips with spots); shifts and trips close when full;
   - the item is only asked for food sign-ups;
   - turns on a volunteer sign-up for STEAM Day Somerset 2027 (Friday, March 5, 2027, the
     event an officer added: 8:00 AM to 4:30 PM, North Campus) with shifts (Setup,
     Activity tables, Cleanup) and a draft S-STEM scholar note that officers can edit.

7. **Update 2026-11-09 (migration `club_v4`, `sql/004_club_social_postponed.sql`):**
   - the Competition type is retired; the Spades Competition is now a Social;
   - adds the Postponed status (pill on the card; sign-up closed while postponed).

8. **Update 2026-11-09 (migration `club_v5`, `sql/005_club_food_no_categories.sql`):**
   - food sign-ups have no categories: the form asks for name, dish and note, and the
     list is one plain list; club_signup ignores any category sent for a food event;
   - the category lists on food events were cleared (existing sign-ups keep their old
     category value, which the pages no longer show).

9. **Update 2026-11-09 (migration `club_v6`, `sql/006_club_event_pages.sql`):**
   - events get an optional `page` (an info page in the site), returned by club_events;
   - STEAM Day Somerset 2027 gets `steam-day-2027` and ends at 2:00 PM (volunteers work
     8:00 a.m. to about 2:00 p.m., Justin's call).

10. **Update 2026-11-10 (migration `club_v7`, `sql/007_club_visits.sql`; PR #42):**
    - **Site engagement** in Officer tools: anonymous visit counts (see *Site
      engagement* above);
    - Justin applied the reviewed file in the Supabase SQL Editor, because the
      connector's confirmation prompt didn't reach him. So `schema_migrations` has no
      row for it;
    - **post-apply checks:** RLS on both new tables; the two public functions are
      SECURITY DEFINER and callable by anon; the helper and the tables are closed to
      anon; the daily cap and the day index are present;
    - **existing club data untouched:** the events (18), sign-ups (7) and settings
      checksums are the same before and after;
    - **production smoke test**, inside a block that was rolled back (nothing left
      behind): bad input refused; 2 browsers and 4 views counted; an officer device left
      out before and after; a 30-day series ending today; sign-up totals matching; no ID
      or hash in the answer;
    - **live check after the merge:**
      - the home page sent a visit and it was counted; Officer tools sent none, and a
        wrong officer code was refused;
      - that one test browser was then added to `club.officer_devices`, so real
        counting starts at 0;
    - **security advisors:** only the expected notices for the new objects (RLS without
      policies; SECURITY DEFINER functions callable by anon/authenticated).

11. **Update 2026-11-10 (migration `club_v8`, `sql/008_club_visits_all_traffic.sql`):**
    - Justin's call: the numbers are **overall traffic**. Officers' browsers are no longer
      left out, and Officer tools counts as a page. `club.officer_devices` is dropped, and
      `club_stats` ignores `p_visitor`;
    - the go-live check's single test visit is deleted, so the count is real traffic only;
    - in Officer tools, Site engagement moved to the bottom, collapsed like *Change the
      officer code* with the visitor count on its title, and the explanation came off the
      card.

12. **Update 2026-11-16 (migration `club_v9`, `sql/009_club_override_code.sql`; PR #55):**
    - the adviser's **override code**: `club.code_ok` also accepts `override_code_hash`;
      Officer tools lock after 15 minutes without activity (page change, no SQL);
    - applied through the Supabase connector as `club_v9` (`schema_migrations` version
      20261116023522); the override's bcrypt hash was then set in a separate statement
      that is not in this repository;
    - **existing club data untouched:** the events (18), sign-ups (9) and settings
      (officer code included) checksums are the same before and after;
    - **production smoke test**, inside a block that was rolled back: a temporary officer
      code, the override, a wrong code and an empty code each behave as expected; after a
      simulated officer-code change the old code fails and the override still works and can
      set a new officer code;
    - **live check:** through the public API the override is accepted and wrong or empty
      codes are refused; in a browser, Officer tools unlocked with the override and locked
      again after 16 (simulated) idle minutes.

Rollback: the `drop …` statements at the end of the SQL file. Setting `enabled: false`
returns the pages to the printed schedule. For `club_v9`:
`delete from club.settings where key = 'override_code_hash';`
