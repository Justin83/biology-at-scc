-- Math & Science Club: anonymous site-engagement counts for Officer tools (migration "club_v7").
--
-- Why: the site's job is to keep the MSSE cohort engaged and the club coordinated, so the
-- officers get a visible measure of use ("N people have visited the club website") that
-- can be tracked over the semesters.
--
-- What is stored, and what isn't:
--   * Each browser that opens a public club page (home, sign-up, event pages; not Officer
--     tools or the QR poster) keeps a random ID in localStorage ("club-visitor") and sends
--     it with the page name. Only the sha256 of that ID is stored, with the day (Somerset
--     time) and a view count for that day.
--   * No IP address, user agent, cookie, name or location is stored. A "visitor" is a phone
--     or computer (a browser), not a verified person: the same student on a phone and a
--     laptop counts twice, and private browsing or clearing the browser counts again.
--   * A device that opens Officer tools is remembered (its hashed ID only) and left out of
--     every count, so officers checking the site don't inflate it.
-- Access follows the rest of the club schema: private tables, RLS on with no policies, no
-- grants; the browser reaches them only through the two SECURITY DEFINER functions below.

create table if not exists club.visits (
  visitor_hash text not null check (visitor_hash ~ '^[0-9a-f]{64}$'),
  day          date not null,
  page         text not null check (char_length(page) <= 60 and page ~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)?$'),
  views        int  not null default 1 check (views between 1 and 500),
  primary key (visitor_hash, day, page)
);
create index if not exists visits_day_idx on club.visits (day);
comment on table club.visits is
  'One row per browser, day and page: sha256 of a random per-browser ID (never the ID itself), the day and how many views. No IP, user agent, cookie or name.';

create table if not exists club.officer_devices (
  visitor_hash text primary key check (visitor_hash ~ '^[0-9a-f]{64}$'),
  first_seen   timestamptz not null default now()
);
comment on table club.officer_devices is
  'Hashed IDs of browsers that opened Officer tools; their visits are left out of the counts.';

alter table club.visits          enable row level security;
alter table club.officer_devices enable row level security;
revoke all on club.visits, club.officer_devices from public, anon, authenticated;

-- sha256 of a browser's random ID (a UUID, or 32 hex digits), or null if it isn't one.
create or replace function club.visitor_hash(p_visitor text)
returns text language sql immutable set search_path = '' as $$
  select case when lower(coalesce(p_visitor, '')) ~ '^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$'
              then encode(extensions.digest(lower(p_visitor), 'sha256'), 'hex') end
$$;
revoke all on function club.visitor_hash(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- public: count a page view
-- Called once per page load by msclub/assets/club.js. Never blocks or breaks a page: bad
-- input gets bad_value, and past a ceiling of new rows per day the view simply isn't
-- counted, so a script can't fill the table.
create or replace function public.club_visit(p_visitor text, p_page text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare h text := club.visitor_hash(p_visitor); d date := club.today();
begin
  if h is null or char_length(coalesce(p_page, '')) > 60
     or coalesce(p_page, '') !~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)?$' then
    return jsonb_build_object('ok', false, 'error', 'bad_value');
  end if;
  if not exists (select 1 from club.visits where visitor_hash = h and day = d and page = p_page)
     and (select count(*) from club.visits where day = d) >= 3000 then
    return jsonb_build_object('ok', true, 'counted', false);
  end if;
  insert into club.visits (visitor_hash, day, page) values (h, d, p_page)
  on conflict (visitor_hash, day, page) do update set views = least(club.visits.views + 1, 500);
  return jsonb_build_object('ok', true, 'counted', true);
end $$;

-- ---------------------------------------------------------------- officers: the numbers
-- Needs the officer code. p_visitor is the officer's own browser ID: it is remembered as an
-- officer device and left out of the counts. Returns totals only, never a visitor ID or hash.
create or replace function public.club_stats(p_code text, p_visitor text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare h text := club.visitor_hash(p_visitor); d date := club.today(); r jsonb;
begin
  if not club.code_ok(p_code) then
    perform pg_sleep(0.5);
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  if h is not null then
    insert into club.officer_devices (visitor_hash) values (h) on conflict (visitor_hash) do nothing;
  end if;
  with v as (
    select x.* from club.visits x
     where not exists (select 1 from club.officer_devices o where o.visitor_hash = x.visitor_hash)
  ), per as (
    select visitor_hash, count(distinct day) as days from v group by visitor_hash
  )
  select jsonb_build_object('ok', true, 'today', d,
    'since', (select min(day) from club.visits),
    'visitors', (select count(*) from per),
    'returning', (select count(*) from per where days >= 2),
    'visitors_today', (select count(distinct visitor_hash) from v where day = d),
    'visitors_7d', (select count(distinct visitor_hash) from v where day > d - 7),
    'visitors_30d', (select count(distinct visitor_hash) from v where day > d - 30),
    'views', (select coalesce(sum(views), 0) from v),
    'daily', (select jsonb_agg(jsonb_build_object('day', g.day,
                       'visitors', (select count(distinct visitor_hash) from v where v.day = g.day)) order by g.day)
                from (select d - i as day from generate_series(0, 29) as i) g),
    'pages', (select coalesce(jsonb_agg(jsonb_build_object('page', p.page, 'visitors', p.n, 'views', p.views)
                                        order by p.n desc, p.page), '[]'::jsonb)
                from (select page, count(distinct visitor_hash) as n, sum(views) as views from v group by page) p),
    'signups', (select count(*) from club.signups),
    'signup_people', (select count(distinct btrim(regexp_replace(regexp_replace(lower(s.name), '[^[:alnum:][:space:]]', '', 'g'), '\s+', ' ', 'g')))
                        from club.signups s),
    'officer_devices', (select count(*) from club.officer_devices))
    into r;
  return r;
end $$;

revoke all on function public.club_visit(text, text) from public;
revoke all on function public.club_stats(text, text) from public;
grant execute on function public.club_visit(text, text) to anon, authenticated, service_role;
grant execute on function public.club_stats(text, text) to anon, authenticated, service_role;

-- Rollback (removes the counts; nothing else in the club schema depends on them):
--   drop function if exists public.club_visit(text, text), public.club_stats(text, text), club.visitor_hash(text);
--   drop table if exists club.visits, club.officer_devices;
