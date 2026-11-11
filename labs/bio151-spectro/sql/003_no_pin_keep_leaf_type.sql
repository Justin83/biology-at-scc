-- BIO 151 Live Lab v2 fix-up — put leaf_type back (2026-11-10).
-- Run after 002_no_pin.sql. Applied to efxymeviokaocosmpqwf by the instructor in
-- the Supabase SQL editor.
--
-- Why: 002_no_pin.sql was written against a copy of this repo that predated
-- PR #9 (migration livelab_bio151_add_leaf_type, applied 2026-10-27). So 002
--   * replaced livelab.group_json without 'leaf_type' (the column and its data
--     were untouched), and
--   * dropped the 6-arg PIN save but left PR #9's 7-arg PIN save
--     lab_save_readings(text,int,text,jsonb,text,text,text) in place — still
--     executable by PUBLIC, and broken, since it calls livelab.pin_ok(), which
--     002 dropped.
-- This file restores leaf_type to every group payload and makes the one student
-- save function: no PIN, with p_leaf_type.

create or replace function livelab.group_json(g livelab.groups, p_with_members boolean)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'group_number', g.group_number, 'label', g.label,
    'joined', livelab.group_joined(g),
    'member_count', coalesce(array_length(g.members, 1), 0),
    'dilution', g.dilution, 'leaf_type', g.leaf_type,
    'notes', g.notes, 'updated_at', g.updated_at,
    'readings', livelab.readings_json(g.id))
  || case when p_with_members then jsonb_build_object('members', to_jsonb(g.members)) else '{}'::jsonb end
$$;

drop function if exists public.lab_save_readings(text, int, text, jsonb, text, text, text);  -- PR #9's PIN version
drop function if exists public.lab_save_readings(text, int, jsonb, text, text);              -- 002's version without leaf_type

create function public.lab_save_readings(p_slug text, p_group_number int, p_readings jsonb,
                                         p_dilution text default null, p_notes text default null,
                                         p_leaf_type text default null)
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
     set dilution  = coalesce(nullif(left(p_dilution, 120), ''),  case when p_dilution  is null then dilution  else null end),
         notes     = coalesce(nullif(left(p_notes, 1000), ''),     case when p_notes     is null then notes     else null end),
         leaf_type = coalesce(nullif(left(p_leaf_type, 120), ''), case when p_leaf_type is null then leaf_type else null end),
         updated_at = now()
   where id = gr.id returning * into gr;

  return jsonb_build_object('ok', true, 'saved', n, 'saved_at', now(),
           'experiment', livelab.experiment_json(e), 'group', livelab.group_json(gr, false));
end $$;

revoke all on function public.lab_save_readings(text, int, jsonb, text, text, text) from public;
grant execute on function public.lab_save_readings(text, int, jsonb, text, text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
