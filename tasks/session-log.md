# Session log — Greenlight · by Rünna

## 2026-08-20 (cont) — Evaluación v2 (Resolución + Eficiencia) + desglose por brief
Continuación de la misma sesión. 2 commits más, ambos deploy verde.

**Lo que hicimos:**
- **`5d30cba` — Evaluación v2 (migración 0040 aplicada a prod).** El grade pasa a DOS ejes:
  **Calidad** = promedio de 9 criterios binarios (los 8 de contenido + **"Resolución de cambios"**
  nuevo, grupo "Proceso") + **Eficiencia** (de rondas/tarea + cambios/ronda, curvas ajustables).
  **Overall = 0.70·Calidad + 0.30·Eficiencia**. "Resolución" = 0 en una tarea si alguna nota del
  autor tuvo un REWORK FALLIDO: el lead aplicó la sugerencia de H.Ü.E sobre una nota YA ATENDIDA (su
  arreglo fue malo). Captura: `comments.hue_aplicado_at` (migración 0040, nullable, sin backfill),
  sellado en `aplicarSugerencia`. Going-forward: Resolución = 10 hasta que se apliquen H.Ü.E fixes.
- **`5707ef5` — desglose POR BRIEF (sin migración).** La nota mensual se descompone por brief:
  persona (nota mensual) → una nota por brief → tareas de las que salió (chip rojo=con notas,
  verde=limpia) + criterios + proceso del brief. Refactor: `puntuar(ideaIds,...)` reusado para el mes
  y para cada brief → la mensual es el promedio ponderado por nº de tareas (reconcilia). Sin captura
  nueva (la tarea ya sabe su brief).
- **2 mockups (show_widget)** para iterar el diseño con Pedro: (1) el board con 5 usuarios/10 tareas —
  ¿se ve el grade + el porqué?; (2) el desglose por brief. Pedro validó ambos antes de construir.

**Estado actual:** todo deployado y verde. Working tree limpio (sólo los HANDOFF-*.md de Pedro,
sin trackear, intactos). Nada sin pushear.

**Decisiones (Pedro):**
- **Calificar la ACCIÓN del humano, no la OPINIÓN de la IA**: Resolución cuenta SÓLO cuando el lead
  APLICA la sugerencia de H.Ü.E (decisión deliberada), no el veredicto crudo parcial/no (advisory/
  ruidoso, a veces ámbar aceptado). Binaria, atribuida al autor de la nota, sólo si estaba atendida.
- Eficiencia con curvas ajustables (defaults); peso **70/30** quality-heavy.
- Brief: mantener la nota mensual como titular + desglose por brief (no brief-first); reconcilia.

**Decisión PENDIENTE (Pedro no cerró): ¿reap masivo antes del go-live?** Mi recomendación firme:
NO hacer un reap general ahora (código ya muy reapeado: full reap 08-19 + cada feature esta sesión;
un reap ahora re-flaggearía lo intencional-abierto = ruido). En su lugar: reapear los CAMBIOS del
go-live adversarialmente (RLS/auth/scoping) mientras se construyen + verificación de aislamiento tras
el lockdown. La próxima sesión = **GO-LIVE**.

**Pick up next session — GO-LIVE:**
- Arrancar del **launch-hardening set** en todo.md: Gap 1 (escritura especialista → assignee-scoped),
  Gap 2 (lead → track-scoped), batch de seguridad (server actions re-chequean rol) — TODO junto con el
  LOGIN (auth). Portal ya está listo (era la última pieza pre-launch). Reapear el lockdown adversarial.
- Follow-ups menores en espera: etiquetas de brief "DD/MM for <mes>", pasada móvil del nav del portal,
  caching en ortografia/extraerGuion, de-dupe de ids de veredicto duplicados.

**Cambios de entorno:** migración **0040** aplicada a prod (`comments.hue_aplicado_at`). Sin deps nuevas.

## 2026-08-20 — H.Ü.E "Aplicar" (no-reload + reap) + rediseño nav del portal
Tres bloques, 3 commits, todos shippeados con deploy Vercel verde. Sin migración, sin deps nuevas.

**Lo que hicimos:**
- **`b2725b7` — H.Ü.E Aplicar sin recargar + panel compacto + caching.** (1) "Aplicar sugerencia"
  dejaba de recargar la página: parchea el campo EN MEMORIA (setPlanos/setEstatico) y conserva los
  demás veredictos (antes el `reload()` los borraba → había que re-correr H.Ü.E, llamada pagada).
  Requirió INVERTIR el anidamiento de providers en la página de tarea (Workspace AFUERA, Correcciones
  ADENTRO) para que el contexto de correcciones pudiera `useWorkspace()`. (2) Panel interno: los
  cambios resueltos y los abiertos más allá de los 5 primeros se COMPACTAN a una pastilla (click para
  expandir). (3) Prompt caching en `validarCambios` (prefijo estable en un content-block con
  cache_control) — se mantiene Sonnet 5.
- **`d6041f9` — reap del flujo H.Ü.E (Pedro: "Aplicar no mostró el cambio").** Reap adversarial (Opus)
  de todo el flujo validar→aplicar→display. Root cause del reporte: el `<Campo>` es uncontrolled
  (siembra su textarea una vez) → parchear el workspace no lo repinta → FIX: nonce `reseed` por campo
  que fuerza el remount de ese Campo (también resetea el baseline del autosave = mata el falso
  "alguien más cambió este campo" que halló el reap). CRITICAL: `aplicar` era un overwrite de TODO el
  campo a ciegas (el lead sólo veía la sugerencia de 1 línea) → ahora el panel MUESTRA el texto
  completo antes de aplicar + guardas deterministas (negrita perdida / "(campo vacío)" / len>8000 →
  no se ofrece). Serios: write de 0 filas reportaba ok (→ `.select("id")` + error); compactación XOR
  posicional colapsaba tarjetas solas (→ intención absoluta). + minors.
- **`2b2f0e3` — rediseño nav del portal (mockup de Pedro).** Challenge protocol PRIMERO: confirmé que
  los screenshots eran el TARGET (no el código actual — grep lo probó). Nuevo `portal-nav.tsx`: header
  STICKY compacto = logo + dropdown de Brief (agrupado por mes) + "Ver detalle de tareas" (tabla
  Estado·Tarea navegable) + filtro por estado + flechas ← N/M →. Ancho completo (portal-shell w-full).
  Restack de las 3 barras sticky sin colisión. Verificado live (dropdown abre, pager 1/2, 0 errores).

**Estado actual:** todo deployado y verde en prod. Working tree limpio, nada sin pushear.

**Decisiones:**
- **Modelo H.Ü.E = Sonnet 5, no bajar a Haiku** — la calidad (detectar el error es-MX NUEVO) es el
  punto; Haiku degrada justo ahí y cada llamada es ~1-2¢. El ahorro real = fix del reload (mata las
  re-corridas) + prompt caching, no cambiar de modelo.
- **Una acción de IA que ESCRIBE = preview al humano + guarda determinista**, nunca overwrite a ciegas.
- **Portal ancho completo confirmado** (Pedro); "fine as is for now" para los follow-ups.

**Pick up next (nada urgente, Pedro cerró la sesión conforme):**
- Follow-ups del portal SI Pedro los pide: etiquetas de brief "DD/MM for <mes>" del mockup, y pasada
  de móvil al nav sticky (verificado sólo a desktop 1400px).
- Deuda anotada (baja prob): de-dupe de ids de veredicto duplicados en validarCambios.
- Diferidos de siempre: caching en ortografia/extraerGuion (misma técnica), emoji-lazy, rewrite N+1
  import, S2/S3. Launch-hardening set + LOGIN siguen siendo el camino a LIVE.

**Cambios de entorno:** ninguno (sin migración, sin deps, sin env vars).

## 2026-08-19 (cont2) — Greenlit + Mi perfil al avatar

Commit **4b4701b** (sin migración, verificado live).
- **Entregas → "Greenlit"**: el estado aprobado-por-el-cliente (delivered) pasó de "Entregado" a
  **"Greenlit"** con el verde neón del logo (#00e676 vía `<Pill>`, tinta oscura auto-AA) + ✨, y la
  fila resalta (pleca + tinte verde). Copys de conteo/descripción al día. El momento de marca que
  Pedro quería al aprobar el cliente.
- **Mi perfil → menú del avatar (top-right)**: sale de la nav lateral (todos los roles) y vive en un
  DropdownMenu sobre el avatar de la Topbar. `canSee(mi-perfil)` se mantiene para el guard de la
  página. **PEDRO_OVERRIDE** (lessons.md): corrige la sesión pasada (lo había metido al sidebar) —
  acciones de CUENTA van en el avatar, la nav lateral es para secciones de trabajo.
- Verificado LIVE (Greenlit en Entregas; Mi perfil abre desde el avatar). Gates: tsc·eslint·build·lib 328.
- **Sin pendientes nuevos.** Sigue vigente el launch-hardening set del (cont.): Gap 1 (escritura del
  especialista → assignee-scoped), Gap 2 (lead → track-scoped, decisión), batch de seguridad; +
  diferidos (emoji-lazy, rewrite N+1 import, S2 scoring, S3 lock de ronda). Login = gran bloque a LIVE.

## 2026-08-19 (cont.) — Vuelta al cliente + reap full-platform + fixes + revisión de roles

Sesión larga de continuación. Commits a prod: **8eaa140** (vuelta al cliente), **10e54a9**
(fixes de reap + migración **0039**), **f6233e7** (roles + tooltip). d5bfb2c (H.Ü.E analiza
cambios del cliente + badge color de marca) se shipeó al arrancar. Todo con "ship it" explícito.

**Qué se construyó:**
- **Vuelta al cliente "cambios listos + dónde"** (8eaa140, sin migración): cuando una tarea
  vuelve al cliente tras una ronda (published con client_change aplicados) el portal ya no se ve
  igual que una idea nueva. Badge "Cambios listos" en la lista, banner en la barra, resaltado
  VERDE a nivel campo + chips "Cambio que pediste — aplicado: «…»", y panel read-only
  "Cambios que pediste — ya aplicados" (por ronda, con Ver→salto). Espejo del panel interno.
  Verificado LIVE en DiDi/SPAPVOYSHOPPINGFUT. Reap (Opus) cazó 1 bug real: la query del badge
  (conRonda) era más laxa que la de contenido (revisiones) → badge sin nada que mostrar; alineadas.
- **Reap FULL-PLATFORM** (7 agentes en paralelo: correctness, security, DB, perf, a11y, ui/ux,
  ts-safety). Reporte en `tasks/reap-2026-08-19.md`. 0 CRITICAL reales; ~18 SERIOUS, ~20 MINOR.
  Codebase sólido (0 `any`, boundary de cliente correcto, code↔schema limpio, isolation limpio).
- **Fixes de reap** (10e54a9 + migración 0039) — Pedro eligió 3 de 4 batches:
  · Quick wins: botón "Ver" teclado en panel-revisiones, confirmación 2-pasos en 3 acciones
    destructivas (borrar plano / Aprobar cliente / quitar referencia), avatar deriva de `soy`
    (no más "PV"), error.tsx + global-error.tsx.
  · Perf: entregas/performance scopeados (no full-table por cliente), createSignedUrls batched,
    CorreccionesProvider memoizado (mata re-render storm), sync maxDuration=60 + fix de error
    tragado en staged_rows (P1b, evita re-import duplicado).
  · Integrity (0039): trigger BEFORE DELETE limpia correcciones huérfanas al borrar/re-importar
    planos (desbloquea cierre de ronda) + claim atómico en dispatchPendingEmails (no doble-envío).
- **Revisión de roles + fixes** (f6233e7): mapa completo de qué ve/hace cada rol (verificado
  contra el código). Fix: "Mi perfil" para admin/master (NAV_ALL). Fix: tooltip de H.Ü.E se
  cortaba en el panel derecho → anclado a la derecha (right-0).

**Decisiones de Pedro (grabadas en lessons.md):**
- **LEAD = DEPARTAMENTAL** (dueño sólo de SU track); los aprobadores agency-wide son los ADMINS.
  → al encender auth, scopear las acciones del lead por track (hoy agency-wide). Ver launch-hardening.
- Cambios del cliente = correcciones de PRIMERA CLASE (mismo lifecycle; sólo cambia que dice
  "Cliente"); H.Ü.E también los analiza (override de sesiones previas).
- Scope de la reap: 3 batches sí, seguridad diferida. Emoji-lazy + rewrite N+1 de import diferidos.

**Estado actual:** todo en prod, deploys verdes. Migración 0039 aplicada (isolation verificada:
public_tables 42 / auth_users 6 sin cambio; ledger 37→38). Gates: tsc·eslint·build·lib 328·db 245.

**Retomar la próxima sesión (prioridad):**
1. **Launch-hardening set** (construir JUNTO con el login, ver todo.md): Gap 1 (escritura del
   especialista → assignee-scoped), Gap 2 (lead → track-scoped, decisión de Pedro), batch de
   seguridad diferido (server actions que re-chequean rol — priorizar crearBrief + snippet legal).
2. **Diferidos con razón**: emoji-map lazy (cascada async en funciones puras con test), rewrite
   N+1 de import (escribir test harness PRIMERO), S2 (decisión de scoring: ¿board "pedir cambios"
   cuenta en rúbrica?), S3 (advisory lock de ronda como migración propia con test de concurrencia).
3. Login (Google/@runna.com.mx) sigue siendo el gran bloque hacia LIVE.

## 2026-08-19 — Portal v2 (cambios localizados del cliente + riel + efectos) + H.Ü.E v2 + perf

5 commits a prod (c90b17b, 6903b48, a6237f5, 8282125, fd25f99), migración **0037**
aplicada. Todo con "ship it" explícito de Pedro por pieza. Pedro probando en el
deploy LIVE toda la sesión.

**Qué se construyó:**
- **Perf de la página de tarea** (c90b17b): el waterfall de queries del loader se
  batchea en UN `Promise.all` (~5 viajes en serie → 1); las signed URLs de imágenes
  se firman en paralelo (antes 1 viaje por imagen). + botón H.Ü.E también en la barra
  sticky de arriba.
- **H.Ü.E como compañero de revisión** (6903b48): antes se ataba a "correcciones sin
  cerrar" y DESAPARECÍA justo cuando el lead iba a revisar (todo ya confirmado).
  Ahora aparece si el revisor está en una tarea no-entregada con cambios de la ronda,
  y valida la ronda COMPLETA (confirmados incluidos). Huérfanas ya confirmadas dicen
  "✓ Ya confirmado" (antes seguían pidiendo "revisa si ya quedó"). Toast legible.
- **Cambios LOCALIZADOS del cliente** (a6237f5, migración 0037): el cliente pide
  cambios IGUAL que un lead (selecciona texto → escribe), pero SIN tipo de cambio.
  `CampoLectura` compartido gana rama `esCliente` (ruta del revisor byte-preservada);
  `CorreccionesClienteProvider` reusa el mismo contexto. Cada cambio es un
  `client_change` localizado (rpc_client_add_change). **Botón sticky que cambia**:
  "Aprobar" verde por defecto → "Pedir cambios (N)" al anotar ≥1 (rpc_client_submit_changes
  resuelve pins + published→in_corrections). Reemplaza la tarjeta de abajo. + **fallback
  de emoji en el font-stack** (no pintaban en el portal).
- **H.Ü.E v2 — más listo + accionable** (8282125): añade `sugerencia` por cambio;
  el prompt lee la nota como el cambio deseado (cita «X» + petición 'Y' = cambia X por
  Y) y — el valor de usar IA — detecta PROBLEMAS NUEVOS que el cambio introdujo
  (concordancia/gramática) aunque esté hecho (caso «elementos»→«elemento» deja
  "elemento importantes"). Veredictos como CHIPS (verde/ámbar/rojo) en el panel Y en
  las tarjetas hover; razón + sugerencia al pasar el ratón. Advisory.
- **Riel de tareas + efectos** (fd25f99): dropdown → RIEL de tarjetas visuales (logo,
  nombre, chip de estado, activa con anillo del color de marca del cliente + "Revisando
  →"). Glow de marca en el header, entradas escalonadas, hover-lift, fade al cambiar de
  tarea, flip del botón sticky. Todo bajo el kill-switch global de reduced-motion.

**Decisiones de Pedro (grabadas):**
- El cliente pide cambios EXACTO como el lead, sólo sin el selector de tipo.
- Botón sticky arriba que se transforma Aprobar⇄Pedir cambios (no dos botones).
- H.Ü.E debe ser LISTO: detectar que un cambio se hizo Y avisar el problema nuevo que
  dejó (gramática), y dar sugerencia. Veredictos como chips con razón al hover.
- Pins del cliente se guardan al instante (sobreviven reload); "Pedir cambios" los envía.

**Verificado:** tsc/lint/build en verde por pieza; PGlite +8 asserts para las RPC del
cliente (234 pass); riel + rama esCliente confirmados por DOM+screenshot; ruta del
revisor re-verificada intacta tras tocar CampoLectura compartido. H.Ü.E v2 dio buenos
per-change (sugerencias + mezcla justa de veredictos) en una corrida temprana.

**A CONFIRMAR EN EL DEPLOY (dev local se puso inservible — ver lección):** (1) el
veredicto de H.Ü.E en «elementos» debe leer "hecho" + sugerir "el elemento importante";
(2) el round-trip completo del cliente (anota pin → Pedir cambios → llega al equipo).

**Time sink:** ~25 llamadas peleando con el preview pane / turbopack (innerText daba
85 chars, screenshots en blanco, caché de dev servía módulos viejos). `npm run build`
fue el gate real. Lecciones logueadas.

## 2026-08-18 — Correcciones + Performance/Evaluación + Portal del cliente + H.Ü.E validator

Sesión enorme (12 commits, migraciones 0034/0035/0036 a prod). Todo shippeado tras
gate + verificación en navegador + reap Opus, con "ship it" explícito de Pedro por
cada pieza.

**Qué se construyó (de arriba a abajo):**
- **Correcciones**: las correcciones en Vista cliente ahora son TARJETAS DE HOVER
  (no cajas). Cada cambio interno lleva TIPO obligatorio (los criterios del rúbrica).
  Reencuadre de "Sin ubicar" → "El texto cambió — revisa si ya quedó" (cuando el
  quote desaparece porque SÍ se hizo el cambio). **H.Ü.E validator**: el lead pulsa
  "Revisar cambios con H.Ü.E" y por cada corrección la IA dice "parece hecho / no /
  a medias" + razón — ADVISORY, el lead confirma. Verificado en vivo: acertó
  ("sigue en plural" a medias, "el copy no cambió" no).
- **Performance/Evaluación** (era Workload): sección Performance con sub-tabs
  Workload + Evaluación. Puntaje 0–10 por criterio, POR AUTOR (atribución por
  sección: `field_edits` registra quién escribió cada campo; una corrección se le
  cuenta a quien escribió esa sección → tareas co-asignadas se reparten bien).
  Unidad = tarea APROBADA en el mes (reproducible). Lead ve su equipo, admin todos.
- **Portal del cliente**: `/[cliente]/portal` real — briefs + dropdown de tareas +
  Vista cliente de sólo lectura + **Aprobar / Pedir cambios**. El texto del cliente
  llega al equipo por notificación Y como tarjeta "El cliente pidió cambios" en la
  tarea.

**Decisiones de Pedro (grabadas):**
- Scoring automático, por tarea binario, promediado; el tipo de cambio es OBLIGATORIO.
- "Workload" NO "Carga" (override). Cualquier IA se llama "H.Ü.E".
- Atribución por AUTOR de la sección (co-asignados per-person), no por asignado.
- Autoría = clean/going-forward (tablero vacío hasta que el equipo trabaje aquí),
  NO híbrido.
- Portal preview-gated; el binding real cliente↔auth es tarea de launch.

**Bugs arreglados en el camino:** autoría gateada por view-as (mostraba 0 →
ahora por soy.role); "Ver campo" no funcionaba en Vista cliente (faltaba
data-campo-key en CampoLectura); H.Ü.E select sin referencia_nota (veredicto falso).

**Reaps (Opus) atraparon:** el bug del period-scoping en Evaluación (→ atribución
por aprobación, reproducible); importaciones sin autoría (Pegar guión); edición de
revisor robando autoría; el select/iteration desincronizado de H.Ü.E. Todos fixeados.

**Pendientes (fast-follows, no urgentes):** el tablero de Evaluación/autoría se
llena a medida que los especialistas trabajen bajo su identidad real. Launch:
auth Google + binding cliente↔sesión (hoy el portal confía en el slug de la URL).

## 2026-08-13 (cont.) — Camino a live: Workload + Entregas + fix de nav fantasma

Aclaración clave de Pedro sobre el lanzamiento y dos secciones nuevas del lado-
agencia. Todo en prod. Commits **4203559 → 14de08d**.

**Modelo de lanzamiento (aclarado):** TODO es pre-launch salvo el **portal del
cliente**, que es lo ÚLTIMO (depende de que el lado-agencia esté 100% listo).
Luego **login**, luego go-live. Orden: agencia → portal → login → live.
Las secciones "Pronto" NO estaban specificadas — eran placeholders del scaffold;
sus nombres/iconos no cuadraban. Se redefinieron con Pedro.

**Qué se hizo:**
- **Workload** (antes el stub "Carga" — nombre ambiguo con upload): tablero de
  capacidad por persona. Activas = asignadas y no publicadas/entregadas (mismo
  criterio que la carga de Equipo), barra + flag "Cargado" (≥6), desglose por
  ESTADO (Pill) y por CLIENTE (aparece con >1 cliente). Global, grupo GENERAL.
  Pedro pidió el label en INGLÉS "Workload" (excepción a la UI-en-español). 4203559.
- **Entregas** (consolida los 2 stubs "Entregas por revisar" + per-cliente
  "Entregas" en UNO global): rastrea lo `published` (Con el cliente / En cambios /
  Entregado) por cliente, con link de entrega, fecha, asignados. Los estados finos
  del cliente (revisando/aceptó) llegan con el PORTAL. 5abbe88.
- **Fix de nav fantasma** (14de08d): al agregar /workload y /entregas no las metí
  en el set `RESERVED` del sidebar → en esas páginas creía que el cliente era
  "workload" → sección fantasma con links /workload/tablero → vacío ("de Workload
  a Tablero sale vacío", reportó Pedro). RESERVED ahora lista TODA ruta general.
  Auditado en vivo route-by-route: 0 fantasmas; el board siempre renderizó bien.

**Estado:** todo en prod, tsc+build+lint limpios, deploys Ready. No se tocó BD
(sólo UI + loaders de lectura). S.P.A.M intacto.

**Decisiones:** Workload label en inglés (Pedro) · Entregas global (no per-cliente)
· "Con el cliente" = published hasta que exista el portal.

**Camino a live restante:** **Portal del cliente** (último; alimenta los estados
finos de Entregas + prende published→in_corrections) → **Login** → live. Dato
pendiente de Pedro: **legal de Préstamos**. Post-launch: Copies, Slack, Notion, API.

**Lecciones:** refetch-tras-write (no borrar/falso-errorear en refetch fallido) ·
Pill/parSolido (contraste una vez, medir en navegador) · **nav RESERVED**
(new-enum-value aplicado a RUTAS; grep el guard al agregar una ruta top-level; e
investiga artefactos de UI raros en vez de racionalizarlos).

## 2026-08-13 — Design God Mode pass (contraste + Pill + motion + mobile nav) + code-review

Auditoría completa de UX/UI en 4 dimensiones vía agentes en paralelo
(color/contraste, consistencia, motion, tipografía). Pedro eligió el full pass.
Todo en prod. Commits **1207a10 → 1173bf1**.

**Qué se hizo:**
- **Contraste / Pill unificado** (`src/components/ui/pill.tsx`): un solo componente
  reemplaza ~10 pastillas a mano. `parSolido()` garantiza ≥4.5:1 para cualquier
  color (oscurece el fondo si un tono medio no pasa). Bug de Pedro (nombres
  invisibles) 1.4→13.2:1; canales, avatares, badges de estado, contador de
  notif, gradientes del panel de tipo, bandas del deck (tokenizadas+oscurecidas).
  **0 fails AA medidos en el workspace** (auditor de contraste por DOM en vivo).
  Tokens nuevos: --status-warning, --deck-blue/orange.
- **Motion** (reduced-motion-safe, 120–220ms): indicador de autoguardado animado
  + auto-descarte; pin de corrección "pop"; entrada de items nuevos; delay de
  tooltip; pickup/landing del drag; acordeón de rondas; **reload→optimista** en
  agregar plano e importar guión (server actions devuelven la fila creada).
- **Mobile nav** (<768px): hamburguesa + Sheet lateral (antes NO había nav móvil).
- **Tipografía/semántica**: textarea principal 13→14px; piso 8→10px; cada página
  con `<h1>` real; `<h3>/<h4>` mal usados como micro-labels → `<p>`; `.gl-eyebrow`
  en los 2 close-matches.
- **/code-review** del diff completo (high): 3 hallazgos, 2 reales arreglados
  (importarGuion no borra el workspace / importarEstatico no falso-errorea si el
  refetch falla tras un write exitoso), 1 negligible sin cambio.

**Estado:** todo en prod, tsc+build limpios, deploy Ready. S.P.A.M intacto (no se
tocó BD; sólo UI + 2 server actions que devuelven filas ya existentes).

**Decisiones:** contraste se resuelve UNA vez en `<Pill>`/`parSolido` (no por
callsite); las bandas deck se oscurecieron a AA (Pedro puede revertir si quiere
fidelidad exacta al deck); ~58 labels con tamaños variados NO se forzaron a
gl-eyebrow (aplanaría la jerarquía).

**Pick up next (sin comprometer):** DRY opcional de los color-maps duplicados de
correcciones (ya pasan AA, cosmético) · muestra real de estático para el
gold-test del parser · candidatos viejos (portal cliente, Notion, Slack, API).

## 2026-08-12 — Descartar corrección + Importador "Pegar guión" (Feature 2, completo)

Sesión larga, todo en prod. S.P.A.M **byte-idéntico 42/31/6** de punta a punta.
13 commits (a4335e2→2421cbd), +1201 líneas / 16 archivos. GL migraciones 29→30.

**Qué se hizo (build/fix/deploy):**
1. **Descartar una corrección fijada** (revisor cambió de opinión) — server action
   `descartarCorreccion` (hard delete, revisor-only, la ronda se auto-cura) + botón
   trash con confirmación en dos pasos en el panel. 4 db tests. Commit **09b60f4**.
2. **"Pedir cambio" de campo entero sólo en campos VACÍOS** (con texto la selección
   lo cubre; vacío igual se flaggea). Commit **b21611a**.
3. **Importador "Pegar guión" (Feature 2)** — 4 pasos: (1) parser determinista
   `src/lib/guion.ts` + gold test contra el guión REAL de DiDi (`4c0b068`); (2) RPC
   atómico mig **0030** `rpc_import_planos` + server actions + 11 db tests, aplicada
   a prod con "apply it" (`e787157`); (3) UI diálogo + preview editable montado en
   editor-tarea (`21ac7e4`); (4) normalizador **H.Ü.E** con guardarraíl para pegados
   sin saltos (`8c113cf`). Dep nueva `@anthropic-ai/sdk` + `ANTHROPIC_API_KEY`.
4. **Iteración con Pedro (todo shipped):** botón importador movido ARRIBA como CTA de
   arranque (PEDRO_OVERRIDE, `d2f3d39`); diálogo con alto fijo + body scrollable +
   más ancho (`73b377e`); botón renombrado a "Deja que H.Ü.E lo arregle" (`56092ea`);
   **fix del guard** (`227d0ab`): (a) bug de regex `\bplano` que se saltaba el "Plano 1"
   pegado al header → guard comparaba slices desalineados; (b) guard ahora verifica
   contenido FACT-SHAPED (dígitos + * % $ + multiset de letras) en vez de bytes.
   Verificado 3/3 en vivo con el guión real.
5. **Limpieza infra:** re-apuntado y luego ELIMINADO el alias manual `-pedro-3338-`
   (se quedaba stale, caché-inmune, confundió a Pedro). Una sola URL canónica.

**Estado actual:** todo en prod y verificado. `npm test` 220 lib + 214 db pass
(nuevos tests de importador + guard + regresiones). Deploy `nxfcr4fxg` Ready.

**Trabajo sin commitear:** ninguno. **Sin pushear:** 1 commit docs (`2421cbd`,
lección Vercel-alias) — se pushea al arrancar la próxima o con el próximo código.

**Decisiones (para no re-debatir):**
- Guard del LLM = fact-shaped, no byte-identity (el modelo es no determinista →
  byte-identity da falsos-negativos intermitentes). El humano igual revisa la preview.
- Modelo del normalizador: `claude-sonnet-5` (mecánico + guard). Subir a opus si
  la tasa de rechazo sube.
- Deploy = git push a main (auto). `vercel --prod` sólo como respaldo. UNA URL canónica.

**Verificación clave:** RPC de escritura probado en prod dentro de una txn con
rollback (0 residuo); LLM+guard probado 3/3 contra la API real con el guión de DiDi.
El MCP del navegador NO puede driblar clicks de React (sí lee DOM) — por eso muchas
verificaciones fueron por DOM-read + pruebas directas, no por click.

**Pick up next (sin comprometer):**
1. **Muestra REAL de estático** de Pedro → reemplazar el parseEstatico PROVISIONAL
   con gold-test.
2. **Llenar emails del equipo** en /admin ▸ Equipo (notificaciones hoy `skipped`).
3. **Rotar `ANTHROPIC_API_KEY`** (se compartió en texto plano en el chat).
4. Otros candidatos viejos: Portal del cliente · F6 Notion · Slack · API/MCP tokens.

**Cambios de entorno:** dep `@anthropic-ai/sdk` (^0.100.1); `ANTHROPIC_API_KEY` en
Vercel + `.env.local`; alias `-pedro-3338-` eliminado.

## 2026-08-11 — Correcciones ancladas a SELECCIÓN de texto (+ follow-ups)

Continuación de la sesión larga. Todo en producción, S.P.A.M idéntico 42/31/6
(migraciones GL 27→28). Commit principal **1e2fb7d**.

**Follow-ups rápidos primero** (todos en prod):
- Panel de correcciones movido AL FINAL (antes partía cabecera→guión — Pedro). 2ad834a.
- Email de notificación: iteración a colores NEÓN + aprobada = verde-logo en pastilla
  oscura ("A" de Pedro). Enviado end-to-end. a1c2fdc.
- Limpieza de 2 correcciones fantasma (test viejo del botón "Mandar cambios" del tablero,
  2026-08-04) que el panel nuevo sacaba a la luz.

**Correcciones ancladas a selección** (DESIGN-FIRST, plan aprobado en
/Users/work/.claude/plans/question-for-the-changes-glowing-hopper.md, fidelidad "B"):
el revisor resalta un substring de un campo ("6% de CASHBACK*" en Copy in) y la
corrección se ancla a ESA frase, no a todo el campo.
- **Ancla de record = el QUOTE** (target_quote), NO los offsets: el campo es un
  <textarea> y el especialista edita el texto para arreglarlo → los offsets se
  desincronizan. Offsets = best-effort para el resaltado inicial.
- **Resaltado en vivo = mirror overlay**: un div idéntico en caja detrás del textarea
  transparente, pinta un <mark> (color de estado) sobre la frase; se re-encuentra por
  contenido (indexOf) si el offset ya no calza; si la frase desaparece, se apaga (el
  quote sigue en el panel). Helper puro `resaltadosEnTexto` + tests.
- **Mig 0029**: comments += target_quote/start/end; rpc_add_correction extendido (DROP
  firma vieja de 9 args → sin overload PGRST203).
- **Reap adversarial** (opus): limpio en lo grande, 4 fixes aplicados — el más importante,
  mandar los params del quote SÓLO si hay quote (desacopla el path de campo-entero de la
  migración; PostgREST resuelve por NOMBRE → si el código va antes que la migración, sin
  el fix se rompía TODA corrección con PGRST202). Aplicar migración ANTES del push.
- **Verificado END-TO-END EN PROD** (no sólo localhost): el <mark> resalta la frase, el
  panel muestra el quote, best-effort drop al editar. Datos de prueba limpiados.
- Tests: 183 lib + 187 db. tsc + build limpios.

**Aprendizajes clave** (en lessons.md): mirror-overlay para resaltar dentro de un
<textarea>; ancla por quote-snapshot no por offsets; footgun de PostgREST por-nombre +
orden de deploy (migración antes del push); twMerge tapa bg conflictivos; verificar
features client-side en el target REAL (prod), no sólo localhost.

## 2026-08-10 — Correcciones localizadas + rol specialist_lead + rediseño del email

Sesión larga, DESIGN-FIRST. Dos entregas grandes, **todo en producción**, S.P.A.M
idéntico 42/31/6 en todo momento (migraciones GL 25→27). 3 commits en `main`
(dfad2aa correcciones · 2ad834a mover panel · a1c2fdc email).

**1. Flujo de correcciones localizadas** (la pieza central).
Diseñado con Pedro vía un MOCKUP clicable (scratchpad/correcciones-mockup.html,
iterado ~5 veces: tooltip hover+tap+foco, botón que MUTA, Devolver a revisión,
3 estados rojo/ámbar/verde, fixes de contraste y de encoding). Modelo cerrado:
- **Migración 0027** (archivo propio): `app_role += 'specialist_lead'`.
- **Migración 0028**: columnas de destino en `comments` (target_tabla/fila/campo/
  label, ronda, atendido_at/by, resolved_member_id), transición nueva
  `in_corrections→under_review`, `is_team()` += specialist_lead, RPCs
  rpc_add_correction (cálculo de ronda), rpc_task_send_corrections,
  rpc_task_return_review; + reconcilió rpc_task_request_changes (estampa ronda) y
  rpc_task_approve (cierra la ronda) — hallazgos del reap.
- **Rol specialist_lead**: en roles.ts (VIEW_ROLES/labels/NAV=creative/**canAssign
  SÓLO**), en is_team pero NO is_lead. Un especialista que además asigna.
- **UI**: pins sobre cada campo + tooltip (hover/tap/foco) + barra flotante que
  muta (Mandar a correcciones → Aprobar → Enviar a cliente) + Devolver a revisión
  + panel "Correcciones" agrupado por ronda. `CorreccionesProvider` envuelve el
  workspace; `<Campo>` consume el contexto. El panel se movió AL FINAL (antes
  partía cabecera→guión — Pedro).
- **Reap adversarial** (subagente opus) encontró 5 bugs reales + 1 pre-existente,
  TODOS arreglados y con test de regresión (round=NULL vía botón legacy; aprobar
  dejaba ámbar sin resolver para siempre; sin reabrir un confirmado; client_change
  latente; master fuera de isLead). 182 db + 176 lib tests.
- **Contraste** (Pedro lo pidió): pins/pastillas = fondo sólido oscurecido + texto
  blanco; ámbar alineado a --status-progress; se arregló un white-on-white real
  (hover de Confirmar). Medido en navegador: todo 4.5–13.2 AA.
- **Verificado en vivo** por PostgREST (14/14: mandar→devolver→pin→atendido→
  confirmar→aprobar) + render + demo sembrada/revertida. Deploy prod verificado.

**2. Rediseño del email de notificación** (email-template.ts, puro/testeable).
Header navy con wordmark, chip+acento NEÓN por tipo (coral cambios / púrpura
revisar / **verde-logo aprobada** / azul enviada / ámbar brief), texto del chip
auto-elegido por contraste medido, UTF-8. **Aprobada = verde del logo #00e676 en
pastilla oscura** para que BRILLE como el wordmark (opción "A" de Pedro, sobre un
fill más brillante). **CTA inteligente**: los emails de tarea van directo a LA
TAREA (caes sobre los pins rojos), el de brief a /mi-trabajo. Revisado enviándome
correos reales por variante (el inbox = la review). Send path verificado
end-to-end en vivo (gate→ruteo→envío→marcado sent→limpieza).

**PEDRO_OVERRIDE / correcciones aplicadas esta sesión** (todas ya integradas):
mockup ≠ diseño final (aclarar que el mockup es de INTERACCIÓN); panel al final,
no en medio; aprobada debe ser el verde del logo brillante.

**Pendiente (setup de Pedro, no código):** llenar los emails del equipo en
/admin ▸ Equipo — hoy vacíos → las notificaciones se marcan `skipped`.

## 2026-08-06 (cont.) — Emails de notificación (Gmail SMTP) + varios

Segunda mitad de una sesión muy larga. Todo en producción, S.P.A.M idéntico
42/31/6, commiteado y pusheado a `Runna-Ad/runna-command-center`.

**Antes del email (fixes):**
- **Notas ya NO va al cliente** — era interno; se quitó `peloteo` del PreviewSlide
  (revierte una agrupación mía previa; qué es interno vs cliente es decisión
  por-campo). Comentarios Leads y Notas = internos; Resumen y Trend = del cliente.
- **Git**: el repo YA tenía remoto (`Runna-Ad/runna-command-center`) y estaba
  sincronizado; corregí las notas obsoletas que decían "no hay remoto". Ahora es
  público bajo org Runna-Ad. ⚠️ Vercel Hobby NO auto-deploya repos privados de
  org — deploys por `npx vercel --prod --yes` (ver lección).
- Agregué Greenlight a Mission Control (`~/Downloads/mission-control_3.html`).

**Sistema de emails de notificación** (patrón "Brooklyn" de SnapTrack):
- **Gmail SMTP** (nodemailer), sender **`unique@runna.com.mx`** (cuenta Workspace
  + App Password → Gmail resuelve SPF/DKIM). NO Resend.
- **Autocontenido en el Vercel de Greenlight**, NO en Supabase edge functions —
  para no pisar los secretos de S.P.A.M en el proyecto compartido.
- Piezas: `email.ts` (envío), `notif-routing.ts` (doble compuerta, testeada),
  `notif-email.ts` (dispatcher: drena cola pending → resuelve email por persona
  → manda → marca), disparo **inline con `after()`** tras cada cambio de estado.
- **Migración 0025**: canal `email` activo + `track_members.notify_email`.
- **/admin ▸ Equipo**: toggle "Recibe emails" por persona.
- **Migración 0026 + `rpc_notificar_brief`**: al crear un brief, un aviso
  **agregado por especialista** ("Nuevo brief · tienes X tareas → /mi-trabajo").
- **PEDRO_OVERRIDE**: Pedro revocó su regla #3 ("no tocar .env/secretos") para
  que yo pusiera el App Password. Lo escribí a `.env.local` (gitignoreado,
  verificado no-trackeado) + a Vercel env por CLI. Nunca commiteado.

**Verificado en vivo** (todos los emails de prueba → **petedv31@gmail.com**):
SMTP directo ✅ · dispatcher end-to-end ✅ · aviso de brief "2 tareas" ✅. Scripts
`send-test-email.mjs`, `test-dispatch.mjs`, `test-brief-notif.mjs` (reversibles).
Tests: 176 lib + 160 db, 0 fallos.

**Cómo opera**: emails en nuevo-brief · lista-para-revisar · cambios · aprobada ·
enviada-al-cliente. Gateados por el toggle + que la persona tenga email. Como
Pedro pidió "ignorar los emails por ahora", los 14 tienen `email` vacío → esas
notificaciones se marcan `skipped`. **Se activan solos al llenar los correos en
/admin ▸ Equipo.**

## 2026-08-06 — Constructor de brief, referencias al cliente y panel /admin

Sesión larga y muy productiva. **7 commits de features en `main`, todo en
producción, S.P.A.M idéntico 42/31/6 en todo momento.** Migraciones 0022–0024
aplicadas a la base viva.

**1. Constructor de brief nuevo** (`/[cliente]/briefs/nuevo`). Reemplazó el
formulario demo que no persistía. Pool de tarjetas + **3 gestos de duplicación**
(diseñados con Pedro): copiar UN campo a las tarjetas elegidas · copiar VARIOS
campos · duplicar tarjeta entera (# Idea autoincrementa A1→A2). Persistencia
atómica vía RPC nuevo `rpc_crear_brief(jsonb)` (0022) — todo-o-nada. Lógica pura
compartida extraída a `src/lib/intake-crear.ts` (import.ts refactorizado para
reusarla). Puerta de obligatorios = la misma del import; # Idea únicos se bloquean
(no se renombran en silencio).

**2. Fix del Trend** — un `-` (centinela "sin valor" del sheet) generaba una
falsa pastilla "Referencia 1". `parseReferencias` ahora devuelve segmentos
tipados: sólo una URL real se numera; el texto no-URL se deja tal cual;
centinelas se descartan. Arreglado en la raíz + los 2 renderers.

**3. Alineación de `# Idea`** — el hint envolvía y descuadraba la fila; pasó al
placeholder.

**4. Referencias (imágenes/videos) al lado del cliente** — Pedro: las referencias
también las ve el cliente. El preview "Como lo verá el cliente" ahora muestra las
miniaturas por plano/estático (imágenes por signed URL, videos con thumbnail).
Cambio presentacional: el RefVista ya estaba cargado; sólo se enhebró al
PreviewSlide.

**5. Panel `/admin`** (modelado en la sección de Settings de SnapTrack). 5
pestañas: **Perfil · Equipo · Actividad · Integraciones · Biblioteca**.
- **Equipo/roles**: gestiona los 14 (track_members) con edición inline + guardado
  inmediato (rol, track, color, email, Slack, lead), badge de carga, alta y
  desactivación con confirmación. Rol **Master Builder** nuevo (tier sobre admin):
  enum (0023) + roles.ts + helpers RLS (0024). Atributos de persona en
  track_members, NO profiles falsos (listo para el login vía profile_id).
- **Actividad**: feed de quién movió qué tarea (status_events), sin tabla nueva.
- **Integraciones**: estado del Sheet (conectado · última sync · 32 tareas) +
  pasos para rotar el secreto + placeholder Notion.
- **Biblioteca**: CRUD de snippets por kind (legales incl. donde meter el de
  Préstamos, selling points, instrucciones).

**Verificación**: cada feature verificada en vivo (aserciones al DOM; el write
path de Equipo probado creando+borrando una persona de prueba por id). Tests
finales: 166 lib + 154 db + 44 sync, 0 fallos. tsc/lint/build limpios.

**Un PEDRO_OVERRIDE**: me clavé en la seguridad al planear admin ("sin login sería
público") cuando la regla del proyecto ya decía "no re-abrir el tema de
seguridad". Corregido: es beta sin login hasta el final; dejar el modelo listo,
no empujar el login. (Ver lessons.md.)

**Sigue**: F6 Notion (bloqueado en token+base de Pedro) · notificaciones que SÍ
envían (email/Slack — necesita Resend/Slack + contactos) · API/MCP con tokens
para Claude · portal del cliente · legal de Préstamos (agregarlo por Biblioteca).

## 2026-08-05 (tarde) — Los 4 enlaces muertos del menú

**Desplegado.** Sesión corta y de una sola cosa: el sidebar tenía 4 enlaces a
rutas que no existen — `/carga`, `/entrega-check`, `/admin` ("Configuración") y
`/[cliente]/entregas`.

**Por qué importaba más de lo que parecía:** no hacía falta clicarlos. `<Link>`
de Next prefetchea el segmento RSC en cuanto el enlace entra en el viewport, así
que **cada carga de la app en producción disparaba 4 peticiones `?_rsc=` con
404**. Invisible en pantalla, visible en la pestaña de red.

**Decisión de Pedro (preguntado, no asumido):** los cuatro son trabajo de P6 y
tres de ellos ni siquiera se pueden construir todavía (falta asignación, subida
de archivos y la tabla de entregas). `/admin` sí era construible — los datos ya
están en Supabase — pero Pedro eligió respetar el orden del roadmap y dejarlo
también para P6.

**Solución:** `soon?: boolean` en `NavItem`. Un item pendiente se pinta apagado
con distintivo "Pronto" y se renderiza como `<span>`, no como `<Link>` — sin
ancla no hay prefetch. El menú sigue enseñando el roadmap completo sin mentir
sobre lo que ya existe. Al construir cada página se quita su `soon: true`
(anotado en todo.md).

**Verificado en producción**, no sólo en local: dos cargas completas de
`/didi/tablero` y `/clientes` con cero 404 y cero `?_rsc=` a las rutas muertas.
El árbol de accesibilidad confirma que los cuatro ya no tienen `href` — un
screenshot no habría distinguido eso.

**Sigue:** lo que ya estaba — Copies, curar selling points, selector de
biblioteca de legales.

## 2026-08-05 — La plantilla de trabajo (guión + estático)

**Desplegado.** Al hacer clic en una tarjeta ya se abre la pantalla donde el
equipo trabaja. Reemplaza el deck de 45 slides que llenaban a mano.

El deck del cliente resultó estar compartido por link, así que se pudo leer
entero (PDF + texto + XML del pptx). La cabecera y las dos columnas salen de la
plantilla real, no de una interpretación.

**Hallazgo del deck:** conviven DOS textos legales distintos — 12 slides con el
CAT de mayo y 9 con el de enero. Es el argumento de por qué los legales se
seleccionan de una biblioteca en vez de pegarse.

**Deuda pagada:** `seed.sql` nunca se aplicó a producción. La biblioteca de
legales estaba vacía y faltaba la matriz base de tamaño×plataforma entera.
Los datos de referencia se mudaron a migración; el harness ahora aplica el seed
en una instancia aparte y falla si se desfasa — al añadir ese guard apareció
una segunda constraint muerta.

**También:** `is_assigned()` llevaba roto desde la 0008 (la policy de `planos`
era falsa para todos) y `Referencias` era la tercera columna que el import leía
y tiraba — se rescataron 15.

**Decisión:** un estático multiplataforma recibe reglas contradictorias (GG sin
CTA, FB con CTA). Se muestran AGRUPADAS por plataforma; elegir una sería decidir
por el creativo.

**Sigue:** Copies (la página lo dice en vez de fingir), curar los selling points,
y cablear el selector de biblioteca.

## 2026-08-04 — Repo propio, tablero interactivo, asignación real

**Lo primero: el proyecto ya tiene git.** `git init` en la carpeta del proyecto
(antes `git rev-parse --show-toplevel` devolvía `/Users/work` y todo estaba sin
versionar). 99 archivos, 5 commits. `.gitignore`: `.env*` fuera salvo las
plantillas `*.example`, más `.vercel`, `.next`, `supabase/.temp`. Verificado que
ningún valor de `.env.local` quedó dentro de lo versionado.
Falta el remoto — decidir cuenta y visibilidad.

**Migración 0008 aplicada a la base viva** (con "deploy it" de Pedro).
S.P.A.M idéntico antes y después: 42 tablas public / 31 migraciones / 6 usuarios.

**Tablero interactivo desplegado.** Asignar personas, arrastrar entre estados,
filtros por persona / brief / plataforma / marca.

**Tres hallazgos**
1. **El import tiraba `Asignación` y `Marca`** — pérdida silenciosa. `Asignación`
   se leía, se usaba para la llave de dedup, y nunca se guardaba; las 32 tareas
   estaban sin nadie. Recuperadas de `staged_rows.data` (52 asignaciones en 30
   filas, 32 marcas, 0 sin match) e import arreglado para que no vuelva a pasar.
2. **El filtro por pod estaría vacío** — 0/32 tareas tienen `pod_id` y el sheet
   no trae esa columna. No se construyó. Falta decidir cómo se asigna un pod.
3. **`@dnd-kit` no estaba instalado**, pese a la nota que decía lo contrario.

**Dos bugs que sólo aparecieron en el navegador** (ni tsc, ni eslint, ni build):
error de hidratación de dnd-kit, y 4 de 10 chips de personas fallando contraste
AA. Ambos corregidos y re-medidos. Ver lessons.md.

**Decisión de diseño con consecuencia a futuro:** las asignaciones apuntan a
`track_members.id`, no a `profiles`. Crear 14 profiles con uuid inventado habría
roto el login el día que la gente entre con Google. `track_members.profile_id`
queda nulo como punto de unión.

**Respondido por Pedro:** Copies = temas con cuota · Estáticos = sólo COPY IN |
REFERENCIA/IMAGEN · Preview = ambos, en vivo. Detalle en todo.md.

**⚠️ Abierto**
1. Sin login nadie es lead, así que **ningún movimiento hacia atrás es posible**.
   A1 quedó en "En progreso" de una prueba y no se puede devolver. Cerrar antes
   de que el equipo lo use.
2. `SHEETS_SCRIPT_SECRET` sigue sin rotar (estuvo público ~4 min).
3. `check:leak` es un no-op desde la shell local y su salida parece un OK.
4. Sigue sin remoto de git.

**Sigue:** la plantilla de trabajo por tarea (punto 2 del plan), ya con las
3 respuestas de Pedro.

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

## 2026-08-05 (tarde) — Cabecera editable: TREND, NOTAS y Duración

**Desplegado.** Migración 0013 aplicada a la base viva; S.P.A.M idéntico antes
y después (42 tablas public / 31 migraciones / 6 usuarios).

TREND y NOTAS existían en el slide del deck y no tenían dónde guardarse — se
llenaban a mano y se perdían. Ya son campos de `ideas`, con el mismo
autoguardado del cuerpo.

**Lo importante fue la Duración.** `assets.duracion_code` es una COPIA hecha al
crear cada archivo ("for filename stability", 0001). Hacerla editable sin
propagarla habría dejado los 12 nombres de la tarea diciendo la duración vieja
— y el nombre es justo lo que el equipo copia literal al entregar. La
propagación va en TRIGGER, no en la acción del servidor: así el import, un fix
a mano o una RPC futura quedan cubiertos.

Verificado en producción sobre SPAPVOYTOURISM: `10-40s → 30-40s` reescribió los
**12 archivos**, el nombre se actualizó en pantalla sin recargar, y quedó en
`activity_log`. Datos de prueba restaurados a sus valores importados.

**Quitado a petición de Pedro:** el veredicto que juzgaba el diálogo contra la
Duración. El read-time se queda como dato ("11s de lectura en total"), sin
semáforo. Ver PEDRO_OVERRIDE en lessons.md.

**Hallazgo aparte:** 4 enlaces del menú lateral apuntan a rutas inexistentes y
dan 404 al prefetch — `/carga`, `/entrega-check`, `/admin`, `/[cliente]/entregas`.
Levantado como tarea aparte; no se tocó.

**Sigue:** Copies, curar los selling points, cablear el selector de biblioteca,
y el bloque de Simulación de Préstamos del plano 4 (falta decidir si es campo
del plano, tipo de plano, o pieza de biblioteca).

## 2026-08-05 (noche) — Blueprint del workspace: F1–F4 desplegadas

Pedro entregó un blueprint en wireframes (Brief View + Workspace por tipo).
Plan aprobado de 6 fases; construidas y desplegadas las 4 primeras.

**Desplegado a producción** (migraciones 0014+0015 aplicadas; S.P.A.M idéntico
42/31/6; bucket privado `greenlight-referencias` creado):
- F1 · 5º verbo "Enviar a cliente" (paso aparte de aprobar) + barra de acciones
  en el workspace. Despacho de verbos ahora por mapa exhaustivo (verbos.ts) —
  antes un verbo nuevo caía al else y aprobaba en silencio.
- F2 · Bundles por brief: /briefs deja de ser placeholder; cards con conteo,
  clic → workspace con flechas ← n/N →. Una sola fuente (bundle.ts) filtra por
  rol y ordena; el especialista sólo ve sus tareas.
- F3 · Panel "Rünna details" colapsable, SÓLO INTERNO (verificado por curl: el
  panel no está en el HTML del rol cliente). Lead/Team, liga de entrega
  editable con validación http/https, prioridad, "Marcar leads".
- F4 · Banda de marca: logo + topic + resumen del brief editable + íconos de
  content type y canales.

**Verificado en vivo:** las 3 secciones rinden en prod, consola limpia,
send_client alcanzable por PostgREST (grants ok, sin PGRST203) y respeta el
guard. Tests: 99 lib + 134 db.

**Falta:** F5 referencias drag&drop (bucket ya autorizado y creado) · F6
biblioteca Notion (BLOQUEADA en token + link de la base de Pedro).

## 2026-08-05 (cont.) — F5 desplegada · referencias con Storage

Migración 0016 aplicada y bucket privado `greenlight-referencias` creado y
verificado end-to-end en prod: subida ok, signed URL sirve la imagen (200),
acceso público sin firma bloqueado (400 → es privado). S.P.A.M idéntico.

Referencias por plano: arrastra imágenes (validadas por magic bytes en el
servidor — un .exe→.png se rechaza) o pega ligas de video; thumbnails con
hover-grow y popup. Imágenes en bucket privado, signed URL por render.

Nota de proceso: apliqué 0016 tomando "authorize the storage bucket" + "deploy
it" como luz verde para dejar F5 funcional. Es aditiva (tabla+columnas nuevas),
S.P.A.M no se tocó. Si Pedro prefería revisar antes, es fácil de revertir.

**Falta sólo F6** (biblioteca Notion) — BLOQUEADA en el token de integración +
link de la base de Pedro. Todo lo demás del blueprint está en producción.

## 2026-08-05 (cont.) — Fusión de la cabecera + fix del dropdown de Duración

Pedro: las dos secciones (banda de marca + datos del intake) se sentían
partidas → fusionadas en UNA tarjeta que se lee de arriba a abajo, enmarcada
por los colores-guía (pleca izq · panel de tipo der): identidad + content type
+ channels · formato ratio (pastillas) + duración + formato + entrega · cajas
para escribir (resumen, trend, notas). banda-marca.tsx eliminado.

FIX: Duración mostraba un dropdown tipo fecha (era el <datalist>). Quitado +
autocomplete="off". Verificado en prod: 0 datalists, sin flecha, una sola
tarjeta, sin crash.

## 2026-08-05 (cont.) — Link de entrega prominente + claridad en referencias

- Pedro aclaró: ÉL borró la imagen de referencia, no una limpieza mía (falsa
  alarma; lección corregida en lessons.md).
- Link de entrega: bloque destacado (borde/fondo primario, caja obvia) con la
  nota de que de ahí sale el botón "Abrir entregable" del CLIENTE. Confirmado
  el modelo: el campo se EDITA en Rünna details (interno), pero su VALOR
  alimenta el botón del cliente cuando se construya el portal.
- Referencias: "Link" → "Link de video"; leyenda de drag & drop añadida
  (confirmado que la zona acepta arrastrar imágenes).
- Popup de referencia agrandado a 90vw / sm:max-w-5xl (antes topado en
  sm:max-w-sm ≈ 384px).

## 2026-08-05 (cont.) — Botón de flujo más bonito + copia al final

Botón de acción (Mandar a revisión / etc.): gradiente + ícono por verbo +
sombra + micro-hover. Segunda instancia al FINAL del workspace (variante
"prominente", barra "¿Lista esta tarea?" + botón grande) para no subir al
encabezado al terminar. Misma decisión (actionsFor), no un botón aparte.
Verificado en prod por CSS: 2 botones con gradiente/sombra/ícono, barra final
presente, sin crash.

## 2026-08-05 (cont.) — Vista del cliente: Acción, diálogo por locutor, planos

Tres mejoras al preview del cliente (PreviewSlide), verificadas escribiendo en
vivo en prod:
- Acción rotulada ("Acción: camina hacia los tomates").
- Diálogo: (paréntesis) → quién habla, en negritas + seccionado + entre
  comillas. Parser puro lib/dialogo.ts + 6 tests. Separa actor/narrador.
- Cada plano con banda "Plano N" a todo lo ancho.
Nota: al probar escribiendo en los campos, el autoguardado persistió el texto
de prueba en A1; se limpió después (plano 1 de vuelta a null). 112 lib, 0 fallos.

## 2026-08-05 (cont.) — Cortinilla de Cierre con legales

Al final del guión (después de todos los planos): bloque "Cortinilla de Cierre".
- Texto libre editable (ideas.legales_libres, migración 0018 aplicada a prod).
- "Agregar desde biblioteca": picker de legales por marca (idea_snippets, con
  alternarSnippet que ya existía). Verificado en una tarea de Card: el picker
  muestra "Legal CAT — Card" con su texto; se selecciona, no se pega.
- Preview del cliente muestra seleccionados + texto libre.
Nota: sólo el legal de Card está sembrado; Préstamos aún no (es un dato
financiero que debe dar Pedro, o llegará por Notion). Para tareas de Préstamos
sólo aplica el texto libre por ahora. S.P.A.M idéntico 42/31/6.

## 2026-08-05 (cont.) — Reglas con tooltip + nota del guión editable

- Panel de reglas: encabezado "Reglas que aplican" + read-time, y cada chip
  abre su regla COMPLETA en un tooltip al pasar el mouse (verificado: "De 20 a
  30s van al menos 4 beneficios; de 30s en adelante, 5; de 40s, 6"). El título
  corto se queda; el detalle vive en el tooltip.
- La nota "1 actriz / 1 actor · # outfits" pasó de fija a CUADRO EDITABLE
  (ideas.nota_guion, migración 0019). El texto del tipo queda de placeholder.
S.P.A.M idéntico 42/31/6.

## 2026-08-05 (cont.) — Design God Mode · fase 1 (fundación)

Pedro pidió el pase de diseño completo (/design-god-mode). Diagnóstico: el app
era PLANO (sin elevación), por eso todo se perdía con el fondo.
Fundación (propaga a todo): escala de sombras teñida con el ink morado
(override de --shadow-* de Tailwind), borde más definido, motion sutil global,
helpers gl-card/gl-card-interactive/gl-eyebrow. Aplicado a superficies clave:
clientes, bundles y tablero (lift al hover), workspace (cabecera, reglas,
planos, Rünna details), barra de acciones (gradiente), topbar sticky con blur.
Contraste AA verificado (4.84–12.01). Notion sigue en pausa (falta acceso).
Falta (si Pedro quiere ir más profundo): tipografía escala, login/sync/forms,
empty states, y capa emil-design-eng de micro-interacciones.

## 2026-08-05 (cont.) — Tablero sin botones, ícono de tipo, dropzone en estático

- Board: quitados los botones de flujo de las tarjetas (drag + workspace los
  hacen redundantes; Pedro). Se removió todo el plumbing (runAction/onAction/
  RequestChangesButton). /mi-trabajo conserva los suyos (sin drag ahí).
- Board: ícono del tipo de asset junto al código (con tooltip).
- Estático: campo "Liga" → drag & drop de IMÁGENES (sin video). Migración 0020
  estatico_references (espejo de plano_references); acciones generalizadas a un
  `owner {plano|estático}`. Upload verificado end-to-end en prod.
- Pregunta abierta de Pedro: los bundles viven en la pestaña Briefs; el Tablero
  es kanban por estado. Falta decidir si el Tablero también se agrupa por brief.
S.P.A.M idéntico 42/31/6.

## 2026-08-05 (cont.) — Resumen y Notas pre-llenados del sheet

Resumen del brief ← ideas.concepto; Notas ← ideas.comentarios_creativo (columna
"Comentarios Leads" del sheet). Editables encima. Concepto quitado del subtítulo
de arriba (ya no se duplica). Trend sigue vacío (sin columna en el sheet).
Verificado en prod. Sin migración (columnas ya existían).

## 2026-08-05 (cont.) — Mapeo correcto del sheet + campos al preview del cliente

Concepto→Resumen; Referencias→Trend (backfill 0021 + import); Peloteo→Notas
(peloteo_raw); Comentarios Leads→subtítulo bajo el título (interno). Resumen/
Trend/Notas ahora se muestran en el preview del cliente. Verificado en 2 tareas
(una con peloteo, una sin). S.P.A.M idéntico.

## 2026-08-05 (cont.) — Trend como "Referencia 1, 2…" (URLs achicadas)

Los URLs del Trend (columna Referencias) ahora salen como chips "Referencia 1",
"Referencia 2"… clicables, en el workspace (con lápiz para editar el crudo) y en
el preview del cliente. parseReferencias() parte por salto de línea (no espacios)
+ 7 tests. CampoIntake gana onCambio para el valor en vivo. Verificado en prod
con una tarea de URL Drive. Sin migración. 119 lib, 0 fallos.

## 2026-08-05 (cont.) — URLs clicables en todo el texto mostrado

Componente <Linkify> (server+client) vuelve clicable cualquier http(s)/www. en
texto de sólo lectura: preview del cliente (Resumen, Notas, Acción, Copy in,
referencia estático) + subtítulo de Comentarios Leads. urlDeLinea() más robusta
para Trend (http/www/dominio-con-path; no confunde "asset.mp4"). Verificado en
prod. 124 lib, 0 fallos. (Volví a escribir en un campo real para probar y lo
restauré desde el sheet — cuidar esto.)

## 2026-08-05 (cont.) — Design God Mode · fase 2 (profundidad)

Radio de marca en las 15 primitivas shadcn (rounded-none → md/xl/sm) — arregla
botones/inputs/diálogos de todo el app; <EmptyState> reutilizable (tablero,
mi-trabajo, guión); loading.tsx con skeletons (tablero/tarea/briefs); login
pulido (fondo de marca + G de Google + entrada); botón primario con sombra+lift.
Verificado en prod: login rediseñado, botones con radio 8px, consola limpia.
124 lib + 141 db + 44 sync, 0 fallos.

## 2026-08-06 — Infra: migración de los 6 repos Rünna a la org `Runna-Ad` + auto-deploy

Sesión de infraestructura (no de features). Se creó la organización de GitHub
**`Runna-Ad`** (owner: Moisty-Mango) como hogar permanente de todos los proyectos
Rünna. Acciones:
- **Transferidos** a `Runna-Ad` (con historial/issues/redirects): runna-pitch,
  spam-runnareach, runna-hunter, runna-barcode-studio.
- **Repos nuevos creados + push**: `Runna-Ad/runna-command-center` (Greenlight,
  76 commits — antes no tenía remoto) y `Runna-Ad/runna-website` (antes sin git).
- Remotos locales de los 6 repuntados a `Runna-Ad`.
- **Bloqueo Vercel**: el plan Hobby NO permite git-deploy de repos PRIVADOS de una
  org (409 → Pro). Pedro eligió hacer los 6 repos **públicos** (escaneé historial
  + contenido: 0 secretos, sólo nombres de env vars). Instalada la Vercel GitHub
  App en `Runna-Ad`; **git-connect de los 6** → `git push main → auto-deploy` vivo.
- Verificado: Greenlight redeploya desde git (el "No Production Deployment" era
  sólo el dashboard sin refrescar — la ranura de producción-git se llenó al primer
  deploy). Dominio sirve (307). Deploy CLI (`vercel --prod`) ya no hace falta.
- Actualizado `~/Downloads/mission-control_3.html` (links → Runna-Ad, deploy status).
- Lección durable guardada en memoria global: `vercel_hobby_private_org_repos.md`.
- Pendiente (no bloqueante): añadir gente (Nils) a la org; desenredar el repo
  cajón-de-sastre `/Users/work` (runna-website vivía dentro de él sin git propio).

---

## Sesión 2026-08-17 — H.Ü.E extractor format-agnostic + emoji (Opción 1)
Commits en `main` (auto-deploy Vercel): 71d1260 → 1a38a64. Todo verificado en prod por Pedro.

**Hecho:**
1. **Bugfix (arranque de tarea al importar)** [71d1260]: importarGuion/importarEstatico
   escribían planos por RPC/update directo, saltándose el auto-start de guardarCampo →
   el botón seguía en "Empezar". Helper compartido `iniciarTareaSiTodo(db, ideaId)`
   llamado por ambos importadores. Pedro confirmó fix.
2. **Opción 1 — H.Ü.E como EXTRACTOR format-agnostic** [86437f0]: `extraerGuion` (server
   action, Sonnet 5, tool-use forzado `emitir_planos` con schema de 7 campos) reemplaza
   a `normalizarGuion`. Lee CUALQUIER formato → PlanoParsed[] estructurado. Guardarraíl
   nuevo `sinInventar` (SUBMULTISET: cada letra/dígito/marca del extraído existe en la
   entrada — caza inventar/alterar; omitir lo caza la vista previa humana). Cliente:
   botón "Deja que H.Ü.E lo lea" también aparece con 0 planos (formato desconocido);
   nota persistente de revisión en previews de IA. Determinista-primero se queda.
3. **Emoji shortcodes → emoji real** [da18cb5 → 05586bb]: guiones de Notion traen
   `:orange_heart:` etc.; el parser los dejaba como texto y H.Ü.E los expandía a palabras.
   `limpiarPegado` ahora emojifica. Empecé con mapa curado (~55) — Pedro pidió cobertura
   completa → mapa GENERADO de 3.4k shortcodes (emojibase-data, presets github+iamcal+
   emojibase; `scripts/gen-emoji-map.mjs` → `src/lib/emoji-map.ts`, 24KB gzip). node-emoji
   descartado (naming emojibase ≠ github/slack). La tabla DiDi entera parsea determinista
   con emoji + legal `*` intactos. Pedro: "emojis work now".

**Tests:** test-lib 227 → 244 (guard sinInventar + emoji). tsc + build limpios en cada paso.
**Lecciones:** 4 nuevas en lessons.md (side-effect compartido, subset-vs-equality guard,
emoji shortcode determinista, curado→completo + naming-preset gotcha).

**⚠️ Pendiente / heads-up:**
- `src/components/tarea/campo.tsx` quedó MODIFICADO sin commitear — NO es mío (otra sesión
  con dev server corriendo en la carpeta lo está editando: refactor de Floating UI
  `refs`→`elements` controlados). Lo dejé intacto; que la otra sesión lo cierre.
- Probar H.Ü.E en localhost necesita ANTHROPIC_API_KEY en .env.local (ya está en Vercel).
- Estático (parseEstatico) sigue provisional — falta muestra real del copy de Pedro.

---

## 2026-08-20 (pm) — 🟢 GO-LIVE: login real en producción + fix /clientes DB-backed

**Contexto:** continuación tras /compact. La sesión previa ya había construido las 5
fases del go-live (reset · login core · acceso cliente · brief fail-safe · settings CRUD),
reapeado y aplicado migraciones. Esta parte = SHIP + verificación en vivo + un bug.

**Hecho:**
1. **GO-LIVE shipped y en vivo** [3918960 feat(go-live) + 3dd1b13 polish(login)]: con
   "ship it" de Pedro — `AUTH_ENABLED=true` en Vercel, Google OAuth + magic-link cliente,
   identidad real (getCurrentUser: JWT→profiles→track_member), migs 0041/0042 a prod,
   reset blank-slate corrido (754 filas borradas, KEEP intactas). Copy de login pulido a
   pedido de Pedro: "Bienvenido" (no "de vuelta") + "Smart production platform. H.Ü.E
   included." + logo Rünna más grande; portal: "H.Ü.E lo aprueba y te manda un enlace…".
2. **Login verificado end-to-end**: Pedro entró como master (`unique@runna.com.mx`).
   Confirmé provisioning en la DB: `profiles.role=master` (activo) + `track_members`
   ligado por profile_id, role master. Fase 1 (Google→identidad→provisioning) OK.
3. **BUG /clientes — números fantasma** [7695455 fix(clientes)]: la tarjeta DiDi mostraba
   4 BRIEFS / 37 ABIERTOS / 3 ATRASADOS tras el reset a cero. Raíz: `/clientes/page.tsx`
   leía `MOCK_CLIENTS` hardcodeado (mock.ts), no la DB. Reescrita como server component
   DB-backed (force-dynamic, service-role, mismo patrón que las demás páginas de datos):
   briefs=draft/active · abiertos=5 estados no-terminales (espejo ESTADOS_ACTIVOS) ·
   atrasados=abiertas con due_date vencido. Borré MOCK_CLIENTS + su tipo. Verificado en
   render real (DOM leído, no sólo screenshot): DiDi 0/0/0, 0 errores server/consola.
   Pedro confirmó 0/0/0 en el sitio en vivo.

**Elección técnica de nota:** filtro de ideas abiertas con `.in("status", [5 estados])`
POSITIVO en vez de `.not(status,'in','(...)')` — un `.not.in` mal formado devuelve null→0,
que POST-RESET se ve correcto y ENMASCARA el bug. (Ver lección nueva.)

**Gates:** tsc + eslint limpios en archivos tocados. Verificación en render local real.
**Deploy:** push a main → Vercel auto-deploy (repo público Runna-Ad). Todo commiteado y pusheado.
**Lecciones:** 2 nuevas (mock sobrevive al reset · forma de query robusta cuando el fallo
se ve igual que la respuesta correcta).

**⚠️ Pendiente / próxima sesión:**
- **Test en vivo Fases 2/3/4**: aprobar cliente → magic-link → binding portal · brief
  fail-safe (añadir agency people) · marca/user CRUD en Admin (empezar por crear/borrar
  una marca de prueba bajo DiDi).
- 2 docs `tasks/HANDOFF-*.md` (golive + hue-hub) siguen untracked — decidir si commitear.
- Siguiente hito grande planeado: **H.Ü.E HUB fase 1** (analytics + brain self-learning),
  handoff en `tasks/HANDOFF-hue-hub-phase1.md`.
