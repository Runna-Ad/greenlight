-- ─────────────────────────────────────────────────────────────
-- refs-impact.sql — ¿sirven las referencias que H.Ü.E lee? (medición · Step 2)
--
-- Correr con el CLI (login persistente — research.md 2026-08-21):
--   supabase db query --linked --file scripts/refs-impact.sql -o json
-- Verificá el proyecto linkeado ANTES: cat supabase/.temp/project-ref
--
-- Contexto: cada generación de H.Ü.E registra en hue_generations.referencias las ligas
-- que ENTRARON al prompt: [{url, tipo, estado, chars}] (0064; TikTok se suma en Tier 2).
-- El "editRate" borrador→publicado NO es una columna — se calcula EN VIVO en la app
-- (resumenEdiciones / diffGuion en src/lib/hue-data.ts), así que el corte de CALIDAD
-- ("¿se editan MENOS los guiones que llevaron referencia?") se lee desde el Hub de H.Ü.E,
-- no desde aquí. Este archivo cubre el corte de ADOPCIÓN, que sí es SQL puro y ya corre.
--
-- Sólo cuenta generaciones IMPORTADAS (imported_at not null): las que de verdad se usaron
-- (misma regla que el loop de ediciones — una regeneración nunca importada no cuenta).
-- OJO: al principio habrá poca data — la señal se vuelve confiable con decenas de tareas.
-- ─────────────────────────────────────────────────────────────

-- A) Generaciones usadas por plataforma de referencia + estado (rollup con totales).
with usadas as (
  select id, kind, coalesce(referencias, '[]'::jsonb) as referencias
  from produccion.hue_generations
  where imported_at is not null
),
refs as (
  select u.id, r->>'tipo' as tipo, r->>'estado' as estado
  from usadas u
  left join lateral jsonb_array_elements(u.referencias) as r on true
)
select
  coalesce(tipo, '(sin referencia)') as tipo,
  estado,
  count(distinct id)                 as generaciones
from refs
where estado is null or estado in ('leida', 'parcial')  -- las que de verdad entraron al prompt
group by rollup (tipo, estado)
order by tipo nulls last, estado nulls last;

-- B) % de generaciones usadas que llevaron AL MENOS una referencia útil (leida|parcial).
with usadas as (
  select coalesce(referencias, '[]'::jsonb) as referencias
  from produccion.hue_generations
  where imported_at is not null
)
select
  count(*) as generaciones_usadas,
  count(*) filter (
    where exists (
      select 1 from jsonb_array_elements(referencias) e
      where e->>'estado' in ('leida', 'parcial')
    )
  ) as con_referencia_util,
  round(
    100.0 * count(*) filter (
      where exists (
        select 1 from jsonb_array_elements(referencias) e
        where e->>'estado' in ('leida', 'parcial')
      )
    ) / nullif(count(*), 0),
    1
  ) as pct_con_referencia;
