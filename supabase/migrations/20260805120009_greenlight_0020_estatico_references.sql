-- ═══════════════════════════════════════════════════════════════
-- 0020 — Referencias por estático (imágenes)
-- ═══════════════════════════════════════════════════════════════
-- El template de estático tenía un campo de TEXTO para la liga de imagen de
-- referencia. Pedro lo quiere como el drag & drop de imágenes que ya existe
-- (sólo imágenes, sin video). Como un estático no tiene planos, se le da su
-- propia tabla de vínculo — espejo de plano_references, mismo registro
-- reusado (produccion.references).
create table produccion.estatico_references (
  estatico_id  uuid not null references produccion.estaticos(id)   on delete cascade,
  reference_id uuid not null references produccion.references(id)  on delete cascade,
  note         text,
  position     int not null default 0,
  created_at   timestamptz not null default now(),
  primary key (estatico_id, reference_id)
);
create index estatico_refs_idx on produccion.estatico_references(estatico_id);

alter table produccion.estatico_references enable row level security;
-- Mismo patrón que plano_references: el equipo lee; lead o asignado escribe.
create policy estatico_refs_team_read on produccion.estatico_references
  for select using (produccion.is_team());
create policy estatico_refs_write on produccion.estatico_references for all
  using (exists (select 1 from produccion.estaticos e
                  where e.id = estatico_id
                    and (produccion.is_lead() or produccion.is_assigned(e.idea_id))))
  with check (exists (select 1 from produccion.estaticos e
                       where e.id = estatico_id
                         and (produccion.is_lead() or produccion.is_assigned(e.idea_id))));

grant all on produccion.estatico_references to anon, authenticated, service_role;
