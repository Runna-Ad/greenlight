# Greenlight → Go-Live Build (login, blank-slate reset, client onboarding, settings CRUD)

You are working on **Greenlight / Rünna Command Center** at `/Users/work/Projects/runna-command-center`.
This is the **launch-gate build**: turning on login is the last thing before go-live, so treat it as high-stakes auth + data work. Use the project's **beast-mode-dev** workflow (plan → build → 5-pass reap → verify → learn) and log lessons to `tasks/lessons.md`.

Run this as ONE focused session, but **fan out parallel sub-agents** for the independent pieces (see "How to parallelize"). This whole spec has already been scoped against the codebase — the facts below are verified; confirm anything you're unsure of by reading the cited files, don't re-discover from scratch.

---

## PROJECT FACTS (verified — trust these, verify before contradicting)

- **Framework:** Next.js 16.2.12, App Router, React 19. ⚠️ Next 16 quirk: middleware lives in **`src/proxy.ts`**, not `middleware.ts`. Tailwind v4 (oklch), shadcn/ui, sonner, next-themes. Spanish UI throughout.
- **Hosting:** Vercel, **git push to `main` auto-deploys to PRODUCTION** (public repo `Runna-Ad/runna-command-center`). ⛔ **DO NOT push/deploy without Pedro's explicit "ship it" / "deploy it" in-session.**
- **Database:** Supabase project **S.P.A.M**, ref `ybbrpqzbedaxsmotgtkh`. Greenlight lives ONLY in schema **`produccion`**. S.P.A.M's own tables are in `public` (42 tables) — **NEVER touch `public.` or `storage.`**; `npm run check:isolation` fails any migration that does.
- **Migrations:** custom ledger, NOT the Supabase CLI. Add numbered files in `supabase/migrations/` (current max ~0039), apply with **`npm run migrate`** (`scripts/migrate.mjs`), test first on PGlite via **`npm run test:db`** (`scripts/test-db.mjs`). ⛔ **NEVER `supabase db push`** (would corrupt S.P.A.M's history).
- **Auth today = fully OFF by design.** Gated behind `AUTH_ENABLED === "true"` + Supabase env keys in `src/lib/supabase/middleware.ts` (called from `src/proxy.ts`). `src/app/login/page.tsx` is a disabled placeholder. **No `/auth/callback` route and no `/portal/login` page exist yet.** Identity today is faked by two cookies: `gl_soy` (`src/lib/soy.ts`, "who am I") and `gl_view_as` (`src/lib/view-as.ts`, default role = `admin`). These are throwaway shims.
- **RLS:** defined + ENABLED on all tables (`supabase/migrations/0002_rls_and_rpcs.sql`) with real policies keyed on `produccion.current_profile_id()` — but currently **bypassed** because every server call uses the **service-role client** `src/lib/supabase-admin.ts` (`supabaseAdmin()`). When login turns on, user reads must move to an anon/user client or RLS does nothing.
- **Roles (already built):** DB enum `produccion.app_role` = `master | admin | lead | specialist_lead(dead, unused) | creative | delivery | client`. App layer in `src/lib/roles.ts` (`ViewRole`, single source for nav + permissions). Labels: **`creative` → "Especialista"**, **`client` → "Partner"**, **`lead` → "Dept Head / Lead"**, `master` → "Master Builder". Gate `canAssignAdmins` is **master-only** (an admin cannot create/promote another admin) — keep this.
- **Two "person" tables (critical):**
  - `produccion.track_members` = the real team today (14 people, the pre-login source of truth). Columns incl. `id, name, track, color, sort_order, active, es_lead, role (default 'creative'), email, slack_user_id, notify_email, notify_slack`. This is what the Equipo tab and `gl_soy` read.
  - `produccion.profiles` = the auth mirror (`profiles.id = auth.users.id`), dormant, ~1 row. Becomes the identity table at login; bridged to track_members via a planned `track_members.profile_id`. ⛔ **NEVER fabricate a profiles row with a made-up uuid** — it must equal the real Google `auth.users.id`, or Google login breaks later.
- **Clients / brands:** `produccion.clients` (seeded: DiDi — `slug`, `brand_color`, etc.). `produccion.marcas` (seeded: Card, Préstamos under DiDi; `unique(client_id, slug)`, has `logo_url`). ⚠️ The client picker `src/app/(app)/clientes/page.tsx` reads **`MOCK_CLIENTS` from `src/lib/mock.ts`, not the DB** — must be made DB-backed if you add/remove clients.
- **Tasks:** there's no "tasks" table. A "tarea" = a `produccion.ideas` row. Chain: `briefs → idea_families → ideas → planos + assets`. Assignment = `produccion.idea_assignments` (`idea_id ↔ member_id`→track_members, `es_lead`). The "N activas" badge = count of non-terminal `idea_assignments` for a member (`src/app/(app)/admin/actions.ts::listarEquipo()`).
- **Email = live** (Gmail SMTP + Nodemailer): `src/lib/email.ts::sendEmail()`. Queue tables `notifications` + `notification_deliveries`, drained inline via `after(() => dispatchPendingEmails())` (`src/lib/notif-email.ts`). Types/routing in `src/lib/notif-routing.ts` (`EMAIL_TYPES`), templates in `src/lib/email-template.ts`. **To add a new notification: add a type, enqueue a `notifications` row + `notification_deliveries(channel:'email')`.** Slack is stubbed (post-launch).
- **Admin page:** `src/app/(app)/admin/page.tsx` + `src/components/admin/admin-shell.tsx` (tabs: perfil, equipo, marcas, actividad, integraciones, biblioteca). Actions in `src/app/(app)/admin/actions.ts`. `crearMiembro`/`guardarMiembro` exist; **no delete-person exists**; `marcas-tab.tsx` only manages logos (`subirLogoMarca`/`quitarLogoMarca`) — **no create/delete marca exists**.

---

## ⚠️ COORDINATION — another session is live in this same checkout

Another session has **built-but-not-yet-shipped HUE work** in the task workspace. **Do not edit these "hot" files** without checking with Pedro first:
`src/app/(app)/[cliente]/tareas/[id]/page.tsx`, `src/app/(app)/[cliente]/tareas/[id]/validar-actions.ts`, `src/components/tarea/workspace-provider.tsx`, `src/components/tarea/correcciones/contexto.tsx`, `src/components/tarea/correcciones/panel.tsx`, `src/components/tarea/campo.tsx`, `src/components/tarea/documento-tarea.tsx`.
Because the checkout may be shared: **commit with explicit file paths (`git add <file>`), NEVER `git add -A`/`-a`**, or you'll sweep up the other session's work.

---

## THE BUILD

### Phase 0 — BLANK-SLATE RESET (destructive, gated, do FIRST, main-thread only — NOT delegated to a casual agent)
Goal: an empty platform for the final pre-live test, **keeping the DiDi client and its brands**.
- **DELETE:** all content — `briefs, idea_families, ideas, planos, assets, comments, status_events, activity_log, notifications, notification_deliveries` (and any other content/child tables) — **AND** all `track_members` + `idea_assignments`. Also clear `profiles` (they'll be re-created correctly on first login via the allowlist — do NOT keep dormant/fake profile rows).
- **KEEP:** `clients` (DiDi) and `marcas` (Card, Préstamos). Null out / handle any FK references from kept rows to deleted rows (e.g. `created_by`).
- **HOW:** write a reset script that (1) prints a **DRY-RUN count** of every table it will touch (rows to delete, rows to keep) and STOPS; (2) only after **Pedro's explicit "yes, run it"** performs deletes in correct FK order (children → parents); (3) `produccion` schema only, never `public`/`storage`; (4) re-prints counts after so the result is verifiable. Prefer running against a PGlite copy first to prove the order.
- This is the one irreversible step — confirm scope and counts with Pedro before executing.

### Phase 1 — LOGIN CORE (must land before Phases 2–3 can be tested end-to-end)
- **Agency (Google OAuth):** allow domain **`runna.com.mx`**, PLUS allow-list **`petedv31@gmail.com` as role `master`** (Pedro's personal email — explicit exception to the domain rule). Add `runna.com.mx` to the `AUTH_ALLOWED_DOMAINS` env pattern; keep the master-email exception in code/config, clearly commented.
- **First-login provisioning:** build `/auth/callback`. On first successful agency login, create the real `profiles` row (`id = auth.users.id`), role = `master` for the allow-listed master email, else **`creative` (Especialista)**; AND create/bind a `track_members` row (set `profile_id`) so the person appears in Equipo. Match an existing track_member by email if one exists (post-reset there won't be, so mostly fresh). Never invent profile uuids.
- **Enable the login page** ("Continuar con Google") and make the middleware enforce login when `AUTH_ENABLED=true`. Build it so login is **flippable via env** — turning it ON is the deliberate go-live step, not silently on.
- **Retire the `soy` ("¿Quién eres?") and `view-as` ("Ver como") testing shims — this IS the identity cutover, so replace-then-remove in this same change; do NOT delete them while login is still off or nothing identifies the user and the app breaks.**
  - Grep for every reader: `getSoy`, `getViewAs`, `gl_soy`, `gl_view_as`, `setSoy`, `setViewAs`, `DEFAULT_ROLE`, `soy.role`. Switch each to read the **authenticated session's** profile + role and its bound `track_member` (via `profile_id`).
  - Task ownership/attribution (formerly keyed on `gl_soy`, e.g. "Empezar") now uses the logged-in member. Per the standing lesson: never gate real attribution on the shim — gate on real identity.
  - Then DELETE `src/lib/soy.ts`, `src/lib/view-as.ts`, `src/app/(app)/soy-actions.ts`, `src/app/(app)/view-as-actions.ts`, the two UI controls (the "¿Quién eres?" picker and the "Ver como" role switcher — grep to find the components), both cookies, and the `DEFAULT_ROLE='admin'` fallback.
  - No role-preview/impersonation remains after this (Pedro confirmed it's not needed). If a proper *audited* "view as / impersonate for support" is ever wanted, that's a separate future feature — do not rebuild the shim.
- **RLS engagement + launch-hardening** (the notes list these as required with login):
  - Move user-facing reads to an anon/user Supabase client so RLS actually fires.
  - Gap 1: scope specialist write-actions to the actual assignee (not just `canMoveStatus`) — today a specialist can edit any task by URL.
  - Gap 2: leads are **departmental** (own track only); admins/master are agency-wide. Enforce server-side.
  - Security batch: re-check role **server-side** in `sync/*`, `importRows`, `crearBrief` (it sends emails), and admin legal-snippet actions — don't trust the page-level gate alone.
- **VERIFY FROM THE USER'S SEAT, not admin/service-role:** for each role, confirm they see exactly what they should, and confirm an outsider/unapproved user sees **zero**. Use a rolled-back transaction with `set local role authenticated` + real JWT claims, or a real non-admin test login. "It works as admin" proves nothing here.

### Phase 2 — CLIENT ACCESS (approval-gated magic link)
- **Request-access page** (client login route, e.g. `/portal/login`): client enters **any email** (+ name; optionally the brand they think they're with). This creates a **pending-invite** row. ⛔ **It does NOT authenticate them and does NOT send a login link.** On submit, show "Your access request was sent — you'll get an email when you're approved," and **notify Pedro + all admins** (email + in-app) that a client is requesting access.
- **New `pending_invites` table** (email, name, requested_brand?, status pending/approved/rejected, timestamps, decided_by). Add migration.
- **Two new Settings/Admin tabs:**
  - **"Invitaciones pendientes":** list requests; **Approve** → assign role `client` + choose which **client + brand/marca** → this action (a) creates the client's `profiles` row scoped to that `client_id`, (b) **sends the magic-link login email** (Supabase `signInWithOtp` or invite) — the link is sent HERE, only after approval, per Pedro. **Reject** option too.
  - **"Clientes":** list client users, their brand, active/inactive, revoke access.
- **Only approved emails can actually log in.** Gate the magic-link/OTP path so an un-approved email cannot self-issue a working link.
- **Bind client ↔ session** (fixes today's "portal trusts the URL slug" gap): the portal must verify the logged-in client's `client_id`/brand matches the requested slug via `current_client_id()` + RLS. A client sees only their brand's portal.

### Phase 3 — BRIEF FAIL-SAFE (add missing agency people)
- When an admin creates/saves a brief that **assigns/names agency people who aren't `track_members` yet**, intercept and prompt: *"These people aren't in the platform yet — add them?"*
- If yes → create `track_members` rows (role = `creative`/Especialista) → offer to **email them**: "You've been added to Greenlight — log in with your @runna.com.mx email." (Reuse the email pipeline; add a notification type.)
- "Leads" here means **agency people on the brief** (assignees/dept-heads), NOT the client-change entities and NOT creative ideas.

### Phase 4 — SETTINGS CRUD (parallelizable with Phase 2/3)
- **Marcas CRUD:** add **create-marca** and **delete-marca** (with confirm dialog) to `marcas-tab.tsx` + `admin/actions.ts`, DB-backed on `produccion.marcas`. Respect `unique(client_id, slug)`.
- **Delete users:** add `eliminarMiembro` (hard delete) to the Equipo tab with confirm. **Guard:** admins may delete regular members but **NOT other admins/masters — only `master` can delete an admin/master.** Keep the existing deactivate toggle too. Handle FK cleanup (assignments already gone if member had none; block/confirm if live references exist).
- If real client add/delete is needed, first make `/clientes` DB-backed (replace `MOCK_CLIENTS`).

---

## HARD RULES (non-negotiable)
1. ⛔ **No push to `main` / no deploy without Pedro's explicit "ship it."** Build + verify locally and on PGlite; you may do a Vercel **preview** if asked, but production is gated. Turning login on = go-live = gated.
2. **Phase 0 reset:** dry-run counts → explicit Pedro confirm → child-first FK order → `produccion` only. Never let a blank/partial state clobber kept data (DiDi + brands).
3. **Migrations:** `npm run migrate` only, PGlite-tested first, pinned to `ybbrpqzbedaxsmotgtkh`. Never `supabase db push`. Never reference `public.`/`storage.` (`npm run check:isolation`).
4. **Never fabricate `profiles` uuids** — bind via `track_members.profile_id`; real profile id = `auth.users.id`.
5. **Verify RLS from the least-privileged real role**, and confirm outsiders/unapproved users see zero. Not from admin/service-role.
6. **Shared checkout:** `git add <explicit paths>` only, never `-A`/`-a`. Don't touch the HUE hot files listed above without checking first.
7. **Sub-agents you spawn:** tell each one NOT to use interactive prompts (state assumptions in text — a spawned agent has no one to answer a UI question and will hang), NOT to run git, and to report findings back. The Phase 0 reset is NOT delegated — run it on the main thread with Pedro in the loop.
8. Regenerate Supabase types after schema changes; cast at the boundary if types lag.

## HOW TO PARALLELIZE
Sequence the gates, parallelize the leaves:
1. **Phase 0** (reset) — main thread, gated. Then:
2. **Phase 1** (login core) — do this next; Phases 2–3 depend on it. One focused track (it's security-critical — keep it coherent, don't over-split).
3. Once login core is in, fan out in parallel (mostly separate files):
   - Agent A → **Phase 2** client approval flow (new table, request page, pending/clients tabs, magic-link-on-approve, portal binding).
   - Agent B → **Phase 3** brief fail-safe (intercept in brief-builder/crear-brief, add-people prompt + email).
   - Agent C → **Phase 4** marca CRUD + delete-users guards.
4. Reconverge → 5-pass reap (code health, security, perf, a11y, UI/UX) → verify from each role's seat → report.

## DELIVERABLE
Build and self-verify everything through Phase 4. **Stop before any production deploy.** Then report: what's done, what was verified (and how, per role), what's left, and wait for Pedro's "ship it" to turn login on in prod. Keep login OFF (`AUTH_ENABLED` unset) until that explicit go.
