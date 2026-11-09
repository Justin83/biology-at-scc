-- Math & Science Club: food theme per event, and no paper-goods category.
--
-- Applied as migration "club_v2" after 001_club.sql (with Justin's approval for this task).
--   * events get an optional food theme ("Pasta", "Tacos", ...) that officers set and the
--     club pages show on event cards and in the sign-up;
--   * the "Plates, cups or napkins" category is removed from the events seeded in 001
--     (only where nobody has signed up for it).

alter table club.events add column if not exists theme text check (char_length(theme) <= 60);
comment on column club.events.theme is 'Optional food theme for the event, e.g. "Pasta" or "Tacos".';

update club.events e
   set slots = coalesce((select jsonb_agg(s) from jsonb_array_elements(e.slots) s
                          where s->>'label' <> 'Plates, cups or napkins'), '[]'::jsonb),
       updated_at = now()
 where e.slots @> '[{"label":"Plates, cups or napkins"}]'::jsonb
   and not exists (select 1 from club.signups x where x.event_id = e.id and x.slot = 'Plates, cups or napkins');

create or replace function club.event_json(e club.events, p_with_signups boolean)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', e.id, 'starts_on', e.starts_on, 'ends_on', e.ends_on,
    'start_time', to_char(e.start_time, 'HH24:MI'), 'end_time', to_char(e.end_time, 'HH24:MI'),
    'title', e.title, 'theme', e.theme, 'kind', e.kind, 'location', e.location, 'details', e.details,
    'tentative', e.tentative, 'status', e.status,
    'signup_enabled', e.signup_enabled, 'signup_note', e.signup_note, 'slots', e.slots)
  || case when p_with_signups and e.signup_enabled then jsonb_build_object('signups', coalesce((
       select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'slot', s.slot, 'item', s.item,
                                           'note', s.note, 'created_at', s.created_at) order by s.created_at)
         from club.signups s where s.event_id = e.id), '[]'::jsonb)) else '{}'::jsonb end
$$;

-- Same as 001, plus the theme field in save_event.
create or replace function public.club_admin(p_code text, p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_n int; v_start time; v_end time; v_on date; v_until date;
begin
  if not club.code_ok(p_code) then
    perform pg_sleep(0.5);
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  p_payload := coalesce(p_payload, '{}'::jsonb);

  if p_action = 'check' then
    return jsonb_build_object('ok', true, 'signups_open', club.setting('signups_open') = 'true',
      'max_signups_per_event', club.setting('max_signups_per_event')::int);

  elsif p_action = 'save_event' then
    v_on := nullif(p_payload->>'starts_on', '')::date;
    if v_on is null then return jsonb_build_object('ok', false, 'error', 'no_date'); end if;
    v_until := nullif(p_payload->>'ends_on', '')::date;
    if v_until = v_on then v_until := null; end if;
    v_start := nullif(p_payload->>'start_time', '')::time;
    v_end := nullif(p_payload->>'end_time', '')::time;
    if v_start is null then v_end := null; end if;
    if nullif(btrim(coalesce(p_payload->>'title', '')), '') is null then
      return jsonb_build_object('ok', false, 'error', 'no_title');
    end if;
    v_id := nullif(p_payload->>'id', '')::uuid;
    if v_id is null then
      insert into club.events (starts_on, ends_on, start_time, end_time, title, theme, kind, location, details, tentative, status,
                               signup_enabled, signup_note, slots, source)
      values (v_on, v_until, v_start, v_end, club.txt(p_payload, 'title', 120), club.txt(p_payload, 'theme', 60),
              coalesce(nullif(p_payload->>'kind', ''), 'event'),
              club.txt(p_payload, 'location', 120), club.txt(p_payload, 'details', 1000),
              coalesce((p_payload->>'tentative')::boolean, false), coalesce(nullif(p_payload->>'status', ''), 'scheduled'),
              coalesce((p_payload->>'signup_enabled')::boolean, false), club.txt(p_payload, 'signup_note', 300),
              club.clean_slots(p_payload->'slots'), 'Added by a club officer')
      returning id into v_id;
    else
      update club.events set starts_on = v_on, ends_on = v_until, start_time = v_start, end_time = v_end,
             title = club.txt(p_payload, 'title', 120), theme = club.txt(p_payload, 'theme', 60),
             kind = coalesce(nullif(p_payload->>'kind', ''), 'event'),
             location = club.txt(p_payload, 'location', 120), details = club.txt(p_payload, 'details', 1000),
             tentative = coalesce((p_payload->>'tentative')::boolean, false),
             status = coalesce(nullif(p_payload->>'status', ''), 'scheduled'),
             signup_enabled = coalesce((p_payload->>'signup_enabled')::boolean, false),
             signup_note = club.txt(p_payload, 'signup_note', 300), slots = club.clean_slots(p_payload->'slots'),
             updated_at = now()
       where id = v_id;
      get diagnostics v_n = row_count;
      if v_n = 0 then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    end if;
    return jsonb_build_object('ok', true, 'id', v_id);

  elsif p_action = 'delete_event' then
    delete from club.events where id = (p_payload->>'id')::uuid;
    get diagnostics v_n = row_count;
    return jsonb_build_object('ok', v_n = 1);

  elsif p_action = 'remove_signup' then
    delete from club.signups where id = (p_payload->>'id')::uuid;
    get diagnostics v_n = row_count;
    return jsonb_build_object('ok', v_n = 1);

  elsif p_action = 'set_signups_open' then
    update club.settings set value = case when (p_payload->>'open')::boolean then 'true' else 'false' end where key = 'signups_open';
    return jsonb_build_object('ok', true);

  elsif p_action = 'set_code' then
    if char_length(coalesce(p_payload->>'new_code', '')) < 8 then
      return jsonb_build_object('ok', false, 'error', 'code_too_short');
    end if;
    insert into club.settings values ('officer_code_hash', extensions.crypt(p_payload->>'new_code', extensions.gen_salt('bf', 8)))
      on conflict (key) do update set value = excluded.value;
    return jsonb_build_object('ok', true);
  end if;

  return jsonb_build_object('ok', false, 'error', 'unknown_action');
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    return jsonb_build_object('ok', false, 'error', 'bad_value');
  when check_violation or not_null_violation then
    return jsonb_build_object('ok', false, 'error', 'bad_value');
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'duplicate_event');
end $$;

revoke all on function public.club_admin(text, text, jsonb) from public;
grant execute on function public.club_admin(text, text, jsonb) to anon, authenticated, service_role;

-- Rollback: alter table club.events drop column theme; then re-run the event_json and
-- club_admin definitions from 001_club.sql.
