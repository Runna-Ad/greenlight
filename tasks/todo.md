# Greenlight · by Rünna — Build Todo

Full plan: /Users/work/.claude/plans/flickering-plotting-brook.md (approved 2026-07-30)
Pipeline: lead intake → execution workspace (script editor) → lead review + Gary check → client portal (publish/approve) → delivery.
DB: S.P.A.M Supabase project `ybbrpqzbedaxsmotgtkh`, dedicated schema `produccion`. Migrations schema-scoped, tested locally first. NEVER touch `public` (live S.P.A.M).

## P0 — Scaffold ✅ DONE (2026-07-30)
- [x] Next 16.2 + TS + Tailwind v4 + shadcn/ui (radix base, lyra preset) at /Users/work/Projects/runna-command-center
- [x] @theme tokens in globals.css (Poppins/Inter/Geist Mono; status colors; pleca TT black/FB blue/GG green; type static light purple/normal dark purple/real DiDi orange; dark-ready)
- [x] Supabase client/server/proxy helpers scoped to `produccion` schema; middleware→proxy (Next 16 convention); dev-degrade when no env
- [x] Shell: deep-navy sidebar (dynamic client-section nav) + topbar; /clientes selector; /[cliente]/tablero placeholder (5-status colors verified); /login placeholder
- [x] Runna logos in public/brand; build clean; verified in browser (desktop + mobile)
- [ ] DESIGN.md file (tokens are in globals.css; formal DESIGN.md deferred to start of P1)
- [ ] Google OAuth wiring (needs Supabase env + auth.users verification) → P1
- [ ] Mobile nav toggle (Sheet) — sidebar hidden on mobile, no opener yet → P3
- [ ] .env.local not created (only .example) — needs real anon/service keys before any query

## P1 — Schema ✅ DONE (2026-07-30)
- [x] Migration 0001_init.sql: schema `produccion`, 9 enums, 25 tables (clients/marcas/briefs/waves/families/ideas/planos/assets/asset_versions/idea_assignments/snippets/references/vocab/size_platform_validity/comments/gary_reviews/status_events/activity/notifications+deliveries), indexes, per-table updated_at triggers, idea.code trigger, filename builder + trigger
- [x] 3 naming formulas (Real/Normal/Static) as build_filename(): NA-genero omission, static-no-duration, colon→x, version→filename, validated override, fixed RN
- [x] Migration 0002_rls_and_rpcs.sql: auth helpers (JWT-claim based), RLS on all 25 tables (team read + guarded write, client hard-scoped to published+own client), RPCs (rpc_generate_assets w/ validity matrix, rpc_submit_version, rpc_request_correction), status transition guard + status_events/activity logging, planos read-time trigger
- [x] Size↔platform validity as its own table (not vocab meta — sizes carry ':' which vocab CHECK forbids)
- [x] Roles: admin/lead/creative/delivery/client
- [x] seed.sql: 5 pods, 25 vocab, 17 validity combos, 3 snippets (anti-copy-paste), demo team + brief/family/idea/3 assets across statuses
- [x] TESTED: scripts/test-db.mjs via PGlite (no Docker) — 29 assertions pass (naming contract, RPCs, transitions, RLS enforcement). `npm run test:db`
- [x] src/lib/database.types.ts (hand-maintained until real gen)
- [ ] NOT DONE (needs live DB / Pedro): push migrations to remote (gated by "ship it"); verify S.P.A.M auth.users; real `supabase gen types`; seed real auth.users for team; delivery lock UI + notification enqueue (deferred to P4/P5 where those flows live)

## P2 — Lead intake ✅ DONE (2026-07-30)
- [x] 4-step intake wizard (src/components/intake/intake-wizard.tsx): Brief → Familia → Variante → Entregables, with stepper + draft state
- [x] Peloteo paste-parser (src/lib/peloteo.ts + peloteo-paste.tsx): live split into 7 fields, accent-insensitive headers, keeps inner ':'; raw always preserved. HERO moment verified in browser (7/7 detected)
- [x] Asset generator matrix (src/components/intake/asset-matrix.tsx): size×platform grid constrained by validity matrix (invalid combos blocked w/ Ban icon), respects idea's chosen platforms, live filename list. Verified: 3 correct filenames generated
- [x] TS filename builder (src/lib/filename.ts) — CONTRACT-tested vs DB build_filename across 75 combos (0 mismatch) + 16 lib assertions. `npm run test:lib`
- [x] Snippet picker (checkboxes from mock), briefs list page
- [x] Verified full flow in browser (desktop): all 4 steps, both hero moments, success toast, no console errors
- [ ] STUBBED until Supabase: persistence (Crear→toast, will call rpc_generate_assets); reference picker (URL dedupe) deferred to when references table is live; real vocab/marca options (currently MOCK_VOCAB)
- [ ] NOTE: form_input (browser tool) doesn't fire React onChange — use click+type for controlled inputs (logged)

## P3 — Kanban + execution workspace (3d)
- [ ] Kanban 5 states, filters, Realtime, grouped-by-idea cards
- [ ] Script editor: Plano blocks (Acción/Copy/GFX-SFX | Diálogo), hooks, SFX/GFX/EDICIÓN fields
- [ ] Live read-time per plano + total; contextual guideline chips + disappearing placeholders
- [ ] Auto-rendered slide-style preview (pleca view)

## P4 — Review loop (2d)
- [ ] Pre-submit checklist; Gary grammar check (Claude API es-MX, flags, override+log)
- [ ] Lead approve/corrections; V bump; threaded comments/@mentions; Storage uploads

## P5 — Notifications (1d)
- [ ] Outbox + dispatcher (Resend + Slack), cron reminders, client-action notifications

## P6 — Delivery + ops (1.5d)
- [ ] Auto ENTREGA FINAL on upload; delivery verification queue (/entrega-check)
- [ ] /entregas calendar; /carga workload; /admin (clientes/equipo/vocab/snippets)

## P7 — Client portal (2d)
- [ ] Magic-link auth (client role); published-only idea cards; Revisión/Cambios/Aprobado; threaded change requests; per-wave view

## P7.5 — Polish (0.5d)
- [ ] emil-design-eng motion pass; empty states; skeletons

## P8 — Gates + ship (1d)
- [ ] web-design-guidelines audit; huashu 5-dim ≥8/10; pre-delivery checklist; Playwright screenshots; code-reaper 5-pass
- [ ] Verification per plan: contract tests (filenames), RLS tests, RPC tests, 3 Playwright golden paths

## P2 revisions (2026-07-30, Pedro feedback)
- [x] Peloteo: replaced auto-detect parser with DEFINED labeled fields; Peloteo now = free Notas field (PEDRO_OVERRIDE logged)
- [x] Added missing sheet fields: Marca, Brief Name, Drive link, Concepto, Comunicacion, Selling points, Referencias, Duracion, Origen, Comentarios por rol
- [x] Clarified "letra de familia" with inline explainer + auto code
- [x] Tablero responsive: stacks vertically below lg
- [x] Removed dead parser code + tests
- [x] Deployed public prototype to Vercel for team testing
- [ ] Reference picker (URL dedupe) deferred until references table is live

## P2 rebuild — sheet fidelity (2026-07-30, round 2)
- [x] OFFICIAL NAME: Greenlight · by Rünna (renamed across app)
- [x] Extracted REAL dropdown lists from the xlsx data-validation rules (openpyxl) — no guessing
- [x] Real vs Normal track switch as the FIRST choice; drives Asignación / Tipo de Asset / Formato pools
- [x] All 21 sheet columns present with VERBATIM names
- [x] Asignación multi-select w/ sheet colors (Real: 10 people, Normal: 4)
- [x] New vocab discovered: EC platform, "2736 x 1260" size, AIGC video, GIF
- [x] Migration 0003: track_scope vocab, track_members, sheet-accurate vocab, norm_token fix, empty-token guard
- [x] Fixed: Género "N/A" now omitted correctly; hyphenated durations survive; no double underscores
- [x] Fixed: multi-select stale-closure bug (functional updaters)
- [x] Tests: 15 lib + 31 db (incl. 75-combo TS↔DB contract) all green; deployed

## P2 round 3 — answered by Pedro (2026-07-30)
- [x] EC + "2736 x 1260" = special cases, kept OPEN (no size↔platform restriction); rules only enforced for GG/FB/TT
- [x] Two Tipo de Asset validations CONFIRMED in file (rows 2-6 vs 7-22) — Sheets only shows the rule for the clicked cell. Using the full superset.
- [x] "Otro" free-text option added to ALL 8 dropdowns (custom chips, removable, flow into filenames)
- [x] Comentarios Leads stays as 3 fields (Creativo/Producción/Diseño) — confirmed
- [ ] UNVERIFIED: Enter-to-commit on the Otro input (browser tool can't dispatch key events). "Agregar" button IS verified. Test Enter manually in a real browser.

## Sheets sync (2026-07-30)
- [x] Parser + header guard (Google silently serves tab 1 on a bad name — blocked)
- [x] Semantic dedup (natural key + content hash); verified 0 dupes on re-sync
- [x] PROJECT = one tab (track + date). Migration 0005: briefs.track/source_tab/brief_date
- [x] Tab classification: project | template | control | unrecognized (shown, not skipped)
- [x] Apps Script connector (scripts/apps-script/Code.gs), secret via Script Properties
- [x] Project-based sync UI, newest first, verified live: 21 REAL + 11 NORMAL
- [x] Tests: scripts/test-sync.mjs — 40 assertions incl. live fetch
- [ ] PEDRO TO DO: deploy Code.gs on the sheet, set GREENLIGHT_SECRET, give me URL+secret
- [ ] Then: set SHEETS_SCRIPT_URL / SHEETS_SCRIPT_SECRET env, sync lists ALL projects
- [ ] Wire "Crear" to rpc_stage_row + idea creation (needs Supabase env)

## Deploy + security (2026-07-30)
- [x] Vercel prod env: SHEETS_SCRIPT_URL / SHEETS_SCRIPT_SECRET (encrypted, server-only)
- [x] Deployed sync + redesigned editable review cards to prod
- [x] FIXED prod secret leak (config passed as client-component prop → RSC payload)
- [x] Added `npm run check:leak [url]` regression guard; run after every env-touching deploy
- [ ] ROTATE SHEETS_SCRIPT_SECRET — it was publicly readable for ~4 min (Propiedades del script → update → tell me new value)
- [ ] Decide: app is PUBLIC (no auth). Add shared-password gate before wider sharing?

## Supabase LIVE (2026-07-31)
- [x] Migrations pushed to S.P.A.M project, schema `produccion` (29 tables) — S.P.A.M public/auth/history byte-identical before & after
- [x] scripts/migrate.mjs — own ledger `produccion._migrations` (db push unusable in a shared project)
- [x] scripts/check-isolation.mjs — fails build on cross-schema DDL or colliding versions; verified it catches all 4 violation types
- [x] Migration 0006: schema exposed via Management API + GRANTs to API roles
- [x] Seeded: 5 pods, DiDi + marcas, 37 vocab, 14 people, admin profile (bound to Pedro's existing auth account)
- [x] Sync "Crear" writes for real → 2 briefs, 9 familias, 32 ideas, 227 entregables from Brief 24/07
- [x] Dedup PROVEN across sessions: re-sync → "0 nuevas · 32 sin cambios · Todo al día"
- [x] Tablero reads live data — CORREGIDO: 32 tareas (una por fila), no 227; archivos como conteo dentro de la tarjeta (migración 0007)
- [ ] Assignment + drag-to-change-status (next)
- [ ] Client portal + "ver como cliente" for admin
- [ ] Auth stays OFF until pre-launch (Pedro's call; AUTH_ENABLED flag ready)

## Parking lot
- Final product name (placeholder: Rünna On Deck)
- Blueprint v2 for team review (Pedro said "not yet" — revisit before launch)
- Dark mode v1.5; Pro upgrade decision when platform grows
