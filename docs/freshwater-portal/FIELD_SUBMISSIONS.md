# Student field observations with photos

Students submit field observations, with up to six photos, from a phone. Faculty review
every entry before anything is public.

**Status (2026-11-05): built and tested against a local stand-in database. Not live.**
The database part has **not** been applied to Supabase, and `enabled` in
`research/freshwater/assets/fieldobs.js` is `false`. Until both change, the form runs in
*practice mode*: students can fill it in and attach photos, the photos are read and
checked on the phone, and nothing is sent anywhere.

## Pages

| URL (under `research/freshwater/`) | For | What it does |
|---|---|---|
| `observations/submit/` | students (QR target) | Mobile form: photos, time, location, conditions, measurements, observers, class code |
| `observations/review/` | faculty (`noindex`) | Sign in with the instructor key; review, approve or reject entries; remove photos; open or close submissions; set the class code; print the class QR |
| `observations/` | public | Approved entries with photos; how submission works; data dictionary |
| `sites/allen-branch/`, home page | public | Latest approved entries (compact) and the form's QR code |
| `maps/` | public | The "Field observation points" layer shows approved entries, with a photo in the popup |

QR codes:

- `assets/qr-submit.svg` is the public QR. It opens the form with no class code. It is
  shown on the form itself and on the Observations, Allen Branch, Methods and home pages.
  Regenerate it with `node tools/freshwater-portal/make-qr.mjs`; `--check` reports if it
  no longer matches `submitUrl`.
- The **class QR** is made on the review page when faculty save or type the class code.
  It opens `…/observations/submit/?code=<class code>`. The form fills the code in, keeps it
  on that phone, and removes it from the address bar. Print it from the review page; the
  print view shows only the QR, the code and the URL.

## How a photo is handled

1. The phone's camera or photo library supplies the file through
   `<input type="file" accept="image/*">`. "Take a photo" also sets `capture="environment"`.
2. **exifr 7.1.3** (MIT, vendored at `assets/vendor/exifr/lite.umd.js`) reads these fields
   from the original on the phone:
   - `DateTimeOriginal`, with `OffsetTimeOriginal` when the camera saved one;
   - GPS latitude and longitude, plus `GPSHPositioningError` as the accuracy;
   - make and model.
3. The photo is drawn onto a canvas, upright (EXIF orientation applied), and re-encoded
   as JPEG:
   - display image: at most 1600 px on the long edge and 700 KB;
   - thumbnail: at most 400 px and 80 KB;
   - if a photo is still too large, quality is lowered, then the image is made smaller.
   The canvas copy carries **no embedded metadata**. The time, GPS and camera from step 2
   are sent as separate fields instead.
4. The first photo with a time fills in *Date and time observed*. The first photo with a
   GPS position inside Kentucky fills in *Location*. Students can change both. Each field
   records where its value came from: `photo`, `device`, `map`, `manual` or `none`.

Known limits, stated on the form:

- **Many phones remove GPS from photos shared with a website.** iOS and recent Android
  photo pickers do this for privacy, and photos taken through a browser's camera capture
  usually have no GPS at all. For these cases the form offers "Use my current location"
  (browser geolocation) and a map to tap or drag a pin on.
- An EXIF time without a saved offset is read as the phone's own time zone.
- Browsers that cannot decode HEIC show a message with the iPhone setting that avoids it.
  Safari normally converts HEIC to JPEG when a site asks for `image/*`.
- None of this has been tried on a real iPhone or Android phone yet (see the checklist).

## Upload and storage

Three calls to SECURITY DEFINER functions in `research/freshwater/sql/001_field_submissions.sql`:

1. `fw_submit(class code, entry)` checks the code, open status, time, location bounds and
   measurement ranges. It returns a receipt (`FW-XXXXXX`) and an upload token that is good
   for 2 hours. A retried submit with the same `client_id` returns the original receipt
   instead of creating a duplicate.
2. `fw_add_photo(id, token, photo)` is called once per photo. It checks the JPEG
   signature, the size caps, the 6-photo limit and the total photo quota.
3. `fw_finish(id, token)` closes the upload window, and the entry waits for review.

If the connection drops between photos, the form keeps what it has sent. "Finish sending"
continues from the next photo.

**Where photos live:** bytea columns in the private `fieldobs` schema of the SyllaBased
project's database. That schema is not exposed by the Supabase API. Supabase Storage
buckets are not used. Space is limited because the project is on the free tier. As of
2026-11-05 the database used about 219 MB of 500 MB, and Storage about 708 MB of 1 GB.
Photos are therefore capped:

| Setting (`fieldobs.settings`) | Default | Meaning |
|---|---|---|
| `photo_quota_bytes` | 150 MB | Total for all display images and thumbnails. At about 200–400 KB per photo, that is roughly 400–700 photos. |
| `max_photos` | 6 | Per entry |
| `max_photo_bytes` / `max_thumb_bytes` | 700 KB / 80 KB | Per image |

The review page shows usage against the quota. When the quota is full, entries are
still accepted without photos.

## Privacy and security

- **Public site:** it only calls `fw_public_observations` and `fw_public_photo`. These
  return approved entries only. They leave out review notes, per-photo GPS and camera,
  and the names of students who did not tick "Show this name on the website" (the public
  credit is then "SCC Biology students").
- **Students:** they cannot read anything back except their own receipt. The class code
  and instructor key are stored only as bcrypt hashes. A wrong code or key adds a
  0.5-second delay.
- **Faculty:** the instructor key is kept in `sessionStorage` for the open tab only.
  "Remove photo" deletes the image bytes for good (for a face, plate, home, or a photo not
  from the visit) and keeps the record that a photo was there.
- **Consents:** the student must tick all three before sending: own work, no
  recognizable faces, plates or homes, and understanding of review and publication.
  The faces item is required only when photos are attached.
- **Publishable key:** the Supabase URL and publishable key in `fieldobs.js` are public
  by design, as in the BIO 151 live lab. They reach only the `fw_*` functions.
- **Local testing:** `?api=` only accepts `127.0.0.1` or `localhost`, so a crafted link
  cannot send student uploads to another server. `?api=off` clears it.
- **Exports:** the review page's JSON download includes student names. Keep it in
  faculty storage, never in this repository.

## Going live — needs Justin's approval at each step

1. Apply `research/freshwater/sql/001_field_submissions.sql` to the SyllaBased project
   (`efxymeviokaocosmpqwf`) as migration `fieldobs_v1`, then run the Supabase security
   advisors.
2. Set the instructor key with the SQL at the end of the migration file. Keep the plain
   key outside the repository.
3. Set `enabled: true` in `research/freshwater/assets/fieldobs.js` and merge. Merging to
   `main` publishes the site.
4. On `observations/review/`: save a class code, open submissions, print the class QR.
5. Test on real phones (iPhone Safari, Android Chrome), at least once at Allen Branch:
   camera capture, library photos with and without location, "Use my current location",
   map pin, and a weak signal.

Rollback: the `drop …` statements at the end of the migration remove everything it
created. Setting `enabled: false` returns the site to practice mode.

## Testing locally (no production access)

```bash
npm install --no-save @electric-sql/pglite@0.5.8               # once, for the stand-in database
FW_UPLOAD_CODE=class-test-code node tools/freshwater-portal/local-api.mjs &
node --test tools/freshwater-portal/tests/*.test.mjs           # 6 database contract tests
NODE_PATH=$(npm root -g) node tools/freshwater-portal/tests/observation-form.e2e.mjs   # browser test (Playwright)
```

To try the pages by hand, serve the repository and open any portal page with
`?api=http://127.0.0.1:8788`; the instructor key is `local-instructor-key`.
`tests/fixtures/exif-gps-orientation6.jpg` is a synthetic photo with EXIF time, GPS (the
campus address point), camera and orientation 6. `make_fixture.py` regenerates it.

## Open decisions for faculty

- How long unapproved or rejected entries and their photos are kept. Nothing is deleted
  automatically.
- Whether approved student photos carry a license (for example CC BY 4.0, like the rest
  of the site) or only the credit line. The consent text currently promises display on
  the site and use in SCC Biology teaching and research, and names no license.
