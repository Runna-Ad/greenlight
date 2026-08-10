# Próxima sesión — Greenlight · by Rünna

## Arranque (lee esto primero, en orden)
1. `tasks/project-state.md` — el estado real y completo (recién actualizado).
2. `tasks/session-log.md` — bitácora cronológica (lo de arriba es lo más reciente).
3. `tasks/lessons.md` — mistakes/overrides/wins. **Lee los PEDRO_OVERRIDE.**
4. Este archivo — qué sigue y cómo.

## 🎯 THIS SESSION'S FOCUS (what Pedro wants to work on)
(Note: Pedro & Claude converse in ENGLISH; the Greenlight platform UI/copy stays
in SPANISH for the team.) **Ask Pedro what he wants to tackle** — the two big
2026-08-10 pieces (corrections flow + specialist_lead role, and the email
redesign) are SHIPPED. Nothing is committed to below; pick with Pedro.

**✅ DONE & LIVE (2026-08-10) — don't rebuild, just know it exists:**
- **Correcciones localizadas** (migs 0027/0028): pin-a-field corrections + tooltip
  + panel by round (red/amber/green) + morphing reviewer button + Devolver a
  revisión. Role **specialist_lead** (assign-only). Built REUSABLE for the client
  portal (`client_change` kind, `published→in_corrections`). See project-state.md.
- **Email redesign** (`lib/email-template.ts`): branded neon, smart CTA.

**Likely next candidates (Pedro picks):**
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

## Dónde quedamos (fin de sesión 2026-08-10)
Se shippearon dos piezas grandes, todo en producción y verificado en vivo
(S.P.A.M intacto 42/31/6; migraciones GL 25→27). Detalle completo en
session-log.md ▸ 2026-08-10 y project-state.md.
- **Correcciones localizadas + rol specialist_lead** (migs 0027/0028, commit
  dfad2aa; panel movido al final 2ad834a). Diseñado design-first con un mockup
  clicable, verificado por reap (5 bugs reales arreglados) + PostgREST 14/14 +
  contraste medido AA. Reusable para el portal del cliente.
- **Email de notificación rediseñado** (commit a1c2fdc): branded neón, aprobada =
  verde-logo en pastilla oscura, CTA inteligente (tarea/mi-trabajo), UTF-8. Send
  path verificado end-to-end.

**Migraciones 0001–0028 aplicadas** (⚠️ no existe 0017 — Notion, diferida; salta
0016→0018 a propósito). La próxima migración usa un timestamp NUEVO
(`20260810120003` o superior), NUNCA reciclar 0017.

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
