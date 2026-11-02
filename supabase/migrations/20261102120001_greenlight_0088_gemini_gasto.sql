-- ══════════════════════════════════════════════════════════════════════════════
-- 0088 — Formatos: lo que cuesta Gemini, y un tope diario que el Master mueve
-- ══════════════════════════════════════════════════════════════════════════════
-- El freno de hoy cuenta llamadas por persona en la memoria de cada instancia. Esto guarda el costo real de cada
-- llamada y, si el Master lo pone, un tope en dólares por día (hora de México). Sin tope (null, el valor inicial)
-- no se bloquea nada: sólo se anota. `usd` null = Google no reportó el uso (no se inventa).
-- Aditivo; sólo `produccion`; mismo patrón que prisma_formatos_lecturas (0087): RLS master-only, la app usa service_role.

alter table produccion.hue_settings
  add column gemini_tope_diario_usd numeric(8,2) check (gemini_tope_diario_usd is null or gemini_tope_diario_usd > 0);

create table produccion.prisma_gemini_gastos (
  id         bigint generated always as identity primary key,
  ruta       text not null check (ruta in ('tamano', 'copia', 'fondo_plano', 'leer')),
  modelo     text not null check (char_length(modelo) between 1 and 80),
  usd        numeric(10,4) check (usd is null or usd >= 0),
  member_id  uuid references produccion.track_members(id) on delete set null,
  created_at timestamptz not null default now()
);
create index prisma_gemini_gastos_created_at on produccion.prisma_gemini_gastos (created_at);

alter table produccion.prisma_gemini_gastos enable row level security;
create policy prisma_gemini_gastos_master on produccion.prisma_gemini_gastos for all using (produccion.auth_role() = 'master') with check (produccion.auth_role() = 'master');
grant select, insert on produccion.prisma_gemini_gastos to service_role;

-- Lo gastado hoy y este mes, en SQL (no traer las filas a la app para sumarlas).
create function produccion.prisma_gemini_resumen()
returns table (hoy_usd numeric, mes_usd numeric, llamadas_hoy int, sin_costo_hoy int)
language sql stable set search_path = '' as $$
  with ahora as (select now() at time zone 'America/Mexico_City' as t)
  select
    coalesce(sum(g.usd) filter (where g.created_at >= (select date_trunc('day', t) from ahora) at time zone 'America/Mexico_City'), 0),
    coalesce(sum(g.usd), 0),
    (count(*) filter (where g.created_at >= (select date_trunc('day', t) from ahora) at time zone 'America/Mexico_City'))::int,
    (count(*) filter (where g.usd is null and g.created_at >= (select date_trunc('day', t) from ahora) at time zone 'America/Mexico_City'))::int
  from produccion.prisma_gemini_gastos g
  where g.created_at >= (select date_trunc('month', t) from ahora) at time zone 'America/Mexico_City';
$$;
revoke all on function produccion.prisma_gemini_resumen() from public, anon, authenticated;
grant execute on function produccion.prisma_gemini_resumen() to service_role;
