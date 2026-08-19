# GREENLIGHT / RÜNNA COMMAND CENTER — next session prompt

> Paste this at the start of the next session. Written 2026-08-19.

Working dir: `/Users/work/Projects/runna-command-center`
(Next 16 App Router · React 19 · Tailwind v4 · Supabase schema `produccion` ·
Spanish UI · Vercel auto-deploy on push to `main` · repo `Runna-Ad/runna-command-center`)

**Read first:** `tasks/session-log.md` (top entry = 2026-08-19), `tasks/lessons.md`,
`tasks/project-state.md`, `tasks/todo.md`.

---

## FIRST TASK: bold detection in "Copiar guión" (paste script)

**GOAL:** when a user pastes a guión that contains BOLDED text, detect it and keep it
as markdown bold, e.g. `**$46,800 m.n.**` — instead of silently flattening it to
plain text (which is what happens today).

**WHY it doesn't work now (already traced):**
- The paste box is a plain `<Textarea>` in `src/components/tarea/pegar-guion.tsx`
  (state `texto` → `parseGuion(texto)`). A plain textarea only receives `text/plain`,
  so rich formatting from Google Docs/Word is lost before it's ever parsed.
- Even if bold arrives as markdown, `src/lib/guion.ts` → `limpiarPegado()` EXPLICITLY
  STRIPS it: line ~82 `.replace(/\*\*(.+?)\*\*/g, "$1")` and line ~83 for `__ __`.
  So the very first fix is to stop stripping bold there.

**THE THREE PIECES to build:**
1. **CAPTURE bold on paste** — add an `onPaste` handler to the Textarea in
   `pegar-guion.tsx` that reads `clipboardData.getData("text/html")`; walk the HTML
   and convert bold runs (`<b>`, `<strong>`, and inline `font-weight:bold` / `>=600`)
   into `**…**` markdown; insert that into the textarea (`preventDefault` + set value).
   Fall back to `text/plain` when there's no HTML. This is what catches a real paste
   from Google Docs / the team's deck.
2. **STOP stripping** — in `guion.ts` `limpiarPegado()`: drop the two lines that remove
   `**…**` / `__…__`; instead NORMALIZE `__x__` → `**x**` and KEEP `**x**`. Make sure
   this composes with the existing emoji-shortcode handling and the table/pipe cleanup
   already in that function.
3. **RENDER bold** — the copy/dialogo fields render via `CampoLectura`'s `pretty` branch
   and `DocumentoTarea`. Add a tiny markdown-bold renderer (`**x**` → `<strong>`) used in
   the read/client views (and decide what the editor shows — see open question). Must
   not fight the existing Linkify / dialogo formatter.

**OPEN QUESTIONS to confirm with Pedro BEFORE coding (ask, don't assume):**
- **(a)** Does he want the field to STORE the markers `**…**` (visible in the editor) and
  RENDER bold in the client view? Or a true rich-bold with a toolbar? *(Recommend: store
  markdown `**…**`, render bold in read views, editor shows the markers for v1 — simplest,
  reversible, matches his example.)*
- **(b)** Anchoring/AI tradeoff to raise: if `copy_in` stores `"**$46,800 m.n.**"`, then the
  correction quote/offset anchors AND H.Ü.E's spell-check + validator all now see the `**`
  characters. Options: (i) store markdown in-field and strip `**` when feeding H.Ü.E /
  computing quotes, or (ii) keep bold as separate metadata. Pick with Pedro; (i) is simpler.
- **(c)** Scope: only `copy_in`, or also `dialogo`/`accion`/`gfx`/`sfx`/`edicion`?
  *(Likely `copy_in` + `dialogo` first.)*

**VERIFY:** paste a real Google-Docs snippet with a bold number → it lands as
`**$46,800 m.n.**` in the paste preview → imports → renders bold in Vista cliente and
the portal. `tsc` + `lint` + `npm run build` + `npm run test:db`. Add a
`parseGuion`/`limpiarPegado` unit test in `scripts/test-db.mjs` or `test-lib.mjs` with a
real bolded fixture.

**Relevant files:** `src/components/tarea/pegar-guion.tsx` · `src/lib/guion.ts` ·
`src/lib/dialogo.ts` · `src/components/tarea/campo-lectura.tsx` ·
`src/components/tarea/documento-tarea.tsx`. (Bold lives inside the existing text fields —
no column change expected.)

---

## BEFORE anything else — confirm two things from last session on the LIVE deploy

1. **H.Ü.E on the «elementos» case** should now read "parece hecho" + suggest
   "usa el elemento importante" (it was rating it "no"). If still off, tune the prompt in
   `src/app/(app)/[cliente]/tareas/[id]/validar-actions.ts`.
2. **Full client change round-trip** in the portal: pick a task from the visual rail →
   select text → "Anotar cambio" → the top button flips to "Pedir cambios (N)" → send →
   it lands on the internal task as "El cliente pidió cambios". RPCs are PGlite-tested
   (`rpc_client_add_change` / `rpc_client_submit_changes`, migration 0037, already on prod
   `ybbrpqzbedaxsmotgtkh`) but the live end-to-end wasn't confirmed.

---

## STANDING RULES (do not violate)

- **NO prod deploy** (git push to `main` / supabase migration) without Pedro's explicit
  "ship it" in-session. Preview/local is fine.
- **Migrations:** `npm run migrate` (never `supabase db push`), pinned to
  `ybbrpqzbedaxsmotgtkh`; sandbox in PGlite (`scripts/test-db.mjs`) BEFORE prod. Postgres
  overload footgun: drop the old signature before re-creating an RPC with new params.
- Any AI feature is named **"H.Ü.E"**, never "IA".
- **Dev preview pane was flaky last session** (turbopack stale cache, `innerText` returns
  ~85 chars, blank screenshots): trust `npm run build` as the gate, verify DOM with
  querySelector not `body.innerText`, and if the bundle wedges, move `.next` aside for a
  clean rebuild. Don't burn 20 calls fighting it.
- Log every lesson to `tasks/lessons.md` immediately; Pedro overrides = highest weight.
- `view-as` / `soy` are a temporary testing shim; real roles come at launch via
  Google/@runna.com.mx login (still the LIVE blocker).

## WHAT'S ALREADY LIVE

Agency loop, Performance/Evaluación, typed corrections + hover cards, **H.Ü.E v2**
(review-time, chips + reason + suggestion, catches new problems), **client portal v2**
(localized client changes, sticky Aprobar⇄Pedir-cambios, emoji rendering, visual task
rail + effects).
