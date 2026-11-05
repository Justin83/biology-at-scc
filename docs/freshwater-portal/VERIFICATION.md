# Verification record — first release (Phase 1)

Date: 2026-11-04/05. Everything below was checked from this repository's build environment;
items that need a person are listed at the end.

## External links (Resource Library)

`tools/freshwater-portal/check-links.mjs` requested all 36 resource URLs with a
self-identifying User-Agent (`biology-at-scc-linkcheck/1.0 …`), following redirects.
Page titles were also read to confirm each URL leads to the intended resource.

- 31 returned HTTP 200 at the original URL.
- 1 redirects: USDA Cropland Data Layer viewer → `https://www.nass.usda.gov/research-and-science/cropland/viewer`
  (works; card shows the new destination; original link kept).
- 4 flagged **Needs review** (link left unchanged):
  - Kentucky Geological Survey `https://www.uky.edu/KGS/` — TLS certificate chain could not be verified by the checker. **Resolved 2026-11-05:** KGS moved to `https://kygs.uky.edu/` (confirmed by Justin in a browser); the card now points there and passes the check.
  - USGS Water Data for Kentucky `https://waterdata.usgs.gov/state/Kentucky/` — HTTP 403 to automated request.
  - Google Scholar — HTTP 429 (rate-limited automated request).
  - GBIF — HTTP 403 (bot protection page).
- Note: `eec.ky.gov` returns 403 to curl's default User-Agent but 200 to the checker's
  descriptive User-Agent. No browser User-Agent was ever imitated.

## Bibliography

- 116 references in `research/freshwater/data/references.json`; 44 are in the Research
  Paper Library.
- All DOI metadata (authors, year, title, journal, volume, issue, pages) was retrieved from
  the Crossref API, not typed from memory. USGS report numbers came from the USGS
  Publications Warehouse API. `verify-references.mjs` re-checked every DOI (title and
  year) against Crossref after the bibliography was assembled: 91 of 91 match.
- Three candidate DOIs did not match the intended articles and were dropped
  (one Komárek et al. 2014 Preslia DOI that does not exist in Crossref; two DOIs that
  resolved to unrelated papers).
- Crossref data errors corrected by hand and noted: swapped given/family names for all
  authors of Quiblier et al. (2013); malformed first author on Shapiro & Wright (1984);
  all-caps titles of Carpenter et al. (1998) and Snow et al. (2005).
- de la Cruz et al. (2017): the DOI on its PubMed record does not resolve; cited by
  PMCID instead, with a note.
- Library summaries were written from abstracts retrieved from PubMed, Crossref, the USGS
  Publications Warehouse or Semantic Scholar. Each record's `summary_status` states the
  basis; several rest on a database-generated synopsis or on a research assistant's
  reading and are marked for verification. **None has been faculty-reviewed.**
- A separate research pass (a delegated research agent, reviewed and re-verified here)
  searched for Kentucky-specific literature. Finding: peer-reviewed literature on
  cyanobacteria in Kentucky is thin, and nothing was found for Lake Cumberland or Pulaski
  County streams.

## Agency facts quoted in the text

Read directly from the source pages on 2026-11-05:

- EPA recreational values (2019): microcystins 8 µg/L, cylindrospermopsin 15 µg/L.
- EPA 10-day drinking-water health advisories (2015): microcystins 0.3 / 1.6 µg/L;
  cylindrospermopsin 0.7 / 3.0 µg/L.
- EPA state-threshold table (updated July 2026) lists Kentucky as "No Thresholds".
- Kentucky Energy and Environment Cabinet news releases (kydep.wordpress.com): 2013
  Taylorsville and Corps-lake findings and planned 20,000 / 100,000 cells/mL protocol;
  2014 lifting of cautions below 100,000 cells/mL; 2015 Ohio River advisory to Cannelton
  and 20 ppb microcystin threshold; 2016 watch/warning definitions; 2019 Ohio River and
  Briggs Lake advisory; 2022 Nutrient Reduction Strategy; 2026 Old Springfield Reservoir.
  Each quote was matched against the downloaded page text.

## Allen Branch geography

Queried 2026-11-05 from public services (all **Mapped**, none field-verified):

- USGS NHD (hydro.nationalmap.gov, layer 6): one flowline named Allen Branch near
  Somerset — GNIS 00485848, reach 05130103001019, FCode 46003 (intermittent),
  4.02 km, flowdir 1. Downstream trace reach by reach: Sinking Creek (FCode 46006,
  perennial) → artificial paths through Pitman Creek → Lake Cumberland (NHD waterbody
  GNIS 00490483, reservoir) → Cumberland River.
- USGS WBD: the whole mapped line intersects only HUC12 051301030204 Lower Pitman Creek
  (128.26 km²); HUC10 0513010302; HUC8 05130103; downstream HUC12 051301030401.
- KGS 1:24,000 geology at two points on the line: St. Louis Limestone (Delmer quad,
  GQ-909) and Salem and Warsaw Limestones (Somerset quad, GQ-1196). KGS 1:500,000 karst
  potential: "Intense" and "Prone".
- Water Quality Portal: no monitoring location on Allen Branch; KDOW CRW023/CRW024 on
  Pitman Creek and three USACE Nashville District locations in the HUC12.
- **Map center point — 808 Monticello Street.** Every portal map is centered on the
  Kentucky 911 Site Structure Address Point for 808 MONTICELLO ST, SOMERSET 42501
  (Pulaski County 911 record, updated 2022-05-03): 37.059788, −84.616904. The U.S. Census
  Geocoder interpolates the same address 268 m to the northwest (37.061784, −84.618622);
  the 911 address point is used instead and the difference is documented on the site.
  Browser test: on the home preview, Maps page and Allen Branch page (desktop and phone)
  the campus marker renders within 1 px of the map's center, and the ⌂ Campus control
  re-centers after panning.
- Straight-line distance from that point to the nearest point of the NHD Allen Branch
  centerline: about 250 m; the line extends to about 2.2 km away. Distance circles
  (0.5/1/2 km) are drawn around the point as an orientation aid only.
- NHD karst features: within 84.66–84.58° W, 37.04–37.10° N, NHD maps 18 springs/seeps
  (FType 458), 10 sinks/rises (FType 450) and 15 underground-conduit flowlines (FType
  420). None is mapped within 25–50 m of the Allen Branch line.
- Not computed on purpose: drainage area, land-cover percentages, distances, flow
  paths beyond NHD, groundwater routes.

- **KGS dye traces (added 2026-11-05).** The KGS karst groundwater basin and dye-trace
  service lists 61 dye-trace sites, 47 traced flow paths and 5 karst groundwater basins
  within 84.72–84.50° W, 36.98–37.15° N. None is mapped on Allen Branch. Nearest to the
  campus address point: Correll Swallet (injection, ~1.45 km), Weir Spring (recovery,
  ~1.51 km), Railroad Mill Bottom Spring (recovery, ~1.60 km); nearest traced flow path
  ~1.12 km from the Allen Branch line; the "Slide" basin ~1.5 km away. Straight-line
  distances computed from the service geometry.
- **Geologic quadrangle maps.** USGS GQ-909 (Delmer, 1971) and GQ-1196 (Somerset, 1974),
  both by R. Q. Lewis: titles, years and DOIs verified with Crossref; author from the
  USGS Publications Warehouse.
- **Road layers (added 2026-11-05).** Kentucky Commonwealth Map street base map
  (KyGovMaps), USGS Imagery Topo, and the USGS National Map transportation service were
  each rendered near campus and toggled in the browser with no failed requests. The
  KYTC state-road service on KyGovMaps returned empty images and was not used.

- **Businesses (added 2026-11-05).** Google Maps tiles are not loaded in the portal
  (Google's terms allow them only through its APIs, which need a key and a billing
  account). Instead every map has an "Open in Google Maps" link built with Google's
  documented Maps URLs (no key): it opens the current center and zoom in a new tab;
  browser test confirmed it updates on pan. OpenStreetMap standard tiles were added as a
  base map with the required "© OpenStreetMap contributors" link; near campus OSM names
  some places (e.g., Courtyard hotel, The Center for Rural Development) but many
  buildings are unnamed, which the layer's limitations state.

## Map services

Every layer in `data/map-layers.json` returned an image or tile near Allen Branch on
2026-11-05 (two Kentucky tile services reset the connection once and succeeded on retry).

## Site tests

- `node tools/freshwater-portal/build.mjs --check`: 25 pages, 0 problems (links, in-page
  anchors, citation keys, required data fields, duplicate ids, one `h1` per page).
- Headless Chromium (Playwright) at 1366×900 and 390×844, light and dark color schemes,
  all 25 pages: no console errors, no horizontal overflow at phone width.
- axe-core 4.10.2, WCAG 2.0/2.1 A and AA rules, all pages in light (desktop) and dark
  (desktop and phone): 0 violations after fixes.
- Map interaction exercised in the browser: layers load, karst/sinkhole overlays toggle,
  provenance panels open, flow arrows render, observation layer reports empty.

## Student observation form with photos (added 2026-11-05)

Everything below ran against the local stand-in database (`tools/freshwater-portal/local-api.mjs`:
in-memory PostgreSQL 18 via PGlite 0.5.8 with pgcrypto, applying
`research/freshwater/sql/001_field_submissions.sql` unchanged). **The production Supabase
project was not touched**, and `enabled` in `assets/fieldobs.js` is `false`.

- Database contract tests (`tests/fieldobs-api.test.mjs`): 6 of 6 pass. They cover the
  open/closed state, rejection of a wrong class code and instructor key, input validation,
  and the token-checked photo upload with its size, count and quota limits. They also
  check that entries stay private until approved, that only consented names become
  public, photo removal, un-approval, and class-code changes.
- Browser end-to-end test (`tests/observation-form.e2e.mjs`), Chromium emulating a Pixel 7
  in America/New_York: **pass**.
  - With a synthetic photo carrying EXIF orientation 6, `DateTimeOriginal` with offset
    −05:00, GPS (the campus address point, ± 8 m) and a camera model, the form showed
    the photo upright and the GPS and camera correctly, and filled in the time
    (14:21 local).
  - The stored JPEG had no EXIF block and no camera name. The time, GPS and camera were
    stored as separate fields.
  - The entry was not public until a faculty user approved it on the review page.
  - The Observations page then showed the student who chose to be named, and not the
    student who did not.
- Additional browser checks:
  - A 4032×3024 photo was stored as 1200×1600 at 171 KB, with a 20 KB thumbnail.
  - "Use my current location" used the emulated geolocation.
  - Validation messages link to their fields, including inside the collapsed
    measurements section.
  - A draft survives a reload; photos are not kept in drafts, as stated.
  - A non-image file and a 7th photo are refused with messages.
  - Out-of-bounds coordinates are refused; a typed positive longitude is read as west.
  - In practice mode no request leaves the page.
  - `?api=` with a non-loopback host is ignored.
  - An unreachable database is reported.
  - "Remove photo" deletes the image; the map popup shows the approved photo.
  - The class code is taken out of the address bar after a QR scan.
- QR codes, decoded with jsQR 1.4.0 from screenshots:
  - `assets/qr-submit.svg` at full size, and at the 132 px size used on the Allen Branch
    page, both decode to `https://justin83.github.io/biology-at-scc/research/freshwater/observations/submit/`.
  - A class QR made on the review page decodes to the same URL with `?code=` and the code.
  - The print view shows only the QR, the code and the URL.
- `build.mjs --check`: 27 pages, 0 problems. axe-core 4.10.2 (WCAG 2.0/2.1 A and AA) on
  all 27 pages, light and dark, desktop and phone width: 0 violations, no horizontal
  overflow. The same audit ran on these interactive states:
  - the form with photos attached and its error list showing;
  - practice mode;
  - the review page signed in, with an entry and a QR open;
  - the public pages showing an approved entry.

  After one fix (dark-mode contrast of the red "Remove" and "Reject" buttons), all
  states showed 0 violations.

### In production (2026-11-05, after Justin's approval)

- Migration `fieldobs_v1` was applied to the SyllaBased project.
- Public functions were called through the REST API with the publishable key:
  - status shows closed;
  - public observations come back empty;
  - submitting is refused while closed;
  - a wrong instructor key is refused.
- The full submit → photo → finish → approve → public flow was run inside a transaction
  that was then rolled back; afterwards there were 0 rows and submissions were still
  closed.
- The `fieldobs` schema is not exposed by the API, and anon has no usage on it.
- The pages were loaded in a phone-sized browser against production:
  - the submit page says submissions are closed;
  - the review page signs in;
  - the map and Observations page show the empty state;
  - no console errors; axe shows 0 violations.

## Not verified — needs a person

1. The four "Needs review" links, in a normal browser.
2. Real-device checks (iPhone/Android), Safari and Firefox, and a screen-reader pass.
3. Faculty review of the cyanobacteria chapters and every Research Paper Library summary.
4. Allen Branch campus access point, access route and permissions (on site).
5. Whether the channel reached from campus is the NHD-mapped Allen Branch (on site).
6. The observation form on real phones (iPhone Safari, Android Chrome): camera capture,
   whether GPS survives each phone's photo picker, location permission, and uploading on
   a weak signal at the creek. Then, with approval, applying the database migration and
   switching the form on (steps in FIELD_SUBMISSIONS.md).
