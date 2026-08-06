# Próxima sesión — Greenlight · by Rünna

## Arranque (lee esto primero, en orden)
1. `tasks/project-state.md` — el estado real y completo (recién actualizado).
2. `tasks/session-log.md` — bitácora cronológica (lo de arriba es lo más reciente).
3. `tasks/lessons.md` — mistakes/overrides/wins. **Lee los PEDRO_OVERRIDE.**
4. Este archivo — qué sigue y cómo.

## Dónde quedamos (fin de sesión 2026-08-06, larga)
El **workspace** ya estaba completo. Esta sesión se agregó, todo en producción y
verificado en vivo (S.P.A.M intacto 42/31/6):
- **Constructor de brief nuevo** (`/[cliente]/briefs/nuevo`) con 3 gestos de
  duplicación + RPC atómico `rpc_crear_brief`.
- **Referencias (imágenes/videos) al lado del cliente** en el preview.
- **Panel `/admin`** completo: Perfil · Equipo/roles (con **Master Builder**) ·
  Actividad · Integraciones · Biblioteca (CRUD de snippets).
- **Emails de notificación** (Gmail SMTP, sender `unique@runna.com.mx`) —
  dispatcher inline con `after()`; avisa en nuevo-brief · a-revisión · cambios ·
  aprobada · enviada-al-cliente. Probado en vivo a petedv31@.
- Fixes: Trend "-" ya no genera falsa referencia · # Idea alineado · Notas ya no
  se pasa al cliente (es interno).

**Migraciones 0001–0026 aplicadas** (⚠️ no existe 0017 — Notion, diferida; salta
0016→0018 a propósito). Últimas: 0022 rpc_crear_brief · 0023 enum master · 0024
track_members role/email/slack · 0025 canal email + notify_email · 0026
rpc_notificar_brief. La próxima migración usa un timestamp NUEVO
(`20260806120006` o superior), NUNCA reciclar 0017.

Todo commiteado + pusheado a `Runna-Ad/runna-command-center` (público).
⚠️ **Deploys por `npx vercel --prod --yes` (CLI)** — el auto-deploy por git push
NO es confiable (repo privado/org en Vercel Hobby; ver lección). Verificar con
`npx vercel ls`. Login sigue apagado (beta, hasta el final — NO re-abrir el tema).
Secretos de email en `.env.local` (gitignoreado) + Vercel env — nunca commitear.

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
