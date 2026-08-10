# Session log — Greenlight · by Rünna

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
