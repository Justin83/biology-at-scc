#!/usr/bin/env node
// Local stand-in for the Supabase REST API, for testing the field-submission form
// without touching the real database.
//
// It starts an in-memory PostgreSQL (PGlite, with pgcrypto), applies
// research/freshwater/sql/001_field_submissions.sql exactly as written, and answers
// POST /rest/v1/rpc/<function> the way PostgREST does (JSON body = named arguments).
//
//   npm install --no-save @electric-sql/pglite@0.5.8   (once; not a site dependency)
//   node tools/freshwater-portal/local-api.mjs          (listens on http://127.0.0.1:8788)
//
// Environment: PORT (default 8788), FW_INSTRUCTOR_KEY (default "local-instructor-key"),
// FW_UPLOAD_CODE (if set, submissions are opened with this class code at start-up).
// Point the site at it by opening any portal page with ?api=http://127.0.0.1:8788

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = +(process.env.PORT || 8788);
const IKEY = process.env.FW_INSTRUCTOR_KEY || "local-instructor-key";

const db = await PGlite.create({ extensions: { pgcrypto } });
await db.exec(`
  create schema if not exists extensions;
  create extension if not exists pgcrypto schema extensions;
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;`);
await db.exec(fs.readFileSync(path.join(ROOT, "research/freshwater/sql/001_field_submissions.sql"), "utf8"));
await db.query(`insert into fieldobs.settings values ('instructor_key_hash', extensions.crypt($1, extensions.gen_salt('bf', 6)))
                on conflict (key) do update set value = excluded.value`, [IKEY]);
if (process.env.FW_UPLOAD_CODE) {
  await db.query(`insert into fieldobs.settings values ('upload_code_hash', extensions.crypt($1, extensions.gen_salt('bf', 6)))
                  on conflict (key) do update set value = excluded.value`, [process.env.FW_UPLOAD_CODE]);
  await db.query(`update fieldobs.settings set value = 'true' where key = 'submissions_open'`);
}

// argument names and types of every public.fw_* function
const sig = {};
for (const r of (await db.query(`
  select p.proname, p.proargnames, array(select format_type(t, null) from unnest(p.proargtypes) t) as types
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'fw\\_%'`)).rows) sig[r.proname] = r;

const send = (res, code, obj) => {
  res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization", "Access-Control-Allow-Methods": "POST, OPTIONS" });
  res.end(JSON.stringify(obj));
};

http.createServer((req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  const m = req.url.match(/^\/rest\/v1\/rpc\/(fw_[a-z_]+)$/);
  if (req.method !== "POST" || !m || !sig[m[1]]) return send(res, 404, { message: "not found" });
  let body = "";
  req.on("data", (c) => { body += c; if (body.length > 12e6) req.destroy(); });
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
}).listen(PORT, "127.0.0.1", () => console.log(`fieldobs local API on http://127.0.0.1:${PORT} (instructor key: ${IKEY})`));
