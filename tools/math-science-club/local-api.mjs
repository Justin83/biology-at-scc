#!/usr/bin/env node
// Local stand-in for the Supabase REST API, for testing the Math & Science Club
// pages without touching the real database.
//
// It starts an in-memory PostgreSQL (PGlite, with pgcrypto), applies
// every math-science-club/sql/NNN_*.sql file in order, exactly as written, and answers
// POST /rest/v1/rpc/club_<function> the way PostgREST does (JSON body = named arguments).
//
//   npm install --no-save @electric-sql/pglite@0.5.8   (once; not a site dependency)
//   node tools/math-science-club/local-api.mjs          (listens on http://127.0.0.1:8789)
//
// Environment: PORT (default 8789), CLUB_OFFICER_CODE (default "local-officer-code"),
// CLUB_TODAY (optional YYYY-MM-DD: pretend "today" is this date, e.g. 2026-11-05, so the
// seeded Fall 2026 schedule stays testable later).
// Point the pages at it by opening any club page with ?api=http://127.0.0.1:8789

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = +(process.env.PORT || 8789);
const CODE = process.env.CLUB_OFFICER_CODE || "local-officer-code";

const db = await PGlite.create({ extensions: { pgcrypto } });
await db.exec(`
  create schema if not exists extensions;
  create extension if not exists pgcrypto schema extensions;
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;`);
const SQL = path.join(ROOT, "math-science-club/sql");
for (const f of fs.readdirSync(SQL).filter((x) => /^\d+_.*\.sql$/.test(x)).sort()) await db.exec(fs.readFileSync(path.join(SQL, f), "utf8"));
await db.query(`insert into club.settings values ('officer_code_hash', extensions.crypt($1, extensions.gen_salt('bf', 6)))
                on conflict (key) do update set value = excluded.value`, [CODE]);
if (process.env.CLUB_TODAY) {
  if (!/^\d{4}-\d\d-\d\d$/.test(process.env.CLUB_TODAY)) throw new Error("CLUB_TODAY must be YYYY-MM-DD");
  // test-only override of the helper; the migration itself is unchanged
  await db.exec(`create or replace function club.today() returns date language sql stable set search_path = '' as $$ select '${process.env.CLUB_TODAY}'::date $$;`);
}

const sig = {};
for (const r of (await db.query(`
  select p.proname, p.proargnames, array(select format_type(t, null) from unnest(p.proargtypes) t) as types
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'club\\_%'`)).rows) sig[r.proname] = r;

const send = (res, code, obj) => {
  res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization", "Access-Control-Allow-Methods": "POST, OPTIONS" });
  res.end(JSON.stringify(obj));
};

http.createServer((req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  const m = req.url.match(/^\/rest\/v1\/rpc\/(club_[a-z_]+)$/);
  if (req.method !== "POST" || !m || !sig[m[1]]) return send(res, 404, { message: "not found" });
  let body = "";
  req.on("data", (c) => { body += c; if (body.length > 1e6) req.destroy(); });
  req.on("end", async () => {
    try {
      const args = body ? JSON.parse(body) : {};
      const s = sig[m[1]], names = s.proargnames || [], parts = [], params = [];
      names.forEach((n, i) => {
        if (!(n in args)) return;
        const v = args[n];
        params.push(v !== null && typeof v === "object" ? JSON.stringify(v) : v);
        parts.push(`${n} => $${params.length}::${s.types[i]}`);
      });
      const r = await db.query(`select public.${m[1]}(${parts.join(", ")}) as out`, params);
      send(res, 200, r.rows[0].out);
    } catch (e) {
      send(res, 400, { message: String(e.message || e) });
    }
  });
}).listen(PORT, "127.0.0.1", () => console.log(`club local API on http://127.0.0.1:${PORT} (officer code: ${CODE}${process.env.CLUB_TODAY ? ", today = " + process.env.CLUB_TODAY : ""})`));
