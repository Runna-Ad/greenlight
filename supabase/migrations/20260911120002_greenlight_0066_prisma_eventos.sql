-- ═══════════════════════════════════════════════════════════════
-- 0066 — HÜE Prisma: eventos de uso (lo que el diseñador HACE con un prompt)
-- ═══════════════════════════════════════════════════════════════
-- Para que H.Ü.E aprenda solo: qué prompt se COPIÓ o se ABRIÓ en la herramienta
-- (= sirvió), qué VERSIÓN se pidió (segura/audaz/mínima) y qué CAMBIO se pidió al
-- refinar. El writer lee esto al generar (ganadores + preferencias por marca) sin
-- que nadie tenga que curar nada. El pulgar sigue en prisma_ratings.
-- `client_id`, `job`, `tool` y `variante` van DESNORMALIZADOS a propósito: la
-- agregación por marca es una sola consulta sin joins. Aditivo; sólo `produccion`.
create table produccion.prisma_eventos (
  id         uuid primary key default gen_random_uuid(),
  spec_id    uuid not null references produccion.prisma_specs(id) on delete cascade,
  prompt_id  uuid references produccion.prisma_prompts(id) on delete cascade,
  client_id  uuid references produccion.clients(id) on delete set null,
  job        text not null,
  tool       text not null,
  variante   text not null default 'base' check (variante in ('base','segura','audaz','minima')),
  user_id    uuid references produccion.track_members(id) on delete set null,
  tipo       text not null check (tipo in ('copiado','abierto','variante','refinado')),
  detalle    text check (char_length(detalle) <= 300), -- versión pedida / texto del cambio (recortado)
  created_at timestamptz not null default now()
);
create index prisma_eventos_client_idx on produccion.prisma_eventos (client_id, created_at desc);
create index prisma_eventos_spec_idx   on produccion.prisma_eventos (spec_id, created_at desc);
-- Un mismo prompt copiado/abierto 200 veces por la misma persona cuenta UNA vez: la señal no
-- se puede inundar a golpe de click (la app inserta con "si ya existe, nada").
create unique index prisma_eventos_unico_idx on produccion.prisma_eventos (prompt_id, user_id, tipo);

-- Una versión pedida nace como spec HERMANO: este enlace dice de cuál viene (para agrupar
-- "todas las versiones de esta idea" sin adivinar por idea/fecha). Nullable; aditivo.
alter table produccion.prisma_specs add column origen_spec_id uuid references produccion.prisma_specs(id) on delete set null;
create index prisma_specs_origen_idx on produccion.prisma_specs (origen_spec_id);

-- RLS + grants (patrón prisma_* / hue_*): master-only; la app escribe por service_role.
alter table produccion.prisma_eventos enable row level security;
create policy prisma_eventos_master on produccion.prisma_eventos for all using (produccion.auth_role() = 'master') with check (produccion.auth_role() = 'master');
grant select, insert, update, delete on produccion.prisma_eventos to service_role;
