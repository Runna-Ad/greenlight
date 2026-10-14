-- ═══════════════════════════════════════════════════════════════
-- 0079 — Tipografías de cada CLIENTE, para que Formatos vuelva a escribir el texto de sus PSD
-- ═══════════════════════════════════════════════════════════════
-- Un admin sube los .otf/.ttf una vez en Admin › Marcas, en la tarjeta del cliente (DiDi cubre Card y
-- Préstamos). Formatos pide por NOMBRE PostScript las que le faltan a un PSD ("DiDiSans-Pro-Medium"):
-- `nombres` = los que trae cada archivo (una variable trae uno por estilo).
-- Aditivo; sólo `produccion`; mismo patrón de seguridad que prisma_* (0063/0078): RLS master-only, la app
-- escribe y lee por service_role. Los archivos viven en el bucket PRIVADO `greenlight-tipografias` (letra con
-- licencia del cliente; se crea en scripts/setup-storage.mjs, no aquí: check-isolation prohíbe tocar storage.*).

create table produccion.tipografias_cliente (
  id         uuid primary key default gen_random_uuid(),
  -- restrict: borrar un cliente con tipografías falla hasta borrarlas desde Admin (si no, sus archivos se quedarían
  -- en el bucket sin fila que los encuentre).
  client_id  uuid not null references produccion.clients(id) on delete restrict,
  archivo    text not null check (char_length(archivo) between 1 and 120),          -- el nombre al subirlo, para enseñar
  ruta       text not null unique check (ruta ~ '^[0-9a-f-]{36}/[0-9a-f]{64}\.(otf|ttf)$'), -- <cliente>/<sha256>.<ext>
  sha256     text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes      integer not null check (bytes between 12 and 4000000),
  nombres    text[] not null check (cardinality(nombres) between 1 and 256 and array_position(nombres, null) is null),
  created_by uuid references produccion.track_members(id) on delete set null,
  created_at timestamptz not null default now(),
  -- El mismo archivo dos veces en un cliente es uno.
  unique (client_id, sha256),
  -- La ruta es la del cliente y la huella de esa fila (nadie apunta a un archivo de otro).
  constraint tipografias_cliente_ruta check (ruta like client_id::text || '/' || sha256 || '.%')
);
-- (Sin índice aparte por client_id: el unique (client_id, sha256) ya lo cubre.)

alter table produccion.tipografias_cliente enable row level security;
create policy tipografias_cliente_master on produccion.tipografias_cliente for all using (produccion.auth_role() = 'master') with check (produccion.auth_role() = 'master');
grant select, insert, update, delete on produccion.tipografias_cliente to service_role;
