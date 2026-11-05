-- =============================================================================
-- Freshwater Ecology & Watershed Research portal — DRAFT schema (Phase 4)
-- =============================================================================
-- STATUS: DRAFT. NOT APPLIED TO ANY DATABASE.
-- Applying this requires Justin's approval and a decision on where it lives
-- (see docs/freshwater-portal/PLAN.md §8). It is written for Supabase Postgres
-- (auth.uid(), auth.users) and follows the live-lab precedent of a dedicated schema.
--
-- Design notes
--   * Every table has review_status; anonymous visitors only ever read 'published'.
--   * Nothing is hard-deleted by application roles: archive instead (no DELETE grants).
--   * Measurements require a unit and a method.
--   * Column names match research/freshwater/data/*.json so seed data loads unchanged.
-- =============================================================================

create schema if not exists freshwater;

-- ---------- enums ------------------------------------------------------------
create type freshwater.review_status as enum
  ('draft','submitted','changes_requested','approved','published','archived');
create type freshwater.evidence_status as enum
  ('unverified','mapped','field_confirmed','lab_confirmed');
create type freshwater.knowledge_type as enum
  ('established','single_study','preliminary','hypothesis','speculative','open_question');
create type freshwater.project_status as enum
  ('proposed','planning','active','analysis','completed','archived');
create type freshwater.member_role as enum
  ('student_researcher','faculty_reviewer','administrator');

-- ---------- members & role helpers -------------------------------------------
create table freshwater.portal_members (
  user_id              uuid primary key references auth.users(id),
  display_name         text not null,
  role                 freshwater.member_role not null,
  active               boolean not null default true,
  consent_public_name  boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create or replace function freshwater.my_role()
returns freshwater.member_role
language sql stable security definer set search_path = freshwater, pg_temp as $$
  select role from freshwater.portal_members where user_id = auth.uid() and active
$$;

create or replace function freshwater.is_reviewer()
returns boolean
language sql stable security definer set search_path = freshwater, pg_temp as $$
  select coalesce(freshwater.my_role() in ('faculty_reviewer','administrator'), false)
$$;

-- Common columns are spelled out per table (no inheritance) to keep RLS simple.

-- ---------- sites ------------------------------------------------------------
create table freshwater.field_sites (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  name             text not null,
  aliases          text[] not null default '{}',
  site_type        text not null check (site_type in ('stream','pond','lake','reservoir','wetland','spring','other')),
  region           text, county text, state text default 'KY',
  campus_reference text,
  environment      text,
  habitat_summary  text,
  watershed_status text,
  sampling_status  text,
  access_notes     text,
  safety_notes     text,
  facts            jsonb not null default '[]',   -- [{label,value,evidence_status,source,source_url,retrieved_at,notes}]
  geometry_ref     text,
  is_featured      boolean not null default false,
  review_status    freshwater.review_status not null default 'draft',
  created_by uuid references freshwater.portal_members(user_id),
  updated_by uuid references freshwater.portal_members(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create table freshwater.site_investigation_tasks (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null references freshwater.field_sites(id),
  slug            text not null,
  task            text not null,
  status          text not null default 'not_started'
                  check (status in ('not_started','in_progress','mapped','field_confirmed','complete','blocked')),
  evidence_status freshwater.evidence_status,
  summary         text,
  documentation   jsonb not null default '[]',
  assigned_to     uuid references freshwater.portal_members(user_id),
  sort_order      int not null default 0,
  review_status   freshwater.review_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, slug)
);

create table freshwater.sampling_stations (
  id                uuid primary key default gen_random_uuid(),
  site_id           uuid not null references freshwater.field_sites(id),
  code              text not null,
  name              text not null,
  description       text,
  latitude          numeric(9,6) check (latitude between -90 and 90),
  longitude         numeric(9,6) check (longitude between -180 and 180),
  coordinate_method text,           -- e.g. 'Garmin GPSMAP 65, ±3 m'
  established_on    date,
  evidence_status   freshwater.evidence_status not null default 'unverified',
  access_notes      text,
  review_status     freshwater.review_status not null default 'draft',
  created_by uuid references freshwater.portal_members(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, code)
);

-- ---------- observations & measurements ---------------------------------------
create table freshwater.field_observations (
  id                 uuid primary key default gen_random_uuid(),
  site_id            uuid not null references freshwater.field_sites(id),
  station_id         uuid references freshwater.sampling_stations(id),
  observed_at        timestamptz not null,
  latitude           numeric(9,6), longitude numeric(9,6), gps_accuracy_m numeric,
  weather            text,
  air_temperature_c  numeric,
  rain_last_24h_mm   numeric, rain_last_72h_mm numeric, rain_source text,
  water_depth_cm     numeric,
  flow_observation   text check (flow_observation in ('dry','pooled','trickle','low','moderate','high','flood')),
  canopy_cover_pct   numeric check (canopy_cover_pct between 0 and 100),
  canopy_method      text,
  substrate          text[] not null default '{}',
  visible_biofilm    text check (visible_biofilm in ('none','thin','thick','mat','floating')),
  notes              text,
  review_status      freshwater.review_status not null default 'draft',
  reviewed_by        uuid references freshwater.portal_members(user_id),
  reviewed_at        timestamptz,
  created_by uuid not null references freshwater.portal_members(user_id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table freshwater.observation_observers (
  observation_id uuid references freshwater.field_observations(id),
  member_id      uuid references freshwater.portal_members(user_id),
  primary key (observation_id, member_id)
);

create table freshwater.water_quality_measurements (
  id                 uuid primary key default gen_random_uuid(),
  observation_id     uuid not null references freshwater.field_observations(id),
  parameter          text not null,
  value              numeric,
  unit               text not null,
  detection_limit    numeric,
  below_detection    boolean not null default false,
  method             text not null,
  method_reference   text,
  calibration_record text,
  qc_flag            text not null default 'none'
                     check (qc_flag in ('none','duplicate','blank','estimated','out_of_range','instrument_drift')),
  qc_notes           text,
  sample_depth_cm    numeric,
  measured_in        text not null default 'field' check (measured_in in ('field','lab')),
  lab_name           text,
  created_by uuid not null references freshwater.portal_members(user_id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (value is not null or below_detection)
);

-- ---------- organisms & media -----------------------------------------------
create table freshwater.organism_taxa (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text not null unique,
  scientific_name        text not null,
  authority              text,
  rank                   text not null default 'genus',
  taxonomy               jsonb not null default '{}',
  "group"                text not null,
  common_name            text,
  former_names           text[] not null default '{}',
  growth_form            text,
  diagnostic_morphology  text[] not null default '{}',
  typical_habitat        text,
  ecological_function    text,
  similar_taxa           text[] not null default '{}',
  identification_limits  text,
  toxin_associations     jsonb not null default '[]',
  reference_keys         text[] not null default '{}',
  status_note            text,
  review_status          freshwater.review_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table freshwater.media_assets (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('photomicrograph','field_photo','figure','map')),
  storage_key      text not null,       -- Supabase Storage object key
  caption          text, alt_text text not null,
  creator          text not null, license text not null, attribution text,
  source_url       text,
  magnification    text, scale_bar_um numeric, calibration_id text,
  captured_at      timestamptz,
  site_id          uuid references freshwater.field_sites(id),
  observation_id   uuid references freshwater.field_observations(id),
  consent_on_file  boolean not null default false,
  review_status    freshwater.review_status not null default 'draft',
  created_by uuid not null references freshwater.portal_members(user_id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table freshwater.organism_observations (
  id                   uuid primary key default gen_random_uuid(),
  observation_id       uuid not null references freshwater.field_observations(id),
  taxon_id             uuid references freshwater.organism_taxa(id),
  morphotype_label     text,
  identification_level text not null default 'provisional_morphotype'
    check (identification_level in ('provisional_morphotype','genus_morphological','species_morphological','molecular_confirmed')),
  identified_by        uuid references freshwater.portal_members(user_id),
  confirmed_by         uuid references freshwater.portal_members(user_id),
  notes                text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (taxon_id is not null or morphotype_label is not null)
);

create table freshwater.organism_observation_media (
  organism_observation_id uuid references freshwater.organism_observations(id),
  media_id                uuid references freshwater.media_assets(id),
  primary key (organism_observation_id, media_id)
);

-- ---------- knowledge base ---------------------------------------------------
create table freshwater.research_references (
  id               uuid primary key default gen_random_uuid(),
  citation_key     text not null unique,
  reference_type   text not null,
  title            text not null,
  authors          text[] not null default '{}',
  year             int,
  container        text, volume text, issue text, pages text,
  doi              text unique, url text, publisher text,
  verified_with    text not null, verified_at date not null,
  in_library       boolean not null default false,
  summary          text, summary_status text,
  geographic_scope text, topics text[] default '{}', organisms text[] default '{}',
  methodology      text, key_findings text, limitations text,
  full_text        text check (full_text in ('open_access','subscription','unknown')),
  review_status    freshwater.review_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table freshwater.resource_links (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique,
  title                text not null, organization text not null,
  category             text not null, description text not null,
  geographic_relevance text not null, primary_use text,
  url                  text not null, publication_date text,
  source_type          text not null, featured boolean not null default false,
  last_checked         date, check_status text, check_detail text, final_url text,
  review_status        freshwater.review_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table freshwater.wiki_articles (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,
  unit                text not null, chapter_number int,
  title               text not null, short_title text, summary text,
  learning_objectives text[] not null default '{}',
  status              text not null check (status in ('complete','outline','planned')),
  path                text not null, last_reviewed date,
  review_status       freshwater.review_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table freshwater.glossary_terms (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  term        text not null, definition text not null,
  see_also    text[] not null default '{}', article text,
  reference_keys text[] not null default '{}',
  review_status freshwater.review_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table freshwater.research_questions (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  question         text not null, theme text,
  status           freshwater.project_status not null default 'proposed',
  knowledge_type   freshwater.knowledge_type not null default 'open_question',
  related_articles text[] default '{}', related_methods text[] default '{}',
  reference_keys   text[] default '{}',
  review_status    freshwater.review_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table freshwater.research_projects (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique,
  title                text not null,
  research_question_id uuid references freshwater.research_questions(id),
  hypothesis           text, background text, methods text,
  status               freshwater.project_status not null default 'proposed',
  results              text, limitations text,
  faculty_supervisor   uuid references freshwater.portal_members(user_id),
  visibility           text not null default 'private' check (visibility in ('private','published')),
  review_status        freshwater.review_status not null default 'draft',
  created_by uuid not null references freshwater.portal_members(user_id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table freshwater.project_members (
  project_id uuid references freshwater.research_projects(id),
  member_id  uuid references freshwater.portal_members(user_id),
  role       text not null default 'investigator',
  primary key (project_id, member_id)
);
create table freshwater.project_sites (
  project_id uuid references freshwater.research_projects(id),
  site_id    uuid references freshwater.field_sites(id),
  primary key (project_id, site_id)
);
create table freshwater.project_references (
  project_id   uuid references freshwater.research_projects(id),
  reference_id uuid references freshwater.research_references(id),
  primary key (project_id, reference_id)
);
create table freshwater.project_media (
  project_id uuid references freshwater.research_projects(id),
  media_id   uuid references freshwater.media_assets(id),
  primary key (project_id, media_id)
);

create table freshwater.spatial_layers (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  name             text not null, "group" text not null,
  provider         text not null, dataset text not null, version text,
  resolution       text, coverage text, limitations text,
  service_url      text not null, service_type text not null, layers_param text,
  min_zoom int, max_native_zoom int, opacity numeric, default_on boolean default false,
  checked_at date, check_status text,
  review_status    freshwater.review_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- row-level security (pattern; repeat per table) --------------------
alter table freshwater.field_observations enable row level security;

-- Anyone (including anon) reads published observations.
create policy obs_public_read on freshwater.field_observations
  for select using (review_status = 'published');
-- Members read their own drafts; reviewers read everything.
create policy obs_member_read on freshwater.field_observations
  for select to authenticated using (created_by = auth.uid() or freshwater.is_reviewer());
-- Students create their own drafts only.
create policy obs_insert on freshwater.field_observations
  for insert to authenticated
  with check (created_by = auth.uid() and review_status in ('draft','submitted')
              and freshwater.my_role() is not null);
-- Students edit their own rows until approved; reviewers edit anything.
create policy obs_update on freshwater.field_observations
  for update to authenticated
  using (freshwater.is_reviewer()
         or (created_by = auth.uid() and review_status in ('draft','submitted','changes_requested')))
  with check (freshwater.is_reviewer()
         or (created_by = auth.uid() and review_status in ('draft','submitted')));
-- No DELETE policy: records are archived, never deleted, by application roles.

-- Public read of observer names goes through a view that honors consent:
create view freshwater.published_observers as
  select oo.observation_id,
         case when m.consent_public_name then m.display_name else 'SCC student researcher' end as observer
  from freshwater.observation_observers oo
  join freshwater.portal_members m on m.user_id = oo.member_id
  join freshwater.field_observations o on o.id = oo.observation_id
  where o.review_status = 'published';

-- TODO before applying: repeat the RLS pattern for every table; add updated_at
-- triggers; decide whether to expose the schema to PostgREST or publish through
-- SECURITY DEFINER read functions (live-lab pattern); set up a Storage bucket with
-- matching policies for media_assets.
