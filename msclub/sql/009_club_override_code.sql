-- Math & Science Club: an override code for Officer tools (migration club_v9).
--
-- Justin's call (2026-11-16): if a student changes the officer code, the adviser needs a way
-- back in without editing the database by hand each time. The override code works everywhere
-- the officer code does: unlocking Officer tools, every officer action, Site engagement, and
-- "Change the officer code" (so the adviser can set a new officer code from the page).
-- Officer tools can only ever change the officer code (club_admin 'set_code' writes
-- officer_code_hash), never the override, so officers can't lock the adviser out.
--
-- The override itself is NOT in this file or anywhere in the repository. Only its bcrypt hash
-- is stored, in club.settings under 'override_code_hash', set (or changed) in the Supabase
-- SQL Editor:
--   insert into club.settings (key, value)
--   values ('override_code_hash', extensions.crypt('<override code>', extensions.gen_salt('bf', 8)))
--   on conflict (key) do update set value = excluded.value;
-- Until that row exists, only the officer code works, exactly as before.
--
-- Rollback: delete from club.settings where key = 'override_code_hash';
-- (with the row gone, the function below behaves exactly like the original in 001).

create or replace function club.code_ok(p_code text)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(p_code, '') <> '' and exists (
    select 1 from club.settings s
    where s.key in ('officer_code_hash', 'override_code_hash')
      and s.value = extensions.crypt(p_code, s.value))
$$;

comment on table club.settings is
  'officer_code_hash = bcrypt hash of the officer code (officers can change it in Officer tools). override_code_hash = bcrypt hash of the adviser''s override code: works like the officer code, set only in SQL (009), never from Officer tools. Never plain text. signups_open = global switch. max_signups_per_event = spam limit.';
