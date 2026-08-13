# Project state — Greenlight · by Rünna
Última actualización: 2026-08-13 (Design God Mode pass: Pill/contraste + motion + mobile nav)

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
- **https://runna-command-center.vercel.app** — público, sin login (decisión de Pedro)
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
  env + `.env.local`. Sólo el server action `normalizarGuion` la usa (Sonnet 5,
  thinking off) para reordenar un guión pegado SIN saltos de línea. (Pedro: la key
  está bien, NO rotar.)
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
  Parser determinista `src/lib/guion.ts` (parseGuion/parseEstatico/contarPlanos +
  guard `mismoContenido`/`desdeElPrimerPlano`). Para pegados SIN saltos de línea,
  botón **"Deja que H.Ü.E lo arregle"** → `normalizarGuion` (Sonnet, structure-only)
  + guard fact-shaped (dígitos + * % $ + multiset de letras; tolera coma/comilla/
  espacios). Verificado 3/3 en vivo con el guión real de DiDi. Estático: parser
  PROVISIONAL (falta muestra real de Pedro para gold-test).
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
3. App pública sin login — decisión de Pedro; revisar en pre-lanzamiento.
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
