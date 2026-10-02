-- ═══════════════════════════════════════════════════════════════
-- 0077 — HÜE Prisma › Formatos: un anuncio terminado → N tamaños, con el original intocable
-- ═══════════════════════════════════════════════════════════════
-- Un LOTE = un anuncio subido; una SALIDA = un tamaño de ese lote. Dos tablas a propósito: cada tamaño
-- se procesa en su propia llamada (4 a la vez) y actualiza SU fila; una lista jsonb dentro del lote
-- perdería escrituras cuando dos tamaños terminan al mismo tiempo.
-- Aditivo; sólo `produccion`; mismo patrón de seguridad que prisma_* (0063/0070): RLS master-only, la
-- app escribe por service_role. Los archivos viven en el bucket privado `greenlight-formatos` (se crea en
-- scripts/setup-storage.mjs, no aquí: check-isolation prohíbe tocar storage.* desde SQL); aquí sólo la ruta.

create table produccion.prisma_formatos_lotes (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid references produccion.clients(id) on delete set null,
  marca_id           uuid references produccion.marcas(id) on delete set null,
  resultado_id       uuid references produccion.prisma_resultados(id) on delete set null, -- vino de "¿Cómo salió?"
  nombre             text not null default 'anuncio' check (char_length(nombre) between 1 and 80),
  estado             text not null default 'subiendo' check (estado in ('subiendo', 'listo')),
  fuente_path        text not null unique check (fuente_path ~ '^fuente/[0-9a-f-]{36}\.(png|jpg|webp)$'),
  fuente_mime        text check (fuente_mime is null or fuente_mime in ('image/png', 'image/jpeg', 'image/webp')),
  fuente_w           integer check (fuente_w is null or fuente_w between 1 and 20000),
  fuente_h           integer check (fuente_h is null or fuente_h between 1 and 20000),
  costo_estimado_usd numeric(8, 4) not null default 0 check (costo_estimado_usd >= 0),
  created_by         uuid references produccion.track_members(id) on delete set null,
  created_at         timestamptz not null default now(),
  -- "listo" exige saber qué se subió y cuánto mide.
  constraint prisma_formatos_lotes_listo check (estado <> 'listo' or (fuente_mime is not null and fuente_w is not null and fuente_h is not null))
);
create index prisma_formatos_lotes_autor_idx on produccion.prisma_formatos_lotes (created_by, created_at desc);
-- Un resultado de "¿Cómo salió?" da UN lote por persona: dos pestañas abriendo el mismo enlace a la vez no
-- duplican la copia (la segunda choca aquí y reusa la primera).
create unique index prisma_formatos_lotes_resultado_autor_uq on produccion.prisma_formatos_lotes (resultado_id, created_by) where resultado_id is not null;

create table produccion.prisma_formatos_salidas (
  id                 uuid primary key default gen_random_uuid(),
  lote_id            uuid not null references produccion.prisma_formatos_lotes(id) on delete cascade,
  preset             text not null check (preset ~ '^[a-z]+-[0-9]{2,4}x[0-9]{2,4}$'), -- lib/prisma/formatos/geometria.ts
  ancho              integer not null check (ancho between 32 and 4096),
  alto               integer not null check (alto between 32 and 4096),
  modo               text not null check (modo in ('ia', 'blur', 'color')),
  color              text check (color is null or color ~ '^#[0-9a-f]{6}$'),
  estado             text not null default 'pendiente' check (estado in ('pendiente', 'procesando', 'listo', 'error')),
  png_path           text check (png_path is null or png_path ~ '^salida/[0-9a-f-]{36}/[0-9a-f-]{36}\.png$'),
  jpg_path           text check (jpg_path is null or jpg_path ~ '^salida/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'),
  proveedor          text check (proveedor is null or char_length(proveedor) <= 60), -- p. ej. gemini-3.1-flash-image
  costo_estimado_usd numeric(8, 4) not null default 0 check (costo_estimado_usd >= 0),
  costo_real_usd     numeric(8, 4) check (costo_real_usd is null or costo_real_usd >= 0), -- tokens reales × precio publicado
  pixel_lock_ok      boolean,                     -- la zona del original, releída del PNG, es idéntica byte por byte
  deriva             numeric(5, 1) check (deriva is null or deriva between 0 and 255), -- cuánto movió la IA el centro
  error              text check (error is null or char_length(error) <= 300),
  intentos           smallint not null default 0 check (intentos between 0 and 50),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (lote_id, preset),
  constraint prisma_formatos_salidas_color check (modo <> 'color' or color is not null),
  -- "listo" = archivos guardados Y el original verificado idéntico: un tamaño con pixel-lock falso nunca es entregable.
  constraint prisma_formatos_salidas_listo check (estado <> 'listo' or (png_path is not null and jpg_path is not null and pixel_lock_ok is true))
);
-- (Sin índice aparte por lote_id: el unique (lote_id, preset) ya lo cubre.)

alter table produccion.prisma_formatos_lotes   enable row level security;
alter table produccion.prisma_formatos_salidas enable row level security;
create policy prisma_formatos_lotes_master   on produccion.prisma_formatos_lotes   for all using (produccion.auth_role() = 'master') with check (produccion.auth_role() = 'master');
create policy prisma_formatos_salidas_master on produccion.prisma_formatos_salidas for all using (produccion.auth_role() = 'master') with check (produccion.auth_role() = 'master');
grant select, insert, update, delete on produccion.prisma_formatos_lotes   to service_role;
grant select, insert, update, delete on produccion.prisma_formatos_salidas to service_role;
