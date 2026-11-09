-- Math & Science Club: sign-up types, and Somerset STEAM Day 2027.
--
-- Applied as migration "club_v3" after 002_club_theme.sql (Justin asked for a "who's
-- going" sign-up and a "work this event" sign-up for STEAM Day, 2026-11-09).
--   * events.signup_kind: 'food' (bring food, as before), 'work' (volunteer shifts or
--     roles) or 'going' (who's going, for trips). Existing events stay 'food'.
--   * For 'work' and 'going' there is no item: people give their name, pick a shift or
--     role (or just "Going"), and can add a note. When a shift or role has a number
--     needed (or a trip a number of spots), it closes when full.
--   * Adds Somerset STEAM Day (Friday, March 5, 2027) with a volunteer sign-up.

alter table club.events add column if not exists signup_kind text not null default 'food'
  check (signup_kind in ('food', 'work', 'going'));
comment on column club.events.signup_kind is
  'What people sign up for: food (bring food), work (volunteer shifts or roles), going (who''s going, e.g. a trip).';

-- item is only asked for food sign-ups
alter table club.signups alter column item set default '';
alter table club.signups drop constraint if exists signups_item_check;
alter table club.signups add constraint signups_item_check check (char_length(item) <= 120);
comment on table club.signups is
  'Sign-ups. Name, slot and item are shown publicly so people can plan. token_hash lets the person who signed up change or remove it from the same device.';

create or replace function club.event_json(e club.events, p_with_signups boolean)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', e.id, 'starts_on', e.starts_on, 'ends_on', e.ends_on,
    'start_time', to_char(e.start_time, 'HH24:MI'), 'end_time', to_char(e.end_time, 'HH24:MI'),
    'title', e.title, 'theme', e.theme, 'kind', e.kind, 'location', e.location, 'details', e.details,
    'tentative', e.tentative, 'status', e.status,
    'signup_enabled', e.signup_enabled, 'signup_kind', e.signup_kind, 'signup_note', e.signup_note, 'slots', e.slots)
  || case when p_with_signups and e.signup_enabled then jsonb_build_object('signups', coalesce((
       select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'slot', s.slot, 'item', s.item,
                                           'note', s.note, 'created_at', s.created_at) order by s.created_at)
         from club.signups s where s.event_id = e.id), '[]'::jsonb)) else '{}'::jsonb end
$$;

-- Is this shift, role or trip full? (work and going only; food "needed" stays a guide)
create or replace function club.slot_full(e club.events, p_slot text, p_except uuid)
returns boolean language sql stable set search_path = '' as $$
  select e.signup_kind <> 'food' and exists (
    select 1 from jsonb_array_elements(e.slots) s
     where s->>'label' = p_slot and coalesce(s->>'needed', '') ~ '^\d{1,3}$'
       and (select count(*) from club.signups x
             where x.event_id = e.id and x.slot = p_slot and x.id is distinct from p_except) >= (s->>'needed')::int)
$$;

create or replace function public.club_signup(p_event_id uuid, p_entry jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e club.events; v_name text; v_slot text; v_item text; v_token text; v_id uuid; v_n int;
begin
  if club.setting('signups_open') is distinct from 'true' then
    return jsonb_build_object('ok', false, 'error', 'signups_closed');
  end if;
  select * into e from club.events where id = p_event_id;
  if not found or not e.signup_enabled or e.status <> 'scheduled' then
    return jsonb_build_object('ok', false, 'error', 'no_signup');
  end if;
  if coalesce(e.ends_on, e.starts_on) < club.today() then
    return jsonb_build_object('ok', false, 'error', 'event_past');
  end if;
  v_name := club.txt(p_entry, 'name', 60);
  v_item := case when e.signup_kind = 'food' then club.txt(p_entry, 'item', 120) else '' end;
  v_slot := club.txt(p_entry, 'slot', 60);
  if v_name is null then return jsonb_build_object('ok', false, 'error', 'no_name'); end if;
  if v_item is null then return jsonb_build_object('ok', false, 'error', 'no_item'); end if;
  if jsonb_array_length(e.slots) > 0 then
    if v_slot is null or not exists (select 1 from jsonb_array_elements(e.slots) s where s->>'label' = v_slot) then
      return jsonb_build_object('ok', false, 'error', 'bad_slot');
    end if;
  else
    v_slot := coalesce(v_slot, case e.signup_kind when 'food' then 'Food or drink' when 'work' then 'Volunteer' else 'Going' end);
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

create or replace function public.club_signup_update(p_id uuid, p_token text, p_entry jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s club.signups; e club.events; v_name text; v_slot text; v_item text;
begin
  select * into s from club.signups where id = p_id;
  if not found or s.token_hash <> encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') then
    return jsonb_build_object('ok', false, 'error', 'not_yours');
  end if;
  select * into e from club.events where id = s.event_id;
  if coalesce(e.ends_on, e.starts_on) < club.today() then
    return jsonb_build_object('ok', false, 'error', 'event_past');
  end if;
  v_name := coalesce(club.txt(p_entry, 'name', 60), s.name);
  v_item := case when e.signup_kind = 'food' then coalesce(club.txt(p_entry, 'item', 120), nullif(s.item, '')) else '' end;
  v_slot := coalesce(club.txt(p_entry, 'slot', 60), s.slot);
  if v_item is null then return jsonb_build_object('ok', false, 'error', 'no_item'); end if;
  if jsonb_array_length(e.slots) > 0 and not exists (select 1 from jsonb_array_elements(e.slots) x where x->>'label' = v_slot) then
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

-- Same as 002, plus signup_kind in save_event.
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
                               signup_enabled, signup_kind, signup_note, slots, source)
      values (v_on, v_until, v_start, v_end, club.txt(p_payload, 'title', 120), club.txt(p_payload, 'theme', 60),
              coalesce(nullif(p_payload->>'kind', ''), 'event'),
              club.txt(p_payload, 'location', 120), club.txt(p_payload, 'details', 1000),
              coalesce((p_payload->>'tentative')::boolean, false), coalesce(nullif(p_payload->>'status', ''), 'scheduled'),
              coalesce((p_payload->>'signup_enabled')::boolean, false), coalesce(nullif(p_payload->>'signup_kind', ''), 'food'),
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
             signup_kind = coalesce(nullif(p_payload->>'signup_kind', ''), signup_kind),
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

revoke all on function club.slot_full(club.events, text, uuid) from public;
revoke all on function public.club_signup(uuid, jsonb) from public;
revoke all on function public.club_signup_update(uuid, text, jsonb) from public;
revoke all on function public.club_admin(text, text, jsonb) from public;
grant execute on function public.club_signup(uuid, jsonb) to anon, authenticated, service_role;
grant execute on function public.club_signup_update(uuid, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.club_admin(text, text, jsonb) to anon, authenticated, service_role;

-- Somerset STEAM Day, Friday, March 5, 2027: volunteer sign-up. Officers can change the
-- shifts, how many are needed, the note and the time in Officer tools.
insert into club.events (starts_on, title, kind, signup_enabled, signup_kind, signup_note, slots, source)
values ('2027-03-05', 'Somerset STEAM Day', 'event', true, 'work',
        'S-STEM scholars: working STEAM Day counts as one of your scholar activities for the semester. Ask your mentor if you have questions.',
        '[{"label":"Setup","needed":null},{"label":"Activity tables","needed":null},{"label":"Cleanup","needed":null}]'::jsonb,
        'Added for Justin, 2026-11-09')
on conflict (starts_on, title) do nothing;

-- Rollback: delete the STEAM Day row if unwanted; drop function club.slot_full; re-run the
-- event_json, club_signup, club_signup_update and club_admin definitions from 001/002;
-- alter table club.signups drop constraint signups_item_check, add check (char_length(item)
-- between 1 and 120) (only once no sign-up has an empty item); alter table club.events drop
-- column signup_kind.
