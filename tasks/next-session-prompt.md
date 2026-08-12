# Próxima sesión — Greenlight · by Rünna

## Arranque (lee esto primero, en orden)
1. `tasks/project-state.md` — el estado real y completo (recién actualizado).
2. `tasks/session-log.md` — bitácora cronológica (lo de arriba es lo más reciente).
3. `tasks/lessons.md` — mistakes/overrides/wins. **Lee los PEDRO_OVERRIDE.**
4. Este archivo — qué sigue y cómo.

## ✅ HECHO 2026-08-12 (ya NO son focus — shipped, ver session-log)
Las DOS features que estaban aquí abajo ya se shippearon:
- **Descartar una corrección fijada** + **"Pedir cambio" sólo en campos vacíos**.
- **Importador "Pegar guión" (Feature 2)** completo: parser determinista + RPC
  atómico (mig 0030) + UI diálogo/preview + normalizador **H.Ü.E** con guard
  fact-shaped. CTA arriba, diálogo scrollable. Verificado 3/3 en vivo.

## 🎯 PRÓXIMOS CANDIDATOS (ninguno comprometido — Pedro elige)
(Note: Pedro & Claude converse in ENGLISH; la UI/copy de Greenlight queda en
SPANISH. DESIGN-FIRST donde haya ambigüedad; use beast-mode-dev.)
1. **Muestra REAL de estático** de Pedro → reemplazar el `parseEstatico` PROVISIONAL
   de `src/lib/guion.ts` con un gold-test (hoy es best-effort, sin muestra real).
2. Candidatos viejos: **Portal del cliente** · **F6 Notion** (bloqueado en token) ·
   **Slack** de notificación · **API/MCP con tokens** · **legal de Préstamos** · dark mode.

**NO son pendientes (decisión de Pedro 2026-08-12):**
- `ANTHROPIC_API_KEY`: NO rotar — Pedro dice que está bien. No lo re-plantees.
- Emails del equipo vacíos: es POR DISEÑO. La columna `email` se reinicia vacía
  cuando salga a live tras el testing, y se llena SOLA cuando cada quien haga
  login. No es un todo — no lo flaggees ni pidas llenarlo a mano.

## (histórico — ya hecho) Las dos features originales de esta tanda

**1. "Cancelar" / descartar una corrección — el revisor cambió de opinión.**
- The composers (field-level in `campo-correcciones.tsx`, selection-level in
  `campo.tsx`) ALREADY have a "Cancelar" that closes the composer without creating.
  So Pedro's ask is almost certainly the OTHER gap: **delete/undo a correction the
  reviewer already PINNED** (right now, once created, a reviewer can only Confirmar
  or Reabrir — there's no "remove this, I changed my mind"). CONFIRM with Pedro which
  he means at session start.
- Likely build: a "Descartar" (trash) action for the REVISOR on each correction in
  the panel (and/or the field toolbar) → new server action `descartarCorreccion(id)`
  that deletes the `comments` row (revisor-only, canOverrideStatus). Consider: only
  allow deleting one you're mid-review on (not one already sent to the specialist),
  or allow always with a confirm. No migration needed (just a delete). Watch the
  round-close math: deleting the last open correction shouldn't strand the task.

**2. "Pegar guión" — bulk paste an entire script → auto-fill the plano fields.**
- A button (near "Agregar plano") opens a POPUP textarea; the reviewer/specialist
  pastes a whole deck-format script (Pedro's example: rows of "ACCIÓN + COPY IN +
  GFX/SFX (Motion) | DIÁLOGO", "Plano N - int. Sala - MCU", "Copy in: …", "SFX: …",
  "Botón CTA: …", dialogue by speaker). Parse it and POPULATE the plano fields
  (titulo/accion/copy_in/sfx/gfx/dialogo, CTA for estáticos), CREATING extra planos
  as needed (Plano 1, 2, 3…).
- ⚠️ **PEDRO_OVERRIDE tension — read lessons.md "Peloteo/parser".** Pedro previously
  KILLED an "auto-detect smart parser" in favor of defined labeled fields. This is
  DIFFERENT (the deck format is KNOWN/consistent, so it's a structured importer, not
  freeform guessing) — but respect the spirit: parse a DEFINED format, show a PREVIEW
  before writing (like the sync review cards — the editable staged-row pattern in
  `components/sync/`), let Pedro edit/confirm, and NEVER silently invent field
  boundaries. Confirm the exact deck format + the preview-then-confirm UX with Pedro
  before building the parser. Pure parser in `src/lib/` + tests (mirror `peloteo.ts`).
- The plano fields are `<textarea>`s via `<Campo>` (tabla="planos"); creation is
  `agregarPlano` (server action) + per-field autosave. A bulk import likely wants an
  atomic RPC (like `rpc_crear_brief`) or a loop of inserts + field writes.

**Likely OTHER candidates (if Pedro picks something else):**
1. **Portal del cliente** — the natural next build. The corrections model was
   designed to be reused: the client reviews `published` work and requests changes
   via `kind='client_change'` + `published→in_corrections` (already legal). It's
   another ROUTE/view (not the workspace with fewer props). "Enviar a cliente" ya
   deja la tarea en `published`; falta dónde el cliente la vea.
2. **F6 · Biblioteca Notion** — BLOCKED on Pedro's Notion integration token + base
   link/ID. CRUD de Biblioteca en /admin ya existe; falta el sync.
3. **Slack notifications** (email ya está) + **prefs por-evento por usuario** (hoy
   un toggle global `notify_email`).
4. **API / MCP con tokens para Claude** — greenfield (referencia SnapTrack).
5. **Copies template · legal de Préstamos · dark mode · agrupar corrections/pods.**

**⚠️ NON-CODE SETUP Pedro owes:** fill team emails in **/admin ▸ Equipo** — until
then correction/review notifications are computed but marked `skipped` (no send).

**Discipline reminders that bit us this session (see lessons.md):**
- Adversarial reap on any non-trivial feature BEFORE deploy — it found 5 real bugs.
- Contrast: solid darkened pill + white (or auto-picked text), and MEASURE in the
  browser — never white-on-mid-tone or colored-text-on-same-hue-tint.
- Any new `app_role` value → own migration + teach EVERY role branch (is_team etc.).
- Emails: table layout + inline styles + explicit UTF-8; the inbox is the review.

## Dónde quedamos (fin de sesión 2026-08-11)
Se shippearon TRES piezas grandes, todo en producción y verificado en vivo
(S.P.A.M intacto 42/31/6; migraciones GL 25→28). Detalle en session-log.md ▸
2026-08-10 y 2026-08-11 + project-state.md.
- **Correcciones localizadas + rol specialist_lead** (migs 0027/0028, dfad2aa;
  panel al final 2ad834a). Reusable para el portal del cliente.
- **Email de notificación rediseñado** (a1c2fdc): branded neón, verde-logo en
  aprobada, CTA inteligente, UTF-8. Send path verificado end-to-end.
- **Correcciones ancladas a SELECCIÓN** (mig 0029, 1e2fb7d): resaltar una frase de un
  campo y anclar la corrección ahí (mirror overlay, quote-snapshot). Reap limpio (4
  fixes), verificado end-to-end EN PROD.

**Migraciones 0001–0029 aplicadas** (⚠️ no existe 0017 — Notion, diferida; salta
0016→0018 a propósito). La próxima migración usa un timestamp NUEVO
(`20260811120001` o superior), NUNCA reciclar 0017.

Todo commiteado + pusheado a `Runna-Ad/runna-command-center` (público) —
**`git push main` → auto-deploy** a prod (Vercel git-connected, repo PÚBLICO).
`npx vercel` (sin `--prod`) = preview, pero el env de PREVIEW NO tiene las claves
Supabase (da "base de datos no está configurada") — por eso el preview no sirve
para revisar; usa localhost:3100 (`.env.local`) o prod. Login apagado (beta — NO
re-abrir). Secretos en `.env.local` (gitignoreado) + Vercel env — nunca commitear.

## Qué sigue (elige; ninguno comprometido)
- **Llenar los emails del equipo** en /admin ▸ Equipo — con eso los emails de
  notificación empiezan a llegarles solos (hoy la columna `email` está vacía →
  las notificaciones se marcan `skipped`, sin error).
- **F6 · Biblioteca Notion** — bloqueado en el **token de integración** + el
  **link/ID de la base**. El CRUD de Biblioteca en /admin ya existe; falta el
  sync con Notion (espejo a `snippets`).
- **Slack** de notificación (el email ya está) + **prefs por-evento por usuario**
  (hoy un toggle global `notify_email` por persona).
- **API / MCP con tokens para Claude** — greenfield (API + auth de token + tabla
  hasheada). Su propia fase. Referencia: la de SnapTrack (`ApiTokensTab.tsx`).
- **Portal del cliente** · **Copies** · **legal de Préstamos** (agregarlo por
  /admin ▸ Biblioteca — hoy sólo está el de Card) · **dark mode**.

## (histórico) F6 · Biblioteca Notion — detalle del plan
**Bloqueado en Pedro**: necesita darte el **token de integración de Notion** y
el **link/ID de la base** (la "Biblioteca Central"). Sin eso NO se puede avanzar.

Cuando los tenga:
- Es un **espejo sincronizado**: Greenlight jala la biblioteca a la tabla
  `produccion.snippets` (kinds: legal, selling_point, instruccion…). La UI ya
  lee de snippets (el picker de la Cortinilla de Cierre ya funciona con lo que
  hay sembrado). Falta el sync.
- Plan ya pensado (en `/Users/work/.claude/plans/ahora-pregunta-q-opinas-drifting-wolf.md`,
  fase F6): migración con columnas `external_source/external_id/external_url/
  synced_at` en snippets + tabla `library_syncs`; `src/lib/notion.ts` (fetch
  server-only, secreto jamás al cliente — patrón `resolveConfig` de
  sync/actions.ts); `notion-map.ts` VACÍO con TODO (no inventar el esquema de la
  base de Notion — mapear viendo la base real de Pedro); panel "Biblioteca" en
  `/[cliente]/sync` con previsualizar→confirmar (patrón `diffRows` del sheet sync);
  upsert idempotente, NUNCA delete (lo que desaparece → `active=false`).
- Env: `NOTION_TOKEN`, `NOTION_DB_ID` en `.env.local` + Vercel.
- Después: `npm run check:leak <url>` (que el token no se filtró al HTML).

## Cosas que Pedro podría pedir después (no comprometidas)
- **Portal del cliente** — la vista donde el cliente ve lo `published`, pone
  Revisión/Cambios/Aprobado y abre el entregable (el Link de entrega ya alimenta
  ese botón). Es otra RUTA con otra vista, no el workspace con menos props.
- **Copies** — plantilla no construida (no existe en el deck). Acordado: temas
  con cuota (lead define temas + cuántos; copy llena headline+descripción).
- **Legal de Préstamos** — sólo el de Card está sembrado. Es un dato financiero
  (CAT) — que lo dé Pedro, no inventarlo.
- **Tablero agrupado por brief** — Pedro preguntó, decidió que NO (bundles en
  Briefs, Tablero por estado). No hacer salvo que lo pida.
- **Miniaturas reales de video** en referencias (oEmbed de TikTok) — quedó fuera;
  hoy un link de video muestra un recuadro con el nombre de la plataforma.
- **3ª capa de diseño** — `PageHeader` compartido para unificar títulos; **dark
  mode** (los tokens ya están en globals.css, falta un pase de contraste).

## Reglas duras de este proyecto (violarlas = fallo)
- **Una TAREA = una fila del sheet.** Tamaños × plataformas son ARCHIVOS que la
  tarea entrega, no tareas separadas.
- **Nombres de columnas del sheet, literales** — nunca renombrar.
- **Login apagado hasta pre-lanzamiento** — NO re-abrir el tema de seguridad.
- **Campos definidos, no parsers "inteligentes".** Todo dropdown lleva "Otro".
- **Migraciones**: timestamp (nunca `0001_`), `npm run migrate`, NUNCA
  `supabase db push`. Cada archivo = 1 transacción (los `alter type add value`
  van en archivo aparte). Vistas: `create or replace`, jamás `drop view`.
  Grants explícitos en tablas nuevas.
- **Secretos jamás como props a client components** (Next los serializa al HTML).
- **PROD-SAFETY**: no escribir datos de prueba en campos reales de prod para
  verificar UI. Usar dev local, o insertar/borrar SÓLO por id propio y verificar
  el conteo antes/después. (Pasó 2-3 veces esta sesión; siempre restaurar.)
- **Deploy**: producción necesita "deploy it"/"ship it" explícito de Pedro
  en-sesión. Preview OK. (En sesiones de iteración rápida Pedro suele autorizar
  por lote; si dudas, pregunta.)
- **PGlite no ve 3 fallos**: resolución de nombres PostgREST (PGRST203), esquema
  storage, y grants (42501). Por eso grants explícitos + una llamada REAL contra
  la base antes de cantar victoria.

## Verificación (cómo probar)
- `npm test` (isolation + lib + db + sync). Los de sync (red) son intermitentes.
- Navegador: el preview se va solo a /clientes cada tanto — verifica con
  consultas a la BD/`curl`, no sólo screenshots. Los screenshots del MCP salen
  en blanco a veces (quirk conocido) — usar aserciones al DOM vía javascript_tool.
- Para migraciones a la base viva: `npm run migrate`, y verificar S.P.A.M
  idéntico antes/después (42 public / 31 migraciones / 6 usuarios).

## Tarea aparte pendiente (chip de sesión)
Había 4 enlaces del menú lateral que daban 404 (Carga/Entregas por revisar/
Entregas/Configuración) — ya están apagados con "Pronto" y no navegan. Al
construir cada página, quitar su `soon:true` en `src/components/shell/sidebar.tsx`.
