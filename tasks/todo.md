# Greenlight · by Rünna — Build Todo

## 🔧 CONSTRUIDO (2026-08-19 noche, 2º) — H.Ü.E analiza cambios del cliente + badge color de marca [Pedro] — SIN pushear
Pedro corrigió mi decisión de "sin veredicto para cliente" (ver lesson). Sin migración.
- [x] validar-actions.ts: `.or(correction_request OR (client_change AND ronda not null))` → H.Ü.E analiza
      también los cambios del cliente. Verificado live: la query trae el client_change + las 2 internas.
- [x] VeredictoChip se muestra para cliente también (panel/campo/campo-lectura; antes gateado a !cliente).
- [x] BadgeCliente usa `color` = clients.brand_color del cliente (DiDi #ff6b1a naranja); threaded via
      CorreccionesProvider.marcaColor (page.tsx carga brand_color por slug). Fallback a --primary si null.
- [x] Gates: tsc·eslint·build. .or verificado contra prod (3 filas: 2 correction_request + 1 client_change con ronda).
- PENDIENTE: "ship it" para pushear (sin migración).

## ✅ SHIPPED (2026-08-19 noche) — Cambios cliente first-class + lista colapsable + refs en portal [Pedro] — commit d70c73f (mig 0038 en prod)
Construido + reap (Opus) FIX-FIRST (3 SERIOS + 3 MINOR) + gates verdes. NO commiteado; migración 0038 SÓLO PGlite (falta "ship it" para aplicarla a prod).
- [x] Task 1 lista colapsable (portal-shell).
- [x] Task 2 client_change first-class: migración 0038 (ronda=marcador enviado; correction_next_round/
      rpc_task_approve/rpc_task_send_corrections/rpc_task_return_review cuentan client_change enviados;
      submit asigna ronda no resuelve; data-migration SCOPEADA a tareas activas). Código: revert aislamiento,
      client_change en `correcciones`, BadgeCliente, descartar/confirmarCampo incluyen client_change.
- [x] Reap FIX-FIRST: **S1** send_corrections/return_review no contaban client_change → botón "Pedir cambios"
      del lead reventaba (arreglado + test PGlite). **S2** clienteQuitarCambio usaba resolved_at→ronda.
      **S3** data-migration resucitaba tareas terminadas → scopeada a in_corrections/under_review. M4 doc,
      M5 notif, M6 drafts fantasma (portal query .not target_campo is null).
- [x] **Referencias en el portal** (Pedro): portal-data.ts carga+firma refs (helper nuevo `lib/referencias-data.ts`);
      portal-tarea.tsx las pasa (antes `{}`/`[]`). El cliente ve imágenes/videos de referencia.
- [x] Gates: tsc·eslint·lib 328·db 239·build. cliente-feedback.tsx borrado (muerto).
- PENDIENTE: (a) "ship it" → aplicar 0038 (`npm run migrate`, pin ybbrpqzbedaxsmotgtkh) ANTES del push; (b) verificar live.
- DEUDA: page.tsx aún tiene su copia inline de firma de refs → migrar al helper `referencias-data.ts` (post-reap).

## (histórico) plan — Cambios del cliente = correcciones de PRIMERA CLASE + lista colapsable [Pedro OVERRIDE]
Ver PEDRO_OVERRIDE en lessons.md. Pedro: los client_change deben tener el MISMO lifecycle interno
(atendido→confirmar→gate→rondas), única diferencia = badge "Cliente". Decisión: **lifecycle sí, Evaluación NO**
(sin categoría, no puntúa). Y la lista de tareas del portal COLAPSABLE.
- [x] **Task 1 — lista colapsable** (portal-shell.tsx TareaLista): toggle de colapso, muestra "revisando X"
      al plegar. tsc+lint ok.
- [ ] **Task 2 — client_change first-class**:
  - CLAVE: `ronda` = marcador draft/enviado (null=borrador, asignada=enviado) → libera `resolved_at` para el
    lifecycle (antes rpc_client_submit_changes ponía resolved_at=enviado → chocaba con "confirmado").
  - **Migración 0038** (PGlite ANTES de prod): (1) correction_next_round cuenta `correction_request OR
    (client_change AND ronda is not null)`; (2) rpc_task_approve resuelve ambos; (3) rpc_client_submit_changes:
    seleccionar drafts por `ronda is null`, asignar `ronda=correction_next_round` (una vez), NO tocar resolved_at,
    mover published→in_corrections; (4) data-migrate: client_change existentes con resolved_at set → asignar ronda
    + limpiar resolved_at (re-entran OPEN).
  - **Portal** (portal-data.ts): query de drafts `resolved_at is null` → `ronda is null`.
  - **Revertir mi aislamiento** (code): client_change vuelve al array `correcciones` (cliente:true), estado por
    timestamps; QUITAR cambiosClienteCorr/max-resolved-at + la tarjeta ClienteFeedback (ahora en el panel).
    contexto.tsx quita cambiosCliente/merge. campo.tsx quita csRev (vuelve a cs; badge "Cliente" en hover).
    campo-lectura.tsx quita exclusión de huerfanas + la rama read-only → acciones completas + badge. panel.tsx
    badge "Cliente" donde va la categoría. correcciones-actions.ts: descartar/confirmarCampo incluyen client_change.
  - VERIFY: PGlite (round-calc+approve+submit con client_change) + tsc/lint/build + reap adversarial + live.
  - Reglas: migrar SÓLO tras "ship it"; `npm run migrate` (pin ybbrpqzbedaxsmotgtkh); drop firma vieja si cambia args.


## ✅ CONSTRUIDO (2026-08-19 pm) — Correcciones a la derecha + cambios cliente resaltados + fixes [Pedro] — SIN pushear
Construido + reap adversarial (Opus) FIX-FIRST + gates verdes. NO commiteado/pusheado (falta "ship it").
- [x] #4 Panel de correcciones en columna DERECHA fija (2-col, `mostrarPanel ? grid : ""`, aside
      `lg:sticky lg:top-32`, stack en móvil). page.tsx.
- [x] #1 Cambios del cliente RESALTADOS en el plano (rojo): `cambiosCliente` aparte → `deCampo` los
      mezcla sólo para display; flag `cliente:true`; FUERA del gate/lifecycle (`csRev`). ClienteFeedback
      reubicado a la derecha + clicable (salta al campo). campo.tsx / campo-lectura.tsx / cliente-feedback.tsx /
      contexto.tsx / correcciones.ts / page.tsx.
- [x] #2 Bug scroll portal: PortalAcciones `top-0 z-30` → `top-16 z-20` (chocaba con el Topbar de la app).
- [x] #3 Mock del riel denso (15+ tareas): artifact **8d889afb** (Opción A grid / Opción B lista+filtros).
- [x] Reap (Opus) → FIX-FIRST: **S1 (serio)** cambios de cliente de rondas pasadas reaparecían como rojos
      permanentes (query sin scope de ronda) → filtrado a `max(resolved_at)` = ronda actual. **M2** non-inline
      CampoCorrecciones cs→csRev. **M3** pin badge/aria cs.length→csRev.length. **M4** excluir cliente de
      huerfanas + comentario. Todo verificado limpio: gate de aprobación NO incluye cliente; única acción
      destructiva (setEstado) inalcanzable sobre cliente; portal client sin regresión; layout sin clip.
- [x] Gates: tsc · eslint 0-err · lib 328 · db 234 · build.
- [x] SHIPPED #4/#1/#2 (commit e43b29e → main, sin migración). Pedro "ship it".
- [x] #3 riel: Pedro eligió **Opción B** (lista/tabla) → CONSTRUIDO en portal-shell.tsx (TareaRail→TareaLista:
      una fila por tarea estado·nombre·acción, encabezado fijo, filtro por estado, sin scroll horizontal).
      Gates tsc·eslint·build. Se pushea con "ship it and option B".

## (histórico) plan — Correcciones al lado del guión + fixes de UX
Pedro (feedback en live + aprobó un mockup: artifact 541fe65d). Cuatro cosas:
- **#4 Panel de correcciones a la DERECHA** (no al fondo): la página de tarea interna
  pasa a 2 columnas — documento (izq) + `PanelCorrecciones` FIJO (der, sticky), stack
  en móvil (desktop-first). Clic en corrección → salta+flash del campo (ya existe verCampo).
- **#1 Cambios del cliente RESALTADOS en el plano**: hoy `client_change` sólo sale como
  tarjeta arriba (ClienteFeedback) SIN ubicación. Fix: cargar los target_* del client_change,
  mapearlos a Correccion (kind='client_change', estado rojo), y ALIMENTAR `deCampo` con un
  ARRAY SEPARADO (no el de reviewer) → resaltan inline GRATIS. NO entran al gate/conteo de
  aprobación (que sólo cuenta reviewer correction_request). Panel: sección "Del cliente"
  (coral, sin acciones de lifecycle). Hover card: rama cliente (sin confirmar/descartar/categoría).
- **#2 Bug de scroll en el portal**: la barra sticky (PortalAcciones) se encima del contenido
  al hacer scroll. Fix CSS (z-index/width/bg). Archivo: portal-acciones.tsx / portal-tarea.tsx.
- **#3 Mock del riel denso** (15+ tareas): subagente en paralelo → HTML → publico artifact.

Piezas #1/#4: `correcciones.ts` (Correccion += kind; color cliente) · `contexto.tsx`
(cambiosCliente + merge en deCampo) · `page.tsx` (cargar target_* de client_change + 2-col
+ quitar ClienteFeedback redundante) · `panel.tsx` (sección cliente) · `campo-lectura.tsx`
(hover card rama cliente) · `campo.tsx` (verificar overlay pinta marcas cliente).
Reglas: key={idea.id} en providers (lección route-param) · NO tocar el gate de aprobación ·
reap adversarial antes de shippear · NADA a prod sin "ship it".
Verificación: tsc·eslint·lib·db·build + render-proof + navegación (route-param).



## ✅ SHIPPED (2026-08-19 pm) — Negrita en el guión pegado (bold detection) [Pedro "ship it"]
Commit **1750def** → push a main (auto-deploy Vercel). SIN migración. Verificado
antes de pushear (tsc · eslint · lib 328 · db 234 · build · 2 render-proofs react-dom/server).
Aceptación real PENDIENTE de Pedro en el deploy live: pegar un guión con `**…**` →
negrita en Vista cliente + portal; y confirmar que el editor muestra los `**` literales.
- [x] `src/lib/negrita.ts`: `partirNegrita` (runs por marcadores) · `sinNegrita` · `desmarcarNegrita`
      (texto limpio + rangos de negrita en coords limpias — base del fix S1).
- [x] `guion.ts` `limpiarPegado`: conserva negrita a mitad de línea, des-negrita el andamiaje
      inicio-de-línea, `__x__`→`**x**`. HEADER sin cambio (el andamiaje llega des-negritado).
- [x] `linkify.tsx`: `linkificarTexto()` + `<TextoRico>` (negrita+links) + `<Negrita>` (sólo negrita).
- [x] `documento-tarea.tsx`: pretty→`<TextoRico>`, DialogoContenido→`<Negrita>`, header→`sinNegrita`.
- [x] `campo-lectura.tsx`: TODO el modo interactivo en espacio LIMPIO (desmarcarNegrita) + negrita
      por RANGO (pintarNegrita) → resaltados de corrección NUNCA parten un par `**` (fix S1).
- [x] `ortografia-actions.ts` + `validar-actions.ts`: `sinNegrita()` antes del prompt (texto y cita).
- [x] `actions.ts` `extraerGuion`: prompt conserva `**`; `sinInventar(sinNegrita(limpio), sinNegrita(extraido))` (fix M2).
- [x] Tests: fixtures de negrita en guión + partirNegrita/sinNegrita/desmarcarNegrita.

### Review — reap adversarial (Opus) sobre el diff → FIX-FIRST
- **S1 (SERIO, arreglado + probado)**: correcciones ancladas por offset partían el par `**` en el
  portal del cliente (dejaban `**` literales + perdían la negrita en precios/ofertas). Fix: anclar el
  modo interactivo en espacio limpio + negrita por rango. Probado: `<mark><strong>$46,800</strong></mark>`,
  cero `**` en 3 escenarios (frase completa / subset / adyacente).
- **M2 (menor, arreglado)**: el `*`-budget de `sinInventar` se aflojaba con los `**` → contar sobre
  `sinNegrita`. **M3 (menor, NO arreglado)**: `__x__`→`**x**` false-positive en `foo__bar` literal —
  raro en copy es-MX y NO es regresión nueva (el código viejo también lo maltrataba). Aceptado.
- Verificación prod-safe (sin tocar prod, sin preview): componentes reales renderizados con
  `typescript` + `react-dom/server`. Patrón nuevo para verificar render cuando el preview falla.
- **Limitación conocida v1 (aceptada)**: (a) una línea de CONTENIDO que empieza con palabra en negrita
  pierde esa negrita inicial (heurística inicio-de-línea); (b) si el revisor selecciona en el EDITOR
  (textarea crudo) una frase INCLUYENDO los `**`, esa corrección no resalta en Vista cliente (degrada
  sin fugar `**`). Casos raros; el humano revisa la vista previa/campo.
- PENDIENTE de Pedro: **"ship it"** (migración: ninguna). Aceptación real = pegar un guión con
  `**…**` en el deploy live → negrita en Vista cliente + portal. Y confirmar en el editor que los `**`
  se ven literales (por diseño).

## (histórico) plan original — Negrita en el guión pegado
Pedro: al pegar el guión en "Pegar guión", parte del texto viene con marcadores
literales `**…**` (p. ej. `**$46,800 m.n.**`). Hoy `limpiarPegado` los BORRA
(guion.ts:82). Objetivo: conservarlos como markdown, y renderizarlos en **negrita**
en las vistas de lectura/cliente. Decisiones de Pedro (esta sesión):
- FUENTE: los `**` ya vienen como caracteres literales en el pegado (NO es formato
  rico de Google Docs) → se DESCARTA la captura de `text/html` en onPaste.
- SCOPE: TODOS los campos de texto del documento (planos + estático).
- MODELO: `**…**` viven DENTRO de los campos de texto existentes (SIN migración).
  Negrita real en vistas de lectura/cliente; las cajas de edición muestran los `**`
  literales (un textarea no puede pintar media-negrita — límite del navegador).
  H.Ü.E ve el texto con los `**` quitados para no descuadrar sus guardarraíles.

**Piezas:**
- [ ] `src/lib/negrita.ts` (NUEVO, puro): `partirNegrita(texto)` → runs {texto,fuerte};
      `sinNegrita(s)` → quita `**`. Sin deps (test node + bundle-safe).
- [ ] `src/lib/guion.ts` · `limpiarPegado`: dejar de borrar `**`; normalizar `__x__`→`**x**`.
      HEADER tolera `**` inicial (un "Plano N" en negrita NO debe perder el plano).
- [ ] `src/components/ui/linkify.tsx`: extraer `linkificarTexto()`; `<TextoRico>` (negrita+links)
      y `<Negrita>` (sólo negrita). Server-safe.
- [ ] `documento-tarea.tsx`: pretty → `<TextoRico>`; DialogoContenido → negrita;
      encabezado del plano → `sinNegrita` (display only).
- [ ] `campo-lectura.tsx`: cada segmento → `<Negrita>` (cliente/revisor ven negrita real).
- [ ] `ortografia-actions.ts` + `validar-actions.ts`: `sinNegrita()` al texto ANTES del prompt
      (evita que el `*`-counting de fixSeguro y la IA se confundan — lección brain-recall).
- [ ] `actions.ts` `extraerGuion`: instruir al extractor que CONSERVE `**bold**`
      (limpio ya trae `**`; `sinInventar` sigue OK por submultiset).
- [ ] `scripts/test-lib.mjs`: actualizar el test que esperaba borrar `**`; añadir fixture con
      negrita real (partirNegrita, parseGuion conserva `**`, `__`→`**`, sinNegrita).

**Verificación:** tsc + eslint + `npm run build` + `npm test`. DOM: pegar fixture con
`**$46,800 m.n.**` → cajas de edición muestran `**` → importar → `<strong>` en Vista
cliente + portal (querySelector, no innerText — preview flaky). Reap adversarial del diff.
**Limitación conocida (v1, aceptada):** si una ETIQUETA o un CUE de locutor viene TODO
en negrita (`**Copy in:**`, `**Actor:**`), la detección estructural puede fallar — lo caza
la vista previa humana. El caso real de Pedro es negrita en VALORES (mitad de línea), OK.

## ✅ SHIPPED (2026-08-19) — Portal v2 + H.Ü.E v2 + perf [Pedro]
Commits c90b17b, 6903b48, a6237f5, 8282125, fd25f99 → main. Migración **0037** en prod.
- Perf loader de tarea (batch queries + parallel signed URLs) + H.Ü.E en barra sticky.
- H.Ü.E v2: aparece al revisar (no atado a "sin cerrar"), valida la ronda completa,
  chips verde/ámbar/rojo con razón+**sugerencia** al hover, detecta cambio-hecho +
  problema-nuevo-introducido. Huérfanas confirmadas = "✓ Ya confirmado".
- Portal: cambios LOCALIZADOS del cliente (select→escribe, sin tipo) + botón sticky
  Aprobar⇄Pedir cambios + fallback emoji + **riel visual** de tareas + efectos.
- CampoLectura compartido con rama `esCliente` (ruta revisor byte-preservada, re-verificada).
- **CONFIRMADO en live (2026-08-19)** — las dos pendientes:
  (1) H.Ü.E «elementos»: da `parcial` (ámbar) + razón + sugerencia exacta "usa el elemento importante"
      (bug viejo 'no' resuelto). Pedro ACEPTÓ ámbar ("keep it") — NO tunear a 'si' (ver lección 08-19).
  (2) round-trip cliente: PROBADO en prod con txn rolled-back (DO+raise) → published→in_corrections
      + client_change creado+resuelto, 0 persistido. UI DOM-verificado la sesión pasada; puppeteo de
      clicks no fiable (limitación de herramienta, logueada) → se probó el DATA path en prod.
- Siguiente si Pedro quiere: empujar más el riel (tarjetas más grandes / thumbnails /
  más motion). Login sigue siendo el bloqueador para LIVE (binding cliente↔sesión).


## ✅ SHIPPED (2026-08-17 pm) — Workspace WYSIWYG unificado (Fase 1) [Pedro]
Commits 0004dbb→eb99971 (4), pusheados a main → deploy 54ih2ey18 **Ready** en prod.
Verificado en prod (curl): "Documento de la tarea" + "Ver como cliente" + "Diálogos"
×14 sirviéndose. UN documento que se ve como el slide del cliente pero editable EN SU
LUGAR (agencia); toggle "Editar / Ver como cliente" (lectura oculta vacíos, formatea
diálogo) reemplaza el preview lateral chico. `documento-tarea.tsx` nuevo + `Campo`
variante `inline` (conserva autoguardado/conflicto/correcciones). Iconos por sección:
motion AZUL / diálogos NARANJA. El resto de la página (Reglas/Nota/Pegar/Cortinilla/
cabecera/runna-details) quedó IGUAL.
- Reap adversarial (FIX-FIRST → resuelto): HIGH legales_extra sin onCambio (arreglado);
  LOW focus tapaba resaltado + scrollbar-gutter (arreglados); pin NO se recorta (confirmado).
- PENDIENTE (scope Fase 1, para el portal/Fase 2): "ver como cliente" NO muestra aún
  la Cortinilla en formato cliente ni oculta la Nota interna — es preview parcial; la
  vista cliente 100% aislada es el portal. Dead code para limpiar luego: `voz()` sin
  llamadas, `PreviewSlide` component sin render (sólo tipos), `referencia_url` legacy.

## ✅ SHIPPED (2026-08-17 pm) — H.Ü.E chequeo ortografía/gramática es-MX [Pedro]
Commits fb81ff8/edaf383/b25792f → main → deploy kc8aguhjt **Ready** en prod. Al clic en
"Mandar a revisión": H.Ü.E revisa los campos (es-MX, Sonnet tool-use), si hay errores
abre un diálogo con cada error + fix; "Aplicar" hace find-replace anclado + guardarCampo;
SIEMPRE hay "Enviar de todos modos" (surface + override, nunca bloquea). Sin clave/DB →
degrada a enviar directo. `src/lib/ortografia.ts` (guard `fixSeguro`, 15 tests) +
`ortografia-actions.ts` (revisar/aplicar) + `dialogo-ortografia.tsx` + intercept en
acciones-tarea.tsx.
- Verificado contra API real: 5 fixes es-MX correctos, "6% de CASHBACK*" intacto.
- Reap (FIX-FIRST → resuelto): HIGH fixSeguro comparaba dígitos pelados → aceptaba
  mover el punto decimal (1.5%→15%, $60,000→$60.000); ahora compara tokens numéricos
  CON separadores (+3 tests). LOW auth: aplicarOrtografia ya gatea rol + valida tabla.
- Guardarraíl: números (con separadores) + legales (* % $) intactos; legales_extra y
  cortinilla EXCLUIDOS del chequeo; el humano hace clic para aplicar.
- PENDIENTE menor (aceptado por diseño): reemplazo de 1ª ocurrencia (self-heal para
  typos repetidos); cross-instance del botón top+bottom = 2× llamada posible (envío
  idempotente server-side). Campo aplicado no se refleja en el editor hasta recargar
  (Campo es uncontrolled) — el fix SÍ se guardó; el envío se lleva la tarea igual.

## 🔜 CANDIDATOS (post estas 2 features, sin comprometer)
- Portal del cliente (Fase 2): "ver como cliente" 100% aislado (render de cortinilla en
  formato cliente + ocultar Nota interna) → ruta del portal + login + client_change.
- Limpieza: `voz()` sin uso, `PreviewSlide` component muerto (sólo tipos), `referencia_url`
  legacy no se muestra en el doc.
- (viejos) Slack notif · Notion sync · prefs notif por-usuario · legal de Préstamos.

## ✅ HECHO — H.Ü.E como EXTRACTOR format-agnostic (Opción 1) (2026-08-17)
Construido y verificado (tsc + build + 236 tests limpios). Pedro lo prueba en prod.
- `extraerGuion(texto)` (server action) reemplaza a `normalizarGuion`: usa Sonnet 5
  con tool-use forzado (`emitir_planos`, schema de 7 campos) → devuelve `PlanoParsed[]`
  ESTRUCTURADO (no texto con saltos). Lee CUALQUIER formato (tabla, bullets, screenplay,
  labels distintas, deck sin saltos) y lo mapea a los campos del plano.
- Guardarraíl `sinInventar(entrada, extraído)` en guion.ts: cada letra/dígito/marca
  (* % $) del extraído debe existir en la entrada (SUBMULTISET, no igualdad — el
  extractor descarta rótulos, así que el contenido es subconjunto). Caza inventar/
  cambiar/expandir; OMITIR lo caza la vista previa humana. (Distinto de `mismoContenido`,
  que exige IGUALDAD para el normalizador structure-only, ya retirado.)
- Cliente: el botón "Deja que H.Ü.E lo lea" ahora aparece también cuando el parser
  determinista saca 0 planos (formato desconocido), no sólo cuando perdió saltos. La
  vista previa que viene de H.Ü.E muestra una nota persistente: "revisá que no haya
  omitido nada". Determinista-primero sigue: el parser plano maneja el deck sin IA.
- PENDIENTE (Pedro): probar en prod contra varios formatos reales. Requiere
  ANTHROPIC_API_KEY (ya en Vercel; falta en .env.local para probar en localhost).



## 🚀 CAMINO A LIVE (aclarado con Pedro 2026-08-13)
Modelo: TODO es pre-launch salvo el **portal del cliente**, que es lo ÚLTIMO que se
construye antes de lanzar (depende de que el lado-agencia esté 100% listo). Luego
**login**, luego go-live. Orden agencia-side → portal → login → live.
- [x] **Workload** (antes "Carga"): tablero de capacidad por persona (estado+cliente).
      SHIPPED 4203559. (Pedro pidió el label en inglés "Workload".)
- [x] **Entregas** (agency-side v1): SHIPPED 5abbe88. Tablero global que consolida los
      2 stubs → una sección `/entregas` (GENERAL). Rastrea lo `published` (Con el
      cliente / En cambios / Entregado) por cliente. FALTA (con el portal): subdividir
      "Con el cliente" en revisando/aceptó — los estados finos los produce el portal.
- [ ] **Portal del cliente** (ÚLTIMO pre-launch): el cliente ve lo `published`, pide
      Revisión/Cambios/Aprobado; alimenta el tablero de Entregas.
- [ ] **Login** (final, antes de live). Emails del equipo se llenan solos al login.
- [ ] Dato: **legal de Préstamos** (sólo Card sembrado; lo da Pedro, no inventar).
- POST-LAUNCH (no bloquean): **Copies** template (Pedro: post-launch) · Slack notif ·
  prefs notif por-usuario · F6 Notion (bloqueado en token) · API/MCP tokens.



## 🎨 IN PROGRESS (2026-08-12) — Design God Mode pass (Pedro: full pass = A+B+D)
4-dimension audit done via parallel agents (color/contrast, consistency, motion, typography).
Scope chosen: contrast fixes + unified <Pill> + motion. Dark-mode (C) deferred.

**Phase A+B — color/pill layer — ✅ SHIPPED (ff20540, live p69irdwen):**
- [x] globals.css: `--status-warning` (light+dark) + `--deck-blue/--deck-orange`
- [x] `src/components/ui/pill.tsx` — un componente: soft (tinte+tinta+punto) | solid (parSolido, AA garantizado, maneja hex Y var()) | status (darkened+blanco)
- [x] Convert name pills (ChipPersona), channels, avatars (perfil/actividad), equipo chip, notif count, asset-type panel gradients, deck bands (oscurecidas), status badges (bundle-card + board), amber-*→--status-warning
- [x] VERIFICADO en vivo: page de tarea 16→0 fails medibles; tablero AA; tsc+build
**Phase D — motion — ✅ CASI COMPLETO (e96902f, 57e8648):**
- [x] Keyframes gl-rise-in/gl-pop/gl-enter · autosave indicator (fade+auto-dismiss+✓) · pin de corrección pop · planos nuevos gl-enter
- [x] Tooltip delay 0→200ms · board drag pickup scale-1.03 · chevron rotante en rondas
- [ ] PENDIENTE (único): kill 2× reload()→optimistic insert (state plumbing, riesgo medio — el reload igual funciona con gl-enter). Board "landing confirm" opcional.
**Mobile nav — ✅ SHIPPED (57e8648):** <SidebarNav> reusable + <MobileNav> (hamburguesa + Sheet lateral) en la Topbar. Verificado a 375px.
**Type — ✅ COMPLETO:** [x] textarea 13→14px · [x] 8px→10px floor · [x] `.gl-eyebrow` en los 2 close-matches (los ~58 restantes tienen tamaños variados a propósito)
**Color menor — ✅:** [x] botones de corrección (Confirmar/Pedir cambio/Fijar) oscurecidos a AA. Pendiente opcional: unify DRY de los color-maps de correcciones (ya pasan AA).
**Headings — ✅:** [x] cada página con <h1> real (h2→h1); [x] h3/h4 mal usados como micro-labels → <p>.

### 🎨 DESIGN PASS COMPLETO (2026-08-12/13, live). Commits: 09b60f4→e3f3d10.
Contraste (Pill unificado, 0 AA fails en workspace) · motion (indicador, pin pop, enter,
tooltip, drag, chevron, reload→optimista) · mobile nav (hamburguesa+Sheet) · tipografía/
headings. Único opcional restante: DRY de color-maps de correcciones (cosmético).

## 🚧 IN PROGRESS (2026-08-11 pm) — "Pegar guión" importer (Feature 2)
Deck-script paste → parse → editable preview → confirm → atomic write. Both video
(N planos) y estático (fila única). Diseño: parser DETERMINISTA (verbatim) +
normalizador con IA guardado (structure-only) para el caso sin saltos de línea.
Respeta el PEDRO_OVERRIDE del parser: formato DEFINIDO + preview-then-confirm, no
adivina; campo no encontrado → blank.
- [x] **Paso 1 — parser** `src/lib/guion.ts` (parseGuion/parseEstatico/contarPlanos/
      mismoContenido). Gold test contra la muestra REAL de Pedro (6 planos DiDi).
      Mapeo: CTA→copy_in, Copy in múltiples unidos, dialogo→"(Quien) texto". Commit 4c0b068.
- [x] **Paso 2 — RPC + actions** mig 0030 `rpc_import_planos` (replace/append, atómico,
      read_time por trigger) + importarGuion/importarEstatico. 11 db tests. Commit e787157.
- [x] **Paso 3 — UI** `pegar-guion.tsx` (diálogo + preview editable + radio replace/append)
      montado en editor-tarea.tsx. Aviso de pegado-sin-saltos. Commit 21ac7e4.
- [x] ✅ **SHIPPED** (Pedro "apply + ship"): mig 0030 aplicada a prod — **S.P.A.M
      byte-idéntico 42/31/6**, GL ledger 28→29, RPC + grants live. Push a main →
      deploy Ready. RPC verificado en prod end-to-end (txn con rollback, 0 residuo).
- [x] **Paso 4 — normalizador con IA** (commit 8c113cf): botón "Arreglar con IA" →
      normalizarGuion (claude-sonnet-5, thinking off) re-inserta SÓLO saltos de línea +
      guardarraíl `mismoContenido` (rechaza si cambió cualquier carácter no-espacio) →
      re-parseo determinista. Dep `@anthropic-ai/sdk`; `ANTHROPIC_API_KEY` en .env.local.
      Verificado en vivo contra la API real (guard PASA, 6 planos, copy intacto).
      ⚠️ FALTA: (a) el "ship it" de Pedro para pushear; (b) agregar ANTHROPIC_API_KEY al
      env de Vercel (sin ella el path de IA en prod degrada a "no configurado").
- [ ] **Estático**: parser PROVISIONAL — falta la muestra real de estático de Pedro
      para fijar el gold test.



## ✅ DONE (2026-08-11 pm) — Descartar una corrección fijada (revisor cambió de opinión)
Feature 1 del next-session-prompt. Design locked with Pedro: **hard delete**, **anytime**,
behind a **two-step inline confirm**. NOT deployed yet — awaiting Pedro's "ship it".
- [x] Server action `descartarCorreccion(ideaId, commentId)` en `correcciones-actions.ts`
      — reviewer-only (`canOverrideStatus`), hard delete scoped by id+idea_id+kind (mirror `borrarPlano`).
- [x] `descartar(id)` wired into `CorreccionesProvider` context (toast "Corrección descartada").
- [x] Panel: reviewer-only **Descartar** (Trash2, `ml-auto`, destructive-ghost) → two-step
      confirm "¿Descartar? · Sí, descartar (danger) · Cancelar (autoFocus = safe default)".
      Added `tone="danger"` + `autoFocus` to `BtnAccion`.
- [x] DB test (test-db.mjs): delete self-heals — deleting one of two open keeps the round
      (no spurious bump); deleting the last open leaves 0 unresolved (button reverts, no strand).
- [x] Reap (5-pass): 1 a11y fix applied (autofocus the safe option). No other findings.
- [x] Gates: tsc clean · eslint clean (only pre-existing line-86 ternary warning) ·
      `npm test` 183+191+44 pass (incl. 4 new) · `npm run build` OK.
- [x] Live render check on task A12 (seeded 1 correction, panel + Descartar trigger render for
      reviewer, then cleaned up → A12 back to 0). ⚠️ Click-through NOT drivable: browser MCP can't
      reach React handlers this session (even the pre-existing round-collapse toggle didn't respond;
      read_page/screenshot blank). Interaction is trivial useState; logged the tooling limit in lessons.md.
### Review / follow-ups
- No migration (hard delete). No new secret surface. Same auth model as siblings (service-role + role gate).
- Descartar shows for the reviewer on ALL states (open/done/closed) per the "anytime" decision.
- Discard doesn't notify or move state (by design). Round math + morphing button self-heal on refresh.

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
- [x] ✅ SHIPPED (Pedro "apply it" + "ship it" 2026-08-11): Mig 0029 aplicada a live ANTES del
      push (S.P.A.M 42/31/6; GL 28; 1 sola rpc_add_correction, sin overload). Commit 1e2fb7d
      pusheado. Verificado END-TO-END EN PROD (runna-command-center.vercel.app): el <mark>
      resalta «6% de CASHBACK*», panel muestra el quote, best-effort drop al editar. Datos de
      prueba limpiados (copy_in restaurado, 0 correcciones). Feature LIVE.
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
