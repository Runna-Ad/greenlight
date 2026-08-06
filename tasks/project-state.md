# Project state — Greenlight · by Rünna
Última actualización: 2026-08-06 (constructor de brief + panel /admin)

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
- Deploy: **`npx vercel --prod --yes`** (CLI, confiable). ⚠️ El auto-deploy por
  `git push` NO es confiable: repo privado/org en Vercel Hobby no auto-deploya
  (ver lección). Verificar con `npx vercel ls` que el último Production = el
  último commit; ante la duda, forzar con la CLI.
- Repo: **`github.com/Runna-Ad/runna-command-center`** — público (org Runna-Ad)

## Base de datos (LIVE)
- Proyecto Supabase **S.P.A.M** `ybbrpqzbedaxsmotgtkh`, esquema propio **`produccion`**
- S.P.A.M vive en `public` (42 tablas) y NO se toca — `npm run check:isolation`
  mata cualquier migración que mencione `public.`/`storage.` (por eso el bucket
  se crea fuera de migraciones). **S.P.A.M verificado idéntico**: 42 tablas / 31
  migraciones / 6 usuarios, antes y después de todo.
- Migraciones: ledger propio en `produccion._migrations`, `npm run migrate`
  (NUNCA `supabase db push` — dañaría el historial de S.P.A.M).
- **Migraciones aplicadas 0001–0026** (OJO: **no existe 0017** — era la de
  Notion, que se difirió; la numeración salta 0016→0018. F6/Notion cuando se
  haga usa un timestamp NUEVO, no 0017). Últimas: **0022** `rpc_crear_brief`,
  **0023** enum `app_role += 'master'`, **0024** `track_members += role/email/
  slack_user_id` + helpers RLS con master, **0025** canal `email` activo +
  `track_members.notify_email`, **0026** `rpc_notificar_brief` (aviso al crear
  brief).
- **Storage**: bucket privado `greenlight-referencias` (creado con
  `npm run setup:storage`, fuera de migraciones). Imágenes se sirven por signed
  URL firmada por render. Verificado: privado (acceso público = 400).

### Datos actuales (cliente DiDi, marcas Card + Préstamos)
briefs=2 · ideas(tareas)=32 · assets(archivos)=227 · track_members=14
snippets legal=1 (sólo Card) · references(links del sheet)=15

## Integraciones
- **Google Sheets** vía Apps Script (solo lectura). `scripts/apps-script/Code.gs`.
- **Vercel env**: SHEETS_SCRIPT_URL/SECRET, NEXT_PUBLIC_SUPABASE_URL/ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY. (Falta NOTION_TOKEN/NOTION_DB_ID para F6.)
- `.env.local` local tiene las mismas; los scripts node lo cargan a mano.

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

## Qué NO existe todavía
- **F6 · Biblioteca Notion** — bloqueado en el token de integración + link de la
  base. La tabla destino (`snippets`) + el picker + el CRUD de Biblioteca en
  /admin ya existen; falta cablear la sincronización con Notion.
- **Emails de notificación — YA FUNCIONAN** (Gmail SMTP, sender `unique@runna.
  com.mx`, dispatcher inline con `after()` en el Vercel de Greenlight). Salen en
  nuevo-brief · a-revisión · cambios · aprobada · enviada-al-cliente. **Falta
  sólo llenar el `email` de cada persona en /admin ▸ Equipo** (hoy vacíos → esas
  notificaciones se marcan `skipped`; se activan solos al llenarlos). Env
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
