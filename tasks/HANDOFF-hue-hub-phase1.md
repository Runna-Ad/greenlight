# H.Ü.E HUB — Phase 1 (learning/analytics + trainable brain), building toward "Crear guión"

You are working on **Greenlight / Rünna Command Center** at `/Users/work/Projects/runna-command-center` (Next.js 16 App Router, React 19, Supabase schema `produccion`, Spanish UI). Use the **beast-mode-dev** workflow (plan → build → 5-pass reap → verify → learn); log lessons to `tasks/lessons.md`.

**The vision (do NOT build the end-state yet):** eventually replace the "Pegar guión / Dejar que H.Ü.E lo lea" *fix-a-messy-script* flow with **"Crear guión"** — HUE writes the script directly from the task info. **Phase 2 = that writer. This prompt is Phase 1 only:** make HUE *trainable and measurable* first — a Master-Builder "H.Ü.E HUB" that shows what's working and lets Pedro feed it instructions + a knowledge base, plus the capture plumbing that makes it learn. Build Phase 1; leave clear seams for Phase 2.

Fan out **parallel sub-agents** for the independent pieces (see "How to parallelize").

---

## PROJECT FACTS (verified against the codebase — trust, verify before contradicting)

- Middleware is `src/proxy.ts` (Next 16). Deploy = **git push `main` auto-deploys to PRODUCTION** → ⛔ **no push/deploy without Pedro's explicit "ship it."**
- DB: Supabase **S.P.A.M** ref `ybbrpqzbedaxsmotgtkh`, schema **`produccion`** ONLY. Never touch `public.`/`storage.` (`npm run check:isolation`). Migrations: numbered files in `supabase/migrations/` (max ~0039), applied via **`npm run migrate`**, tested first on PGlite via **`npm run test:db`**. ⛔ Never `supabase db push`.
- Roles: enum `produccion.app_role`; app layer `src/lib/roles.ts`. **The HUB is MASTER-only** (`role='master'`, "Master Builder"). Gate every HUB route/action on master.
- **HUE = 3 hardcoded-prompt server actions on the task screen, Claude Sonnet 5, forced tool-use, no chat, no memory, advisory-only with deterministic guardrails:**
  - `validarCambios` / `aplicarSugerencia` — `src/app/(app)/[cliente]/tareas/[id]/validar-actions.ts` (correction validator). ⚠️ **Prompt-caching split is load-bearing** (lines ~231-244): stable `instrucciones` block carries `cache_control:{type:'ephemeral'}`, variable `bloques` after it. **Any injected instruction/KB text must go INSIDE the cached `instrucciones` block, before the cache breakpoint** — appending after it re-costs full price every call.
  - `revisarOrtografia` / `aplicarOrtografia` — `src/app/(app)/[cliente]/tareas/[id]/ortografia-actions.ts` (spellcheck, single uncached block).
  - `extraerGuion` — `src/app/(app)/[cliente]/tareas/[id]/actions.ts` ~575-685 (script extractor; will be superseded by Phase 2's "Crear guión").
- ⚠️ **These HUE files are HOT** — another session has built-but-unshipped HUE work in them. Before editing `validar-actions.ts`, `actions.ts`, and `src/components/tarea/{workspace-provider,correcciones/contexto,correcciones/panel,campo,documento-tarea}.tsx`, **confirm with Pedro that that work has shipped/parked.** Commit with explicit file paths (`git add <file>`), never `-A`/`-a`.

### Data that already exists (REUSE — do not rebuild)
- **Existing analytics engine:** `src/lib/evaluacion.ts` + `src/app/(app)/performance/data.ts` already compute `rondasPorTarea`, `cambiosPorRonda`, `cicloMedianoDias` (median assign→completed), and per-rubric-criterion scores, joining `ideas`, `idea_assignments`, `comments`, `field_edits`. **The HUB analytics should extend this, not reinvent it.**
- **Join view:** `produccion.board_tasks` already joins task↔brief↔client↔brand↔specialist (`marca_id/marca`, `client_id/client_slug`, `brief_id/brief_title`, `member_ids[]`). Slice HUB metrics through it.
- **Corrections:** `produccion.comments` — `kind (comment|correction_request|approval|client_change)`, `ronda` (round; logic in `produccion.correction_next_round`), `categoria` (rubric criterion: cumplimiento_brief/errores_marca/ortografia/storytelling/claridad/creatividad/hook/dinamismo/otro — internal corrections only), `resolved_*`/`atendido_*` two-sided resolution. Note: `comments.author_member_id` = who WROTE the correction (usually the lead), not who fixes it — attribute to the specialist via `idea_assignments`/`field_edits`.
- **Status/approval:** `produccion.ideas.status` (enum `asset_status`) + `produccion.status_events` (every transition, via `rpc_move_task`/trigger). Approval = `rpc_task_approve`. Bounce = count `to_status='in_corrections'` per idea. All raw ingredients for approval-rate/bounce-rate/time-in-status exist.
- **Selling points / legals (COMPUTABLE the clean way):** `produccion.snippets` (kind includes `selling_point`, `legal`, `instruccion`, `consideracion`, `referencia`; scoped global/client/marca/brief) attached to tasks via `produccion.idea_snippets(idea_id, snippet_id, ...)`. **"Most-used selling point/legal" = `GROUP BY snippet_id` over `idea_snippets`** joined to `snippets`. ⚠️ Do NOT use `snippets.usage_count` — it's dead/never incremented. Count `idea_snippets` rows.
- **Free-text content** (`planos.hook_narrativo/copy_in/...`, `estaticos.legales_extra`, `ideas.legales_libres`, `ideas.selling_points text[]`) is UNSTRUCTURED — aggregating "most-used X" from it needs NLP. **Mark as Phase-1.5/stretch; do NOT ship fake counts from free text.**
- **Nothing HUE-specific is logged today:** no suggestion adoption record, no custom-instruction store, no KB. (A dead `gary_reviews` table exists from an old design — ignore it.)

---

## PHASE 1 BUILD

### A. New schema (one migration, PGlite-tested)
Follow the existing `snippets` scoping pattern (global/client/marca) and the storage-bucket constant pattern.
1. **`produccion.hue_suggestions`** — adoption log for BOTH the validator and spellcheck. Columns: `id, idea_id, kind ('correction_verdict'|'ortografia'), correccion_id (nullable→comments), tabla/fila_id/campo (target), hecho (si|no|parcial, verdict only), tipo (spellcheck type only), sugerencia, offered_at, decision ('applied'|'dismissed'|'ignored'), decided_at, actor_member_id`.
2. **`produccion.hue_instructions`** — versioned training instructions. Columns: `id, scope (global|client|marca), client_id?, marca_id?, title, body, version int, active bool, source ('human'|'auto'), reason (why an auto-change was made), created_by, created_at`. (`source`/`reason` power the auto-adapt audit trail — see E.)
3. **`produccion.hue_kb_documents`** — KB doc metadata + extracted plain text. Columns: `id, scope, client_id?, marca_id?, title, storage_path, mime_type, size_bytes, extracted_text (the doc's readable text, so the Phase-2 writer can inject it directly — no embeddings), uploaded_by, created_at`. Files go in a NEW private bucket **`greenlight-kb`**. On upload, extract the text (pdf/docx/txt/md → plain text) and store it in `extracted_text`. **Default consumption = whole-document injection** into the writer's cached prompt (Pedro's real need: "upload docs, HUE reads them"). Leave a nullable `embedding`/`indexed_at` seam for a LATER retrieval upgrade, but do NOT build embeddings/RAG now.
4. **Top-performer flag** — either `produccion.ideas.top_performer bool` + `top_performer_by/at`, or a `produccion.hue_top_performers` table. Starred delivered scripts become learning exemplars.
5. **`produccion.hue_adaptations`** (auto-adapt audit) — `id, at, trigger_summary, changed_instruction_id, from_version, to_version, applied_by ('auto'), reverted_at`. (May be folded into `hue_instructions` history if cleaner.)

### B. Adoption logging (wire into the HOT HUE actions — coordinate first)
- In `validarCambios`: insert one `hue_suggestions` row per verdict at generation time (decision=null). In `aplicarSugerencia`: set `decision='applied', decided_at=now()` for that row.
- Same for `revisarOrtografia`/`aplicarOrtografia`.
- Add a lightweight **client-side "dismiss" signal**: when the corrections/ortografía panel is closed or a suggestion is skipped without applying, mark remaining rows `decision='ignored'` (today an ignored suggestion just silently disappears — nothing records it). Keep it cheap; don't block the UI.
- ⚠️ Do not alter HUE's prompts or guardrails here — logging only. Preserve the `validarCambios` cache split exactly.

### C. "Star top performer" on Entregas
- Add a **Star / "Top performer"** control on the Entregas (delivered) view so a master/admin flags a delivered script as a winner.
- Starring **appends the script to the Winners Library (E)** and **triggers the synthesis job (E)**. Its structured content (`planos` fields) becomes a learning exemplar. In Phase 1: capture + display; the Phase-2 writer consumes it.
- ⚠️ **"Top performer" = a human star.** Greenlight has NO live ad-performance data (CTR/sales live in Meta/TikTok ad managers), so the star IS the ground-truth "this won" signal Pedro supplies. Do not compute or imply real-world performance. (A future ad-metrics integration could auto-flag winners — out of scope now.)

### D. The H.Ü.E HUB (new Master-only admin tab)
Add a HUB tab to `src/components/admin/admin-shell.tsx` (+ actions in `src/app/(app)/admin/actions.ts` or a dedicated `hue-actions.ts`), master-gated. Two areas:
- **1) Intelligence (analytics — extend `evaluacion.ts`, slice via `board_tasks`):** scripts with fewest corrections; approval rate; bounce-to-corrections count; cycle time; **most-used selling points & legals from the snippet library** (`idea_snippets` group-by); **HUE-suggestion adoption rate** (from `hue_suggestions`), split by validator vs spellcheck. All filterable by brand/brief/specialist. Show honest empty-states ("not enough data yet") — after the go-live reset this starts near-empty and fills post-launch. **Only render cards for computable metrics; label free-text/NLP items "coming soon," don't fake them.**
- **2) Training inputs — the two living documents (see E):** render **🧠 the Brain (Playbook)** as a readable, editable document backed by `hue_instructions` (version history, activate/deactivate, scope, per-lesson revert, `source` badge auto/human, `reason`), and **🏆 the Winners Library** backed by `hue_top_performers` + the seed doc. Plus **KB document upload** to `greenlight-kb` (`hue_kb_documents`, list/preview/delete; text extracted on upload). This is where Pedro seeds the "32 best scripts" (which also seeds the Winners Library), hand-writes/edits Brain lessons, and watches HUE's auto-lessons accrue.

### E. The self-improving "brain" — two living documents (Pedro's model), built WITH a seatbelt
Express the auto-learning as **two living documents Pedro can open and read**, each backed by structured records so the seatbelt (version / audit / revert / master switch) still holds. Do NOT implement either as a single free-text blob HUE rewrites wholesale (it would bloat, self-contradict, and lose clean revert).

- **🧠 The Brain (Playbook doc)** — HUE's synthesized learnings + prompt improvements; the guidance it reads when building scripts. It is the **human-readable rendering of the active `hue_instructions`** — each lesson is one tracked, revertible record (`source='human'|'auto'`, `reason`, date, and which winner/insight it came from). Pedro can read the whole doc, hand-edit a lesson, or reject/rollback any auto-added one. The Brain is what the **Phase-2 writer** injects into its cached prompt.
- **🏆 The Winners Library (doc)** — starts with Pedro's uploaded "32 top performers" and **grows every time a winner is starred (section C).** Backed by `hue_top_performers` (starred `ideas` → their `planos` content) + the seed doc's `extracted_text`.

**The loop (this is the "gets better and better"):**
1. A winner is starred → it joins the Winners Library.
2. A **synthesis job** (runs when winners are added, or on a schedule) has HUE **read the Winners Library and mine it for patterns** — recurring hooks, tone, slang, CTA styles, selling-point/legal usage, structure — and **propose new lessons into the Brain** (`hue_instructions`, `source='auto'`, `reason` citing the winners it learned from), recorded in `hue_adaptations`. It may also fold in outcome analytics (approvals, low-correction scripts, suggestion adoption).
3. The next script is built using the updated Brain.

**Seatbelt (non-negotiable for client-facing copy):** every auto-added lesson is **visible** in the HUB ("what HUE learned & changed", citing its source winners), **one-click revertible**, and gated by a **global auto-learn ON/OFF** the master controls. If Pedro later wants it fully silent, removing the audit surface is a small change — default to auditable.

**Honesty guardrail (put this in the UI copy, not just code):** the synthesis finds what winners have in *common* — it does NOT know *why* they won in-market (targeting/budget/timing/product drive real results, not the words alone). Label Brain lessons **"patterns observed in your winners,"** never proven causes. And per section C, **"winner" = a human star**, since Greenlight has no live ad metrics.

- Phase 1 wires the two docs + synthesis job + audit/revert/switch. The Brain doesn't feed a live *writer* yet (Phase 2), but the correction-validator MAY optionally consume the active Brain block (inside its cached prefix) as an early proof.

### Unchanged in Phase 1
- **Grammar/spellcheck logic stays as-is** — only add the adoption logging (B).
- **Correction validator logic stays as-is** — add logging; optional consumption of the active instruction block is the only prompt change, and only if it preserves the cache split.

### Explicitly OUT of scope (Phase 2 — leave seams, don't build)
- The **"Crear guión" writer** itself.
- **Embeddings / RAG retrieval — NOT NEEDED for the current library size.** Pedro's KB is a thin binder (a doc of ~32 short scripts + a playbook), which fits directly in the writer's prompt. So the Phase-2 writer will **inject the KB docs' `extracted_text` wholesale** into its cached prompt — no embeddings, no second provider, no `pgvector`. Only IF the library later outgrows the context/cost budget (many/long docs) do you add retrieval: `pgvector` on `ybbrpqzbedaxsmotgtkh` + an embeddings provider (Anthropic makes none — **Voyage AI** recommended, or OpenAI). That's a future, size-triggered upgrade, NOT a decision to make now. Just store `extracted_text` so either path works.

---

## HARD RULES
1. ⛔ No push to `main` / no deploy without Pedro's explicit "ship it." Build + verify locally + PGlite; production is gated.
2. Migrations via `npm run migrate`, PGlite-tested, pinned to `ybbrpqzbedaxsmotgtkh`, `produccion`-only, never `supabase db push`. Regenerate types after; cast at the boundary if types lag.
3. **Do not break the `validarCambios` prompt-cache split** — injected text goes inside the cached `instrucciones` block, before the `cache_control` breakpoint.
4. **HUE files are HOT** — confirm the other session shipped/parked before editing them; `git add <explicit paths>` only, never `-A`/`-a`.
5. **Honesty in metrics** — only build dashboard cards for metrics computable from stored data (per the "REUSE" section). Label free-text/NLP metrics as later. Do not invent numbers.
6. **Capture-before-data** — B (adoption logging) and C (starring) only record going forward, so land them before go-live so real data accrues from day one.
7. Master-gate every HUB route/action server-side (not just the tab visibility).
8. Sub-agents you spawn: no interactive prompts (state assumptions in text — they hang otherwise), no git, report back.

## HOW TO PARALLELIZE
1. **Schema migration (A)** first — everything depends on it. Land + PGlite-test it, then fan out:
   - Agent A → **B** adoption logging in the HUE actions (coordinate on hot files) + client dismiss signal.
   - Agent B → **D** HUB analytics area (extend `evaluacion.ts`, `board_tasks` slices, empty-states).
   - Agent C → **D** training-inputs area (instruction editor + versioning, KB upload/bucket) + **C** Entregas starring.
   - Agent D → **E** auto-adapt loop + audit/revert + master switch.
2. Reconverge → 5-pass reap (esp. security: master-gating, storage bucket privacy; and correctness of the metric queries) → verify each metric against known task data → report.

## DELIVERABLE
Build + self-verify Phase 1. **Stop before production deploy.** Report: schema added, what each HUB metric computes (and which are stubbed as "coming soon"), how adoption logging + starring capture works, how the auto-adapt audit/revert/switch behaves, and the open Phase-2 items (the "Crear guión" writer; embeddings/retrieval only if the KB library later grows large). Then wait for Pedro's "ship it."
