-- Math & Science Club: site engagement counts all traffic, officers included (migration "club_v8").
--
-- Justin's call (2026-11-10): the numbers are overall traffic. So:
--   * visits from browsers that open Officer tools are no longer left out, and Officer tools
--     itself counts as a page ("officers"; msclub/assets/club.js);
--   * club.officer_devices is no longer needed and is dropped;
--   * club_stats keeps its signature so pages still running the old script keep working;
--     p_visitor is now ignored.
-- One-time cleanup: the single visit made by the go-live check's test browser (2026-11-10,
-- docs/msclub/README.md go-live record, item 10) is removed, so the count is real traffic only.
-- What is stored is unchanged: sha256 of a random per-browser ID, the day, the page and a view
-- count; no cookies, IP addresses or names.

create or replace function public.club_stats(p_code text, p_visitor text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d date := club.today(); r jsonb;
begin
  if not club.code_ok(p_code) then
    perform pg_sleep(0.5);
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  with per as (
    select visitor_hash, count(distinct day) as days from club.visits group by visitor_hash
  )
  select jsonb_build_object('ok', true, 'today', d,
    'since', (select min(day) from club.visits),
    'visitors', (select count(*) from per),
    'returning', (select count(*) from per where days >= 2),
    'visitors_today', (select count(distinct visitor_hash) from club.visits where day = d),
    'visitors_7d', (select count(distinct visitor_hash) from club.visits where day > d - 7),
    'visitors_30d', (select count(distinct visitor_hash) from club.visits where day > d - 30),
    'views', (select coalesce(sum(views), 0) from club.visits),
    'daily', (select jsonb_agg(jsonb_build_object('day', g.day,
                       'visitors', (select count(distinct v.visitor_hash) from club.visits v where v.day = g.day)) order by g.day)
                from (select d - i as day from generate_series(0, 29) as i) g),
    'pages', (select coalesce(jsonb_agg(jsonb_build_object('page', p.page, 'visitors', p.n, 'views', p.views)
                                        order by p.n desc, p.page), '[]'::jsonb)
                from (select page, count(distinct visitor_hash) as n, sum(views) as views from club.visits group by page) p),
    'signups', (select count(*) from club.signups),
    'signup_people', (select count(distinct btrim(regexp_replace(regexp_replace(lower(s.name), '[^[:alnum:][:space:]]', '', 'g'), '\s+', ' ', 'g')))
                        from club.signups s))
    into r;
  return r;
end $$;

revoke all on function public.club_stats(text, text) from public;
grant execute on function public.club_stats(text, text) to anon, authenticated, service_role;

drop table if exists club.officer_devices;

delete from club.visits where visitor_hash = club.visitor_hash('8c5eeaa9-e681-4843-857f-5221b659db28');

-- Rollback: re-run the club.officer_devices table and the club_stats definition from
-- 007_club_visits.sql (officer devices would then be left out again, from their next
-- Officer tools visit on).
