-- Math & Science Club: open or close sign-up one event at a time; the Holiday Party is a
-- club meeting.
--
-- Applied as migration "club_v10" after 009_club_override_code.sql (Justin asked,
-- 2026-11-19: "open and close sign up for any regular meeting, any holiday party, and any
-- future trip ... leave STEAM Day open ... ones added later I can turn off manually. The
-- default should be open." And: "we need club meeting clearly marked on the holiday party,
-- maybe a pill").
--   * events.signup_open (default true): officers open or close one event's sign-up without
--     touching the others. Closed keeps the event's list on the page ("Who's bringing
--     what") but takes no new sign-ups and no changes; people can still remove their own.
--     Every existing event starts open, so nothing changes until an officer closes one:
--     STEAM Day Somerset 2027 stays open.
--   * The site-wide switch (settings.signups_open) still closes every event at once.
--   * club_events (via event_json) returns signup_open. club_signup and club_signup_update
--     refuse a closed event with 'signup_closed'.
--   * club_admin: save_event keeps an event's signup_open unless the editor sends one; a
--     new event is open unless it says otherwise. New action set_event_signup_open
--     {id, open} for the Open / Close button on each event in Officer tools.
--   * The December 3 Holiday Party becomes type "Club meeting" (it was "Social"), so it
--     carries the Club meeting pill and is the home page's "Next meeting".

alter table club.events add column if not exists signup_open boolean not null default true;
comment on column club.events.signup_open is
  'Is this event taking sign-ups? false = closed by an officer: the list stays visible, no new sign-ups or changes. Only matters when signup_enabled.';

create or replace function club.event_json(e club.events, p_with_signups boolean)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', e.id, 'starts_on', e.starts_on, 'ends_on', e.ends_on,
    'start_time', to_char(e.start_time, 'HH24:MI'), 'end_time', to_char(e.end_time, 'HH24:MI'),
    'title', e.title, 'theme', e.theme, 'kind', e.kind, 'location', e.location, 'details', e.details,
    'tentative', e.tentative, 'status', e.status, 'page', e.page,
    'signup_enabled', e.signup_enabled, 'signup_open', e.signup_open, 'signup_kind', e.signup_kind,
    'signup_note', e.signup_note, 'slots', e.slots)
  || case when p_with_signups and e.signup_enabled then jsonb_build_object('signups', coalesce((
       select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'slot', s.slot, 'item', s.item,
                                           'note', s.note, 'created_at', s.created_at) order by s.created_at)
         from club.signups s where s.event_id = e.id), '[]'::jsonb)) else '{}'::jsonb end
$$;

-- Same as 005, plus: a closed event refuses new sign-ups ('signup_closed').
create or replace function public.club_signup(p_event_id uuid, p_entry jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e club.events; v_name text; v_slot text; v_item text; v_token text; v_id uuid; v_n int;
begin
  if club.setting('signups_open') is distinct from 'true' then
    return jsonb_build_object('ok', false, 'error', 'signups_closed');
  end if;
  -- lock the event row so sign-ups for one event go one at a time (see 003)
  select * into e from club.events where id = p_event_id for update;
  if not found or not e.signup_enabled or e.status <> 'scheduled' then
    return jsonb_build_object('ok', false, 'error', 'no_signup');
  end if;
  if not e.signup_open then
    return jsonb_build_object('ok', false, 'error', 'signup_closed');
  end if;
  if coalesce(e.ends_on, e.starts_on) < club.today() then
    return jsonb_build_object('ok', false, 'error', 'event_past');
  end if;
  v_name := club.txt(p_entry, 'name', 60);
  v_item := case when e.signup_kind = 'food' then club.txt(p_entry, 'item', 120) else '' end;
  v_slot := club.txt(p_entry, 'slot', 60);
  if v_name is null then return jsonb_build_object('ok', false, 'error', 'no_name'); end if;
  if v_item is null then return jsonb_build_object('ok', false, 'error', 'no_item'); end if;
  if e.signup_kind = 'food' then
    v_slot := 'Food or drink'; -- no categories for food
  elsif jsonb_array_length(e.slots) > 0 then
    if v_slot is null or not exists (select 1 from jsonb_array_elements(e.slots) s where s->>'label' = v_slot) then
      return jsonb_build_object('ok', false, 'error', 'bad_slot');
    end if;
  else
    v_slot := coalesce(v_slot, case e.signup_kind when 'work' then 'Volunteers' else 'Going' end);
  end if;
  select count(*) into v_n from club.signups where event_id = e.id;
  if v_n >= coalesce(club.setting('max_signups_per_event')::int, 60) then
    return jsonb_build_object('ok', false, 'error', 'full');
  end if;
  if club.slot_full(e, v_slot, null) then
    return jsonb_build_object('ok', false, 'error', 'slot_full');
  end if;
  if exists (select 1 from club.signups where event_id = e.id and lower(name) = lower(v_name)
               and case when e.signup_kind = 'food' then lower(item) = lower(v_item) else slot = v_slot end) then
    return jsonb_build_object('ok', false, 'error', 'duplicate');
  end if;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into club.signups (event_id, name, slot, item, note, token_hash)
  values (e.id, v_name, v_slot, v_item, club.txt(p_entry, 'note', 200), encode(extensions.digest(v_token, 'sha256'), 'hex'))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'token', v_token);
end $$;

-- Same as 005, plus: no changes while the event's sign-up is closed ('signup_closed').
-- Removing your own sign-up (club_signup_remove) is still allowed.
create or replace function public.club_signup_update(p_id uuid, p_token text, p_entry jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s club.signups; e club.events; v_name text; v_slot text; v_item text;
begin
  select * into s from club.signups where id = p_id;
  if not found or s.token_hash <> encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') then
    return jsonb_build_object('ok', false, 'error', 'not_yours');
  end if;
  select * into e from club.events where id = s.event_id for update; -- same lock as club_signup
  if not e.signup_open then
    return jsonb_build_object('ok', false, 'error', 'signup_closed');
  end if;
  if coalesce(e.ends_on, e.starts_on) < club.today() then
    return jsonb_build_object('ok', false, 'error', 'event_past');
  end if;
  v_name := coalesce(club.txt(p_entry, 'name', 60), s.name);
  v_item := case when e.signup_kind = 'food' then coalesce(club.txt(p_entry, 'item', 120), nullif(s.item, '')) else '' end;
  -- food has no categories: the slot stays as it is
  v_slot := case when e.signup_kind = 'food' then s.slot else coalesce(club.txt(p_entry, 'slot', 60), s.slot) end;
  if v_item is null then return jsonb_build_object('ok', false, 'error', 'no_item'); end if;
  if e.signup_kind <> 'food' and jsonb_array_length(e.slots) > 0
     and not exists (select 1 from jsonb_array_elements(e.slots) x where x->>'label' = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'bad_slot');
  end if;
  if v_slot <> s.slot and club.slot_full(e, v_slot, s.id) then
    return jsonb_build_object('ok', false, 'error', 'slot_full');
  end if;
  update club.signups set name = v_name, item = v_item, slot = v_slot,
         note = case when p_entry ? 'note' then club.txt(p_entry, 'note', 200) else note end, updated_at = now()
   where id = s.id;
  return jsonb_build_object('ok', true);
end $$;

-- Same as 003, plus: save_event stores signup_open (new events open unless told otherwise;
-- an edit that doesn't send it keeps it), and the set_event_signup_open action.
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
                               signup_enabled, signup_open, signup_kind, signup_note, slots, source)
      values (v_on, v_until, v_start, v_end, club.txt(p_payload, 'title', 120), club.txt(p_payload, 'theme', 60),
              coalesce(nullif(p_payload->>'kind', ''), 'event'),
              club.txt(p_payload, 'location', 120), club.txt(p_payload, 'details', 1000),
              coalesce((p_payload->>'tentative')::boolean, false), coalesce(nullif(p_payload->>'status', ''), 'scheduled'),
              coalesce((p_payload->>'signup_enabled')::boolean, false), coalesce((p_payload->>'signup_open')::boolean, true),
              coalesce(nullif(p_payload->>'signup_kind', ''), 'food'),
              club.txt(p_payload, 'signup_note', 300), club.clean_slots(p_payload->'slots'), 'Added by a club officer')
      returning id into v_id;
    else
      update club.events set starts_on = v_on, ends_on = v_until, start_time = v_start, end_time = v_end,
             title = club.txt(p_payload, 'title', 120), theme = club.txt(p_payload, 'theme', 60),
             kind = coalesce(nullif(p_payload->>'kind', ''), 'event'),
             location = club.txt(p_payload, 'location', 120), details = club.txt(p_payload, 'details', 1000),
             tentative = coalesce((p_payload->>'tentative')::boolean, false),
             status = coalesce(nullif(p_payload->>'status', ''), 'scheduled'),
             signup_enabled = coalesce((p_payload->>'signup_enabled')::boolean, false),
             signup_open = coalesce((p_payload->>'signup_open')::boolean, signup_open),
             signup_kind = coalesce(nullif(p_payload->>'signup_kind', ''), signup_kind),
             signup_note = club.txt(p_payload, 'signup_note', 300), slots = club.clean_slots(p_payload->'slots'),
             updated_at = now()
       where id = v_id;
      get diagnostics v_n = row_count;
      if v_n = 0 then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    end if;
    return jsonb_build_object('ok', true, 'id', v_id);

  elsif p_action = 'set_event_signup_open' then
    if (p_payload->>'open') is null then return jsonb_build_object('ok', false, 'error', 'bad_value'); end if;
    update club.events set signup_open = (p_payload->>'open')::boolean, updated_at = now()
     where id = (p_payload->>'id')::uuid;
    get diagnostics v_n = row_count;
    if v_n = 0 then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    return jsonb_build_object('ok', true);

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

revoke all on function public.club_signup(uuid, jsonb) from public;
revoke all on function public.club_signup_update(uuid, text, jsonb) from public;
revoke all on function public.club_admin(text, text, jsonb) from public;
grant execute on function public.club_signup(uuid, jsonb) to anon, authenticated, service_role;
grant execute on function public.club_signup_update(uuid, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.club_admin(text, text, jsonb) to anon, authenticated, service_role;

-- The Holiday Party is the December club meeting: type "Club meeting" (was "Social").
update club.events set kind = 'meeting', updated_at = now()
 where starts_on = '2026-12-03' and title = 'Math and Science Club Holiday Party' and kind = 'social';

-- Rollback: re-run the event_json definition from 006, the club_signup and
-- club_signup_update definitions from 005 and the club_admin definition from 003, then
--   alter table club.events drop column signup_open;
-- and set the Holiday Party's type back to Social in Officer tools if wanted.
