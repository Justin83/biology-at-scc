-- Math & Science Club: no "Competition" event type (those events become "Social"), and a
-- "Postponed" status.
--
-- Applied as migration "club_v4" after 003_club_signup_kinds.sql (Justin asked,
-- 2026-11-09).
--   * kind 'competition' is retired: the Spades Competition (and any other competition
--     event) becomes 'social', and officers can no longer pick Competition.
--   * status adds 'postponed' (new date to be announced): the event stays on the page with
--     a "Postponed" pill and its sign-up is closed, because club_signup only accepts
--     events whose status is 'scheduled'. No function changes are needed.

update club.events set kind = 'social', updated_at = now() where kind = 'competition';

alter table club.events drop constraint if exists events_kind_check;
alter table club.events add constraint events_kind_check
  check (kind in ('meeting', 'social', 'astronomy', 'campus-tour', 'conference', 'event', 'graduation'));

alter table club.events drop constraint if exists events_status_check;
alter table club.events add constraint events_status_check
  check (status in ('scheduled', 'postponed', 'cancelled'));
comment on column club.events.status is
  'scheduled; postponed (new date to be announced, sign-up closed); or cancelled (shown crossed out).';

-- Rollback: set postponed events back to 'scheduled' (or 'cancelled'), then re-add the two
-- checks as in 001_club.sql (kind including 'competition'; status in scheduled, cancelled).
-- Events moved from competition to social stay social unless changed in Officer tools.
