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
  - Kentucky Geological Survey `https://www.uky.edu/KGS/` — TLS certificate chain could not be verified by the checker (server-side chain issue likely; verification was not bypassed).
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

## Not verified — needs a person

1. The four "Needs review" links, in a normal browser.
2. Real-device checks (iPhone/Android), Safari and Firefox, and a screen-reader pass.
3. Faculty review of the cyanobacteria chapters and every Research Paper Library summary.
4. Allen Branch campus access point, access route and permissions (on site).
5. Whether the channel reached from campus is the NHD-mapped Allen Branch (on site).
