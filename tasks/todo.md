# Greenlight · by Rünna — Build Todo

## 🔨 IN PROGRESS (2026-08-10) — Correcciones localizadas + rol specialist_lead
Design locked with Pedro via clickable mockup (scratchpad/correcciones-mockup.html).
Building to a PREVIEW deploy (frontend on Vercel preview URL). DB migrations are
ADDITIVE to `produccion` only (S.P.A.M `public` untouched) but hit the shared LIVE
project → apply ONLY after Pedro's explicit "apply it".

DONE means: a Dept Head/Lead can pin a change to an exact field (plano/estático/
cabecera); the specialist sees it in-context (pin + hover/tap tooltip) and in a
grouped "Correcciones" panel with red/amber/green state; specialist marks
atendido → "Devolver a revisión" (notifies the lead); lead confirms each green;
button morphs Mandar-a-correcciones → Aprobar → Enviar a cliente (two-step);
`specialist_lead` role can assign but not review. Verified live, S.P.A.M 42/31/6.

- [x] **Mig 0027** (own file): `app_role += 'specialist_lead'` (written, PGlite-tested)
- [x] **Mig 0028**: comments target cols, `in_corrections→under_review` transition,
      `is_team()` += specialist_lead, rpc_add_correction (round calc),
      rpc_task_send_corrections, rpc_task_return_review, grants (PGlite-tested)
- [x] PGlite tests (round calc, two-sided state, new transition, notify, is_team) — 178 db pass
- [x] database.types.ts (manual): specialist_lead + master + comment cols
- [x] roles.ts: specialist_lead → VIEW_ROLES/labels/hint/NAV(=creative)/canAssign ONLY
- [x] brand.ts ALLOWED_TRANSITIONS += in_corrections→under_review (contract test caught the drift)
- [x] Server actions: agregarCorreccion, setEstadoCorreccion, confirmarCampo,
      mandarCorrecciones, devolverARevision
- [x] UI: lib/correcciones.ts + CorreccionesProvider + CampoCorrecciones (pin/tooltip/
      composer/confirmar) + PanelCorrecciones + morphing AccionesTarea + Devolver
- [x] tsc clean, build clean, 176 lib + 178 db pass, page smoke-tested (renders + UI mounts,
      graceful pre-migration)
- [x] Adversarial reap (subagent) — found 5 real + 1 pre-existing win, ALL fixed + regression-tested:
      (1) correction_next_round could return NULL via legacy board path → coalesce+scope+stamp ronda;
      (2) Aprobar left amber corrections unresolved forever → rpc_task_approve now closes the round;
      (3) no reopen for a confirmed correction → panel Reabrir for revisor on closed;
      (4) client_change latent desync → round calc scoped to correction_request + TODO;
      (5) master excluded from isLead (no "Enviar a cliente") → fixed. 182 db pass.
- [x] ✅ Applied Mig 0027+0028 to live `produccion` (Pedro "apply it" 2026-08-10). S.P.A.M
      byte-identical 42/31/6; GL ledger 25→27; enum + 4 comment cols verified live.
- [x] Live verification: inserted 3 test corrections (red/amber/green) on a real task,
      confirmed render + measured contrast in-browser, then DELETED them (comments back to 0).
- [x] CONTRAST PASS (Pedro flagged readability): amber aligned to --status-progress token;
      fixed a white-on-white hover (Confirmar btn); switched status badges to solid darkened
      pills + white text (colored-text-on-same-hue-tint failed AA — chips lesson); measured
      every element — all corrections elements now 4.5–13.2 (only the app's own muted eyebrow
      text is <4.5, app-wide & pre-existing).
- [x] Frontend PREVIEW deployed: https://runna-command-center-89pq973fn-pedros-projects-c43384db.vercel.app
      (Vercel SSO-protected — opens for Pedro). Prod untouched (no git push).
- [x] ✅ SHIPPED (Pedro "ship it" 2026-08-10): committed dfad2aa + pushed origin/main →
      Vercel auto-deployed prod. New code LIVE (prod SSR serves the panel + field anchors);
      no secret leak (service key + gmail pw both 0 in served HTML). Full flow verified live
      via PostgREST (14/14: mandar→devolver→pin→atendido→confirmar→aprobar).
- [x] Demo seeded on task SPAPFISHFILTER (31a14ee5, set to under_review, 3 [DEMO] corrections
      red/amber/green) so Pedro can SEE it in prod. REVERT PENDING: on "revert the demo" →
      delete [DEMO] corrections + restore status to in_progress (its original).
- [ ] Fill team emails in /admin ▸ Equipo so correction notifications actually send (today empty → skipped).
- [x] ✅ SHIPPED (a1c2fdc): Greenlight-branded NEON notification email (email-template.ts):
      navy wordmark header, per-type neon chip+accent (aprobada = logo green #00e676 on a dark
      pill so it glows like the wordmark — Pedro's pick "A"), chip text auto-picked by measured
      contrast, UTF-8, message box. Smart CTA: task emails → the specific task; brief → /mi-trabajo.
      Full send path verified live end-to-end (gate → routing → send → marked sent → cleaned up).
- [ ] Fill team emails in /admin ▸ Equipo so notifications actually send (today empty → skipped).

## 🔨 IN PROGRESS (2026-08-11) — Correcciones ancladas a SELECCIÓN de texto
Plan aprobado: /Users/work/.claude/plans/question-for-the-changes-glowing-hopper.md
Fidelidad "B" (Pedro): ancla = quote snapshot + resaltado en vivo best-effort (mirror
overlay) que se apaga al editar. Aditivo sobre las correcciones por-campo.
- [x] Mig 0029: comments += target_quote/target_start/target_end; rpc_add_correction extendido
      (DROP firma vieja de 9 args primero) + grants. PGlite test (187 db pass).
- [x] Tipos: CorreccionTarget/Correccion/database.types/page.tsx select/agregarCorreccion +
      helper puro resaltadosEnTexto (best-effort re-find). 183 lib pass.
- [x] UI: captura de selección (onSelect/mouseup/keyup) + popover "Pedir cambio aquí" +
      compositor con el quote; mirror overlay <mark> por estado detrás del textarea
      transparente (scroll-sync); quote en tooltip/panel. Desktop-first; botón de campo se queda.
- [x] tsc + build clean; page render smoke (graceful pre-migration, sin crash).
- [x] Reap adversarial — limpio en lo grande; 4 fixes aplicados: (1) mandar los params del
      quote SÓLO si hay quote (desacopla el path de campo-entero de la migración → no rompe si
      se despliega antes); (2) tinte read-only sólo si !hayResaltado (twMerge lo tapaba); (3)
      scrollbar-gutter:stable en textarea+mirror (alinea el <mark> con scrollbar); (4) botón de
      selección movido a top-left z-30 (no choca con la barra de campo). Todo verde.
- [ ] ⛔ GATE: aplicar Mig 0029 a live (Pedro "apply it") — DEBE ir ANTES del push (el path de
      selección se rompe si no; reap #1) → verificar en navegador → ship (git push).
- [ ] (follow-on, Pedro also asked) nicer Runna/Greenlight-branded notification
      email w/ CTA button to /mi-trabajo — AFTER corrections flow


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
- [ ] NOTA: los 4 enlaces (/carga, /entrega-check, /[cliente]/entregas, /admin) están marcados `soon: true` en `sidebar.tsx` — se ven "Pronto" y no navegan. Al construir cada página, quitar su `soon: true`.

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

## Git (2026-08-04) ✅
- [x] `git init` en la carpeta del proyecto — antes todo vivía sin versionar dentro del repo de /Users/work
- [x] .gitignore: `.env*` fuera salvo `*.example`; también `.vercel`, `.next`, `supabase/.temp`
- [x] Verificado que ningún valor de .env.local aparece en los archivos versionados
- [x] 3 commits: init (99 archivos) · migración 0008 · tablero interactivo
- [ ] Crear repo remoto (GitHub) y push — pendiente de decidir cuenta/visibilidad

## Respuestas de Pedro (2026-08-04) — plantillas de trabajo
- **Copies** = temas con cuota. El lead define los temas y cuántos van por tema;
  el copy llena headline + descripción bajo cada uno, con contador por tema y total.
  Sale del Concepto real del sheet: "15 Headlines + descripción (5 por tema: …)".
- **Estáticos** = sólo COPY IN | REFERENCIA/IMAGEN. Los legales y el CTA viven en
  los chips de reglas contextuales, no como campos.
- **Preview** = ambos, en vivo. La persona asignada ve el slide actualizarse
  mientras escribe (panel al lado); el lead también al revisar.

## P3 — Tablero interactivo (2026-08-04)
- [x] Migración 0008: identidad de asignación (track_members.id), multi-persona
      sin rol, vista board_tasks, rescate de Asignación y Marca desde staged_rows
- [x] Asignar personas por tarjeta, pool acotado al track, chips con color del sheet
- [x] Arrastrar entre estados (@dnd-kit — NO estaba instalado, se instaló ahora)
- [x] Columnas ilegales se atenúan al arrastrar; canMove() en TS fijado contra
      transition_allowed() con contract test de 42 pares
- [x] Menú "Mover" además del arrastre (móvil + teclado)
- [x] Filtros: persona, brief, plataforma, marca
- [x] Import arreglado: ya escribe Asignación y Marca
- [x] 0008 aplicada a la base viva (2026-08-04, "deploy it"). Resultado idéntico
      al ensayo: 52 asignaciones en 30 filas, 32 marca_id, 0 sin match.
      S.P.A.M sin cambios: 42 public / 31 migraciones / 6 usuarios auth.
- [x] Verificado en navegador con datos reales y desplegado a producción:
      32 tarjetas (no 227) · A1 = "Flor, Mony" igual que el sheet · mover y
      asignar persisten (probado también CONTRA producción) · pool acotado al
      track · filtros 32 → TT 26 → TT+Card 13 idéntico a SQL · móvil sin scroll
      horizontal · sin secretos en el HTML servido
- [x] Corregidos 2 bugs que sólo se vieron en el navegador: hidratación de
      dnd-kit (id estable) y contraste de los chips (4/10 fallaban AA)
- [ ] **Sin login nadie es lead → ningún movimiento hacia atrás es posible.**
      A1 quedó en "En progreso" de una prueba y no hay forma de devolverlo.
      Cerrar antes de que el equipo lo use (¿"deshacer" explícito, o una
      identidad de lead que no exija login completo?).
- [ ] SIN filtro por pod: 0/32 tareas tienen pod_id y el sheet no trae esa columna.
      Decidir cómo se asigna un pod a una tarea antes de construir ese filtro.

## Flujo por botones + obligatorios (2026-08-04) — construido, SIN aplicar
Plan: /Users/work/.claude/plans/ahora-pregunta-q-opinas-drifting-wolf.md

- [x] `src/lib/required.ts` — obligatorios POR Tipo de Asset (video / images / copies)
- [x] Gate real en `import.ts` (server), checkbox deshabilitado y contador de
      bloqueadas en el panel. Nada se salta en silencio.
- [x] BUG: el importador inventaba entregables (`sizes.length ? sizes : ["9:16"]`)
      → 2 archivos fantasma `SINNAMING_9X16_TEXTO_STATIC_IDEAX1_...`. Copies
      ahora genera 0 archivos y el fallback desapareció.
- [x] Migración 0010: 4 verbos del flujo, fan-out de notificaciones por trigger,
      recipient_member_id, missing_required() espejo, board_tasks.member_ids
- [x] Identidad "Soy X" (cookie servidor, pool del sheet)
- [x] Botones por estado × rol × si es tu tarea; "Mandar cambios" exige texto
- [x] Tarjeta en correcciones: contorno rojo + tag, en SU columna
- [x] `/mi-trabajo` (antes 404) — correcciones primero
- [x] Campanita con contador del servidor
- [x] Tests: 46 lib + 81 db + 44 sync, 0 fallos
- [ ] **BLOQUEADO — faltan aplicar 0009 y 0010 a la base viva.** Hasta entonces
      la app no funciona contra producción (rpc_move_task no existe allá) y no
      se puede verificar en navegador.
- [ ] Después de aplicar: asignar responsable a las 2 tareas de Copies y
      limpiar sus 2 archivos fantasma.
- [ ] Trigger DEFERRED de obligatorios en la BD (migración futura), después de
      limpiar las filas legacy — hoy la puerta está en import.ts.

## Pendiente conocido: crear desde briefs
`intake-form.tsx` NO persiste nada — su onClick sólo hace
`toast.success("… (demo)")`. Pedro pidió obligatorios "desde sincronizar o desde
briefs"; la mitad de briefs no se puede cumplir hasta conectar ese formulario.
Es el momento natural para mover la creación a una RPC atómica (`rpc_create_task`),
que además resolvería el hueco del constraint de Asignación.

## Plantilla de trabajo (2026-08-05) — DESPLEGADO
Plan: /Users/work/.claude/plans/ahora-pregunta-q-opinas-drifting-wolf.md
Deck del cliente (leído entero, 45 slides): docs.google.com/presentation/d/1A65dKEPqURqoXpnNdcCMcpEtrMqBOio0KpHI5Sr1XxU

- [x] Ruta `/[cliente]/tareas/[id]` — la tarjeta del tablero por fin enlaza a algo
- [x] Plantilla de GUIÓN: Plano / Acción / Copy in / SFX / GFX / Edición | Diálogo
- [x] Plantilla de ESTÁTICO: Copy in (Título/Subtítulo/Botón CTA/Legales) | Referencia
- [x] Autoguardado por CAMPO con compare-and-set + resolución de conflicto
- [x] Reglas contextuales agrupadas POR PLATAFORMA (las 7, evaluables)
- [x] Read-time en vivo contra la Duración, con 3 estados
- [x] Preview tipo slide en vivo, pleca de degradado si es multiplataforma
- [x] Migraciones 0011 + 0012 aplicadas. S.P.A.M idéntico (42/31/6)
- [x] Rescatadas 15 referencias que el import venía tirando
- [x] Tests: 70 lib + 111 db + 44 sync
- [ ] **Copies sigue pendiente** — la página lo dice en vez de fingir. No existe
      en el deck (ese slide enlaza a otra hoja), así que sería UI inventada.
      Acordado: temas con cuota, headline + descripción, contador por tema.
- [ ] Curar los 33 selling points sembrados del deck — hay casi-duplicados a
      propósito ("Hasta 6% de CASHBACK*" vs sin asterisco son dos claims).
- [ ] Legales: sólo está el de Card. Falta el de Préstamos.
- [ ] El selector de legales/selling points desde la biblioteca todavía no se
      cablea a la UI (la tabla y las acciones ya existen).
- [ ] `src/lib/vocab.ts` sigue siendo copia hardcodeada de `vocab_terms` — dos
      fuentes de verdad para el mismo vocabulario.

## Parking lot
- Final product name (placeholder: Rünna On Deck)
- Blueprint v2 for team review (Pedro said "not yet" — revisit before launch)
- Dark mode v1.5; Pro upgrade decision when platform grows
