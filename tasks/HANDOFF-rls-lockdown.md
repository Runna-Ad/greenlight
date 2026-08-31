# HANDOFF — RLS Lockdown (the auth cutover before official go-live)

**Status:** ✅ **BUILT 2026-08-31 (on Opus). ⛔ NOT DEPLOYED — migration 0056 NOT applied.**
**Deploy gate:** needs Pedro's explicit "ship it". Apply 0056 (`npm run migrate`, pin
`ybbrpqzbedaxsmotgtkh`) and deploy the code TOGETHER — the middleware refactor must land
with (or before) the revoke, or the client tether breaks.

## What shipped in the build
- [x] Middleware tether → service-role (+ isolated in try/catch so a DB blip can't 500 every request)
- [x] Migration `0056_rls_lockdown` — written, isolation-checked, replayed in PGlite
- [x] `AUTH_ENABLED` hard-assert (prod-only via `VERCEL_ENV`, so preview/dev stay free)
- [x] `/auth/confirm` + `/auth/callback` active-profile checks — **found a REAL bug: the
      "Revocar" button never revoked anything** (`profiles.active` was written but never
      enforced). Now enforced at the identity chokepoint (`getCurrentUser`) + both auth doors.
- [x] Storage verified: `greenlight-referencias` + `greenlight-kb` PRIVATE, `greenlight-logos`
      public on purpose (brand assets, no PII). Nothing to change.
- [x] CI regression test ("Candado RLS 0056") asserts anon/authenticated hold NO privileges
      and every table has RLS — a future migration can't silently re-open the door.
- Gates: check:isolation 55 ✓ · test:db 326 ✓ · test:lib 427 ✓ · lint 0 errors · build ✓

## STILL TO DO after deploy (the proof step)
Run the anon-key REST test below against the deployed preview, THEN production.

---

## Why this exists
Build-then-lock (Pedro's standing preference). The app was built with RLS intentionally
permissive so testing stayed frictionless. This is the deliberate "turn the lock" step.

## The architecture that decides the approach (verified by code audit 2026-08-31)
- **100% of data reads/writes go through the SERVICE-ROLE client** (`src/lib/supabase-admin.ts`,
  schema `produccion`). Service-role BYPASSES RLS. The CODE is the authz boundary — and the
  pre-launch security reap verified that boundary is solid.
- The **anon key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, shipped in every browser) is used ONLY for
  AUTH: Google sign-in, logout, magic-link confirm, `getUser`. It runs ZERO data queries.
- **No Realtime** anywhere (no anon/authenticated SELECT needed for subscriptions).
- 44 tables in `produccion`; ~half still lack RLS; tables + RPCs carry `grant … to anon, authenticated`.

## The hole being closed
The public anon key + `grant to anon` + missing RLS = anyone with the app URL can hit the REST
API directly (`GET /rest/v1/ideas`, `POST /rest/v1/rpc/rpc_task_approve`) and read/write data,
BYPASSING every code gate. That is the only real exposure left.

## Approach: A — deny the public key (chosen over per-table RLS policies)
Because the app never uses anon/authenticated for data, the clean lock is to REMOVE that access,
keeping service_role. Rejected Approach B (author restrictive RLS policies on all 44 tables for
the `authenticated` role) — it re-implements the entire permission model a second time in SQL for
a path the app doesn't use → huge surface + two-sources-of-truth drift (the Pass-0 bug class).

---

## ⚠️ THE ONE GOTCHA (found in the safety audit — do this FIRST)
`src/lib/supabase/middleware.ts` lines ~72–85: the client-tether reads `produccion.profiles` and
`produccion.clients` on the **session (authenticated) client**. A naive revoke breaks client
confinement. FIX: refactor those two reads to `supabaseAdmin()` (service-role), keeping the session
client for `auth.getUser()` only — mirrors `auth/callback` + `identity.ts` exactly.
- Verify `supabase-admin.ts` works in the middleware runtime (supabase-js is fetch-based/Edge-safe;
  `SUPABASE_SERVICE_ROLE_KEY` is available to middleware on Vercel; never shipped to browser).
- Future optimization (NOT now): put `role`/`client_id` in a JWT custom claim (Supabase access-token
  hook) so the middleware needs no DB query at all.

---

## Build steps (in order)
1. **Middleware refactor** (the gotcha above). Gate: `next build` + reason through the tether logic.
2. **Migration `0056_rls_lockdown`** (`produccion`-ONLY, schema-qualified every line):
   - `REVOKE USAGE ON SCHEMA produccion FROM anon, authenticated;`  ← the single line that locks the door
   - `REVOKE ALL ON ALL TABLES IN SCHEMA produccion FROM anon, authenticated;` (covers views too)
   - `REVOKE ALL ON ALL SEQUENCES IN SCHEMA produccion FROM anon, authenticated;`
   - `REVOKE ALL ON ALL ROUTINES IN SCHEMA produccion FROM anon, authenticated;` (the RPCs)
   - `ALTER DEFAULT PRIVILEGES IN SCHEMA produccion REVOKE ALL ON TABLES/SEQUENCES/ROUTINES FROM anon, authenticated;` (future objects can't silently re-expose)
   - `ENABLE ROW LEVEL SECURITY` on every produccion table still lacking it (belt-and-suspenders; with schema usage revoked, RLS is the second lock).
   - Confirm `service_role` retains full access (it should; verify — the app depends on it).
   - Test in PGlite (`npm run migrate` path) BEFORE prod. Pin `ybbrpqzbedaxsmotgtkh`. Never `supabase db push`.
3. **`AUTH_ENABLED` hard-assert** (reap I2): fail the boot in production if `AUTH_ENABLED !== "true"`
   so the login wall can't be silently disabled by a misconfig.
4. **`/auth/confirm` active-profile re-check** (reap I4): after `verifyOtp`, confirm the session maps
   to an ACTIVE client profile before redirecting.
5. **Storage check** (separate `storage` schema): confirm the `greenlight-kb` bucket + reference
   images are NOT anon-readable/writable; uploads/reads go through service-role + signed URLs.

## Verification (prove the lock — do NOT skip)
- With the **public anon key** (from the browser bundle), hit `/rest/v1/<table>` (Accept-Profile:
  produccion) for ideas/briefs/clients/profiles AND `/rest/v1/rpc/rpc_task_approve` → must return
  PERMISSION DENIED / empty. This is the money test.
- Run the app end-to-end as EACH role (master/admin/lead/creative/client) → still works (service-role
  path untouched); the client tether still confines clients to their portal.
- Confirm auth flows still work (login/logout/magic-link) — they use /auth endpoints, not produccion.
- Re-confirm the project's "Exposed Schemas" setting is intact (shared-project gotcha —
  see brain: shared-supabase-project-api-exposure-is-mutable-state).

## ⚠️ Safety guardrails (NON-NEGOTIABLE)
- **S.P.A.M (`ybbrpqzbedaxsmotgtkh`) is a SHARED Supabase project.** Every statement scoped to
  `produccion` ONLY. NEVER `auth.users`, NEVER `storage` in the revoke migration (storage is its own
  step), NEVER other tools' schemas, NEVER a database-wide revoke.
- Migration is REVERSIBLE (re-grant) but revoking access is high-stakes → PREVIEW + verify + then prod.
- No prod deploy without Pedro's explicit "ship it" (global rule #1).

## Hot files
`src/lib/supabase/middleware.ts` (refactor) · `src/lib/supabase/middleware.ts` env assert (or a startup
module) · `src/app/auth/confirm/route.ts` (I4) · new `supabase/migrations/…_0056_rls_lockdown.sql`.
