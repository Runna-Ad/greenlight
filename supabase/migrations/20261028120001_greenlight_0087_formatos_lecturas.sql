-- ═══════════════════════════════════════════════════════════════
-- 0087 — Formatos, imagen plana: la lectura con IA de cada imagen, guardada
-- ═══════════════════════════════════════════════════════════════
-- La IA no lee igual dos veces la misma imagen (B30: otro anidado, otros ids), así que al volver a subirla las piezas
-- cambiaban y los textos cambiados a mano se perdían. Ahora la primera lectura se guarda y la misma imagen (su huella
-- sha256, del archivo original) con el mismo modelo la reusa: mismas piezas, mismos ids, sin volver a cobrar.
-- «Leer otra vez» en la revisión pide una nueva y la reemplaza. `elementos` = lo que devolvió la IA, crudo (la
-- limpieza, `limpiarLectura`, corre al usarla: si cambia, lo guardado sigue sirviendo). `w`/`h` = la copia reducida
-- que se leyó (las cajas vienen en esos px).
-- También es la biblioteca de lecturas reales para probar (B30). Aditivo; sólo `produccion`; mismo patrón que
-- tipografias (0079): RLS master-only, la app lee y escribe por service_role.

create table produccion.prisma_formatos_lecturas (
  sha256     text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  modelo     text not null check (char_length(modelo) between 1 and 80),
  w          integer not null check (w between 1 and 4096),
  h          integer not null check (h between 1 and 4096),
  elementos  jsonb not null check (jsonb_typeof(elementos) = 'array' and octet_length(elementos::text) <= 500000),
  created_by uuid references produccion.track_members(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (sha256, modelo)
);

alter table produccion.prisma_formatos_lecturas enable row level security;
create policy prisma_formatos_lecturas_master on produccion.prisma_formatos_lecturas for all using (produccion.auth_role() = 'master') with check (produccion.auth_role() = 'master');
grant select, insert, update, delete on produccion.prisma_formatos_lecturas to service_role;
