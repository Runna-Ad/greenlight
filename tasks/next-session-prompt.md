# Próxima sesión — Greenlight · by Rünna

## Arranque (lee esto primero, en orden)
1. `tasks/project-state.md` — el estado real y completo (recién actualizado).
2. `tasks/session-log.md` — bitácora cronológica (lo de arriba es lo más reciente).
3. `tasks/lessons.md` — mistakes/overrides/wins. **Lee los PEDRO_OVERRIDE.**
4. Este archivo — qué sigue y cómo.

## Dónde quedamos (fin de sesión 2026-08-05, larga)
La **vista de trabajo (workspace) está COMPLETA y desplegada**. En una sola
sesión se construyó todo el pipeline interno: bundles → workspace de 3 secciones
→ referencias drag&drop → cortinilla con legales → reglas con tooltips → flujo
de aprobación → enviar a cliente → 2 pases de diseño (Design God Mode). Todo en
producción, verificado en vivo, S.P.A.M intacto (42/31/6).

**Migraciones 0013–0021 aplicadas** (⚠️ no existe 0017 — era Notion, diferida;
la numeración salta 0016→0018 a propósito). La próxima migración usa un
timestamp nuevo (`20260806*` o superior), NUNCA reciclar 0017.

Todo está commiteado. **No hay remoto git** — los deploys van por
`npx vercel --prod --yes`.

## LO ÚNICO PENDIENTE DEL PLAN: F6 · Biblioteca Notion
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
