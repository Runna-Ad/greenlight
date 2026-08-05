-- ═══════════════════════════════════════════════════════════════
-- 0016 — Referencias: imágenes subidas + videos por link, por plano
-- ═══════════════════════════════════════════════════════════════
-- Wireframe: sección de imágenes/videos de referencia como thumbnails, con una
-- caja de referencia por plano. Decisión de Pedro: las IMÁGENES se suben (al
-- bucket privado greenlight-referencias, creado por scripts/setup-storage.mjs,
-- FUERA de migraciones), los VIDEOS van por link con su thumbnail.
--
-- Se reusa produccion.references (registro de URLs, url unique) — NO se crea un
-- registro paralelo. Sólo gana las columnas que le faltaban para alojar el
-- puntero al archivo subido.

-- default 'video' es correcto para las 15 filas que la 0012 rescató del sheet:
-- todas son ligas, no archivos.
alter table produccion.references add column kind text not null default 'video'
  check (kind in ('imagen','video'));
alter table produccion.references add column storage_path text;
alter table produccion.references add column mime  text;
alter table produccion.references add column bytes bigint;
alter table produccion.references add column ancho int;
alter table produccion.references add column alto  int;
alter table produccion.references add column added_member_id uuid
  references produccion.track_members(id) on delete set null;

-- Una imagen SIEMPRE tiene su archivo; un video vive en su url. El CHECK evita
-- una imagen sin dónde estar.
alter table produccion.references add constraint references_imagen_tiene_path
  check (kind <> 'imagen' or storage_path is not null);

-- ─────────────────────────────────────────────────────────────
-- La caja de referencia POR PLANO
-- ─────────────────────────────────────────────────────────────
-- idea_references (PK idea_id, reference_id) no sirve: impide usar la misma
-- referencia en dos planos, y cambiar una PK con datos vivos es riesgo sin
-- ganancia. El REGISTRO (references) sí se reusa — que es lo que pidió Pedro.
create table produccion.plano_references (
  plano_id     uuid not null references produccion.planos(id)     on delete cascade,
  reference_id uuid not null references produccion.references(id) on delete cascade,
  note         text,
  position     int not null default 0,
  created_at   timestamptz not null default now(),
  primary key (plano_id, reference_id)
);
create index plano_refs_plano_idx on produccion.plano_references(plano_id);

alter table produccion.plano_references enable row level security;
-- Mismo patrón que estaticos/planos (0012): el equipo lee; el lead o quien
-- tiene la tarea asignada escribe.
create policy plano_refs_team_read on produccion.plano_references
  for select using (produccion.is_team());
create policy plano_refs_write on produccion.plano_references for all
  using (exists (select 1 from produccion.planos p
                  where p.id = plano_id
                    and (produccion.is_lead() or produccion.is_assigned(p.idea_id))))
  with check (exists (select 1 from produccion.planos p
                       where p.id = plano_id
                         and (produccion.is_lead() or produccion.is_assigned(p.idea_id))));

-- Grants EXPLÍCITOS aunque 0006 los herede por default: un 42501 es de los tres
-- fallos que PGlite no ve, así que se dice en voz alta.
grant all on produccion.plano_references to anon, authenticated, service_role;
