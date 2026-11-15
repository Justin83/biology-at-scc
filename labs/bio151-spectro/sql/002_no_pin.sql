-- BIO 151 Live Lab v2 — group PINs removed (2026-11-10, instructor's decision).
-- Applied to the SyllaBased Supabase project (efxymeviokaocosmpqwf) as migration
-- "livelab_bio151_v2_no_pin", on top of 001_livelab.sql.
--
-- What changes:
--   * Students join a group and save readings with the group number alone. The
--     p_pin parameter is gone, so lab_join_group and lab_save_readings are
--     dropped and recreated with new signatures (and re-granted below).
--   * livelab.groups.pin_hash and livelab.pin_ok() are dropped; lab_instructor
--     loses its reset_pin action (it now answers unknown_action).
--   * Group payloads report "joined" (has names or readings) instead of "has_pin".
--   * Student names stay instructor-only. Without a PIN, anyone could call
--     lab_join_group for any group, so the student RPCs no longer return
--     members at all; only lab_instructor (instructor key) does.
-- Readings, names, dilution and notes already stored are not touched.
--
-- Rollback: add livelab.groups.pin_hash text back, then re-run the
-- "helpers" and "public RPC" sections of 001_livelab.sql and its grants
-- (drop the two v2 student functions first; their signatures differ).

-- ---------------------------------------------------------------- helpers
create or replace function livelab.group_joined(g livelab.groups)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(array_length(g.members, 1), 0) > 0
      or exists (select 1 from livelab.readings r where r.group_id = g.id)
$$;

create or replace function livelab.group_json(g livelab.groups, p_with_members boolean)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'group_number', g.group_number, 'label', g.label,
    'joined', livelab.group_joined(g),
    'member_count', coalesce(array_length(g.members, 1), 0),
    'dilution', g.dilution, 'notes', g.notes, 'updated_at', g.updated_at,
    'readings', livelab.readings_json(g.id))
  || case when p_with_members then jsonb_build_object('members', to_jsonb(g.members)) else '{}'::jsonb end
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
           'joined', livelab.group_joined(gr),
           'member_count', coalesce(array_length(gr.members, 1), 0),
           'readings_count', (select count(*) from livelab.readings r
                               where r.group_id = gr.id and r.absorbance is not null),
           'updated_at', gr.updated_at) order by gr.group_number), '[]'::jsonb)
    into g from livelab.groups gr where gr.experiment_id = e.id;
  return jsonb_build_object('ok', true, 'experiment', livelab.experiment_json(e), 'groups', g);
end $$;

drop function if exists public.lab_join_group(text, int, text, text[]);
create function public.lab_join_group(p_slug text, p_group_number int, p_members text[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e livelab.experiments%rowtype; gr livelab.groups%rowtype; clean text[];
begin
  select * into e from livelab.experiments where slug = p_slug;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into gr from livelab.groups where experiment_id = e.id and group_number = p_group_number for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_such_group'); end if;

  select coalesce(array_agg(left(btrim(m), 80)), '{}') into clean
    from unnest(coalesce(p_members, '{}')) m where length(btrim(m)) > 0;

  -- Names merge into the group (no duplicates, at most 10). An empty list is a
  -- plain re-entry: the form uses it to reload the group's saved data.
  if cardinality(clean) > 0 then
    update livelab.groups
       set members = (gr.members || (select coalesce(array_agg(m), '{}') from unnest(clean) m
                                      where not (m = any (gr.members))))[1:10],
           updated_at = now()
     where id = gr.id returning * into gr;
  end if;
  return jsonb_build_object('ok', true,
           'experiment', livelab.experiment_json(e), 'group', livelab.group_json(gr, false));
end $$;

drop function if exists public.lab_save_readings(text, int, text, jsonb, text, text);
create function public.lab_save_readings(p_slug text, p_group_number int, p_readings jsonb,
                                         p_dilution text default null, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e livelab.experiments%rowtype; gr livelab.groups%rowtype; el jsonb; vx numeric; va numeric; n int := 0;
begin
  select * into e from livelab.experiments where slug = p_slug;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into gr from livelab.groups where experiment_id = e.id and group_number = p_group_number for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_such_group'); end if;
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
         updated_at = now()
   where id = gr.id returning * into gr;

  return jsonb_build_object('ok', true, 'saved', n, 'saved_at', now(),
           'experiment', livelab.experiment_json(e), 'group', livelab.group_json(gr, false));
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

  if p_action = 'clear_group' then
    select * into gr from livelab.groups
      where experiment_id = e.id and group_number = (p_payload->>'group_number')::int for update;
    if not found then return jsonb_build_object('ok', false, 'error', 'no_such_group'); end if;
    delete from livelab.readings where group_id = gr.id;
    update livelab.groups
       set members = '{}', dilution = null, notes = null, updated_at = now()
     where id = gr.id returning * into gr;
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

-- ---------------------------------------------------------------- drop the PIN itself
drop function if exists livelab.pin_ok(livelab.groups, text);
alter table livelab.groups drop column if exists pin_hash;
comment on table livelab.groups is
  'A lab group (pair). Students pick their group by number; there is no PIN (removed in v2). members holds student names and is returned ONLY by the instructor-key path.';

-- ---------------------------------------------------------------- grants (new signatures)
revoke all on function public.lab_join_group(text, int, text[])               from public;
revoke all on function public.lab_save_readings(text, int, jsonb, text, text) from public;
grant execute on function public.lab_join_group(text, int, text[])               to anon, authenticated, service_role;
grant execute on function public.lab_save_readings(text, int, jsonb, text, text) to anon, authenticated, service_role;
revoke all on function livelab.group_joined(livelab.groups) from public;

notify pgrst, 'reload schema';
