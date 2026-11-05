# Freshwater portal — data model

Status: **design + Phase 1 seed data.** The JSON files in `research/freshwater/data/`
are the public seed records. The SQL in `schema/001_freshwater_portal.sql` is a
**draft that has not been applied to any database**; applying it needs Justin's
approval and a decision on where it lives (see PLAN.md §8).

## Principles

1. **One home per fact.** A journal article lives in `research_references`; a website
   lives in `resource_links`; a chapter cites references by id. Nothing is copied
   between the bibliography, the resource library and the wiki.
2. **Provenance on everything.** Every record states where it came from
   (`source`, `source_url`, `retrieved_at`) and who created/changed it.
3. **Evidence status is data, not prose.** Geographic and ecological claims carry
   `evidence_status` ∈ `unverified | mapped | field_confirmed | lab_confirmed`.
   Scientific statements carry `knowledge_type` ∈ `established | single_study |
   preliminary | hypothesis | speculative` where a record needs it.
4. **Review before publication.** `review_status` ∈ `draft | submitted |
   changes_requested | approved | published | archived`. Public visitors only ever
   read `published` rows. Nothing is hard-deleted; records are archived.
5. **Measurements keep units, method and QC.** A number without a unit and method is
   not stored.
6. **JSON seeds use the table's column names**, so Phase 4 loads them unchanged.

## Shared columns

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (DB) / string slug (JSON) | JSON seeds use stable string ids that become `slug` in the DB |
| `slug` | text unique | URL-safe |
| `created_at`, `updated_at` | timestamptz | |
| `created_by`, `updated_by` | uuid → `portal_members` | null for seed data |
| `review_status` | enum | see above |
| `published_at` | timestamptz | set when published |

## Entities

### `field_sites` — `data/sites.json`
`name`, `aliases[]`, `site_type` (stream, pond, lake, reservoir, wetland, spring),
`region`, `county`, `state`, `campus_reference`, `environment`, `habitat_summary`,
`watershed_status`, `sampling_status`, `access_notes`, `safety_notes`,
`facts[]` (each: `label`, `value`, `evidence_status`, `source`, `source_url`,
`retrieved_at`, `notes`), `geometry_ref` (path to a GeoJSON extract), `is_featured`.

### `site_investigation_tasks` — inside `sites.json` → `investigation_tasks[]`
`site_id`, `task`, `status` (`not_started | in_progress | mapped | field_confirmed |
complete | blocked`), `evidence_status`, `summary`, `documentation[]` (links),
`assigned_to`, `updated_at`.

### `sampling_stations`
`site_id`, `code`, `name`, `description`, `latitude`, `longitude`,
`coordinate_method` (GPS model, accuracy m), `established_on`, `evidence_status`,
`access_notes`. Phase 1: none exist; none are invented.

### `field_observations` — `data/observations.json` (empty in Phase 1)
`site_id`, `station_id`, `observed_at` (timestamptz, with time zone), `observers[]`
(member ids; public view shows display names only), `latitude`, `longitude`,
`gps_accuracy_m`, `weather`, `air_temperature_c`, `rain_last_24h_mm`,
`rain_last_72h_mm`, `rain_source`, `water_depth_cm`, `flow_observation`
(`dry | pooled | trickle | low | moderate | high | flood`), `canopy_cover_pct`,
`canopy_method`, `substrate[]`, `visible_biofilm` (`none | thin | thick | mat |
floating`), `photos[]` (→ `media_assets`), `suspected_organisms[]`
(→ `organism_observations`), `notes`, `review_status`, `reviewed_by`, `reviewed_at`.

### `water_quality_measurements`
`observation_id`, `parameter` (controlled list: `water_temperature`, `ph`,
`specific_conductance`, `dissolved_oxygen`, `dissolved_oxygen_saturation`,
`turbidity`, `nitrate_n`, `orthophosphate_p`, `total_phosphorus`, `chlorophyll_a`,
`phycocyanin`, …), `value` (numeric), `unit` (controlled: `°C`, `pH units`,
`µS/cm`, `mg/L`, `%`, `NTU`, `FNU`, `mg/L as N`, `mg/L as P`, `µg/L`, `RFU`),
`detection_limit`, `below_detection` (bool), `method` (instrument/kit + model),
`method_reference`, `calibration_record`, `qc_flag` (`none | duplicate | blank |
estimated | out_of_range | instrument_drift`), `qc_notes`, `sample_depth_cm`,
`measured_in` (`field | lab`), `lab_name` (for outside labs).

### `organism_taxa` — `data/organisms.json`
`scientific_name`, `authority`, `rank`, `taxonomy` (domain → genus as an ordered
object), `group` (`cyanobacteria | green_algae | diatoms | other_protists |
zooplankton | macroinvertebrates`), `common_name`, `former_names[]`,
`growth_form` (`unicellular | colonial | filamentous`), `diagnostic_morphology[]`,
`typical_habitat`, `ecological_function`, `similar_taxa[]`,
`identification_limits`, `toxin_associations` (each: `toxin`, `note`; always
"genus includes reported producers", never "this sample is toxic"),
`references[]` (→ `research_references`), `media[]`, `status_note`.

### `organism_observations`
`observation_id`, `taxon_id` (nullable), `morphotype_label`, `identification_level`
(`provisional_morphotype | genus_morphological | species_morphological |
molecular_confirmed`), `identified_by`, `confirmed_by`, `media[]`, `notes`.

### `media_assets`
`kind` (`photomicrograph | field_photo | figure | map`), `file_path` / storage key,
`caption`, `alt_text`, `creator`, `license`, `attribution`, `source_url`,
`magnification`, `scale_bar_um`, `calibration_id`, `captured_at`, `site_id`,
`observation_id`, `review_status`, `consent_on_file` (bool, for any person shown).

### `research_references` — `data/references.json`
`citation_key`, `reference_type` (`journal_article | book | book_chapter |
government_report | web_page | dataset`), `title`, `authors[]`, `year`,
`container` (journal/book/series), `volume`, `issue`, `pages`, `doi`, `url`,
`publisher`, `verified_with` (`crossref | publisher_page | agency_page`),
`verified_at`, and — for the Research Paper Library — `in_library`,
`summary` (original wording), `summary_status`, `geographic_scope`, `topics[]`,
`organisms[]`, `methodology`, `key_findings`, `limitations`, `full_text`
(`open_access | subscription | unknown`), `related_articles[]`,
`related_projects[]`.

### `resource_links` — `data/resources.json`
`title`, `organization`, `category`, `description`, `geographic_relevance`
(`kentucky | regional | national | global`), `primary_use`, `url`,
`publication_date`, `source_type` (`agency_portal | gis_application | dataset |
database | software | guidance | search_tool`), `featured`, link-check fields:
`last_checked`, `check_status` (`ok | redirected | blocked_automated_check |
unavailable`), `check_detail`, `final_url`.

### `wiki_articles` — `data/articles.json`
`unit`, `chapter_number`, `slug`, `title`, `short_title`, `summary`,
`learning_objectives[]`, `status` (`complete | outline | planned`), `path`,
`related[]`, `last_reviewed`.

### `glossary_terms` — `data/glossary.json`
`term`, `definition`, `see_also[]`, `article` (path), `references[]`.

### `research_questions` — `data/research-questions.json`
`question`, `theme`, `status` (`proposed | planning | active | analysis |
completed | archived`), `related_articles[]`, `related_methods[]`, `references[]`,
`sites[]`, `knowledge_type` (always `hypothesis` or `open_question` until data
exist).

### `research_projects` — `data/projects.json` (empty in Phase 1)
`title`, `research_question_id`, `hypothesis`, `investigators[]`,
`faculty_supervisor`, `background`, `methods`, `site_ids[]`, `datasets[]`,
`status` (`proposed | planning | active | analysis | completed | archived`),
`results`, `limitations`, `reference_ids[]`, `attachments[]` (→ `media_assets`),
`visibility` (`private | published`).

### `spatial_layers` — `data/map-layers.json`
`name`, `group` (`base | hydrology | watershed | land | karst | infrastructure |
monitoring | portal`), `provider`, `dataset`, `version`, `resolution`,
`coverage`, `limitations`, `service_url`, `service_type` (`xyz_tiles |
arcgis_tiles | arcgis_export | geojson`), `layers_param`, `min_zoom`,
`max_native_zoom`, `opacity`, `default_on`, `checked_at`, `check_status`.

### `portal_members` (Phase 4)
`user_id` (→ `auth.users`), `display_name`, `role` (`student_researcher |
faculty_reviewer | administrator`), `active`, `consent_public_name` (bool).
Public visitors are anonymous; no row is needed.

## Roles and permissions (Phase 4 design)

| Role | Read | Create / edit | Review / publish | Configure |
|---|---|---|---|---|
| Public visitor | `published` rows only | — | — | — |
| Student researcher | published + own/assigned drafts | own observations, measurements, media, assigned project records | — | — |
| Faculty reviewer | everything | everything | approve, request changes, publish, archive | — |
| Administrator | everything | everything | everything | members, roles, layers, resource catalog |

Enforced with Postgres row-level security in a private schema, following the live-lab
precedent of exposing only what the API needs. Student names never appear in public
responses unless `consent_public_name` is true.
