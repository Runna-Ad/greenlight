-- ═══════════════════════════════════════════════════════════════
-- 0035 — field_edits: QUIÉN escribió cada sección (autoría)
-- ═══════════════════════════════════════════════════════════════
-- Para la Evaluación por AUTOR (fase 2.5): en vez de repartir el puntaje entre
-- todos los asignados de una tarea, se atribuye cada corrección a quien REALMENTE
-- escribió la sección corregida. La plataforma ya sabe quién edita (guardarCampo
-- resuelve `soy`); esto sólo lo PERSISTE. Log append-only: una fila por guardado.
--
-- Atribución (en el loader): una corrección sobre (tabla, fila, campo) creada en el
-- momento T → autor = el member_id de la última edición de ESE campo con at <= T
-- (quien escribió la versión que el revisor marcó). Las ediciones posteriores
-- (durante el rework) NO cambian la atribución de una corrección ya creada.
--
-- Identidad = honor-system (`gl_soy`) mientras el login esté apagado, así que la
-- autoría es direccional hoy y exacta cuando entre AUTH. Checklist de launch.

create table if not exists produccion.field_edits (
  id         uuid primary key default gen_random_uuid(),
  idea_id    uuid not null references produccion.ideas(id) on delete cascade,
  tabla      text not null,        -- 'planos' | 'estaticos'
  fila_id    uuid,                 -- la fila del plano/estático (null = campo de idea)
  campo      text not null,        -- 'accion' | 'dialogo' | 'copy_in' | ...
  member_id  uuid references produccion.track_members(id) on delete set null,
  at         timestamptz not null default now()
);
create index if not exists field_edits_idea_idx on produccion.field_edits(idea_id);
-- Busca "última edición de este campo antes de T": ordena por campo + at.
create index if not exists field_edits_campo_idx
  on produccion.field_edits(idea_id, tabla, fila_id, campo, at);

alter table produccion.field_edits enable row level security;
-- El equipo lee (para la Evaluación); el equipo escribe su propia edición (el que
-- edita un campo es, por definición, del equipo — guardarCampo ya lo exige). Sin
-- update/delete: es append-only.
create policy field_edits_team_read on produccion.field_edits
  for select using (produccion.is_team());
create policy field_edits_team_write on produccion.field_edits
  for insert with check (produccion.is_team());

-- Grants explícitos (un 42501 es de los fallos que PGlite no ve).
grant select, insert on produccion.field_edits to anon, authenticated, service_role;
