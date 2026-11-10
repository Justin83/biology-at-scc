-- BIO 151 Mitosis Lab: database (applied as migration "mitosis_v1").
--
-- Plan and decisions: docs/bio151-mitosis-lab/PLAN.md (D1–D11, 2026-11-10).
--   * A private schema, mitosislab, with its own tables. Nothing in livelab (the
--     spectrophotometry lab and its Fall 2026 chlorophyll records) is read or changed.
--   * Students work alone, with no PINs or groups. A submission carries a required first and
--     last name. The student's device makes a random 256-bit editing token and sends it
--     with the first save (so a first save whose answer was lost can be sent again without
--     making a second submission); only the token's sha256 is stored, and every later edit
--     needs the token. A name never authorizes an edit, and duplicate names are separate
--     submissions.
--   * Public functions (experiment settings, classroom dashboard) never return names or
--     submission IDs. Names, corrections, recovery, CSV and open/close need the
--     instructor key (bcrypt hash in mitosislab.settings), a credential separate from the
--     student tokens.
--   * One experiment per semester (slug like bio151-mitosis-2026fa); student writes need
--     the experiment to be open.
-- All access is through the SECURITY DEFINER functions at the end; the tables have RLS
-- on with no policies and no grants.

create schema if not exists mitosislab;
revoke all on schema mitosislab from public;
revoke all on schema mitosislab from anon, authenticated;

-- ---------------------------------------------------------------- tables
create table if not exists mitosislab.experiments (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
  title            text not null check (char_length(title) between 1 and 120),
  course           text check (char_length(course) <= 40),
  term             text check (char_length(term) <= 40),
  regions          jsonb not null,  -- ordered [{key, label}], see mitosislab.layout_ok
  stages           jsonb not null,  -- ordered [{key, label, mitotic}]
  cells_per_region int not null default 25 check (cells_per_region between 1 and 200),
  is_open          boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table mitosislab.experiments is
  'One semester''s mitosis lab. Regions and stages are data; they freeze once a student has saved.';

create table if not exists mitosislab.submissions (
  id              uuid primary key default gen_random_uuid(),  -- the anonymous submission ID
  experiment_id   uuid not null references mitosislab.experiments (id) on delete restrict,
  first_name      text not null check (char_length(first_name) between 1 and 40),
  last_name       text not null check (char_length(last_name) between 1 and 40),
  token_hash      text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  token_issued_at timestamptz not null default now(),
  instructor_note text check (char_length(instructor_note) <= 300),
  created_at      timestamptz not null default now(),
  last_saved_at   timestamptz not null default now(),
  last_saved_by   text not null default 'student' check (last_saved_by in ('student', 'instructor'))
);
create index if not exists submissions_experiment_idx on mitosislab.submissions (experiment_id);
create unique index if not exists submissions_token_idx on mitosislab.submissions (experiment_id, token_hash);
comment on table mitosislab.submissions is
  'One student''s counts. Names are shown only to the instructor. token_hash is sha256 of the editing token; the token itself is never stored. No unique constraint on names: duplicates are separate submissions.';

create table if not exists mitosislab.stage_counts (
  submission_id uuid not null references mitosislab.submissions (id) on delete cascade,
  region_key    text not null,
  stage_key     text not null,
  count         int  not null check (count between 0 and 200),
  primary key (submission_id, region_key, stage_key)
);

create table if not exists mitosislab.settings (key text primary key, value text not null);
comment on table mitosislab.settings is 'instructor_key_hash = bcrypt of the instructor key. Never store the plain key.';

create table if not exists mitosislab.audit (
  id            bigserial primary key,
  at            timestamptz not null default now(),
  action        text not null,
  experiment_id uuid,
  submission_id uuid,
  detail        jsonb not null default '{}'::jsonb  -- never a token or token hash
);
comment on table mitosislab.audit is 'Instructor corrections, recoveries, deletions and settings changes.';

alter table mitosislab.experiments  enable row level security;
alter table mitosislab.submissions  enable row level security;
alter table mitosislab.stage_counts enable row level security;
alter table mitosislab.settings     enable row level security;
alter table mitosislab.audit        enable row level security;
revoke all on all tables in schema mitosislab from public, anon, authenticated;

-- ---------------------------------------------------------------- helpers (not callable by the API)
create or replace function mitosislab.token_hash(p_token text)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
$$;

create or replace function mitosislab.new_token()
returns text language sql volatile set search_path = '' as $$
  select encode(extensions.gen_random_bytes(32), 'hex')  -- 256 bits
$$;

-- A first or last name: trimmed, inner spaces collapsed, 1–40 characters, at least one
-- letter, no control characters. Returns null when it isn't acceptable.
create or replace function mitosislab.clean_name(p text)
returns text language plpgsql immutable set search_path = '' as $$
declare v text := regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g');
begin
  if v = '' or char_length(v) > 40 or v ~ '[[:cntrl:]<>]' or v !~ '[[:alpha:]]' then return null; end if;
  return v;
end $$;

-- Regions and stages: 1–4 regions and 2–10 stages, each with a unique key
-- (a–z, 0–9, _), a label of 1–40 characters, and stages with a boolean "mitotic"
-- (at least one stage mitotic and one not).
create or replace function mitosislab.layout_ok(p_regions jsonb, p_stages jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p_regions) = 'array' and jsonb_typeof(p_stages) = 'array'
     and jsonb_array_length(p_regions) between 1 and 4 and jsonb_array_length(p_stages) between 2 and 10
     and not exists (select 1 from jsonb_array_elements(p_regions) r
                      where coalesce(r->>'key', '') !~ '^[a-z0-9_]{1,20}$' or char_length(coalesce(r->>'label', '')) not between 1 and 40)
     and not exists (select 1 from jsonb_array_elements(p_stages) s
                      where coalesce(s->>'key', '') !~ '^[a-z0-9_]{1,20}$' or char_length(coalesce(s->>'label', '')) not between 1 and 40
                         or jsonb_typeof(s->'mitotic') <> 'boolean')
     and (select count(distinct r->>'key') from jsonb_array_elements(p_regions) r) = jsonb_array_length(p_regions)
     and (select count(distinct s->>'key') from jsonb_array_elements(p_stages) s) = jsonb_array_length(p_stages)
     and exists (select 1 from jsonb_array_elements(p_stages) s where s->'mitotic' = 'true'::jsonb)
     and exists (select 1 from jsonb_array_elements(p_stages) s where s->'mitotic' = 'false'::jsonb)
$$;

-- Check a counts object {"<region>": {"<stage>": n, ...}, ...} against an experiment.
-- Missing regions or stages count as 0 (partial saves are fine). Returns null when it's
-- acceptable, otherwise an error code: bad_counts (shape, unknown key, not a whole number,
-- negative) or over_total (a region adds up to more than cells_per_region).
create or replace function mitosislab.counts_error(e mitosislab.experiments, p_counts jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare r record; s record; v jsonb; total int;
begin
  if p_counts is null then return null; end if;
  if jsonb_typeof(p_counts) <> 'object' then return 'bad_counts'; end if;
  if exists (select 1 from jsonb_object_keys(p_counts) k
              where not exists (select 1 from jsonb_array_elements(e.regions) x where x->>'key' = k)) then return 'bad_counts'; end if;
  for r in select x->>'key' as key from jsonb_array_elements(e.regions) x loop
    v := p_counts->r.key;
    if v is null or v = 'null'::jsonb then continue; end if;
    if jsonb_typeof(v) <> 'object' then return 'bad_counts'; end if;
    if exists (select 1 from jsonb_object_keys(v) k
                where not exists (select 1 from jsonb_array_elements(e.stages) y where y->>'key' = k)) then return 'bad_counts'; end if;
    total := 0;
    for s in select y->>'key' as key from jsonb_array_elements(e.stages) y loop
      if v->s.key is null or v->s.key = 'null'::jsonb then continue; end if;
      if jsonb_typeof(v->s.key) <> 'number' or (v->>s.key) !~ '^\d{1,3}$' then return 'bad_counts'; end if;
      total := total + (v->>s.key)::int;
    end loop;
    if total > e.cells_per_region then return 'over_total'; end if;
  end loop;
  return null;
end $$;

-- Replace a submission's counts with p_counts (missing values become 0).
create or replace function mitosislab.write_counts(p_submission uuid, e mitosislab.experiments, p_counts jsonb)
returns void language plpgsql volatile set search_path = '' as $$
begin
  delete from mitosislab.stage_counts where submission_id = p_submission;
  insert into mitosislab.stage_counts (submission_id, region_key, stage_key, count)
  select p_submission, r->>'key', s->>'key', coalesce((p_counts->(r->>'key')->>(s->>'key'))::int, 0)
    from jsonb_array_elements(e.regions) r cross join jsonb_array_elements(e.stages) s;
end $$;

-- A submission as JSON: counts, totals, mitotic cells, mitotic index (%, one decimal) and
-- completion per region. Names and the ID only when p_identify is true (the student's own
-- record, or the instructor).
create or replace function mitosislab.submission_json(sub mitosislab.submissions, e mitosislab.experiments, p_identify boolean)
returns jsonb language sql stable set search_path = '' as $$
  with per as (
    select r->>'key' as region,
           jsonb_object_agg(s->>'key', coalesce(c.count, 0)) as counts,
           sum(coalesce(c.count, 0))::int as total,
           sum(case when s->'mitotic' = 'true'::jsonb then coalesce(c.count, 0) else 0 end)::int as mitotic
      from jsonb_array_elements(e.regions) r
      cross join jsonb_array_elements(e.stages) s
      left join mitosislab.stage_counts c on c.submission_id = sub.id and c.region_key = r->>'key' and c.stage_key = s->>'key'
     group by r->>'key'
  )
  select jsonb_build_object(
      'counts',  (select jsonb_object_agg(region, counts) from per),
      'totals',  (select jsonb_object_agg(region, total) from per),
      'mitotic', (select jsonb_object_agg(region, mitotic) from per),
      'mitotic_index', (select jsonb_object_agg(region, case when total > 0 then round(100.0 * mitotic / total, 1) end) from per),
      'complete', (select bool_and(total = e.cells_per_region) from per),
      'last_saved_at', sub.last_saved_at)
    || case when p_identify then jsonb_build_object(
         'id', sub.id, 'first_name', sub.first_name, 'last_name', sub.last_name,
         'last_saved_by', sub.last_saved_by, 'created_at', sub.created_at) else '{}'::jsonb end
$$;

create or replace function mitosislab.experiment_json(e mitosislab.experiments)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('slug', e.slug, 'title', e.title, 'course', e.course, 'term', e.term,
    'regions', e.regions, 'stages', e.stages, 'cells_per_region', e.cells_per_region, 'is_open', e.is_open)
$$;

create or replace function mitosislab.is_instructor(p_key text)
returns boolean language sql stable set search_path = '' as $$
  select coalesce((select s.value = extensions.crypt(p_key, s.value) from mitosislab.settings s
                    where s.key = 'instructor_key_hash' and p_key is not null and char_length(p_key) between 1 and 200), false)
$$;

revoke all on all functions in schema mitosislab from public, anon, authenticated;

-- ---------------------------------------------------------------- public API: anyone
create or replace function public.mitosis_get_experiment(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare e mitosislab.experiments;
begin
  select * into e from mitosislab.experiments where slug = p_slug;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'experiment', mitosislab.experiment_json(e));
end $$;

-- The classroom dashboard: aggregates only. No names, no submission IDs, no per-student
-- times. Individual mitotic indices (complete submissions only) are returned sorted, so
-- the order says nothing about who is who.
create or replace function public.mitosis_dashboard(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare e mitosislab.experiments; subs jsonb; totals jsonb; n int; n_complete int; pooled jsonb; spread jsonb;
begin
  select * into e from mitosislab.experiments where slug = p_slug;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select coalesce(jsonb_agg(mitosislab.submission_json(s, e, false)), '[]'::jsonb), count(*)
    into subs, n from mitosislab.submissions s where s.experiment_id = e.id;
  select count(*) into n_complete from jsonb_array_elements(subs) x where (x->>'complete')::boolean;
  -- class totals per region and stage (every saved count, complete or not)
  select jsonb_object_agg(r->>'key', (
           select jsonb_object_agg(st->>'key', (
                    select coalesce(sum(c.count), 0) from mitosislab.stage_counts c
                      join mitosislab.submissions s on s.id = c.submission_id
                     where s.experiment_id = e.id and c.region_key = r->>'key' and c.stage_key = st->>'key'))
             from jsonb_array_elements(e.stages) st))
    into totals from jsonb_array_elements(e.regions) r;
  -- pooled mitotic index and the spread of individual indices, complete submissions only
  select jsonb_object_agg(r->>'key', (
           select case when sum((x->'totals'->>(r->>'key'))::int) > 0
                       then round(100.0 * sum((x->'mitotic'->>(r->>'key'))::int) / sum((x->'totals'->>(r->>'key'))::int), 1) end
             from jsonb_array_elements(subs) x where (x->>'complete')::boolean)),
         jsonb_object_agg(r->>'key', (
           select coalesce(jsonb_agg((x->'mitotic_index'->>(r->>'key'))::numeric order by (x->'mitotic_index'->>(r->>'key'))::numeric), '[]'::jsonb)
             from jsonb_array_elements(subs) x where (x->>'complete')::boolean))
    into pooled, spread from jsonb_array_elements(e.regions) r;
  return jsonb_build_object('ok', true, 'experiment', mitosislab.experiment_json(e),
    'submissions', n, 'complete', n_complete, 'totals', totals,
    'class_mitotic_index', pooled, 'individual_mitotic_index', spread, 'server_time', now());
end $$;

-- ---------------------------------------------------------------- public API: students
-- First save: creates a submission and returns its ID and editing token.
-- p_token is the editing token the device made for this submission (64 hex characters).
-- Sending the same first save again with the same token and the same names (its answer was
-- lost on the way back) updates that submission instead of adding a second one. With other
-- names it is a different student on a shared device: a new submission with a new token
-- made here, so one student's retry can never overwrite another's counts. Without p_token
-- the token is made here.
create or replace function public.mitosis_save(p_slug text, p_first_name text, p_last_name text, p_counts jsonb, p_token text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare e mitosislab.experiments; v_first text; v_last text; v_err text; v_token text; sub mitosislab.submissions;
begin
  select * into e from mitosislab.experiments where slug = p_slug for update;  -- one save at a time per experiment
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not e.is_open then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  if p_token is not null and p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'bad_token'); end if;
  v_first := mitosislab.clean_name(p_first_name);
  v_last := mitosislab.clean_name(p_last_name);
  if v_first is null or v_last is null then return jsonb_build_object('ok', false, 'error', 'bad_name'); end if;
  v_err := mitosislab.counts_error(e, p_counts);
  if v_err is not null then return jsonb_build_object('ok', false, 'error', v_err); end if;
  if p_token is not null then
    select * into sub from mitosislab.submissions where experiment_id = e.id and token_hash = mitosislab.token_hash(p_token);
    if found and lower(sub.first_name) = lower(v_first) and lower(sub.last_name) = lower(v_last) then
      update mitosislab.submissions set first_name = v_first, last_name = v_last, last_saved_at = now(), last_saved_by = 'student'
       where id = sub.id returning * into sub;
      perform mitosislab.write_counts(sub.id, e, p_counts);
      return jsonb_build_object('ok', true, 'submission_id', sub.id, 'token', p_token,
                                'submission', mitosislab.submission_json(sub, e, true));
    end if;
    if not found then v_token := p_token; end if;
  end if;
  if (select count(*) from mitosislab.submissions where experiment_id = e.id) >= 300 then
    return jsonb_build_object('ok', false, 'error', 'full');
  end if;
  v_token := coalesce(v_token, mitosislab.new_token());
  insert into mitosislab.submissions (experiment_id, first_name, last_name, token_hash)
  values (e.id, v_first, v_last, mitosislab.token_hash(v_token)) returning * into sub;
  perform mitosislab.write_counts(sub.id, e, p_counts);
  return jsonb_build_object('ok', true, 'submission_id', sub.id, 'token', v_token,
                            'submission', mitosislab.submission_json(sub, e, true));
end $$;

-- Later saves: need the submission's token. A wrong token, an unknown ID and a malformed
-- ID all get the same answer.
create or replace function public.mitosis_update(p_submission_id text, p_token text, p_first_name text, p_last_name text, p_counts jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare sub mitosislab.submissions; e mitosislab.experiments; v_first text; v_last text; v_err text;
begin
  if coalesce(p_submission_id, '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'error', 'not_yours');
  end if;
  select * into sub from mitosislab.submissions where id = p_submission_id::uuid;
  if not found or sub.token_hash <> mitosislab.token_hash(p_token) or coalesce(p_token, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'not_yours');
  end if;
  select * into e from mitosislab.experiments where id = sub.experiment_id for update;
  if not e.is_open then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  v_first := coalesce(mitosislab.clean_name(p_first_name), case when p_first_name is null then sub.first_name end);
  v_last := coalesce(mitosislab.clean_name(p_last_name), case when p_last_name is null then sub.last_name end);
  if v_first is null or v_last is null then return jsonb_build_object('ok', false, 'error', 'bad_name'); end if;
  v_err := mitosislab.counts_error(e, p_counts);
  if v_err is not null then return jsonb_build_object('ok', false, 'error', v_err); end if;
  update mitosislab.submissions set first_name = v_first, last_name = v_last, last_saved_at = now(), last_saved_by = 'student'
   where id = sub.id returning * into sub;
  if p_counts is not null then perform mitosislab.write_counts(sub.id, e, p_counts); end if;
  return jsonb_build_object('ok', true, 'submission', mitosislab.submission_json(sub, e, true));
end $$;

-- A return visit (or a recovery link): the student's own submission, with the token.
create or replace function public.mitosis_get_own(p_submission_id text, p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare sub mitosislab.submissions; e mitosislab.experiments;
begin
  if coalesce(p_submission_id, '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'error', 'not_yours');
  end if;
  select * into sub from mitosislab.submissions where id = p_submission_id::uuid;
  if not found or sub.token_hash <> mitosislab.token_hash(p_token) or coalesce(p_token, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'not_yours');
  end if;
  select * into e from mitosislab.experiments where id = sub.experiment_id;
  return jsonb_build_object('ok', true, 'experiment', mitosislab.experiment_json(e),
                            'submission', mitosislab.submission_json(sub, e, true));
end $$;

-- ---------------------------------------------------------------- instructor API (key required)
create or replace function public.mitosis_instructor(p_key text, p_action text, p_slug text default null, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare e mitosislab.experiments; sub mitosislab.submissions; before jsonb; v_first text; v_last text; v_err text; v_token text; rows jsonb;
begin
  if not mitosislab.is_instructor(p_key) then return jsonb_build_object('ok', false, 'error', 'unauthorized'); end if;
  p_payload := coalesce(p_payload, '{}'::jsonb);
  if p_action = 'check' then return jsonb_build_object('ok', true); end if;

  if p_action = 'set_key' then
    if char_length(coalesce(p_payload->>'new_key', '')) < 8 then return jsonb_build_object('ok', false, 'error', 'key_too_short'); end if;
    -- bcrypt uses only the first 72 bytes, and sign-in (is_instructor) accepts at most 200
    -- characters: a longer key would have an ignored tail, or lock the instructor out
    if octet_length(p_payload->>'new_key') > 72 then return jsonb_build_object('ok', false, 'error', 'key_too_long'); end if;
    update mitosislab.settings set value = extensions.crypt(p_payload->>'new_key', extensions.gen_salt('bf', 8)) where key = 'instructor_key_hash';
    insert into mitosislab.audit (action) values ('set_key');
    return jsonb_build_object('ok', true);
  end if;

  if p_action = 'create_experiment' then
    if coalesce(p_slug, '') !~ '^[a-z0-9][a-z0-9-]{2,59}$' then return jsonb_build_object('ok', false, 'error', 'bad_slug'); end if;
    if exists (select 1 from mitosislab.experiments where slug = p_slug) then return jsonb_build_object('ok', false, 'error', 'exists'); end if;
    if not mitosislab.layout_ok(p_payload->'regions', p_payload->'stages') then return jsonb_build_object('ok', false, 'error', 'bad_layout'); end if;
    insert into mitosislab.experiments (slug, title, course, term, regions, stages, cells_per_region, is_open)
    values (p_slug, coalesce(nullif(btrim(p_payload->>'title'), ''), p_slug), nullif(btrim(p_payload->>'course'), ''),
            nullif(btrim(p_payload->>'term'), ''), p_payload->'regions', p_payload->'stages',
            coalesce((p_payload->>'cells_per_region')::int, 25), coalesce((p_payload->>'is_open')::boolean, true))
    returning * into e;
    insert into mitosislab.audit (action, experiment_id, detail) values ('create_experiment', e.id, jsonb_build_object('slug', e.slug));
    return jsonb_build_object('ok', true, 'experiment', mitosislab.experiment_json(e));
  end if;

  select * into e from mitosislab.experiments where slug = p_slug;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  if p_action in ('list', 'export') then
    select coalesce(jsonb_agg(mitosislab.submission_json(s, e, true) || jsonb_build_object('instructor_note', s.instructor_note)
                              order by lower(s.last_name), lower(s.first_name), s.created_at), '[]'::jsonb)
      into rows from mitosislab.submissions s where s.experiment_id = e.id;
    return jsonb_build_object('ok', true, 'experiment', mitosislab.experiment_json(e), 'submissions', rows, 'server_time', now());
  end if;

  if p_action = 'set_open' then
    update mitosislab.experiments set is_open = coalesce((p_payload->>'is_open')::boolean, is_open), updated_at = now()
     where id = e.id returning * into e;
    insert into mitosislab.audit (action, experiment_id, detail) values ('set_open', e.id, jsonb_build_object('is_open', e.is_open));
    return jsonb_build_object('ok', true, 'experiment', mitosislab.experiment_json(e));
  end if;

  if p_action = 'update_experiment' then
    -- the same row lock as mitosis_save, taken before checking for submissions: a first
    -- save still in flight finishes (and is seen) before the layout can change
    select * into e from mitosislab.experiments where id = e.id for update;
    if (p_payload ? 'regions' or p_payload ? 'stages' or p_payload ? 'cells_per_region') then
      if exists (select 1 from mitosislab.submissions where experiment_id = e.id) then
        return jsonb_build_object('ok', false, 'error', 'has_submissions');
      end if;
      if not mitosislab.layout_ok(coalesce(p_payload->'regions', e.regions), coalesce(p_payload->'stages', e.stages)) then
        return jsonb_build_object('ok', false, 'error', 'bad_layout');
      end if;
    end if;
    update mitosislab.experiments set
      title = coalesce(nullif(btrim(p_payload->>'title'), ''), title),
      course = case when p_payload ? 'course' then nullif(btrim(p_payload->>'course'), '') else course end,
      term = case when p_payload ? 'term' then nullif(btrim(p_payload->>'term'), '') else term end,
      regions = coalesce(p_payload->'regions', regions),
      stages = coalesce(p_payload->'stages', stages),
      cells_per_region = coalesce((p_payload->>'cells_per_region')::int, cells_per_region),
      updated_at = now()
     where id = e.id returning * into e;
    insert into mitosislab.audit (action, experiment_id, detail) values ('update_experiment', e.id, p_payload);
    return jsonb_build_object('ok', true, 'experiment', mitosislab.experiment_json(e));
  end if;

  if p_action in ('update_submission', 'recover_access', 'delete_submission') then
    if coalesce(p_payload->>'id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('ok', false, 'error', 'no_such_submission');
    end if;
    select * into sub from mitosislab.submissions where id = (p_payload->>'id')::uuid and experiment_id = e.id;
    if not found then return jsonb_build_object('ok', false, 'error', 'no_such_submission'); end if;
    before := mitosislab.submission_json(sub, e, true) || jsonb_build_object('instructor_note', sub.instructor_note);

    if p_action = 'update_submission' then  -- corrections work even when data entry is closed
      v_first := case when p_payload ? 'first_name' then mitosislab.clean_name(p_payload->>'first_name') else sub.first_name end;
      v_last := case when p_payload ? 'last_name' then mitosislab.clean_name(p_payload->>'last_name') else sub.last_name end;
      if v_first is null or v_last is null then return jsonb_build_object('ok', false, 'error', 'bad_name'); end if;
      v_err := mitosislab.counts_error(e, p_payload->'counts');
      if v_err is not null then return jsonb_build_object('ok', false, 'error', v_err); end if;
      update mitosislab.submissions set first_name = v_first, last_name = v_last,
             instructor_note = case when p_payload ? 'instructor_note' then nullif(btrim(left(p_payload->>'instructor_note', 300)), '') else instructor_note end,
             last_saved_at = now(), last_saved_by = 'instructor'
       where id = sub.id returning * into sub;
      if p_payload ? 'counts' then perform mitosislab.write_counts(sub.id, e, p_payload->'counts'); end if;
      insert into mitosislab.audit (action, experiment_id, submission_id, detail)
      values ('update_submission', e.id, sub.id, jsonb_build_object('before', before,
              'after', mitosislab.submission_json(sub, e, true) || jsonb_build_object('instructor_note', sub.instructor_note)));
      return jsonb_build_object('ok', true, 'submission', mitosislab.submission_json(sub, e, true) || jsonb_build_object('instructor_note', sub.instructor_note));
    end if;

    if p_action = 'recover_access' then  -- a new token; the old one stops working
      v_token := mitosislab.new_token();
      update mitosislab.submissions set token_hash = mitosislab.token_hash(v_token), token_issued_at = now() where id = sub.id;
      insert into mitosislab.audit (action, experiment_id, submission_id, detail)
      values ('recover_access', e.id, sub.id, jsonb_build_object('name', sub.first_name || ' ' || sub.last_name));
      return jsonb_build_object('ok', true, 'submission_id', sub.id, 'token', v_token);
    end if;

    -- delete_submission (test entries, accidental duplicates): needs payload.confirm = 'DELETE'
    if coalesce(p_payload->>'confirm', '') <> 'DELETE' then return jsonb_build_object('ok', false, 'error', 'confirm_required'); end if;
    delete from mitosislab.submissions where id = sub.id;
    insert into mitosislab.audit (action, experiment_id, submission_id, detail) values ('delete_submission', e.id, sub.id, before);
    return jsonb_build_object('ok', true);
  end if;

  return jsonb_build_object('ok', false, 'error', 'unknown_action');
end $$;

-- ---------------------------------------------------------------- grants
revoke all on function public.mitosis_get_experiment(text) from public;
revoke all on function public.mitosis_dashboard(text) from public;
revoke all on function public.mitosis_save(text, text, text, jsonb, text) from public;
revoke all on function public.mitosis_update(text, text, text, text, jsonb) from public;
revoke all on function public.mitosis_get_own(text, text) from public;
revoke all on function public.mitosis_instructor(text, text, text, jsonb) from public;
grant execute on function public.mitosis_get_experiment(text) to anon, authenticated, service_role;
grant execute on function public.mitosis_dashboard(text) to anon, authenticated, service_role;
grant execute on function public.mitosis_save(text, text, text, jsonb, text) to anon, authenticated, service_role;
grant execute on function public.mitosis_update(text, text, text, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.mitosis_get_own(text, text) to anon, authenticated, service_role;
grant execute on function public.mitosis_instructor(text, text, text, jsonb) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- Fall 2026 experiment
-- Region labels are placeholders the instructor can rename (Instructor page → Experiment)
-- until the first student saves.
insert into mitosislab.experiments (slug, title, course, term, regions, stages, cells_per_region, is_open)
values ('bio151-mitosis-2026fa', 'Mitosis: Counting Cell-Cycle Stages', 'BIO 151', 'Fall 2026',
  '[{"key":"r1","label":"Region 1"},{"key":"r2","label":"Region 2"}]'::jsonb,
  '[{"key":"interphase","label":"Interphase","mitotic":false},{"key":"prophase","label":"Prophase","mitotic":true},
    {"key":"metaphase","label":"Metaphase","mitotic":true},{"key":"anaphase","label":"Anaphase","mitotic":true},
    {"key":"telophase","label":"Telophase","mitotic":true}]'::jsonb,
  25, true)
on conflict (slug) do nothing;

-- The instructor key is set separately (never in this file). In production (2026-11-10) it
-- was copied from the spectrophotometry lab's hash, so the same key works for both:
--   insert into mitosislab.settings (key, value)
--   select 'instructor_key_hash', value from livelab.settings where key = 'instructor_key_hash'
--   on conflict (key) do nothing;
-- To set a new key instead:
--   insert into mitosislab.settings values ('instructor_key_hash', extensions.crypt('<new key>', extensions.gen_salt('bf', 8)))
--   on conflict (key) do update set value = excluded.value;
--
-- Rollback (removes the whole feature and its data; livelab is untouched):
--   drop function if exists public.mitosis_get_experiment(text), public.mitosis_dashboard(text),
--     public.mitosis_save(text, text, text, jsonb, text), public.mitosis_update(text, text, text, text, jsonb),
--     public.mitosis_get_own(text, text), public.mitosis_instructor(text, text, text, jsonb);
--   drop schema mitosislab cascade;
