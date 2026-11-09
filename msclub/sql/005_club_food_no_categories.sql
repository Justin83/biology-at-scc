-- Math & Science Club: no categories for food sign-ups.
--
-- Applied as migration "club_v5" after 004_club_social_postponed.sql (Justin asked,
-- 2026-11-09: "no categories on the form or the list").
--   * Food sign-ups have no category (Main dish, Side, ...): people give their name, what
--     they're bringing and an optional note. club_signup ignores any category sent for a
--     food event and stores 'Food or drink'; club_signup_update leaves it as it is.
--   * The category lists on food events are cleared. Existing sign-ups keep their old
--     category value (e.g. 'Side'); the pages no longer show it.
--   * Work (volunteer) and going (trip) sign-ups are unchanged: they still use their lists
--     (Volunteers, shifts, Going) and close a list when it's full.

update club.events set slots = '[]'::jsonb, updated_at = now()
 where signup_kind = 'food' and slots <> '[]'::jsonb;

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

create or replace function public.club_signup_update(p_id uuid, p_token text, p_entry jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s club.signups; e club.events; v_name text; v_slot text; v_item text;
begin
  select * into s from club.signups where id = p_id;
  if not found or s.token_hash <> encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') then
    return jsonb_build_object('ok', false, 'error', 'not_yours');
  end if;
  select * into e from club.events where id = s.event_id for update; -- same lock as club_signup
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

revoke all on function public.club_signup(uuid, jsonb) from public;
revoke all on function public.club_signup_update(uuid, text, jsonb) from public;
grant execute on function public.club_signup(uuid, jsonb) to anon, authenticated, service_role;
grant execute on function public.club_signup_update(uuid, text, jsonb) to anon, authenticated, service_role;

-- Rollback: re-run the club_signup and club_signup_update definitions from
-- 003_club_signup_kinds.sql, then give food events categories again in Officer tools.
