# Math & Science Club section

Live at `https://biologyatscc.com/msclub/` (until the domain is set up:
`https://justin83.github.io/biology-at-scc/msclub/`). It is the landing
page for anyone in Somerset Community College's Math & Science Club (KCTCS Somerset).

**Status (2026-11-05): live.** The club database was applied to the SyllaBased Supabase
project as migration `club_v1`, with Justin's approval. `enabled` in
`msclub/assets/club.js` is `true`.

## Pages

| URL (under `msclub/`) | For | What it does |
|---|---|---|
| `./` | everyone | Next meeting (food theme, **who's bringing what** beside the details on a computer and above the button on a phone, sign-up button), beside it on a computer the flyer for each upcoming event (see [Flyers](#flyers); no QR code on this page), and event cards by month; food events have a **Sign up to bring food** button that opens the sign-up in a pop-up; an event with an info page (below): its whole card goes to that page |
| `signup/` | everyone | Event sign-up (club-bar tab **Event sign-up**). Clickable cards in two groups: **Club meetings** (meetings and socials, where people bring food) and **Events and trips** (any other event an officer turns sign-up on for; the group is hidden while there are none). Nothing is preselected unless the link names one (the card buttons do). Choosing a card opens who's bringing what and the form below the cards; add, change or remove your own sign-up; no account |
| `officers/` | club officers (`noindex`) | Edit dates, times, titles and food themes in a pop-up editor (two columns on a desktop); add, postpone, cancel or delete events; set up sign-up (bring food, volunteers or who's going); remove sign-ups; open or close sign-up; the **Flyer library**; change the officer code |
| `events/<page>/` | everyone | An event's info page, for a call to action such as volunteering (see [Event info pages](#event-info-pages)). Now: `events/steam-day-2027/` |
| `qr/` | print | Poster with the club's QR code, to print or show in class (**Display Website Invite Poster** in every club page's footer) |

The site home page links to the club. Club pages carry a **Back to Biology at SCC** link at
the top instead of the main site's menu; the club bar's first link is **Home** (the club
home). Every club page ends with the same bold SCC-blue footer: the club's name and **Part
of Biology at SCC**; club links (Home, Event sign-up, Schedule, **Display Website Invite
Poster**, Officer tools); contact (justin.howard@kctcs.edu); and **Not an official KCTCS
website.** New links go in its Club column (or a new column) on all five pages.

## For members

- The schedule comes from the printed *MSSE Scholars Proposed Activities — Fall 2026
  Schedule*. Its tentative items (marked ** on the flyer) carry a "Tentative" tag.
- There is one QR code, on the invite poster (**Display Website Invite Poster** in the
  footer; print it or show it in class). It opens the club website; people choose **Sign
  up to bring food** from there (on an event card, the next-meeting card, or **Event
  sign-up** in the club bar). Type your name (first name and last initial is enough) and
  what you're bringing, and add an allergy note if needed.
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
   - Food sign-ups appear under **Club meetings** on the sign-up page; the other two
     under **Events and trips**.
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

## Site engagement (Officer tools)

The top of Officer tools shows how much the site is used, so the officers can see whether
it's keeping the MSSE cohort engaged, and track it over the semesters:

- **"N people have visited the club website"**, counting since the first counted visit;
- visitors **today**, in the **last 7 days** and the **last 30 days**;
- how many **came back on another day** (visited on two or more days): a sign the site is
  part of the routine, not a one-off scan of the QR code;
- how many **people signed up for something** (food, volunteering or trips; names
  compared ignoring case and punctuation) and the total **page views**;
- a bar chart of visitors each day for the last 30 days, and **visitors by page** (home,
  sign-up, each event page).

**How it's counted** (`msclub/sql/007_club_visits.sql`, migration `club_v7`):
- Each public page (home, sign-up, event pages) counts one view when it opens. Officer
  tools and the QR poster don't count.
- A "visitor" is a **phone or computer (browser)**, not a person. The same student on a
  phone and a laptop counts twice, and private browsing or clearing the browser counts
  again. So treat the number as a close estimate, best for comparing over time.
- The browser keeps a random ID in `localStorage` (`club-visitor`). The database stores
  only its sha256, the day and a view count. **No cookies, IP addresses, names or
  locations** are stored.
- A browser that opens Officer tools is remembered as an officer device, and its visits
  are left out of every count (earlier and later ones), so officers checking the site
  don't inflate it.
- At most 3,000 new visitor-page rows a day are counted, so a script can't fill the table.

## Flyers

The club's flyers are letter-size PDFs in `msclub/flyers/`, each with a preview picture,
listed oldest first in `msclub/flyers/flyers.json`. They are made by
`tools/msclub/flyers/make-flyers.mjs`, which holds each flyer's text and design, so any
flyer can be remade or used as the starting point for a new one (for example next year's
Thanksgiving dinner).

- **Club home page (computers only):** a flyer for an event is shown beside the
  next-meeting card through the day of the event. Its picture and name open the PDF in the
  browser to view or print. The next day it leaves the home page; with no current flyer
  the next-meeting card takes the full width. Phones show no flyers.
- **Flyer library (Officer tools):** every flyer, oldest first, with **View or print** and
  **Download**. A flyer whose event has passed moves to **Archive**, where it can still be
  viewed and downloaded, as a record of what the club did.
- A flyer that isn't for an event (the website flyer) stays in the library's current list
  and never shows on the home page.

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

To take a flyer off the home page early (or retire the website flyer when a new one
replaces it), add `archived: true` to its entry and run the script.

## Event info pages

An event can have a small info page at `msclub/events/<page>/`, for when the card alone
isn't enough, such as a call for volunteers. The event's `page` field (migration `club_v6`)
names it. When it's set:

- its card goes straight to the info page, with no sign-up form in between: on the home
  page and schedule the whole card (title, button or anywhere else on it), and on the
  sign-up page its card is a link (**Details and sign-up →**) instead of a choice that
  opens the form. A link that names the event (`signup/?event=<id>`, the info page's
  fallback for browsers without pop-ups) still opens its form there, with a **More about
  …** link;
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
  - `club_admin` — needs the officer code;
  - `club_visit` (public, counts a page view) and `club_stats` (needs the officer code)
    in `msclub/sql/007_club_visits.sql`.
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
NODE_PATH=$(npm root -g) node tools/msclub/tests/club-pages.e2e.mjs   # browser test (Playwright)
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

Rollback: the `drop …` statements at the end of the SQL file. Setting `enabled: false`
returns the pages to the printed schedule.
