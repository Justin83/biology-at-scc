-- Math & Science Club: event info pages.
--
-- Applied as migration "club_v6" after 005_club_food_no_categories.sql (Justin asked,
-- 2026-11-09: the sign-up button on an event's card should go to a small info page about
-- the event, with the same sign-up button at the top that opens the form).
--   * events.page names the event's info page in the site (msclub/events/<page>/), or is
--     null. When it is set, the card's sign-up button goes to that page instead of opening
--     the sign-up pop-up, and the page finds its event by this name, so it keeps working
--     if officers change the event's title or date.
--   * club_events (via event_json) returns it.
--   * STEAM Day Somerset 2027 gets the page "steam-day-2027". Volunteers work 8:00 a.m. to
--     about 2:00 p.m., so its end time changes from 4:30 PM to 2:00 PM (Justin, 2026-11-09).
--   * Officers' edits don't touch the page (club_admin save_event lists its columns).

alter table club.events add column if not exists page text;
alter table club.events drop constraint if exists events_page_check;
alter table club.events add constraint events_page_check
  check (page is null or (char_length(page) <= 60 and page ~ '^[a-z0-9]+(-[a-z0-9]+)*$'));
create unique index if not exists events_page_key on club.events (page) where page is not null;
comment on column club.events.page is
  'Name of the event''s info page in the site (msclub/events/<page>/), or null for none.';

create or replace function club.event_json(e club.events, p_with_signups boolean)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', e.id, 'starts_on', e.starts_on, 'ends_on', e.ends_on,
    'start_time', to_char(e.start_time, 'HH24:MI'), 'end_time', to_char(e.end_time, 'HH24:MI'),
    'title', e.title, 'theme', e.theme, 'kind', e.kind, 'location', e.location, 'details', e.details,
    'tentative', e.tentative, 'status', e.status, 'page', e.page,
    'signup_enabled', e.signup_enabled, 'signup_kind', e.signup_kind, 'signup_note', e.signup_note, 'slots', e.slots)
  || case when p_with_signups and e.signup_enabled then jsonb_build_object('signups', coalesce((
       select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'slot', s.slot, 'item', s.item,
                                           'note', s.note, 'created_at', s.created_at) order by s.created_at)
         from club.signups s where s.event_id = e.id), '[]'::jsonb)) else '{}'::jsonb end
$$;

update club.events set page = 'steam-day-2027', end_time = '14:00', updated_at = now()
 where starts_on = '2027-03-05' and title ilike 'STEAM Day%' and page is null;

-- Rollback: re-run the event_json definition from 003_club_signup_kinds.sql, then
--   drop index club.events_page_key; alter table club.events drop column page;
-- and set STEAM Day's end time in Officer tools.
