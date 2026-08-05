# Project state — Greenlight · by Rünna
Última actualización: 2026-08-05

## Qué es
App interna de producción de anuncios que reemplaza el Google Sheet de DiDi.
Multi-cliente. UI en español. Pipeline: intake → ejecución → revisión → portal
del cliente → entrega.

## Stack
Next 16.2 (App Router) · React 19 · Tailwind v4 · shadcn/ui · Supabase · Vercel
Fuentes: Poppins (títulos) · Inter (datos) · Geist Mono (nombres de archivo) ·
Unbounded (wordmark)

## Desplegado
- **https://runna-command-center.vercel.app** — público, sin login (decisión de Pedro)
- Vercel: cuenta pedro-3338, proyecto runna-command-center

## Base de datos (LIVE)
- Proyecto Supabase **S.P.A.M** `ybbrpqzbedaxsmotgtkh`, esquema propio **`produccion`** (29 tablas)
- S.P.A.M vive en `public` (42 tablas) y NO se toca — `npm run check:isolation` lo impide
- Migraciones: ledger propio en `produccion._migrations`, aplicadas con `npm run migrate`
  (NUNCA `supabase db push` — ver lessons.md)
- 7 migraciones aplicadas (0001 init … 0007 task-is-a-row)

### Datos actuales
briefs=2 · ideas(tareas)=32 · assets(archivos)=227 · staged_rows=32
profiles=1 (Pedro admin) · track_members=14 · vocab_terms=37 · clients=1 (DiDi)

## Integraciones
- **Google Sheets** vía Apps Script desplegado por Pedro (solo lectura).
  `scripts/apps-script/Code.gs`; secreto en Propiedades del script.
  Lista las 31 pestañas con nombre completo; 6 son proyectos válidos.
- **Vercel env**: SHEETS_SCRIPT_URL/SECRET, NEXT_PUBLIC_SUPABASE_URL/ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY

## Qué funciona
- Selector de clientes → espacio por cliente
- Sincronizar: descubre proyectos, clasifica pestañas, previsualiza, importa de verdad
- Tarjetas de revisión editables (chips del vocabulario real, deshacer por campo)
- Dedup entre sesiones (probado)
- Tablero lee datos reales (32 tareas)
- Nombres de archivo: 3 fórmulas, contrato TS↔BD probado con 75 combinaciones
- Formulario de intake manual (21 columnas, Real/Normal, "Otro" en todo dropdown)

## Qué NO funciona todavía
- Tablero no es interactivo (sin asignar, sin arrastrar)
- Sin plantilla de trabajo (guión por planos / estático / copies)
- Sin revisión, sin Gary, sin versiones
- Sin portal del cliente
- Sin login (a propósito)
- Carga, Entregas por revisar, Entregas y Configuración no existen (P6). En el
  menú se ven apagados con "Pronto" y no navegan — antes eran enlaces que
  devolvían 404 por prefetch. Al construir cada página, quitar su `soon: true`
  en `src/components/shell/sidebar.tsx`.

## Riesgos conocidos
1. **SIN REPO DE GIT PROPIO** — git root es `/Users/work`. Todo sin versionar. ARREGLAR PRIMERO.
2. `SHEETS_SCRIPT_SECRET` estuvo público ~4 min (leak RSC, ya corregido) — rotar
3. App pública sin login — decisión de Pedro, revisar antes del lanzamiento
4. `database.types.ts` es manual, no generado

## Tests
`npm test` → isolation (7) + lib (15) + db/PGlite (35) + sync/red en vivo (56)
