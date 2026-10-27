-- BIO 151 Live Lab — persistent storage for live spectrophotometry data.
-- Applied to the SyllaBased Supabase project (efxymeviokaocosmpqwf) as migration
-- "livelab_bio151_v1". Tables live in a private schema (livelab) that is NOT
-- exposed through PostgREST; the browser reaches them only through the
-- SECURITY DEFINER functions in public (lab_*), which enforce the group PIN and
-- the instructor key. No row in livelab is ever readable or writable directly
-- with the anon key.

create schema if not exists livelab;
revoke all on schema livelab from public;
revoke all on schema livelab from anon, authenticated;

-- ---------------------------------------------------------------- tables
create table if not exists livelab.experiments (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
  title         text not null,
  course        text,
  x_kind        text not null default 'wavelength' check (x_kind in ('wavelength','time')),
  x_label       text not null default 'Wavelength (nm)',
  x_unit        text not null default 'nm',
  x_values      numeric[] not null default '{}',
  y_label       text not null default 'Absorbance',
  y_decimals    int  not null default 3 check (y_decimals between 0 and 4),
  instructions  text,
  is_open       boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table livelab.experiments is
  'One live-lab data collection run. x_values is the configurable list of wavelengths (or times for x_kind = time). Editable by the instructor through lab_instructor(); never hard-coded in the form.';

create table if not exists livelab.groups (
  id            uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references livelab.experiments(id) on delete cascade,
  group_number  int  not null check (group_number between 1 and 50),
  label         text not null,
  members       text[] not null default '{}',
  pin_hash      text,
  dilution      text,
  leaf_type     text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (experiment_id, group_number)
);
comment on table livelab.groups is
  'A lab group (pair). members holds student names and is returned ONLY by the instructor-key path. pin_hash is bcrypt of the group''s self-chosen PIN; null until the first students join.';

create table if not exists livelab.readings (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references livelab.groups(id) on delete cascade,
  x_value       numeric not null,
  absorbance    numeric,
  notes         text,
  updated_at    timestamptz not null default now(),
  unique (group_id, x_value)
);
create index if not exists readings_group_id_idx on livelab.readings (group_id);
comment on table livelab.readings is
  'One absorbance reading per group per x value. absorbance null = not measured yet (blank allowed). Rows are upserted, so edits overwrite in place and updated_at moves.';

create table if not exists livelab.settings (
  key   text primary key,
  value text not null
);
comment on table livelab.settings is 'instructor_key_hash = bcrypt of the instructor key. Never store the plain key.';

alter table livelab.experiments enable row level security;
alter table livelab.groups      enable row level security;
alter table livelab.readings    enable row level security;
alter table livelab.settings    enable row level security;

-- ---------------------------------------------------------------- helpers (private)
create or replace function livelab.experiment_json(e livelab.experiments)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'slug', e.slug, 'title', e.title, 'course', e.course,
    'x_kind', e.x_kind, 'x_label', e.x_label, 'x_unit', e.x_unit,
    'x_values', to_jsonb(e.x_values), 'y_label', e.y_label, 'y_decimals', e.y_decimals,
    'instructions', e.instructions, 'is_open', e.is_open, 'updated_at', e.updated_at)
$$;

create or replace function livelab.readings_json(p_group_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'x', r.x_value, 'a', r.absorbance, 'notes', r.notes, 'updated_at', r.updated_at)
           order by r.x_value), '[]'::jsonb)
  from livelab.readings r where r.group_id = p_group_id
$$;

create or replace function livelab.group_json(g livelab.groups, p_with_members boolean)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'group_number', g.group_number, 'label', g.label,
    'has_pin', g.pin_hash is not null,
    'member_count', coalesce(array_length(g.members, 1), 0),
    'dilution', g.dilution, 'leaf_type', g.leaf_type,
    'notes', g.notes, 'updated_at', g.updated_at,
    'readings', livelab.readings_json(g.id))
  || case when p_with_members then jsonb_build_object('members', to_jsonb(g.members)) else '{}'::jsonb end
$$;

create or replace function livelab.pin_ok(g livelab.groups, p_pin text)
returns boolean language sql stable set search_path = '' as $$
  select g.pin_hash is not null and p_pin is not null
     and g.pin_hash = extensions.crypt(p_pin, g.pin_hash)
$$;

create or replace function livelab.instructor_ok(p_key text)
returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from livelab.settings s
                 where s.key = 'instructor_key_hash' and p_key is not null
                   and s.value = extensions.crypt(p_key, s.value))
$$;

create or replace function livelab.make_groups(p_experiment_id uuid, p_count int)
returns void language sql set search_path = '' as $$
  insert into livelab.groups (experiment_id, group_number, label)
  select p_experiment_id, n, 'Group ' || n from generate_series(1, p_count) n
  on conflict do nothing
$$;

-- ---------------------------------------------------------------- public RPC (student)
create or replace function public.lab_get_experiment(p_slug text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e livelab.experiments%rowtype; g jsonb;
begin
  select * into e from livelab.experiments where slug = p_slug;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'group_number', gr.group_number, 'label', gr.label,
           'has_pin', gr.pin_hash is not null,
           'member_count', coalesce(array_length(gr.members, 1), 0),
           'readings_count', (select count(*) from livelab.readings r
                               where r.group_id = gr.id and r.absorbance is not null),
           'updated_at', gr.updated_at) order by gr.group_number), '[]'::jsonb)
    into g from livelab.groups gr where gr.experiment_id = e.id;
  return jsonb_build_object('ok', true, 'experiment', livelab.experiment_json(e), 'groups', g);
end $$;

create or replace function public.lab_join_group(p_slug text, p_group_number int, p_pin text, p_members text[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e livelab.experiments%rowtype; gr livelab.groups%rowtype; clean text[]; created boolean := false;
begin
  select * into e from livelab.experiments where slug = p_slug;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into gr from livelab.groups where experiment_id = e.id and group_number = p_group_number for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_such_group'); end if;

  select coalesce(array_agg(left(btrim(m), 80)), '{}') into clean
    from unnest(coalesce(p_members, '{}')) m where length(btrim(m)) > 0;

  if gr.pin_hash is null then
    if length(coalesce(p_pin, '')) < 4 or length(p_pin) > 32 then
      return jsonb_build_object('ok', false, 'error', 'pin_too_short');
    end if;
    update livelab.groups
       set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 6)),
           members = clean[1:10], updated_at = now()
     where id = gr.id returning * into gr;
    created := true;
  else
    if not livelab.pin_ok(gr, p_pin) then
      return jsonb_build_object('ok', false, 'error', 'wrong_pin');
    end if;
    if cardinality(clean) > 0 then
      update livelab.groups
         set members = (gr.members || (select coalesce(array_agg(m), '{}') from unnest(clean) m
                                        where not (m = any (gr.members))))[1:10],
             updated_at = now()
       where id = gr.id returning * into gr;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'created_pin', created,
           'experiment', livelab.experiment_json(e), 'group', livelab.group_json(gr, true));
end $$;

create or replace function public.lab_save_readings(p_slug text, p_group_number int, p_pin text,
                                                    p_readings jsonb, p_dilution text default null,
                                                    p_notes text default null, p_leaf_type text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e livelab.experiments%rowtype; gr livelab.groups%rowtype; el jsonb; vx numeric; va numeric; n int := 0;
begin
  select * into e from livelab.experiments where slug = p_slug;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into gr from livelab.groups where experiment_id = e.id and group_number = p_group_number for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_such_group'); end if;
  if not livelab.pin_ok(gr, p_pin) then return jsonb_build_object('ok', false, 'error', 'wrong_pin'); end if;
  if not e.is_open then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  if jsonb_typeof(coalesce(p_readings, '[]'::jsonb)) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'bad_readings');
  end if;

  begin
    for el in select * from jsonb_array_elements(coalesce(p_readings, '[]'::jsonb)) loop
      vx := (el->>'x')::numeric;
      va := case when el->>'a' is null or btrim(el->>'a') = '' then null else (el->>'a')::numeric end;
      if va is not null and (va < -1 or va > 10) then
        return jsonb_build_object('ok', false, 'error', 'out_of_range', 'x', vx);
      end if;
      insert into livelab.readings (group_id, x_value, absorbance, notes)
        values (gr.id, vx, va, nullif(left(el->>'notes', 200), ''))
      on conflict (group_id, x_value) do update
        set absorbance = excluded.absorbance,
            notes = excluded.notes,
            updated_at = now();
      n := n + 1;
    end loop;
  exception when invalid_text_representation or numeric_value_out_of_range then
    return jsonb_build_object('ok', false, 'error', 'bad_number');
  end;

  update livelab.groups
     set dilution = coalesce(nullif(left(p_dilution, 120), ''), case when p_dilution is null then dilution else null end),
         notes    = coalesce(nullif(left(p_notes, 1000), ''),   case when p_notes    is null then notes    else null end),
         leaf_type = coalesce(nullif(left(p_leaf_type, 120), ''), case when p_leaf_type is null then leaf_type else null end),
         updated_at = now()
   where id = gr.id returning * into gr;

  return jsonb_build_object('ok', true, 'saved', n, 'saved_at', now(),
           'experiment', livelab.experiment_json(e), 'group', livelab.group_json(gr, true));
end $$;

-- ---------------------------------------------------------------- public RPC (classroom dashboard, no names)
create or replace function public.lab_dashboard(p_slug text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e livelab.experiments%rowtype; g jsonb;
begin
  select * into e from livelab.experiments where slug = p_slug;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select coalesce(jsonb_agg(
           (livelab.group_json(gr, false) - 'notes')
           || jsonb_build_object('complete',
                (select count(*) from livelab.readings r
                  where r.group_id = gr.id and r.absorbance is not null and r.x_value = any (e.x_values)))
           order by gr.group_number), '[]'::jsonb)
    into g from livelab.groups gr where gr.experiment_id = e.id;
  return jsonb_build_object('ok', true, 'experiment', livelab.experiment_json(e), 'groups', g, 'server_time', now());
end $$;

-- ---------------------------------------------------------------- instructor RPC (key required)
create or replace function public.lab_instructor(p_key text, p_action text, p_slug text default null, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e livelab.experiments%rowtype; gr livelab.groups%rowtype; xs numeric[]; g jsonb;
begin
  if not livelab.instructor_ok(p_key) then
    perform pg_sleep(0.5);
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  if p_action = 'list_experiments' then
    select coalesce(jsonb_agg(livelab.experiment_json(x) order by x.created_at desc), '[]'::jsonb) into g
      from livelab.experiments x;
    return jsonb_build_object('ok', true, 'experiments', g);
  end if;

  if p_action = 'create_experiment' then
    xs := (select coalesce(array_agg(v::numeric order by v::numeric), '{}')
             from jsonb_array_elements_text(coalesce(p_payload->'x_values', '[]'::jsonb)) v);
    insert into livelab.experiments (slug, title, course, x_kind, x_label, x_unit, x_values, y_label, instructions)
      values (p_slug, coalesce(p_payload->>'title', p_slug), p_payload->>'course',
              coalesce(p_payload->>'x_kind', 'wavelength'),
              coalesce(p_payload->>'x_label', 'Wavelength (nm)'), coalesce(p_payload->>'x_unit', 'nm'),
              xs, coalesce(p_payload->>'y_label', 'Absorbance'), p_payload->>'instructions')
      returning * into e;
    perform livelab.make_groups(e.id, coalesce((p_payload->>'group_count')::int, 4));
    return jsonb_build_object('ok', true, 'experiment', livelab.experiment_json(e));
  end if;

  select * into e from livelab.experiments where slug = p_slug;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  if p_action = 'export' then
    select coalesce(jsonb_agg(livelab.group_json(x, true) order by x.group_number), '[]'::jsonb) into g
      from livelab.groups x where x.experiment_id = e.id;
    return jsonb_build_object('ok', true, 'experiment', livelab.experiment_json(e), 'groups', g, 'server_time', now());
  end if;

  if p_action = 'set_x_values' then
    xs := (select coalesce(array_agg(distinct v::numeric order by v::numeric), '{}')
             from jsonb_array_elements_text(coalesce(p_payload->'x_values', '[]'::jsonb)) v);
    if cardinality(xs) = 0 then return jsonb_build_object('ok', false, 'error', 'empty_x_values'); end if;
    update livelab.experiments set x_values = xs, updated_at = now() where id = e.id returning * into e;
    return jsonb_build_object('ok', true, 'experiment', livelab.experiment_json(e));
  end if;

  if p_action = 'update_experiment' then
    update livelab.experiments set
      title        = coalesce(p_payload->>'title', title),
      course       = coalesce(p_payload->>'course', course),
      x_kind       = coalesce(p_payload->>'x_kind', x_kind),
      x_label      = coalesce(p_payload->>'x_label', x_label),
      x_unit       = coalesce(p_payload->>'x_unit', x_unit),
      y_label      = coalesce(p_payload->>'y_label', y_label),
      y_decimals   = coalesce((p_payload->>'y_decimals')::int, y_decimals),
      instructions = coalesce(p_payload->>'instructions', instructions),
      is_open      = coalesce((p_payload->>'is_open')::boolean, is_open),
      updated_at   = now()
     where id = e.id returning * into e;
    return jsonb_build_object('ok', true, 'experiment', livelab.experiment_json(e));
  end if;

  if p_action = 'add_groups' then
    perform livelab.make_groups(e.id, coalesce((p_payload->>'group_count')::int, 4));
    return public.lab_get_experiment(p_slug);
  end if;

  if p_action in ('reset_pin', 'clear_group') then
    select * into gr from livelab.groups
      where experiment_id = e.id and group_number = (p_payload->>'group_number')::int for update;
    if not found then return jsonb_build_object('ok', false, 'error', 'no_such_group'); end if;
    if p_action = 'reset_pin' then
      update livelab.groups
         set pin_hash = case when nullif(p_payload->>'new_pin', '') is null then null
                             else extensions.crypt(p_payload->>'new_pin', extensions.gen_salt('bf', 6)) end,
             updated_at = now()
       where id = gr.id returning * into gr;
    else
      delete from livelab.readings where group_id = gr.id;
      update livelab.groups
         set members = '{}', dilution = null, notes = null,
             pin_hash = case when coalesce((p_payload->>'reset_pin')::boolean, false) then null else pin_hash end,
             updated_at = now()
       where id = gr.id returning * into gr;
    end if;
    return jsonb_build_object('ok', true, 'group', livelab.group_json(gr, true));
  end if;

  if p_action = 'delete_experiment' then
    if p_payload->>'confirm' is distinct from p_slug then
      return jsonb_build_object('ok', false, 'error', 'confirm_required');
    end if;
    delete from livelab.experiments where id = e.id;
    return jsonb_build_object('ok', true, 'deleted', p_slug);
  end if;

  return jsonb_build_object('ok', false, 'error', 'unknown_action');
end $$;

-- ---------------------------------------------------------------- grants
revoke all on function public.lab_get_experiment(text)                                   from public;
revoke all on function public.lab_join_group(text, int, text, text[])                    from public;
revoke all on function public.lab_save_readings(text, int, text, jsonb, text, text)      from public;
revoke all on function public.lab_dashboard(text)                                        from public;
revoke all on function public.lab_instructor(text, text, text, jsonb)                    from public;
grant execute on function public.lab_get_experiment(text)                                to anon, authenticated, service_role;
grant execute on function public.lab_join_group(text, int, text, text[])                 to anon, authenticated, service_role;
grant execute on function public.lab_save_readings(text, int, text, jsonb, text, text)   to anon, authenticated, service_role;
grant execute on function public.lab_dashboard(text)                                     to anon, authenticated, service_role;
grant execute on function public.lab_instructor(text, text, text, jsonb)                 to anon, authenticated, service_role;

-- ---------------------------------------------------------------- seed: BIO 151 chlorophyll run
insert into livelab.experiments (slug, title, course, x_kind, x_label, x_unit, x_values, y_label, instructions)
values ('bio151-chlorophyll', 'Chlorophyll Absorption Spectrum', 'BIO 151', 'wavelength',
        'Wavelength (nm)', 'nm', '{420,440,460,500,540,580,620,640,660,680}', 'Absorbance',
        'Blank the spectrophotometer at each wavelength before reading your extract. Record the absorbance the display shows; leave a box empty if you have not measured it yet.')
on conflict (slug) do nothing;
select livelab.make_groups(id, 4) from livelab.experiments where slug = 'bio151-chlorophyll';
