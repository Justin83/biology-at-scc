# Experiment — BIO 151 chlorophyll absorption spectrum (live lab)

## Class logistics (confirmed by the instructor, 2026-10-26)

- 8 students, expected to work in **4 pairs** → groups 1–4 in the form.
- Students enter spectrophotometer absorbance readings **on their phones**
  (QR code in the printed packet opens the form).
- A shared classroom dashboard (TV) shows **absorbance vs. wavelength, one
  line per group**, updating on refresh and automatically every 12 s.
- The form needs a stable HTTPS URL because it is printed as a QR code in the
  Overleaf packet.
- The spectrophotometer has **manually adjusted wavelength controls with
  graduated ticks**; the exact readable precision will be confirmed in the lab
  on 10/27. The form therefore accepts any decimal (e.g. `0.5`, `0.52`,
  `0.523`) and never demands three decimal places.
- The **DPIP** (Hill reaction) experiment is **conditional** on checking the
  existing reagent and the buffer ingredients on 10/27. The chlorophyll
  absorption experiment must — and does — run independently of DPIP.

## Protocol outline (chlorophyll absorption)

1. Extract chlorophyll (e.g. spinach in acetone or ethanol per the packet).
2. Dilute if the extract is too dark for the instrument (record the dilution in
   the form's *Sample dilution* field).
3. For each wavelength in the list: set the wavelength, **blank** with solvent,
   insert the sample, read absorbance, type it in the form.
4. Tap **Save** at any time; values can be changed later and re-saved.
5. Watch the class graph on the TV; expect peaks in the blue (≈420–460 nm) and
   red (≈660–680 nm) and a trough in the green (≈540–580 nm).

## Provisional wavelengths (nm)

`420, 440, 460, 500, 540, 580, 620, 640, 660, 680`

These are **data**, stored in `livelab.experiments.x_values` for the experiment
with slug `bio151-chlorophyll`. Change them without touching code:

- Dashboard → *Instructor tools* → unlock with the instructor key → edit
  *Wavelengths* → **Save wavelengths**. The form and chart pick the new list
  up on their next load/refresh.
- Readings already saved at a removed wavelength stay in the database and in
  the CSV export; they just stop being plotted.

## Data fields

| Where | Field | Notes |
|---|---|---|
| experiment | `slug`, `title`, `course` | `bio151-chlorophyll`, "Chlorophyll Absorption Spectrum", "BIO 151" |
| experiment | `x_kind` | `wavelength` (this lab) or `time` (future kinetics) |
| experiment | `x_label`, `x_unit`, `x_values` | "Wavelength (nm)", `nm`, the list above |
| experiment | `y_label`, `y_decimals` | "Absorbance", 3 (display rounding only) |
| experiment | `instructions`, `is_open` | shown on the form; `is_open=false` blocks saves |
| group | `group_number`, `label` | 1–4, "Group 1"… |
| group | `members` | student names, **instructor-only** |
| group | `pin_hash` | bcrypt of the group's PIN; `null` until the first join |
| group | `dilution`, `notes` | optional free text |
| reading | `x_value`, `absorbance`, `notes`, `updated_at` | one row per group per wavelength; `absorbance` may be `null` (blank) |

Validation on save: absorbance must parse as a number in **−1 … 10** (the form
also asks for confirmation above 3). Comma decimals (`0,52`) are accepted and
converted.

## Instrument limitations to confirm on 10/27

- Readable precision of the absorbance display (2 vs 3 decimals). The form
  needs no change either way; if the instructor wants the dashboard to round to
  2 decimals, set `y_decimals` to 2 via `update_experiment`.
- Whether the wavelength dial can be set reproducibly to each listed value; if
  some cannot (e.g. 440 vs 450), edit the list in the dashboard before students
  start.
- Blank/zero procedure at each wavelength (manual instruments drift).

## Future experiment: absorbance vs. time (e.g. DPIP reduction)

Create a second experiment; the same pages work with `?exp=<slug>`:

```
lab_instructor(p_key, 'create_experiment', 'bio151-dpip', {
  "title": "DPIP reduction over time", "course": "BIO 151",
  "x_kind": "time", "x_label": "Time (min)", "x_unit": "min",
  "x_values": [0, 2, 4, 6, 8, 10, 15, 20], "group_count": 4 })
```

Then the form is `…/labs/bio151-spectro/?exp=bio151-dpip` and the dashboard
`…/labs/bio151-spectro/dashboard/?exp=bio151-dpip`. The test suite creates and
deletes exactly such an experiment to prove the path works.
