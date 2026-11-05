-- Freshwater portal — student field-observation submissions with photos.
--
-- STATUS: written and tested locally (tools/freshwater-portal/local-api.mjs + tests/).
-- Apply to the SyllaBased Supabase project only with Justin's approval, as migration
-- "fieldobs_v1". Same isolation model as the BIO 151 live lab (labs/bio151-spectro/sql):
--   * tables live in a private schema (fieldobs) that PostgREST does NOT expose;
--   * the browser reaches them only through SECURITY DEFINER functions public.fw_*;
--   * students need the class upload code to submit; nothing is public until a
--     faculty reviewer approves it with the instructor key.
-- Photos are resized and re-encoded in the browser before upload (which strips their
-- embedded metadata); GPS/time/camera read from the original file are stored as fields.
-- Storage is capped (settings.photo_quota_bytes) because the project is on the free tier.

create schema if not exists fieldobs;
revoke all on schema fieldobs from public;
revoke all on schema fieldobs from anon, authenticated;

-- ---------------------------------------------------------------- tables
create table if not exists fieldobs.settings (
  key   text primary key,
  value text not null
);
comment on table fieldobs.settings is
  'upload_code_hash / instructor_key_hash = bcrypt hashes (never plain text). submissions_open, photo_quota_bytes, max_photos, max_photo_bytes, max_thumb_bytes = limits.';

insert into fieldobs.settings (key, value) values
  ('submissions_open', 'false'),
  ('photo_quota_bytes', '157286400'),   -- 150 MB total for all photos
  ('max_photos', '6'),
  ('max_photo_bytes', '716800'),        -- 700 KB per display image (~1600 px JPEG)
  ('max_thumb_bytes', '81920')          -- 80 KB per thumbnail (~400 px JPEG)
on conflict (key) do nothing;

create table if not exists fieldobs.submissions (
  id                   uuid primary key default gen_random_uuid(),
  receipt              text not null unique,
  client_id            uuid not null unique,
  status               text not null default 'uploading'
                       check (status in ('uploading','submitted','changes_requested','approved','rejected','archived')),
  site_id              text not null check (site_id in ('allen-branch','agricultural-pond','lake-cumberland-pitman','lake-linville','other')),
  site_other           text check (char_length(site_other) <= 120),
  station              text check (char_length(station) <= 60),
  observed_at          timestamptz not null,
  observed_at_source   text not null check (observed_at_source in ('photo','device','manual')),
  latitude             numeric(9,6) check (latitude between 36 and 40),
  longitude            numeric(9,6) check (longitude between -90 and -81),
  gps_accuracy_m       numeric check (gps_accuracy_m between 0 and 100000),
  location_source      text not null check (location_source in ('photo','device','map','manual','none')),
  weather              text check (char_length(weather) <= 200),
  air_temperature_c    numeric check (air_temperature_c between -30 and 50),
  rain_note            text check (char_length(rain_note) <= 200),
  measurements         jsonb not null default '[]'::jsonb,
  water_depth_cm       numeric check (water_depth_cm between 0 and 1000),
  flow_observation     text check (flow_observation in ('dry','pooled','trickle','low','moderate','high','flood')),
  canopy_cover_pct     numeric check (canopy_cover_pct between 0 and 100),
  canopy_method        text check (char_length(canopy_method) <= 80),
  substrate            text[] not null default '{}',
  visible_biofilm      text check (visible_biofilm in ('none','thin','thick','mat','floating')),
  suspected_organisms  text check (char_length(suspected_organisms) <= 1000),
  notes                text check (char_length(notes) <= 2000),
  observers            jsonb not null default '[]'::jsonb,
  upload_token_hash    text,
  upload_token_expires timestamptz,
  review_note          text,
  reviewed_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists submissions_status_idx on fieldobs.submissions (status, created_at desc);
comment on table fieldobs.submissions is
  'One field observation from a student or group. observers = [{name, public}] — names are shown publicly only where public = true, and only after approval.';

create table if not exists fieldobs.photos (
  id              uuid primary key default gen_random_uuid(),
  submission_id   uuid not null references fieldobs.submissions(id) on delete cascade,
  position        int not null,
  status          text not null default 'pending' check (status in ('pending','approved','removed')),
  caption         text check (char_length(caption) <= 300),
  taken_at        timestamptz,
  latitude        numeric(9,6),
  longitude       numeric(9,6),
  gps_accuracy_m  numeric,
  camera          text check (char_length(camera) <= 120),
  width           int,
  height          int,
  image           bytea,
  thumb           bytea,
  image_bytes     int not null default 0,
  created_at      timestamptz not null default now(),
  unique (submission_id, position)
);
create index if not exists photos_submission_idx on fieldobs.photos (submission_id);
comment on table fieldobs.photos is
  'Re-encoded JPEGs (no embedded metadata). taken_at / latitude / longitude / camera were read from the original photo in the browser. status removed = image bytes deleted (e.g. a face) but the record kept.';

alter table fieldobs.settings    enable row level security;
alter table fieldobs.submissions enable row level security;
alter table fieldobs.photos      enable row level security;

-- ---------------------------------------------------------------- helpers (private)
create or replace function fieldobs.setting(p_key text)
returns text language sql stable set search_path = '' as $$
  select value from fieldobs.settings where key = p_key
$$;

create or replace function fieldobs.secret_ok(p_key text, p_plain text)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(p_plain, '') <> '' and exists (
    select 1 from fieldobs.settings s
    where s.key = p_key and s.value = extensions.crypt(p_plain, s.value))
$$;

create or replace function fieldobs.num(p jsonb, p_field text)
returns numeric language plpgsql immutable set search_path = '' as $$
begin
  if p is null or not (p ? p_field) or jsonb_typeof(p->p_field) = 'null' or p->>p_field = '' then return null; end if;
  return (p->>p_field)::numeric;
exception when others then
  raise exception 'bad_number:%', p_field;
end $$;

create or replace function fieldobs.txt(p jsonb, p_field text, p_max int)
returns text language sql immutable set search_path = '' as $$
  select nullif(left(btrim(coalesce(p->>p_field, '')), p_max), '')
$$;

-- Allowed measurement parameters and their fixed units / plausible ranges.
create or replace function fieldobs.param_spec(p_param text)
returns jsonb language sql immutable set search_path = '' as $$
  select case p_param
    when 'water_temperature'    then '{"unit":"°C","min":-5,"max":45}'
    when 'ph'                   then '{"unit":"pH units","min":0,"max":14}'
    when 'specific_conductance' then '{"unit":"µS/cm","min":0,"max":20000}'
    when 'dissolved_oxygen'     then '{"unit":"mg/L","min":0,"max":30}'
    when 'turbidity'            then '{"unit":"NTU","min":0,"max":4000}'
    when 'transparency_tube'    then '{"unit":"cm","min":0,"max":200}'
    when 'nitrate_n'            then '{"unit":"mg/L as N","min":0,"max":100}'
    when 'orthophosphate_p'     then '{"unit":"mg/L as P","min":0,"max":50}'
    else null end::jsonb
$$;

create or replace function fieldobs.clean_measurements(p jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare m jsonb; spec jsonb; v numeric; out jsonb := '[]'::jsonb; n int := 0;
begin
  if p is null or jsonb_typeof(p) <> 'array' then return '[]'::jsonb; end if;
  for m in select * from jsonb_array_elements(p) loop
    n := n + 1;
    if n > 20 then raise exception 'too_many_measurements'; end if;
    spec := fieldobs.param_spec(m->>'parameter');
    if spec is null then raise exception 'bad_parameter'; end if;
    v := fieldobs.num(m, 'value');
    if v is null and coalesce((m->>'below_detection')::boolean, false) = false then continue; end if;
    if v is not null and (v < (spec->>'min')::numeric or v > (spec->>'max')::numeric) then
      raise exception 'out_of_range:%', m->>'parameter';
    end if;
    out := out || jsonb_build_array(jsonb_build_object(
      'parameter', m->>'parameter', 'value', v, 'unit', spec->>'unit',
      'method', left(coalesce(m->>'method', ''), 120),
      'below_detection', coalesce((m->>'below_detection')::boolean, false)));
  end loop;
  return out;
end $$;

create or replace function fieldobs.submission_json(s fieldobs.submissions, p_private boolean)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'receipt', s.receipt, 'status', s.status,
    'site_id', s.site_id, 'site_other', s.site_other, 'station', s.station,
    'observed_at', s.observed_at, 'observed_at_source', s.observed_at_source,
    'latitude', s.latitude, 'longitude', s.longitude, 'gps_accuracy_m', s.gps_accuracy_m,
    'location_source', s.location_source,
    'weather', s.weather, 'air_temperature_c', s.air_temperature_c, 'rain_note', s.rain_note,
    'measurements', s.measurements, 'water_depth_cm', s.water_depth_cm,
    'flow_observation', s.flow_observation, 'canopy_cover_pct', s.canopy_cover_pct,
    'canopy_method', s.canopy_method, 'substrate', to_jsonb(s.substrate),
    'visible_biofilm', s.visible_biofilm, 'suspected_organisms', s.suspected_organisms,
    'notes', s.notes,
    'observers', case when p_private then s.observers else
       coalesce((select jsonb_agg(o->>'name') from jsonb_array_elements(s.observers) o
                 where coalesce((o->>'public')::boolean, false)), '[]'::jsonb) end,
    'created_at', s.created_at)
  || case when p_private then jsonb_build_object('review_note', s.review_note, 'reviewed_at', s.reviewed_at) else '{}'::jsonb end
$$;

create or replace function fieldobs.photos_used_bytes()
returns bigint language sql stable set search_path = '' as $$
  select coalesce(sum(coalesce(octet_length(image), 0) + coalesce(octet_length(thumb), 0)), 0) from fieldobs.photos
$$;

-- ---------------------------------------------------------------- public API
-- Form start-up: is the form open, and what are the limits?
create or replace function public.fw_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'ok', true,
    'open', fieldobs.setting('submissions_open') = 'true'
            and exists (select 1 from fieldobs.settings where key = 'upload_code_hash'),
    'max_photos', fieldobs.setting('max_photos')::int,
    'max_photo_bytes', fieldobs.setting('max_photo_bytes')::int,
    'max_thumb_bytes', fieldobs.setting('max_thumb_bytes')::int,
    'photo_space_left', greatest(fieldobs.setting('photo_quota_bytes')::bigint - fieldobs.photos_used_bytes(), 0) > 5 * 1024 * 1024)
$$;

-- Step 1: create the observation (text and numbers). Returns a short-lived upload token.
create or replace function public.fw_submit(p_code text, p_entry jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid; v_receipt text; v_token text; v_obs timestamptz; v_lat numeric; v_lon numeric;
  v_observers jsonb := '[]'::jsonb; o jsonb; v_sub text[] := '{}'; v_existing fieldobs.submissions;
begin
  if fieldobs.setting('submissions_open') is distinct from 'true'
     or not exists (select 1 from fieldobs.settings where key = 'upload_code_hash') then
    return jsonb_build_object('ok', false, 'error', 'not_open');
  end if;
  if not fieldobs.secret_ok('upload_code_hash', p_code) then
    perform pg_sleep(0.5);
    return jsonb_build_object('ok', false, 'error', 'bad_code');
  end if;
  if p_entry is null or jsonb_typeof(p_entry) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_entry');
  end if;

  -- a retried submission (same client_id) returns the original receipt instead of a duplicate
  select * into v_existing from fieldobs.submissions where client_id = (p_entry->>'client_id')::uuid;
  if found then
    return jsonb_build_object('ok', false, 'error', 'already_submitted', 'receipt', v_existing.receipt);
  end if;

  v_obs := (p_entry->>'observed_at')::timestamptz;
  if v_obs is null or v_obs > now() + interval '1 day' or v_obs < now() - interval '400 days' then
    return jsonb_build_object('ok', false, 'error', 'bad_time');
  end if;
  v_lat := fieldobs.num(p_entry, 'latitude'); v_lon := fieldobs.num(p_entry, 'longitude');
  if (v_lat is null) <> (v_lon is null)
     or (v_lat is not null and (v_lat not between 36 and 40 or v_lon not between -90 and -81)) then
    return jsonb_build_object('ok', false, 'error', 'bad_location');
  end if;

  if jsonb_typeof(p_entry->'observers') = 'array' then
    for o in select * from jsonb_array_elements(p_entry->'observers') limit 8 loop
      if btrim(coalesce(o->>'name', '')) <> '' then
        v_observers := v_observers || jsonb_build_array(jsonb_build_object(
          'name', left(btrim(o->>'name'), 60),
          'public', coalesce((o->>'public')::boolean, false)));
      end if;
    end loop;
  end if;
  if jsonb_array_length(v_observers) = 0 then
    return jsonb_build_object('ok', false, 'error', 'no_observer');
  end if;
  if jsonb_typeof(p_entry->'substrate') = 'array' then
    select coalesce(array_agg(x), '{}') into v_sub from jsonb_array_elements_text(p_entry->'substrate') x
     where x in ('bedrock','boulder','cobble','gravel','sand','silt-clay','wood','leaf-litter','vegetation','concrete');
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  loop
    v_receipt := 'FW-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));
    exit when not exists (select 1 from fieldobs.submissions where receipt = v_receipt);
  end loop;

  insert into fieldobs.submissions (
    receipt, client_id, site_id, site_other, station, observed_at, observed_at_source,
    latitude, longitude, gps_accuracy_m, location_source, weather, air_temperature_c, rain_note,
    measurements, water_depth_cm, flow_observation, canopy_cover_pct, canopy_method, substrate,
    visible_biofilm, suspected_organisms, notes, observers, upload_token_hash, upload_token_expires)
  values (
    v_receipt, (p_entry->>'client_id')::uuid, p_entry->>'site_id', fieldobs.txt(p_entry, 'site_other', 120),
    fieldobs.txt(p_entry, 'station', 60), v_obs, coalesce(p_entry->>'observed_at_source', 'manual'),
    v_lat, v_lon, fieldobs.num(p_entry, 'gps_accuracy_m'), coalesce(p_entry->>'location_source', 'none'),
    fieldobs.txt(p_entry, 'weather', 200), fieldobs.num(p_entry, 'air_temperature_c'), fieldobs.txt(p_entry, 'rain_note', 200),
    fieldobs.clean_measurements(p_entry->'measurements'), fieldobs.num(p_entry, 'water_depth_cm'),
    nullif(p_entry->>'flow_observation', ''), fieldobs.num(p_entry, 'canopy_cover_pct'), fieldobs.txt(p_entry, 'canopy_method', 80),
    v_sub, nullif(p_entry->>'visible_biofilm', ''), fieldobs.txt(p_entry, 'suspected_organisms', 1000),
    fieldobs.txt(p_entry, 'notes', 2000), v_observers,
    encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '2 hours')
  returning id into v_id;

  return jsonb_build_object('ok', true, 'submission_id', v_id, 'receipt', v_receipt, 'upload_token', v_token,
                            'max_photos', fieldobs.setting('max_photos')::int);
exception
  when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
    return jsonb_build_object('ok', false, 'error', 'bad_entry');
  when check_violation then
    return jsonb_build_object('ok', false, 'error', 'bad_entry');
  when raise_exception then
    return jsonb_build_object('ok', false, 'error', split_part(sqlerrm, ':', 1), 'field', nullif(split_part(sqlerrm, ':', 2), ''));
end $$;

-- Step 2: attach one photo (call once per photo, up to max_photos).
create or replace function public.fw_add_photo(p_submission_id uuid, p_token text, p_photo jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s fieldobs.submissions; v_img bytea; v_th bytea; v_count int; v_lat numeric; v_lon numeric;
begin
  select * into s from fieldobs.submissions where id = p_submission_id for update;
  if not found or s.upload_token_hash is null or s.upload_token_expires < now()
     or s.upload_token_hash <> encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') then
    return jsonb_build_object('ok', false, 'error', 'bad_token');
  end if;
  select count(*) into v_count from fieldobs.photos where submission_id = s.id;
  if v_count >= fieldobs.setting('max_photos')::int then
    return jsonb_build_object('ok', false, 'error', 'too_many_photos');
  end if;
  begin
    v_img := decode(p_photo->>'image_b64', 'base64');
    v_th  := decode(p_photo->>'thumb_b64', 'base64');
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'bad_image');
  end;
  if v_img is null or v_th is null
     or substring(v_img from 1 for 3) <> '\xffd8ff'::bytea or substring(v_th from 1 for 3) <> '\xffd8ff'::bytea then
    return jsonb_build_object('ok', false, 'error', 'bad_image');
  end if;
  if octet_length(v_img) > fieldobs.setting('max_photo_bytes')::int
     or octet_length(v_th) > fieldobs.setting('max_thumb_bytes')::int then
    return jsonb_build_object('ok', false, 'error', 'image_too_large');
  end if;
  if fieldobs.photos_used_bytes() + octet_length(v_img) + octet_length(v_th) > fieldobs.setting('photo_quota_bytes')::bigint then
    return jsonb_build_object('ok', false, 'error', 'storage_full');
  end if;
  v_lat := fieldobs.num(p_photo, 'latitude'); v_lon := fieldobs.num(p_photo, 'longitude');
  if v_lat is not null and (v_lat not between -90 and 90 or v_lon is null or v_lon not between -180 and 180) then
    v_lat := null; v_lon := null;
  end if;
  insert into fieldobs.photos (submission_id, position, caption, taken_at, latitude, longitude, gps_accuracy_m,
                               camera, width, height, image, thumb, image_bytes)
  values (s.id, v_count + 1, fieldobs.txt(p_photo, 'caption', 300),
          case when p_photo->>'taken_at' ~ '^\d{4}-\d{2}-\d{2}' then (p_photo->>'taken_at')::timestamptz end,
          v_lat, v_lon, fieldobs.num(p_photo, 'gps_accuracy_m'), fieldobs.txt(p_photo, 'camera', 120),
          fieldobs.num(p_photo, 'width')::int, fieldobs.num(p_photo, 'height')::int,
          v_img, v_th, octet_length(v_img));
  return jsonb_build_object('ok', true, 'count', v_count + 1);
exception
  when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or raise_exception then
    return jsonb_build_object('ok', false, 'error', 'bad_entry');
end $$;

-- Step 3: close the upload window; the entry is now waiting for faculty review.
create or replace function public.fw_finish(p_submission_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s fieldobs.submissions; v_count int;
begin
  select * into s from fieldobs.submissions where id = p_submission_id for update;
  if not found or s.upload_token_hash is null
     or s.upload_token_hash <> encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') then
    return jsonb_build_object('ok', false, 'error', 'bad_token');
  end if;
  update fieldobs.submissions
     set status = 'submitted', upload_token_hash = null, upload_token_expires = null, updated_at = now()
   where id = s.id;
  select count(*) into v_count from fieldobs.photos where submission_id = s.id;
  return jsonb_build_object('ok', true, 'receipt', s.receipt, 'photos', v_count);
end $$;

-- Faculty: everything else, gated by the instructor key.
create or replace function public.fw_instructor(p_key text, p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_status text; v_id uuid; v_n int;
begin
  if not fieldobs.secret_ok('instructor_key_hash', p_key) then
    perform pg_sleep(0.5);
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  p_payload := coalesce(p_payload, '{}'::jsonb);

  if p_action = 'summary' then
    return jsonb_build_object('ok', true,
      'open', fieldobs.setting('submissions_open') = 'true',
      'has_upload_code', exists (select 1 from fieldobs.settings where key = 'upload_code_hash'),
      'counts', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from fieldobs.submissions group by status) c), '{}'::jsonb),
      'photo_bytes_used', fieldobs.photos_used_bytes(),
      'photo_quota_bytes', fieldobs.setting('photo_quota_bytes')::bigint);

  elsif p_action = 'list' then
    v_status := nullif(p_payload->>'status', '');
    return jsonb_build_object('ok', true, 'submissions', coalesce((
      select jsonb_agg(fieldobs.submission_json(s, true)
               || jsonb_build_object('photo_count', (select count(*) from fieldobs.photos p where p.submission_id = s.id))
             order by s.created_at desc)
        from fieldobs.submissions s
       where v_status is null or s.status = v_status), '[]'::jsonb));

  elsif p_action = 'get' then
    v_id := (p_payload->>'id')::uuid;
    select fieldobs.submission_json(s, true) into r from fieldobs.submissions s where s.id = v_id;
    if r is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    return jsonb_build_object('ok', true, 'submission', r, 'photos', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'position', p.position, 'status', p.status, 'caption', p.caption,
               'taken_at', p.taken_at, 'latitude', p.latitude, 'longitude', p.longitude, 'gps_accuracy_m', p.gps_accuracy_m,
               'camera', p.camera, 'width', p.width, 'height', p.height, 'image_bytes', p.image_bytes,
               'thumb_b64', case when p.thumb is null then null else encode(p.thumb, 'base64') end) order by p.position)
        from fieldobs.photos p where p.submission_id = v_id), '[]'::jsonb));

  elsif p_action = 'photo' then
    select jsonb_build_object('ok', true, 'image_b64', encode(p.image, 'base64')) into r
      from fieldobs.photos p where p.id = (p_payload->>'id')::uuid and p.image is not null;
    return coalesce(r, jsonb_build_object('ok', false, 'error', 'not_found'));

  elsif p_action = 'review' then
    v_status := p_payload->>'status';
    if v_status not in ('submitted','changes_requested','approved','rejected','archived') then
      return jsonb_build_object('ok', false, 'error', 'bad_status');
    end if;
    update fieldobs.submissions
       set status = v_status, review_note = left(p_payload->>'note', 1000), reviewed_at = now(), updated_at = now()
     where id = (p_payload->>'id')::uuid;
    get diagnostics v_n = row_count;
    if v_n = 0 then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    update fieldobs.photos set status = case when v_status = 'approved' then 'approved' else 'pending' end
     where submission_id = (p_payload->>'id')::uuid and status <> 'removed';
    return jsonb_build_object('ok', true);

  elsif p_action = 'remove_photo' then
    -- privacy or quality removal: delete the image bytes, keep the record
    update fieldobs.photos set status = 'removed', image = null, thumb = null, image_bytes = 0
     where id = (p_payload->>'id')::uuid;
    get diagnostics v_n = row_count;
    return jsonb_build_object('ok', v_n = 1);

  elsif p_action = 'set_open' then
    insert into fieldobs.settings values ('submissions_open', case when (p_payload->>'open')::boolean then 'true' else 'false' end)
      on conflict (key) do update set value = excluded.value;
    return jsonb_build_object('ok', true);

  elsif p_action = 'set_upload_code' then
    if char_length(coalesce(p_payload->>'code', '')) < 6 then
      return jsonb_build_object('ok', false, 'error', 'code_too_short');
    end if;
    insert into fieldobs.settings values ('upload_code_hash', extensions.crypt(p_payload->>'code', extensions.gen_salt('bf', 6)))
      on conflict (key) do update set value = excluded.value;
    return jsonb_build_object('ok', true);

  elsif p_action = 'set_instructor_key' then
    if char_length(coalesce(p_payload->>'new_key', '')) < 12 then
      return jsonb_build_object('ok', false, 'error', 'key_too_short');
    end if;
    update fieldobs.settings set value = extensions.crypt(p_payload->>'new_key', extensions.gen_salt('bf', 8))
     where key = 'instructor_key_hash';
    return jsonb_build_object('ok', true);

  elsif p_action = 'export' then
    return jsonb_build_object('ok', true, 'submissions', coalesce((
      select jsonb_agg(fieldobs.submission_json(s, true) order by s.created_at) from fieldobs.submissions s), '[]'::jsonb));
  end if;

  return jsonb_build_object('ok', false, 'error', 'unknown_action');
exception
  when invalid_text_representation then
    return jsonb_build_object('ok', false, 'error', 'bad_entry');
end $$;

-- Public: approved observations only (names only with consent; no review notes).
create or replace function public.fw_public_observations()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('ok', true, 'observations', coalesce((
    select jsonb_agg(fieldobs.submission_json(s, false)
             || jsonb_build_object('photos', coalesce((
                  select jsonb_agg(jsonb_build_object('id', p.id, 'caption', p.caption, 'taken_at', p.taken_at,
                                                      'width', p.width, 'height', p.height) order by p.position)
                    from fieldobs.photos p where p.submission_id = s.id and p.status = 'approved' and p.image is not null), '[]'::jsonb))
           order by s.observed_at desc)
      from fieldobs.submissions s where s.status = 'approved'), '[]'::jsonb))
$$;

-- Public: one approved photo, as base64 ('thumb' or 'full').
create or replace function public.fw_public_photo(p_id uuid, p_size text default 'thumb')
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_build_object('ok', true, 'image_b64', encode(case when p_size = 'full' then p.image else p.thumb end, 'base64'))
      from fieldobs.photos p join fieldobs.submissions s on s.id = p.submission_id
     where p.id = p_id and p.status = 'approved' and s.status = 'approved' and p.image is not null),
    jsonb_build_object('ok', false, 'error', 'not_found'))
$$;

-- ---------------------------------------------------------------- grants
revoke all on function public.fw_status()                          from public;
revoke all on function public.fw_submit(text, jsonb)               from public;
revoke all on function public.fw_add_photo(uuid, text, jsonb)      from public;
revoke all on function public.fw_finish(uuid, text)                from public;
revoke all on function public.fw_instructor(text, text, jsonb)     from public;
revoke all on function public.fw_public_observations()             from public;
revoke all on function public.fw_public_photo(uuid, text)          from public;
grant execute on function public.fw_status()                       to anon, authenticated, service_role;
grant execute on function public.fw_submit(text, jsonb)            to anon, authenticated, service_role;
grant execute on function public.fw_add_photo(uuid, text, jsonb)   to anon, authenticated, service_role;
grant execute on function public.fw_finish(uuid, text)             to anon, authenticated, service_role;
grant execute on function public.fw_instructor(text, text, jsonb)  to anon, authenticated, service_role;
grant execute on function public.fw_public_observations()          to anon, authenticated, service_role;
grant execute on function public.fw_public_photo(uuid, text)       to anon, authenticated, service_role;

-- After applying, set the instructor key once (keep the plain key outside the repo):
--   insert into fieldobs.settings values ('instructor_key_hash', extensions.crypt('<key>', extensions.gen_salt('bf', 8)))
--   on conflict (key) do update set value = excluded.value;
-- Then open submissions and set the class upload code from the review page.
--
-- Rollback (removes everything this file created):
--   drop function if exists public.fw_status(), public.fw_submit(text, jsonb), public.fw_add_photo(uuid, text, jsonb),
--     public.fw_finish(uuid, text), public.fw_instructor(text, text, jsonb), public.fw_public_observations(),
--     public.fw_public_photo(uuid, text);
--   drop schema fieldobs cascade;
