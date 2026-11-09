-- Math & Natural Sciences Club — events and food sign-ups.
--
-- STATUS: written and tested locally (tools/msclub/local-api.mjs + tests/).
-- Apply to the SyllaBased Supabase project only with Justin's approval, as migration
-- "club_v1". Same isolation model as the BIO 151 live lab and the freshwater observations:
--   * tables live in a private schema (club) that PostgREST does NOT expose;
--   * the browser reaches them only through SECURITY DEFINER functions public.club_*;
--   * anyone can read the schedule and sign up to bring food (no accounts);
--   * changing events, sign-up categories or other people's sign-ups needs the officer code
--     (stored only as a bcrypt hash).
-- Dates and times are local wall-clock times in Somerset, Kentucky (America/New_York).

create schema if not exists club;
revoke all on schema club from public;
revoke all on schema club from anon, authenticated;

-- ---------------------------------------------------------------- tables
create table if not exists club.settings (
  key   text primary key,
  value text not null
);
comment on table club.settings is
  'officer_code_hash = bcrypt hash (never plain text). signups_open = global switch. max_signups_per_event = spam limit.';
insert into club.settings (key, value) values
  ('signups_open', 'true'),
  ('max_signups_per_event', '60')
on conflict (key) do nothing;

create table if not exists club.events (
  id              uuid primary key default gen_random_uuid(),
  starts_on       date not null,
  ends_on         date check (ends_on is null or ends_on >= starts_on),
  start_time      time,                 -- null = all day
  end_time        time,
  title           text not null check (char_length(title) between 1 and 120),
  kind            text not null default 'event'
                  check (kind in ('meeting','social','astronomy','campus-tour','conference','competition','event','graduation')),
  location        text check (char_length(location) <= 120),
  details         text check (char_length(details) <= 1000),
  tentative       boolean not null default false,
  status          text not null default 'scheduled' check (status in ('scheduled','cancelled')),
  signup_enabled  boolean not null default false,
  signup_note     text check (char_length(signup_note) <= 300),
  slots           jsonb not null default '[]'::jsonb,   -- [{"label":"Drinks","needed":3}] — needed may be null
  source          text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (starts_on, title)
);
comment on table club.events is
  'Club schedule. slots = the food sign-up categories officers set up for this event.';

create table if not exists club.signups (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references club.events(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  slot        text not null check (char_length(slot) between 1 and 60),
  item        text not null check (char_length(item) between 1 and 120),
  note        text check (char_length(note) <= 200),
  token_hash  text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists signups_event_idx on club.signups (event_id, created_at);
comment on table club.signups is
  'Food sign-ups. Name and item are shown publicly so people can plan. token_hash lets the person who signed up change or remove it from the same device.';

alter table club.settings enable row level security;
alter table club.events   enable row level security;
alter table club.signups  enable row level security;

-- ---------------------------------------------------------------- helpers (private)
create or replace function club.setting(p_key text)
returns text language sql stable set search_path = '' as $$
  select value from club.settings where key = p_key
$$;

create or replace function club.today()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'America/New_York')::date
$$;

create or replace function club.txt(p jsonb, p_field text, p_max int)
returns text language sql immutable set search_path = '' as $$
  select nullif(left(btrim(coalesce(p->>p_field, '')), p_max), '')
$$;

create or replace function club.code_ok(p_code text)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(p_code, '') <> '' and exists (
    select 1 from club.settings s
    where s.key = 'officer_code_hash' and s.value = extensions.crypt(p_code, s.value))
$$;

create or replace function club.clean_slots(p jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare s jsonb; out jsonb := '[]'::jsonb; lbl text; n int; seen text[] := '{}';
begin
  if p is null or jsonb_typeof(p) <> 'array' then return '[]'::jsonb; end if;
  for s in select * from jsonb_array_elements(p) loop
    lbl := left(btrim(coalesce(s->>'label', '')), 60);
    if lbl = '' or lower(lbl) = any(seen) then continue; end if;
    seen := seen || lower(lbl);
    n := case when coalesce(s->>'needed', '') ~ '^\d{1,3}$' then (s->>'needed')::int end;
    out := out || jsonb_build_array(jsonb_build_object('label', lbl, 'needed', n));
    exit when jsonb_array_length(out) >= 12;
  end loop;
  return out;
end $$;

create or replace function club.event_json(e club.events, p_with_signups boolean)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', e.id, 'starts_on', e.starts_on, 'ends_on', e.ends_on,
    'start_time', to_char(e.start_time, 'HH24:MI'), 'end_time', to_char(e.end_time, 'HH24:MI'),
    'title', e.title, 'kind', e.kind, 'location', e.location, 'details', e.details,
    'tentative', e.tentative, 'status', e.status,
    'signup_enabled', e.signup_enabled, 'signup_note', e.signup_note, 'slots', e.slots)
  || case when p_with_signups and e.signup_enabled then jsonb_build_object('signups', coalesce((
       select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'slot', s.slot, 'item', s.item,
                                           'note', s.note, 'created_at', s.created_at) order by s.created_at)
         from club.signups s where s.event_id = e.id), '[]'::jsonb)) else '{}'::jsonb end
$$;

-- ---------------------------------------------------------------- public API
-- The whole schedule, with food sign-ups for events that have them.
create or replace function public.club_events()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('ok', true, 'today', club.today(),
    'signups_open', club.setting('signups_open') = 'true',
    'events', coalesce((select jsonb_agg(club.event_json(e, true) order by e.starts_on, e.start_time nulls first, e.title)
                          from club.events e), '[]'::jsonb))
$$;

-- Sign up to bring something. Returns a token that lets this device change or remove it.
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
  v_item := club.txt(p_entry, 'item', 120);
  v_slot := club.txt(p_entry, 'slot', 60);
  if v_name is null then return jsonb_build_object('ok', false, 'error', 'no_name'); end if;
  if v_item is null then return jsonb_build_object('ok', false, 'error', 'no_item'); end if;
  if jsonb_array_length(e.slots) > 0 then
    if v_slot is null or not exists (select 1 from jsonb_array_elements(e.slots) s where s->>'label' = v_slot) then
      return jsonb_build_object('ok', false, 'error', 'bad_slot');
    end if;
  else
    v_slot := coalesce(v_slot, 'Food or drink');
  end if;
  select count(*) into v_n from club.signups where event_id = e.id;
  if v_n >= coalesce(club.setting('max_signups_per_event')::int, 60) then
    return jsonb_build_object('ok', false, 'error', 'full');
  end if;
  if exists (select 1 from club.signups where event_id = e.id and lower(name) = lower(v_name) and lower(item) = lower(v_item)) then
    return jsonb_build_object('ok', false, 'error', 'duplicate');
  end if;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into club.signups (event_id, name, slot, item, note, token_hash)
  values (e.id, v_name, v_slot, v_item, club.txt(p_entry, 'note', 200), encode(extensions.digest(v_token, 'sha256'), 'hex'))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'token', v_token);
end $$;

-- Change your own sign-up (the token came back from club_signup on this device).
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
  v_item := coalesce(club.txt(p_entry, 'item', 120), s.item);
  v_slot := coalesce(club.txt(p_entry, 'slot', 60), s.slot);
  if jsonb_array_length(e.slots) > 0 and not exists (select 1 from jsonb_array_elements(e.slots) x where x->>'label' = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'bad_slot');
  end if;
  update club.signups set name = v_name, item = v_item, slot = v_slot,
         note = case when p_entry ? 'note' then club.txt(p_entry, 'note', 200) else note end, updated_at = now()
   where id = s.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.club_signup_remove(p_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  delete from club.signups
   where id = p_id and token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if not found then return jsonb_build_object('ok', false, 'error', 'not_yours'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Officers: everything else, gated by the officer code.
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
      insert into club.events (starts_on, ends_on, start_time, end_time, title, kind, location, details, tentative, status,
                               signup_enabled, signup_note, slots, source)
      values (v_on, v_until, v_start, v_end, club.txt(p_payload, 'title', 120), coalesce(nullif(p_payload->>'kind', ''), 'event'),
              club.txt(p_payload, 'location', 120), club.txt(p_payload, 'details', 1000),
              coalesce((p_payload->>'tentative')::boolean, false), coalesce(nullif(p_payload->>'status', ''), 'scheduled'),
              coalesce((p_payload->>'signup_enabled')::boolean, false), club.txt(p_payload, 'signup_note', 300),
              club.clean_slots(p_payload->'slots'), 'Added by a club officer')
      returning id into v_id;
    else
      update club.events set starts_on = v_on, ends_on = v_until, start_time = v_start, end_time = v_end,
             title = club.txt(p_payload, 'title', 120), kind = coalesce(nullif(p_payload->>'kind', ''), 'event'),
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

-- ---------------------------------------------------------------- grants
revoke all on function public.club_events()                          from public;
revoke all on function public.club_signup(uuid, jsonb)               from public;
revoke all on function public.club_signup_update(uuid, text, jsonb)  from public;
revoke all on function public.club_signup_remove(uuid, text)         from public;
revoke all on function public.club_admin(text, text, jsonb)          from public;
grant execute on function public.club_events()                         to anon, authenticated, service_role;
grant execute on function public.club_signup(uuid, jsonb)              to anon, authenticated, service_role;
grant execute on function public.club_signup_update(uuid, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.club_signup_remove(uuid, text)        to anon, authenticated, service_role;
grant execute on function public.club_admin(text, text, jsonb)         to anon, authenticated, service_role;

-- ---------------------------------------------------------------- seed: Fall 2026 schedule
-- Transcribed from the printed "MSSE Scholars Proposed Activities — Fall 2026 Schedule".
-- The same records are in msclub/data/events.json (the page's fallback); the
-- contract tests check that both match. ** on the flyer = tentative.
insert into club.events (starts_on, ends_on, start_time, end_time, title, kind, tentative, signup_enabled, signup_note, slots, source) values
  ('2026-08-20', null, '17:00', null, 'Math and Science Club Social', 'social', false, false, null, '[]', 'MSSE Scholars Proposed Activities, Fall 2026'),
  ('2026-08-28', null, '20:00', null, 'August Astronomy Night', 'astronomy', true, false, null, '[]', 'MSSE Scholars Proposed Activities, Fall 2026'),
  ('2026-09-11', null, null, null, 'UL Campus Tour', 'campus-tour', true, false, null, '[]', 'MSSE Scholars Proposed Activities, Fall 2026'),
  ('2026-09-17', null, '17:00', null, 'Math and Science Club Meeting', 'meeting', false, false, null, '[]', 'MSSE Scholars Proposed Activities, Fall 2026'),
  ('2026-09-18', null, '20:00', null, 'September Astronomy Night', 'astronomy', false, false, null, '[]', 'MSSE Scholars Proposed Activities, Fall 2026'),
  ('2026-09-23', null, '09:00', '15:00', 'Spades Competition', 'competition', false, false, null, '[]', 'MSSE Scholars Proposed Activities, Fall 2026'),
  ('2026-09-25', null, null, null, 'UL Campus Tour', 'campus-tour', false, false, null, '[]', 'MSSE Scholars Proposed Activities, Fall 2026'),
  ('2026-10-02', null, null, null, 'WKU Campus Tour', 'campus-tour', false, false, null, '[]', 'MSSE Scholars Proposed Activities, Fall 2026'),
  ('2026-10-09', '2026-10-11', null, null, 'STEM Conference @ Washington DC', 'conference', false, false, null, '[]', 'MSSE Scholars Proposed Activities, Fall 2026'),
  ('2026-10-15', null, '17:00', null, 'Math and Science Club Meeting', 'meeting', false, false, null, '[]', 'MSSE Scholars Proposed Activities, Fall 2026'),
  ('2026-10-16', null, '20:00', null, 'October Star Party', 'astronomy', true, false, null, '[]', 'MSSE Scholars Proposed Activities, Fall 2026'),
  ('2026-10-30', null, '08:00', null, 'Laurel STEAM Day', 'event', false, false, null, '[]', 'MSSE Scholars Proposed Activities, Fall 2026'),
  ('2026-10-30', null, '20:00', null, 'Laurel Star Party', 'astronomy', false, false, null, '[]', 'MSSE Scholars Proposed Activities, Fall 2026'),
  ('2026-11-19', null, '17:00', null, 'Math and Science Club Meeting', 'meeting', false, true, null,
     '[{"label":"Main dish","needed":null},{"label":"Side","needed":null},{"label":"Snack","needed":null},{"label":"Dessert","needed":null},{"label":"Drinks","needed":null},{"label":"Plates, cups or napkins","needed":null}]',
     'MSSE Scholars Proposed Activities, Fall 2026'),
  ('2026-11-20', null, '10:00', '15:00', 'Somerset Student Showcase', 'event', false, false, null, '[]', 'MSSE Scholars Proposed Activities, Fall 2026'),
  ('2026-12-03', null, '17:00', null, 'Math and Science Club Holiday Party', 'social', false, true, null,
     '[{"label":"Main dish","needed":null},{"label":"Side","needed":null},{"label":"Snack","needed":null},{"label":"Dessert","needed":null},{"label":"Drinks","needed":null},{"label":"Plates, cups or napkins","needed":null}]',
     'MSSE Scholars Proposed Activities, Fall 2026'),
  ('2026-12-10', null, '17:00', null, 'Fall Graduation', 'graduation', false, false, null, '[]', 'MSSE Scholars Proposed Activities, Fall 2026')
on conflict (starts_on, title) do nothing;

-- After applying, set the officer code once (keep the plain code outside the repo):
--   insert into club.settings values ('officer_code_hash', extensions.crypt('<code>', extensions.gen_salt('bf', 8)))
--   on conflict (key) do update set value = excluded.value;
--
-- Rollback (removes everything this file created):
--   drop function if exists public.club_events(), public.club_signup(uuid, jsonb),
--     public.club_signup_update(uuid, text, jsonb), public.club_signup_remove(uuid, text),
--     public.club_admin(text, text, jsonb);
--   drop schema club cascade;
