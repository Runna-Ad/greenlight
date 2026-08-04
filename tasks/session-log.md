# Session log — Greenlight · by Rünna

## 2026-07-31 — Supabase live, sync persisting, task-model correction

**What we did**
- **Named the product**: Greenlight · by Rünna. Wordmark = Unbounded 700 in signal green `#00E676` + glow + "light" dot; dark-pill treatment on white surfaces (no bright green passes contrast as text on white). Single `<Wordmark>` component.
- **Google Sheets sync, end to end.** Pedro deployed the Apps Script connector (`scripts/apps-script/Code.gs`, secret in Script Properties). App discovers all 31 tabs with full names, classifies them (project / template / control / unrecognised), imports the ones chosen.
- **Supabase LIVE** in the shared S.P.A.M project, schema `produccion` (29 tables). S.P.A.M provably untouched: 42 public tables / 31 migrations / 6 auth users identical before and after.
- **Imported Brief 24/07** (Real + Normal) as test data: 2 briefs, 9 familias, **32 tareas, 227 archivos**.
- **Dedup proven across sessions**: re-sync → "0 nuevas · 32 sin cambios · Todo al día".
- **Redesigned the sync review cards** into an editable surface (chip pickers from real vocab, per-field "editado" undo, required-field highlighting).
- Deployed throughout to https://runna-command-center.vercel.app

**Current state:** deployed and working. Board reads live data but is **not yet interactive** (no assignment, no drag). No client portal. Auth intentionally OFF.

**Decisions made (and why)**
- **Task = one sheet row**, not one file. Pedro's correction — see PEDRO_OVERRIDE in lessons.md. Migration 0007 moved `status` onto `ideas`.
- **Auth stays off until pre-launch** (Pedro's explicit call — do NOT re-raise). `AUTH_ENABLED` flag is ready; server actions use the service-role key meanwhile.
- **Own migration ledger** (`produccion._migrations` via `npm run migrate`) — `supabase db push` is unusable when two repos share a project, and the CLI's suggested repair would have damaged S.P.A.M's live history.
- **Historical sheet data is NOT needed** — only new work from here on. The 2 newest tabs are test data only.

**Environment changes**
- Vercel prod env: `SHEETS_SCRIPT_URL`, `SHEETS_SCRIPT_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `produccion` exposed via Management API + GRANTs (migration 0006)
- New scripts: `migrate`, `check:isolation`, `check:leak`, `test:sync`

**⚠️ Risks / open items**
1. **NO GIT REPO.** `git rev-parse --show-toplevel` → `/Users/work`. This project is untracked inside the home-directory repo — everything built so far is unversioned. **Fix first next session.**
2. `SHEETS_SCRIPT_SECRET` was briefly public (RSC prop leak, ~4 min) — rotation offered, not yet done.
3. App is public with no login — Pedro's decision; revisit at pre-launch.

**Pick up next session:** see `tasks/next-session-prompt.md`.
