-- ═══════════════════════════════════════════════════════════════
-- 0063 — HÜE Prisma: estudio de prompts (una idea → un prompt por herramienta)
-- ═══════════════════════════════════════════════════════════════
-- Todo ADITIVO y en `produccion` (check-isolation lo exige). Mismo patrón de
-- seguridad que las tablas hue_* (0045/0048): RLS encendido, policy master-only,
-- la app escribe por service_role. Nada de esto toca datos existentes.
--
-- Diseñado para la v2 (generar la imagen/video dentro de la app) desde ya:
-- prisma_jobs existe vacía y la salida del compiler (prisma_prompts.salida) es el
-- payload exacto que un job de generación tomaría.

-- ── 1) prisma_specs — el PromptSpec (la descripción intermedia) ──
create table produccion.prisma_specs (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references produccion.clients(id) on delete set null,
  marca_id    uuid references produccion.marcas(id) on delete set null,
  job         text not null,                     -- JobType (lib/prisma/spec.ts)
  tool        text not null,                     -- Tool elegida al guardar
  destino     text,                              -- Destino (ig_story, yt…)
  idea        text not null default '',          -- lo que escribió el diseñador
  spec        jsonb not null,                    -- PromptSpec completo
  refs        jsonb not null default '[]'::jsonb, -- [{role, storage_path, caption, dna}]
  created_by  uuid references produccion.track_members(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index prisma_specs_client_idx on produccion.prisma_specs (client_id, created_at desc);
create index prisma_specs_autor_idx  on produccion.prisma_specs (created_by, created_at desc);

-- ── 2) prisma_prompts — cada prompt compilado (una fila por herramienta/variante) ──
create table produccion.prisma_prompts (
  id             uuid primary key default gen_random_uuid(),
  spec_id        uuid not null references produccion.prisma_specs(id) on delete cascade,
  tool           text not null,
  variante       text not null default 'base' check (variante in ('base','segura','audaz','minima')),
  prompt_version text not null,                  -- versión del writer/compiler que lo produjo
  salida         text not null,                  -- el prompt listo para pegar
  formato        text not null check (formato in ('texto','json')),
  valido         boolean not null default true,  -- pasó los validators
  errores        text[] not null default '{}',   -- lo que el validator objetó (si algo)
  explicacion    text,                           -- "por qué está así", en español, generado 1 vez
  model          text,
  usage          jsonb,                          -- tokens in/out/cache (para costo por prompt)
  created_at     timestamptz not null default now()
);
create index prisma_prompts_spec_idx on produccion.prisma_prompts (spec_id, created_at desc);

-- ── 3) prisma_characters — sujetos/productos recurrentes del cliente ──
-- (Generaliza el "cameo" personal de Roco: una descripción fija que se inyecta al spec.)
create table produccion.prisma_characters (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references produccion.clients(id) on delete cascade,
  name         text not null,
  descripcion  text not null,                    -- en inglés, lista para el prompt
  storage_path text,                             -- imagen de referencia (bucket privado)
  active       boolean not null default true,
  created_by   uuid references produccion.track_members(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index prisma_characters_client_idx on produccion.prisma_characters (client_id, active);

-- ── 4) prisma_ratings — pulgar arriba/abajo por prompt (aprende qué versiones sirven) ──
create table produccion.prisma_ratings (
  id         uuid primary key default gen_random_uuid(),
  prompt_id  uuid not null references produccion.prisma_prompts(id) on delete cascade,
  user_id    uuid not null references produccion.track_members(id) on delete cascade,
  score      smallint not null check (score in (-1, 1)),
  nota       text,
  created_at timestamptz not null default now(),
  unique (prompt_id, user_id)
);

-- ── 5) prisma_jobs — v2: generación dentro de la app (hoy vacía, detrás de flag) ──
create table produccion.prisma_jobs (
  id          uuid primary key default gen_random_uuid(),
  prompt_id   uuid not null references produccion.prisma_prompts(id) on delete cascade,
  provider    text not null,                     -- 'gemini-image' | 'veo' …
  status      text not null default 'queued' check (status in ('queued','running','done','error')),
  result_path text,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index prisma_jobs_prompt_idx on produccion.prisma_jobs (prompt_id, created_at desc);

-- ── 6) marcas.prisma_presets — lo que la marca aporta a TODO prompt ──
-- {paleta: [...], tono: '', evitar: [...], aspect_default: '9:16'}
alter table produccion.marcas add column prisma_presets jsonb;

-- ── RLS + grants (patrón hue_*) ──
alter table produccion.prisma_specs      enable row level security;
alter table produccion.prisma_prompts    enable row level security;
alter table produccion.prisma_characters enable row level security;
alter table produccion.prisma_ratings    enable row level security;
alter table produccion.prisma_jobs       enable row level security;

create policy prisma_specs_master      on produccion.prisma_specs      for all using (produccion.auth_role() = 'master') with check (produccion.auth_role() = 'master');
create policy prisma_prompts_master    on produccion.prisma_prompts    for all using (produccion.auth_role() = 'master') with check (produccion.auth_role() = 'master');
create policy prisma_characters_master on produccion.prisma_characters for all using (produccion.auth_role() = 'master') with check (produccion.auth_role() = 'master');
create policy prisma_ratings_master    on produccion.prisma_ratings    for all using (produccion.auth_role() = 'master') with check (produccion.auth_role() = 'master');
create policy prisma_jobs_master       on produccion.prisma_jobs       for all using (produccion.auth_role() = 'master') with check (produccion.auth_role() = 'master');

grant select, insert, update, delete on produccion.prisma_specs      to service_role;
grant select, insert, update, delete on produccion.prisma_prompts    to service_role;
grant select, insert, update, delete on produccion.prisma_characters to service_role;
grant select, insert, update, delete on produccion.prisma_ratings    to service_role;
grant select, insert, update, delete on produccion.prisma_jobs       to service_role;
