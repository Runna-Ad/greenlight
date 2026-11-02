-- ═══════════════════════════════════════════════════════════════
-- 0079 — Biblioteca de tipografías, para que Formatos vuelva a escribir el texto de los PSD
-- ═══════════════════════════════════════════════════════════════
-- Una sola biblioteca para todo el equipo. Formatos pide por NOMBRE PostScript las que le faltan a un PSD
-- ("DiDiSans-Pro-Medium") y la que lo trae sirve a cualquier cliente, salvo la exclusiva. Dos orígenes:
--   · 'subida': un admin la sube en Admin › Marcas, en la tarjeta de un cliente. `exclusiva` = sólo de ese cliente
--     (DiDi Sans Pro sólo es de DiDi): Formatos la entrega únicamente cuando arriba se eligió ese cliente.
--   · 'google': gratuita, Formatos la trajo de Google Fonts la primera vez que un PSD la pidió (de nadie).
-- `nombres` = los que trae cada archivo (una variable trae uno por estilo).
-- Aditivo; sólo `produccion`; mismo patrón de seguridad que prisma_* (0063/0078): RLS master-only, la app
-- escribe y lee por service_role. Los archivos viven en el bucket PRIVADO `greenlight-tipografias` (se crea en
-- scripts/setup-storage.mjs, no aquí: check-isolation prohíbe tocar storage.*).

create table produccion.tipografias (
  id         uuid primary key default gen_random_uuid(),
  -- restrict: borrar un cliente con tipografías falla hasta borrarlas desde Admin (si no, sus archivos se
  -- quedarían en el bucket sin fila que los encuentre). null = gratuita de Google Fonts.
  client_id  uuid references produccion.clients(id) on delete restrict,
  origen     text not null default 'subida' check (origen in ('subida', 'google')),
  exclusiva  boolean not null default false,
  archivo    text not null check (char_length(archivo) between 1 and 120),          -- el nombre del archivo, para enseñar
  ruta       text not null unique check (ruta ~ '^([0-9a-f-]{36}|google)/[0-9a-f]{64}\.(otf|ttf)$'), -- <cliente|google>/<sha256>.<ext>
  sha256     text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  -- Las subidas pasan por Vercel (4 MB); las de Google las baja el servidor (variables de hasta 10 MB).
  bytes      integer not null check (bytes between 12 and 10000000 and (origen = 'google' or bytes <= 4000000)),
  nombres    text[] not null check (cardinality(nombres) between 1 and 256 and array_position(nombres, null) is null),
  created_by uuid references produccion.track_members(id) on delete set null,
  created_at timestamptz not null default now(),
  -- El mismo archivo dos veces en un cliente es uno.
  unique (client_id, sha256),
  -- Subida ⇔ tiene cliente; sólo la de un cliente puede ser exclusiva.
  constraint tipografias_origen check ((origen = 'google') = (client_id is null)),
  constraint tipografias_exclusiva check (not exclusiva or client_id is not null),
  -- La ruta es la de su dueño (cliente o google) y la huella de esa fila: nadie apunta a un archivo ajeno.
  constraint tipografias_ruta check (ruta like coalesce(client_id::text, 'google') || '/' || sha256 || '.%')
);
-- El mismo archivo de Google una sola vez (el unique de arriba no compara nulls).
create unique index tipografias_google_uq on produccion.tipografias (sha256) where client_id is null;

alter table produccion.tipografias enable row level security;
create policy tipografias_master on produccion.tipografias for all using (produccion.auth_role() = 'master') with check (produccion.auth_role() = 'master');
grant select, insert, update, delete on produccion.tipografias to service_role;
