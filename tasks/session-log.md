# Session log — Greenlight · by Rünna

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
