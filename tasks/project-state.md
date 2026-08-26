# Project state — Greenlight · by Rünna
Última actualización: 2026-08-26 — #4 (H.Ü.E aprende de ediciones) + fixes guardado/legal/sync + Apps Script lee CHIPS de Drive — **shippeado + live**

## 🧠 H.Ü.E aprende de tus EDICIONES (#4) — 2026-08-26 — SHIPPEADO + LIVE (mig 0048)
- 2º motor de aprendizaje (junto al de Ganadores). Captura el borrador de H.Ü.E (`hue_generations`,
  `imported_at` sellado en `importarGuion`), diffea borrador→publicado (`hue-diff.ts`, computado en código),
  mina patrones de ESTILO de las correcciones → propone lecciones `auto_edit` al Cerebro (mismos seatbelts).
- HUB (`hue-training.tsx`): toggle `auto_learn_edits` (independiente), "Correr síntesis de ediciones", métrica
  "% del borrador se conserva" + visor de diff borrador→publicado por tarea.
- Guards: masking de cifras al corpus, `esCambioDeEstilo` (no minar cambios de sólo-números), scope al cliente
  del corpus (no global), sólo mina borradores IMPORTADOS + editRate en (0,0.7). Debounce compare-and-set atómico
  en el auto-trigger (no bucle de llamadas a la API). Reap Opus: 4 serios arreglados.
- Migración **0048** (`hue_generations` + `imported_at`, `hue_instructions.source += auto_edit`, `hue_settings`
  += `auto_learn_edits`/`last_synth_edits_at`). Aplicada a prod.

## 🔧 Fixes de la sesión 2026-08-26 — SHIPPEADO + LIVE (sin migración)
- **Guardado persiste al recargar**: `guardarIntake`/`guardarSellingPoints` faltaba `revalidatePath` → Next servía
  caché vieja (parecía "no guardó", pero la BD sí tenía el valor). Arreglado.
- **Selling Points** movido de Detalles → **Rünna tools** (team-only). "Consideraciones" → **"Dile a H.Ü.E qué
  quieres"**, y el writer AHORA lo lee (`combinarConsideraciones`; antes leía `comentarios_creativo`, nulificado
  al consolidar en `peloteo_raw`).
- **Sync sin lead**: `missingBloqueante` (missingRequired − Asignación) → filas sin lead ya NO se bloquean, se
  marcan "sin lead" y siguen seleccionables (la UI espeja al import).
- **Legal pedir cambios**: `LegalLectura` (target `ideas/legal`) en portal + Vista cliente interna → el cliente
  ancla cambios sobre el legal como un plano; el equipo los ve/gestiona. Sin tabla nueva.
- **Rünna tools en Vista cliente**: la pestaña ya no desaparece — atenuada + EyeOff + "· interno", clickable.
- **Apps Script lee CHIPS de Drive**: `Code.gs` usa el servicio avanzado Sheets (`chipRuns.chip.richLinkProperties.uri`)
  — `getLinkUrl()` no expone los chips de archivo. Requiere el servicio "Google Sheets API" activado (ya lo hizo Pedro).


## 🔧 Fixes de brief + Apps Script + reglas de H.Ü.E (2026-08-25) — SHIPPEADO + LIVE
- **Referencias (`BotonReferencia`)**: se guardaban sólo en la 1ª edición. Causa: el editor se desmonta al colapsar
  en botón y re-sembraba el compare-and-set con el `valorInicial` ORIGINAL → conflicto espurio en la 2ª edición.
  Fix: sembrar del valor VIVO. Check chiquito → botón "Listo". (`7530f99`)
- **Campo Selling Points (nuevo)**: `ideas.selling_points` no tenía editor tras crear el brief. Añadido en la
  pestaña Detalles ("Resumen de brief"), **team-only** (oculto en Vista cliente/portal — prop omitida + gate
  `!lectura`). `guardarSellingPoints` (actions.ts): compare-and-set a nivel app + guard por id (NO array `.eq`,
  que PostgREST no compara fiable — `duracion` usa RPC por eso). Campo de un solo autor, TOCTOU documentado. (`7530f99`)
- **Apps Script lee ligas Drive** (`scripts/apps-script/Code.gs`, `a577d3b`): `readTab` lee
  `getRichTextValues().getLinkUrl()` SÓLO en la columna Referencias y anexa la URL escondida del chip/hipervínculo
  ("etiqueta\nURL" → botón "Ver referencia"). Antes gviz CSV y `getDisplayValues()` sólo veían el texto visible.
  **DiDi ya estaba en apps_script mode en prod** (env `SHEETS_SCRIPT_*` de hace 25 días); el bug era el Code.gs viejo.
  Live: nuevo deploy /exec (`AKfycby…`), `SHEETS_SCRIPT_URL` actualizada por CLI, secreto reseteado por Pedro,
  redeploy `ray21v4li`. Sync lista TODAS las pestañas.
- **H.Ü.E writer — reglas de selling points** (`hue-writer.ts`, `465aeae`): usa los selling points del brief si
  cumplen el KB, si no → elige del KB; reformular OK pero cifras/legales EXACTOS; en video 1er plano (3-5s) siempre
  un selling point o el servicio. Anti-invención ampliado a "brief O KB — nunca inventado".
- **Gates**: tsc·eslint·test:lib 365·test:db 288·test:sync 44·build. **Sin migración nueva.**
- **Pendiente**: LIVE-VERIFY (Pedro) de los 4 puntos. Si un chip Drive no da botón → fallback plain-URL.


## 📄 Plantilla "Copies" (temas con cuota) — 2026-08-24 — CONSTRUIDA + CLIENT-FACING — SIN pushear
- El único tipo de entregable sin plantilla (la página decía "no construido"). Forma: temas con cuota → el lead
  define TEMAS + cuántos copies; el copy llena headline+descripción, con contador X/cuota.
- **DECISIÓN Pedro 2026-08-24: Copies ES entregable al cliente** → va al portal para revisión/aprobación (S1=b).
- Migración **0046** (`copies_temas` + `copies`, RLS/trigger/grant explícitos + **triggers before_delete de limpieza
  de correcciones huérfanas**, como 0039; copies llega por tema_id → 2 saltos al idea_id). Actions: `TablaGuardable`
  (guardarCampo tabla-aware) + CRUD gateado. UI `documento-copies.tsx` con DOS modos: editable (CampoCopy autosave)
  y **lectura** (`CampoLectura` anclable), derivado de `verCliente` — reusado por el portal Y la Vista cliente interna.
- **Portal client-facing**: `cargarTareaPortal` carga temas+copies; `TareaPortal` +plantilla +temas; `CuerpoDoc`
  ramifica a `<DocumentoCopies>`. Round-trip de correcciones completo (cliente ancla pins → equipo ve/gestiona →
  re-revisión) reusa la maquinaria genérica: `comments.target_tabla` texto libre, `TABLAS_VALIDAS`/`CampoLectura`/
  `CorreccionTarget` ampliados con copies. Hero/DetallesTab/BottomBar ahora ramifican por `plantilla` (no `esEstatico`).
- Reap **2×Opus** (round-trip/auth + rendering/types): 1 SERIO de integridad DB (triggers de limpieza faltantes en
  0046 → arreglado + test) + 3 fugas del flag `esEstatico` binario (copies como "Video/Animado/0 s" → arreglado) +
  Copy-N index + Validar oculto para copies. Authz/round-trip/transiciones limpios.
- Gates: tsc·eslint·**test:db 282**·test:lib 359·build. **Migración 0046 NO aplicada a prod.**
- Pendiente: LIVE-VERIFY post-ship (crear una Copies real → portal → pin → re-revisión). Detalle + minors en todo.md.


## ✍️ H.Ü.E Fase 2 — writer "Crear guión" (2026-08-22) — CONSTRUIDO + REAPEADO, SIN pushear
- **Qué es**: H.Ü.E ESCRIBE el guión (video → planos) o el copy (estático → título/subtítulo/CTA) desde el
  brief de la tarea, consumiendo lo que Fase 1 hizo entrenable (Cerebro, KB, Biblioteca de Ganadores). Es el
  sucesor "escribir de cero" del flujo "arreglar un guión pegado". COEXISTE con "Pegar guión"/"Pegar copy"
  (se retira Pegar sólo cuando Crear esté perfeccionado — Pedro).
- **Arquitectura**: `src/lib/hue-writer.ts` (server-only) reúne el contexto (inputs de la tarea + reglas de
  marca vía `reglas_para_tarea` + legal sugerido + Cerebro/KB/Ganadores, TODO scopeado global+cliente+marca) y
  llama a Claude (sonnet-5, prompt cache-split). `writer-actions.ts` (`crearGuion`/`crearCopy`, gate
  canMoveStatus + assertCanActOnTask). Devuelve el MISMO `PlanoParsed[]`/`EstaticoParsed` que `extraerGuion` →
  cae en la preview→import ya probada (el humano revisa antes de escribir; `sinInventar` NO aplica a un writer).
  UI: `pegar-guion.tsx` gana `intent:"crear"`; el banner muestra ambos CTAs. `maxDuration=60` en la ruta.
- **Reap Opus**: 0 crítico de exfiltración; fix clave = fuga cross-cliente en el fallback de ganadores (filtro
  por slug de CLIENTE, sin fallback) + gatherer falla honesto (chequea `.error`). Menores aplicados.
- **Gates**: tsc·eslint·test:db 270·test:lib 359·build. SIN migración → ship = commit + push.
- **Pendiente**: "ship it" → live-test de la calidad de generación en el deploy (Pedro, tarea real).
  Day-1 escribe desde el brief aunque el Cerebro/KB/Ganadores estén vacíos; mejora al sembrarlos.

## 🧠 H.Ü.E HUB — Fase 1 COMPLETA (2026-08-21) — CONSTRUIDA + REAPEADA, SIN pushear (gate "ship it")
- **Qué es**: hace a H.Ü.E medible y entrenable. Etapa 1 = ESQUEMA + CAPTURA (plumbing going-forward).
  Etapa 2 = el HUB tab master-only (analítica + Cerebro/Ganadores/KB) + loop de auto-aprendizaje. Ambas
  construidas. Plan: `/Users/work/.claude/plans/dynamic-wondering-flame.md`; detalle en todo.md (sección 🧠).
- **Etapa 2 (el HUB)**: tab master-only en `admin-shell` (gate real `canHue` en cada action de `hue-actions.ts`).
  · **Inteligencia** (`hue-data.ts`): adopción de sugerencias (validador/ortografía), tareas limpias,
    correcciones/tarea, bounce, ciclo mediano, top selling points/legales (RPC SQL). Nav por mes. Empty-states honestos.
  · **Entrenamiento**: Cerebro (editor `hue_instructions` versionado + activar/revert + badge auto/manual),
    Biblioteca de Ganadores (guiones estrellados + contenido), KB upload (`greenlight-kb` + extracción
    unpdf/mammoth/txt-md → `extracted_text`), switch auto_learn + "Correr síntesis ahora".
  · **Loop** (`hue-sintesis.ts`): al estrellar (auto_learn on) o a mano, H.Ü.E mina patrones de los ganadores
    → propone lecciones `source='auto'` **INACTIVAS** (el master las activa) + auditoría `hue_adaptations`.
    Honestidad: "patrones observados", nunca causas. Seatbelt: visible + revert durable + switch.
  · Deps nuevas: `unpdf`/`mammoth` (server-only, 0 impacto bundle cliente). Migración 0045 extendida
    (`hue_settings.last_synth_at` + RPC `hue_top_snippets`).
- **Reap Opus (0 CRITICAL en ambas etapas)** — fixes clave: metric queries fallan honesto (no "mes vacío" falso);
  revert durable (dedupe vs todas las lecciones); auto-lecciones inactivas + debounce; snippets agregados en SQL.
- **Gates**: tsc·eslint·**test:db 270**·**test:lib 359**·build. Migración 0045 NO aplicada a prod.
- **Pendiente**: review de Pedro → "ship it" = `npm run migrate` (pin ybbrpqzbedaxsmotgtkh) + `npm run setup:storage`
  (bucket greenlight-kb) + commit (git add explícito) + push → live-verify del HUB (necesita las tablas en prod).
- **Migración 0045** (`20260821120003_greenlight_0045_hue_hub.sql`) — 5 tablas `produccion.hue_*`:
  `hue_suggestions` (adopción validador+ortografía) · `hue_instructions` (Cerebro versionado) ·
  `hue_kb_documents` (KB + `extracted_text`; seam `indexed_at`, sin pgvector) · `hue_top_performers`
  (ganadores estrellados) · `hue_adaptations` (auditoría auto). RLS master-only (`auth_role()='master'`),
  trigger updated_at explícito en hue_instructions, unique `(idea_id,correccion_id)` p/ idempotencia.
  **NO aplicada a prod** — `npm run migrate` (pin ybbrpqzbedaxsmotgtkh) va con el "ship it".
- **Bucket `greenlight-kb`** (privado) añadido a `setup-storage.mjs` — NO corrido aún (Etapa 2 lo usa).
- **Captura** (`src/lib/hue-log.ts`, service_role, `after()`-diferida, catches con console.error): adopción
  de sugerencias (offered→applied/ignored, upsert idempotente por corrección) en las acciones H.Ü.E; el
  cache split de validarCambios quedó intacto. **Estrella "top performer"** en Entregas (master/admin).
- **Gate `canHue`** (role==='master') en roles.ts. Tipos `Hue*` a mano en database.types.ts.
- **Gates**: tsc·eslint·test:db 267·test:lib 359·build. Reap Opus: 0 CRITICAL; findings menores aplicados
  (console.error en catches, after(), offered_at=primer-ofrecimiento). Deuda en todo.md.
- **Pendiente**: review de Pedro de Etapa 1 → "ship it" (migrar 0045 + setup:storage + push) → construir Etapa 2.

## 🟢 2026-08-21 — batch B/A/C/D (commit 0abcede, prod Ready + mig 0044 verificada)
- **Roles/flujo**: los botones de flujo se parten por DOER vs REVISOR. Especialista asignado
  (`isAssignee && !isLead`) ve Empezar/Mandar a revisión/Retomar; lead/admin/master sólo revisa
  (Aprobar/Mandar cambios/Enviar a cliente). Fuente: `lib/task-actions.ts` `actionsFor` + `esEspecialista`.
- **Legal del estático**: usa la MISMA biblioteca que el video (bloque `CortinillaCierre`, titulado
  "Legales", con sugerencia Phase-B). El campo libre `estaticos.legales_extra` se RETIRÓ de la UI
  (documento + Pegar copy); la columna DB sigue existiendo pero vestigial (no se escribe/muestra).
- **Borrado (master/admin)**: `eliminarTarea(cliente,ideaId)` (tarea actions) + `eliminarBrief(cliente,
  briefId)` (`briefs/actions.ts` nuevo), gate `canAdmin`, confirm 2 pasos. Cascada de FKs hace el resto
  (verificado). Storage de refs NO se limpia (huérfano inocuo).
- **Track nullable (admin/master = global)**: mig **0044** aplicada a prod. `track_members.track` ahora
  nullable; admin/master → null (vista global, sin equipo); lead/creative conservan track. Equipo tiene
  grupo "Vista global · Admins y Master"; el selector Track se oculta para roles globales; el invariante
  track↔rol se enforcea en `guardarMiembro`/`crearMiembro` + `provision`. Workload (performance/data)
  excluye no-doers. Tipos nullable en identity/soy/equipo/perfil.
- Estado datos prod (4 personas): admin Hermann Fink=null, master Runna Advertising=null, lead Nils
  Vera=normal, creative Christian M=normal.
- **Falta**: live-test en navegador de los 4 (Pedro como master).



## 🟢 GO-LIVE — login real en vivo (2026-08-20, commits 3918960 · 3dd1b13 · 7695455)
- **La app ya NO es pública.** `AUTH_ENABLED=true` en Vercel; el middleware (`proxy.ts`)
  exige sesión salvo en `/login`, `/auth`, `/portal/login`.
- **Identidad real**: Google OAuth (equipo `@runna.com.mx`) → `provisionAgencyLogin`
  (profile + track_member idempotente) → `getCurrentUser()` (JWT sub → profiles →
  track_member). Los shims `gl_soy`/`gl_view_as` quedaron gutted (delegan a la sesión).
  Clientes entran por magic-link **aprobado** (pending_invites → aprobar → generateLink).
  `unique@runna.com.mx` = master (sembrado). Migs **0041** (pending_invites) + **0042**
  (track_members_profile_uq) aplicadas a prod. Reset blank-slate corrido (754 filas, KEEP intactas).
- **Verificado en vivo**: Pedro entró como master; provisioning correcto en DB
  (profiles.role=master + track_member ligado). `/clientes` ahora DB-backed (fix 7695455)
  muestra 0/0/0 real tras el reset (antes: MOCK_CLIENTS congelado 4/37/3).
- **PENDIENTE (próxima sesión)**: test en vivo de Fases 2/3/4 — aprobar cliente→magic-link
  →binding portal · brief fail-safe (añadir agency people faltantes) · marca/user CRUD en Admin.

## 📊 Evaluación (v2 + por brief) — 2026-08-20 (commits 5d30cba mig 0040 · 5707ef5)
- Grade en DOS ejes: **Calidad** = avg de 9 criterios binarios por tarea (8 de contenido + **Resolución
  de cambios**) + **Eficiencia** (de rondas/tarea + cambios/ronda, curvas ajustables en `evaluacion.ts`).
  **Overall = 0.70·Calidad + 0.30·Eficiencia**.
- **Resolución** = 0 si alguna nota del autor tuvo rework fallido = el lead APLICÓ la sugerencia de H.Ü.E
  sobre una nota YA atendida. Se sella en `comments.hue_aplicado_at` (mig 0040) al aplicar. Going-forward:
  10 para todos hasta que fluyan H.Ü.E-applies. Se califica la ACCIÓN del lead, NO el veredicto crudo de H.Ü.E.
- **Desglose por brief**: la nota mensual se descompone por brief (persona → brief → tareas + criterios);
  la mensual es el promedio ponderado por nº de tareas → reconcilia. `puntuar()` reusado mes/brief.
- Lib pura + 356 tests. Curvas de Eficiencia (RONDA_IDEAL/PENAL, CAMBIOS_IDEAL/PENAL) y peso 70/30 son
  constantes AJUSTABLES en `evaluacion.ts` — calibrar con un mes real.

## 🤖 H.Ü.E "Aplicar sugerencia" (2026-08-20, commits b2725b7 + d6041f9)
- El lead puede APLICAR la sugerencia de H.Ü.E directo al campo. Flujo endurecido tras reap adversarial:
  el panel MUESTRA el texto completo que quedaría ("El campo quedaría así:") antes de aplicar (no un
  overwrite a ciegas) + guardas deterministas (no aplica si perdería negrita, si trae "(campo vacío)",
  o si len>8000). Aplica EN MEMORIA sin recargar (nonce `reseed` remonta el `<Campo>` uncontrolled),
  conservando los demás veredictos; el write server checa 0 filas (`.select`).
- **Modelo H.Ü.E = `claude-sonnet-5`** en las 3 llamadas (validarCambios, ortografia, extraerGuion),
  thinking off, tool-use forzado. validarCambios usa prompt caching (prefijo estable). NO bajar a Haiku
  (la calidad es-MX es el punto). Deuda: mismo caching en ortografia/extraerGuion (opcional, bajo volumen).
- Panel de correcciones interno: compacta los cambios resueltos y los abiertos >5 (pastilla, click expande).

## 🖥️ Portal del cliente — nav (2026-08-20, commit 2b2f0e3)
- Navegación consolidada en un HEADER STICKY compacto (`portal-nav.tsx`): dropdown de Brief (agrupado por
  mes) + "Ver detalle de tareas" (tabla Estado·Tarea navegable) + filtro por estado + flechas ← N/M →
  que recorren las tareas (filtradas) del brief. Layout de ANCHO COMPLETO (w-full, sin max-w central).
- 3 barras sticky apiladas sin colisión: nav `top-16` · PortalAcciones `top-[7.5rem]` · panel `lg:top-[11.75rem]`.
- Follow-ups abiertos (Pedro: "fine as is"): etiquetas "DD/MM for <mes>", pasada de móvil.

## ✨ Marca / nav (2026-08-19 cont2, commit 4b4701b)
- **Entregas**: el estado aprobado-por-cliente se muestra como **"Greenlit"** (verde neón del logo
  #00e676 + ✨, fila resaltada) en vez de "Entregado". `--greenlight`/`--greenlight-ink` ya en tokens.
- **Mi perfil** vive en el menú del avatar (Topbar, top-right), NO en la nav lateral (todos los roles).
  Regla: acciones de cuenta/sesión → avatar; nav izquierda = secciones. (El "¿Quién eres?/Ver como"
  sigue en el sidebar "Sesión" por decisión previa de Pedro.)

## 🔎 Reap full-platform (2026-08-19) + fixes aplicados
- Auditoría de 7 lentes en `tasks/reap-2026-08-19.md`. 0 CRITICAL reales; codebase sólido.
- Fixes shipeados (commits 8eaa140 / 10e54a9 / f6233e7, migración 0039): vuelta al cliente
  ("cambios listos + dónde"), quick wins (confirmaciones destructivas, avatar, error.tsx, Ver
  teclado), perf (scoping entregas/performance, signed URLs batched, contexto memoizado, sync
  maxDuration + fix duplicados), integrity (trigger de correcciones huérfanas + claim atómico
  de emails), roles (Mi perfil admin/master + tooltip H.Ü.E).
- **Launch-hardening set** (construir JUNTO con el login — ver todo.md): Gap 1 escritura del
  especialista → assignee-scoped · Gap 2 **lead → track-scoped** (DECISIÓN: lead departamental,
  admins agency-wide) · batch de seguridad (server actions re-chequean rol).
- **Diferidos con razón**: emoji-map lazy (cascada async), rewrite N+1 de import (test primero),
  S2 (scoring de board — decisión), S3 (advisory lock de ronda — migración con test de concurrencia).

## Camino a LIVE (aclarado con Pedro 2026-08-13; avance 2026-08-19)
TODO es pre-launch. Orden: agencia → **portal** → **login** → live.
- Lado-agencia: core loop ✅ · Performance (Workload+Evaluación) ✅ · Entregas ✅
  · Correcciones tipadas + hover cards ✅.
- **H.Ü.E v2 (validador de cambios) ✅**: aparece en el MOMENTO de revisar (tarea no
  entregada con cambios de la ronda), valida la ronda completa; por cada cambio un CHIP
  (verde/ámbar/rojo) con razón + **sugerencia** al hover; detecta que un cambio se hizo
  Y avisa el problema nuevo que dejó (gramática/concordancia). Advisory — el lead
  confirma. Migraciones 0034/0035 (tipos+field_edits) ya en prod.
- **Portal del cliente ✅ v2** (`/[cliente]/portal`): briefs + **riel visual de tareas**
  (no dropdown) + Vista cliente read-only + **cambios LOCALIZADOS** (el cliente
  selecciona texto → escribe, sin tipo de cambio; `client_change` anclado al campo) +
  **botón sticky Aprobar⇄Pedir cambios** (migración 0037: rpc_client_add_change /
  rpc_client_submit_changes). Emojis pintan (fallback en el font-stack). Efectos: glow
  de marca, riel escalonado, hover-lift, fade al cambiar. Preview-gated: confía en el
  slug de la URL — falta el binding cliente↔sesión.
  ⚠️ A CONFIRMAR en el deploy live: veredicto H.Ü.E del caso «elementos» + round-trip
  completo del cliente (dev local se puso inservible — ver session-log/lecciones).
- Falta para LIVE: **Login** (Google/@runna.com.mx → roles reales; hace desaparecer
  `view-as`/`soy` y da el binding real del portal) · dato **legal de Préstamos** (Pedro).
- **Going-forward** (se llenan con el uso real, no son bugs): Evaluación/autoría
  (`field_edits` empieza vacío; se llena cuando los especialistas trabajen bajo su
  identidad real, rol `creative`) · datos tipados de correcciones.
- Post-launch (no bloquean): Copies template · Slack notif · prefs notif por-usuario
  · F6 Notion (bloqueado en token) · API/MCP tokens · surface `approval` del cliente
  en la tarea (hoy sólo se muestra client_change) · rúbrica: score AI de craft.
- Nav: `RESERVED` en sidebar DEBE listar toda ruta general de primer nivel; al
  agregar una página general nueva, agrégala ahí (si no → sección de cliente fantasma).

## Sistema de diseño (design pass 2026-08-13)
- **`<Pill>`** (`src/components/ui/pill.tsx`) — pastilla ÚNICA de toda la app (reemplazó
  ~10 a mano). `parSolido(color)` garantiza texto ≥4.5:1 para cualquier color
  (oscurece el fondo si un tono medio no pasa). Modos: color dinámico soft/solid |
  status semántico. **Toda pastilla nueva usa `<Pill>`** — no re-inventar el contraste.
- **Contraste**: 0 fails AA medidos en el workspace (auditor por DOM en vivo). Tokens
  nuevos: `--status-warning`, `--deck-blue/orange`. Bandas deck oscurecidas a AA.
- **Motion**: reduced-motion-safe global (globals.css). Autoguardado animado+auto-descarte,
  pin de corrección pop, entrada de items, drag pickup/landing, acordeón rondas.
  **reload→optimista**: agregarPlano/importarGuion/importarEstatico devuelven la fila
  creada; el editor actualiza estado sin recargar (con fallback a reload si el refetch
  falla — ver lección refetch-tras-write).
- **Mobile nav** (<768px): `MobileNav` (hamburguesa + Sheet) en la Topbar.
- **Tipografía**: textarea principal 14px; piso 10px; `<h1>` por página; `.gl-eyebrow`.
- Pendiente cosmético: DRY de los 2 color-maps duplicados de correcciones (ya pasan AA).

## Qué es
App interna de producción de anuncios que reemplaza el Google Sheet de DiDi + el
deck de Google Slides de 45 slides. Multi-cliente. UI en español. Pipeline:
intake → workspace de trabajo → revisión → aprobación → enviar a cliente → (portal).

## Stack
Next 16.2 (App Router, `proxy.ts` no `middleware.ts`) · React 19 · Tailwind v4
(`oklch()`) · shadcn/ui · @dnd-kit · Supabase · Vercel
Fuentes: Poppins (títulos) · Inter (datos) · Geist Mono (nombres de archivo) ·
Unbounded (wordmark)

## Desplegado
- **https://runna-greenlight.vercel.app** — dominio de prod ACTUAL (alias → deploy más reciente).
  Login ON (`AUTH_ENABLED=true`) → `/` da 307 a `/login`. ⚠️ El viejo `runna-command-center.vercel.app`
  ya NO sirve (404) — corregido 2026-08-21 al verificar el ship del HUB.
- Deploy: **`git push main` → auto-deploy** (Vercel git-connected). Funciona
  porque el repo es **PÚBLICO** — se hizo público justo para esto (Hobby NO
  auto-deploya repos PRIVADOS de org; ver lección). Verificado 2026-08-06: un
  push genera solo el deploy `…-git-main-…`. `npx vercel --prod --yes` queda
  como respaldo manual.
- Repo: **`github.com/Runna-Ad/runna-command-center`** — público (org Runna-Ad)

## Base de datos (LIVE)
- Proyecto Supabase **S.P.A.M** `ybbrpqzbedaxsmotgtkh`, esquema propio **`produccion`**
- S.P.A.M vive en `public` (42 tablas) y NO se toca — `npm run check:isolation`
  mata cualquier migración que mencione `public.`/`storage.` (por eso el bucket
  se crea fuera de migraciones). **S.P.A.M verificado idéntico**: 42 tablas / 31
  migraciones / 6 usuarios, antes y después de todo.
- Migraciones: ledger propio en `produccion._migrations`, `npm run migrate`
  (NUNCA `supabase db push` — dañaría el historial de S.P.A.M).
- **Migraciones aplicadas 0001–0028** (OJO: **no existe 0017** — era la de
  Notion, que se difirió; la numeración salta 0016→0018. F6/Notion cuando se
  haga usa un timestamp NUEVO, no 0017). Últimas: **0022** `rpc_crear_brief`,
  **0023** enum `app_role += 'master'`, **0024** `track_members += role/email/
  slack_user_id` + helpers RLS con master, **0025** canal `email` activo +
  `track_members.notify_email`, **0026** `rpc_notificar_brief`, **0027** enum
  `app_role += 'specialist_lead'` (archivo propio), **0028** correcciones
  localizadas: columnas de destino en `comments` (target_*, ronda, atendido_at/by,
  resolved_member_id) + transición `in_corrections→under_review` + `is_team()` +=
  specialist_lead + RPCs rpc_add_correction/send_corrections/return_review +
  rpc_task_approve ahora CIERRA la ronda (resuelve lo pendiente), **0029**
  correcciones ancladas a selección (comments += target_quote/start/end;
  rpc_add_correction extendido, firma vieja de 9 args DROPeada), **0030**
  `rpc_import_planos(idea_id, planos jsonb, modo)` — inserta N planos de un guión
  pegado en UNA transacción (replace/append; read_time por trigger). Aplicada a
  prod 2026-08-11, **S.P.A.M byte-idéntico 42/31/6**. La próxima migración usa un
  timestamp NUEVO ≥ 20260812120001.
- **Storage**: bucket privado `greenlight-referencias` (creado con
  `npm run setup:storage`, fuera de migraciones). Imágenes se sirven por signed
  URL firmada por render. Verificado: privado (acceso público = 400).

### Datos actuales (cliente DiDi, marcas Card + Préstamos)
briefs=2 · ideas(tareas)=32 · assets(archivos)=227 · track_members=14
snippets legal=1 (sólo Card) · references(links del sheet)=15

## Integraciones
- **Google Sheets** vía Apps Script (solo lectura). `scripts/apps-script/Code.gs`.
- **Anthropic (H.Ü.E)** — dep `@anthropic-ai/sdk`; `ANTHROPIC_API_KEY` en Vercel
  env (falta en `.env.local` → H.Ü.E no corre en localhost). Server action
  `extraerGuion` (Sonnet 5, thinking off, tool-use forzado `emitir_planos`) — extractor
  format-agnostic que lee CUALQUIER formato pegado → PlanoParsed[]. Reemplazó a
  `normalizarGuion`. (Pedro: la key está bien, NO rotar.)
- **Vercel env**: SHEETS_SCRIPT_URL/SECRET, NEXT_PUBLIC_SUPABASE_URL/ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY, GMAIL_USER/APP_PASSWORD, APP_URL, ANTHROPIC_API_KEY.
  (Falta NOTION_TOKEN/NOTION_DB_ID para F6.)
- `.env.local` local tiene las mismas; los scripts node lo cargan a mano.
- **URL de prod: UNA sola canónica** `runna-command-center.vercel.app` (git-connected,
  se refresca en cada push). Se eliminó el alias manual `-pedro-3338-` que se
  quedaba stale (era caché-inmune, causó confusión). Ver lección Vercel-alias.

## Nuevo 2026-08-12
- **Importador "Pegar guión" / "Pegar copy"** (Feature 2, shipped): CTA prominente
  ARRIBA del cuerpo del workspace → diálogo (alto fijo, body scrollable, header/
  footer pinned) → pega el guión del deck → vista previa EDITABLE (una tarjeta por
  plano, radio Reemplazar/Agregar) → confirma → escritura atómica (`rpc_import_planos`).
  Parser determinista `src/lib/guion.ts` (parseGuion/parseEstatico/contarPlanos).
  `limpiarPegado` des-markdowniza (tabla/negrita/`<br>`) Y emojifica (mapa COMPLETO
  de 3.4k shortcodes `src/lib/emoji-map.ts`, generado por scripts/gen-emoji-map.mjs) →
  el deck de DiDi con emoji parsea DETERMINISTA (sin IA). Para formatos raros o 0
  planos, botón **"Deja que H.Ü.E lo lea"** → `extraerGuion` (extractor format-agnostic,
  Opción 1) → PlanoParsed[] estructurado, guardarraíl `sinInventar` (SUBMULTISET:
  no inventa/altera; omitir lo caza la vista previa). Verificado en prod por Pedro
  (guión DiDi + emoji). Estático: parser PROVISIONAL (falta muestra real de Pedro).
- **Descartar una corrección fijada** (revisor cambió de opinión): botón trash con
  confirmación en dos pasos en el panel; server action `descartarCorreccion` (hard
  delete, la ronda se auto-cura). Y **"Pedir cambio" de campo entero sólo en campos
  VACÍOS** (con texto, la selección lo cubre; un campo vacío igual se puede flaggear).

## Qué funciona (workspace COMPLETO — construido esta sesión)
- **Clientes** → espacio por cliente.
- **Sincronizar**: descubre/clasifica/previsualiza/importa del sheet. Dedup probado.
- **Briefs** = vista de BUNDLES: card por brief con sus tareas; clic → workspace.
- **Tablero** = kanban por estado, interactivo (arrastrar, asignar, filtros).
  Las tarjetas YA NO tienen botones de flujo (drag + auto-move); traen ícono de
  tipo de asset. "Mover" para teclado/móvil.
- **Workspace de tarea** (`/[cliente]/tareas/[id]`) — la pieza central:
  - Flechas ← n/N → para recorrer el bundle (lib/bundle.ts = fuente única).
  - Barra de acciones arriba y abajo: Empezar → Mandar a revisión → (lead)
    Aprobar/Mandar cambios → Enviar a cliente. Botón con gradiente. Auto-move al
    escribir (rpc_task_start).
  - **Rünna details** (colapsable, SÓLO INTERNO — no se construye para rol
    cliente): Nombres de archivo (calculados por la BD) + Lead/Team + Link de
    entrega prominente (de ahí saldrá el botón "Abrir entregable" del cliente) +
    Prioridad.
  - **Cabecera fusionada**: logo marca + topic + Content Type (ícono) + Channels
    + Formato ratio (pastillas) + Duración (editable, reescribe los nombres) +
    Resumen del brief + Trend + Notas.
  - **Campos pre-llenados del SHEET** (editables): Resumen ← Concepto ·
    Trend ← Referencias (como "Referencia 1, 2…" clicables) · Notas ← Peloteo.
    Comentarios Leads → subtítulo bajo el título (interno). Cualquier URL en
    texto mostrado es clicable (`<Linkify>`).
  - **Cuerpo**: planos (guión) con Acción/Copy in/SFX/GFX/Edición/Diálogo +
    referencias drag&drop por plano (imágenes suben, videos por link) + read-time.
    Estático: COPY IN (título/subtítulo/CTA) + dropzone de imágenes.
  - **Reglas contextuales** (chips con tooltip del detalle), agrupadas por plataforma.
  - **Cortinilla de Cierre**: legales de biblioteca (picker) + texto libre.
  - **Preview del cliente** en vivo: Resumen/Trend/Notas, Acción rotulada,
    diálogo por locutor `(Actor)` → **Actor:** "…", planos separados, cortinilla.
- **Nombres de archivo**: contrato TS↔BD probado con 75 combos.
- **Diseño**: 2 pases de Design God Mode (elevación/sombras teñidas + radio de
  marca en primitivas + EmptyState + skeletons + login pulido). Contraste AA.
- **Constructor de brief nuevo** (`/[cliente]/briefs/nuevo`): pool de tarjetas +
  3 gestos de duplicación (copiar campo · copiar varios · duplicar tarjeta).
  Persiste atómico vía `rpc_crear_brief`. Lógica pura en `src/lib/intake-crear.ts`.
- **Referencias al cliente**: el preview "Como lo verá el cliente" muestra las
  imágenes/videos de referencia por plano/estático (signed URL).
- **Panel `/admin`** (5 pestañas): Perfil · **Equipo/roles** (track_members con
  rol/email/slack, edición inline, Master Builder, carga, alta/desactivar) ·
  **Actividad** (feed de status_events) · **Integraciones** (estado del Sheet +
  rotar secreto + Notion) · **Biblioteca** (CRUD de snippets por kind). Sin login:
  atributos de persona en track_members, listo para el login vía profile_id.
- **Correcciones localizadas** (0027/0028, shipped 2026-08-10): el Dept Head/Lead
  fija un cambio a un CAMPO exacto (pin sobre el campo + tooltip hover/tap/foco);
  el especialista lo ve en contexto + en el panel "Correcciones" (agrupado por
  ronda, rojo/ámbar/verde), lo marca atendido y **Devuelve a revisión** (dispara
  el aviso al lead). El botón del revisor MUTA: Mandar a correcciones → Aprobar →
  Enviar a cliente. Reusable tal cual para el portal del cliente (mismo modelo,
  kind `client_change`, entra por `published→in_corrections`). Piezas:
  `lib/correcciones.ts` (puro) · `components/tarea/correcciones/*` (Provider, panel,
  campo-correcciones) · `<Campo>` consume el contexto · `AccionesTarea` muta ·
  server actions en `tareas/[id]/correcciones-actions.ts`.
  - **Anclaje por SELECCIÓN** (0029, shipped 2026-08-11): el revisor resalta un
    substring de un campo y la corrección se ancla a esa FRASE (target_quote = ancla
    de record; offsets best-effort). Resaltado en vivo por MIRROR OVERLAY detrás del
    <textarea> transparente (`<mark>` por estado, re-encuentra el quote por contenido;
    se apaga si el texto cambia). Helper puro `resaltadosEnTexto`. El botón de campo
    entero sigue para notas de campo. Desktop-first.
- **Rol `specialist_lead`** (Especialista Lead): un especialista que ADEMÁS asigna
  tareas (canAssign) — NUNCA revisa/aprueba. En roles.ts + is_team (no is_lead).
  Cadena: Dept Head/Lead (revisa+aprueba+envía) · Especialista Lead (asigna) ·
  Especialista (trabaja).
- **Email de notificación REDISEÑADO** (`lib/email-template.ts`, 2026-08-10):
  branded Greenlight, chip+acento neón por tipo (aprobada=verde-logo en pastilla
  oscura), CTA inteligente (email de tarea → la tarea; brief → /mi-trabajo), UTF-8.

## Qué NO existe todavía
- **F6 · Biblioteca Notion** — bloqueado en el token de integración + link de la
  base. La tabla destino (`snippets`) + el picker + el CRUD de Biblioteca en
  /admin ya existen; falta cablear la sincronización con Notion.
- **Emails de notificación — YA FUNCIONAN** (Gmail SMTP, sender `unique@runna.
  com.mx`, dispatcher inline con `after()` en el Vercel de Greenlight). Salen en
  nuevo-brief · a-revisión · cambios · aprobada · enviada-al-cliente. **Falta
  sólo llenar el `email` de cada persona en /admin ▸ Equipo** (hoy vacíos → esas
  notificaciones se marcan `skipped`). NOTA (Pedro): esto es POR DISEÑO — al salir
  a live la columna `email` se reinicia vacía y se llena SOLA cuando cada quien
  hace login. No es pendiente ni se llena a mano. Env
  (Vercel + `.env.local`): `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `APP_URL`.
- **Slack** de notificación — pendiente (el enum de canal lo contempla; falta el
  sender). Prefs por-evento por usuario — pendiente (hoy un toggle global
  `notify_email` por persona).
- **API / MCP con tokens para Claude** — no existe (greenfield: API + auth de
  token + tabla hasheada). Es su propia fase.
- **Portal del cliente** — no construido (fuera de alcance). "Enviar a cliente"
  deja la tarea en `published` pero el cliente aún no tiene dónde verla. `portal/
  page.tsx` lo dice honestamente.
- **Copies** — plantilla no construida (la página lo dice; no existe en el deck).
- **Login** — apagado a propósito hasta pre-lanzamiento (`AUTH_ENABLED` listo).
  Con auth off, identidad = cookies `gl_soy`/`gl_view_as` resueltas en servidor.
- **Menú lateral**: Carga, Entregas por revisar, Entregas siguen apagados con
  "Pronto" (no navegan). **Configuración YA está construido** (se le quitó
  `soon`). Al construir cada uno de los otros, quitar su `soon:true` en
  `src/components/shell/sidebar.tsx`.
- **Sin backward-move** sin un lead mientras auth esté off.

## Riesgos / deuda conocida
1. ~~SIN REMOTO GIT~~ **RESUELTO (2026-08-06)** — repo en
   `github.com/Runna-Ad/runna-command-center` (org Runna-Ad, público) y
   **Vercel git-connected**: `git push main` auto-deploya a producción (verificado).
   La CLI sigue como respaldo. NOTA: el repo es público — no commitear secretos.
2. `SHEETS_SCRIPT_SECRET` estuvo público ~4 min (ya corregido) — rotar.
3. ~~App pública sin login~~ **RESUELTO (2026-08-20)** — login real en vivo
   (`AUTH_ENABLED=true`). Ver sección "🟢 GO-LIVE" arriba. Queda el test en vivo de
   Fases 2/3/4 para la próxima sesión.
4. `database.types.ts` es manual, no generado.
5. `src/lib/vocab.ts` es copia hardcodeada de vocab_terms/track_members (2 fuentes).
6. Sólo el legal de **Card** está sembrado; falta el de **Préstamos** (dato
   financiero — lo da Pedro, o llega por Notion).
7. `references.url` es único GLOBAL (sin client_id) — coherente hoy, decible
   antes del 2º cliente.
8. **PROD-SAFETY**: NO usar datos de prod como campo de pruebas. Un par de veces
   escribí en campos reales para verificar y tuve que restaurar desde el sheet.
   Probar con dev local o borrar sólo por id propio verificando conteo.

## Tests
`npm test` → isolation + lib (124) + db/PGlite (141) + sync/red en vivo (44).
Los de red (sync) son intermitentes por naturaleza — re-correr antes de investigar.
