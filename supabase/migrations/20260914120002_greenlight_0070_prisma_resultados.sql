-- ═══════════════════════════════════════════════════════════════
-- 0070 — HÜE Prisma v1 · F4: "sube lo que salió" (prisma_resultados + specs de corrección)
-- ═══════════════════════════════════════════════════════════════
-- El diseñador pega el prompt en la herramienta, baja lo que salió y lo SUBE aquí. H.Ü.E lo
-- compara con lo pedido (visión) y guarda el veredicto: qué cumplió y qué no, qué pedirle al
-- prompt original ("refine") y una edición concreta sobre ESA imagen ("corrección"). Marcar un
-- resultado como FINAL ACEPTADO es la señal de aprendizaje más fuerte (aprendizaje.ts).
-- Aditivo; sólo `produccion`; mismo patrón de seguridad que prisma_* (RLS master-only, la app
-- escribe por service_role). La imagen vive en el bucket privado bajo `prisma/out/…` (la ruta
-- se guarda como texto: check-isolation prohíbe tocar storage.* desde SQL).
create table produccion.prisma_resultados (
  id           uuid primary key default gen_random_uuid(),
  spec_id      uuid not null references produccion.prisma_specs(id) on delete cascade,
  prompt_id    uuid references produccion.prisma_prompts(id) on delete set null,
  client_id    uuid references produccion.clients(id) on delete set null, -- desnormalizado: aprende por marca sin joins
  tool         text not null,
  modelo       text check (modelo is null or char_length(modelo) <= 60),  -- el modelo/nivel que dice haber usado
  storage_path text not null check (storage_path ~ '^prisma/out/[0-9a-f-]{36}\.(png|jpg|webp|gif)$'),
  mime         text not null check (mime in ('image/png','image/jpeg','image/webp','image/gif')),
  caption      text check (caption is null or char_length(caption) <= 300),
  veredicto    jsonb not null default '{}'::jsonb, -- {caption, cumple:[{campo, ok, nota_es, nota_en}], refine_es, refine_en, correccion_en}
  score        smallint check (score is null or (score between 0 and 100)), -- % de puntos que cumplió
  aceptado     boolean not null default false,
  created_by   uuid references produccion.track_members(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index prisma_resultados_spec_idx   on produccion.prisma_resultados (spec_id, created_at desc);
create index prisma_resultados_prompt_idx on produccion.prisma_resultados (prompt_id, created_at desc);
create index prisma_resultados_client_idx on produccion.prisma_resultados (client_id, created_at desc);

-- Un prompt de corrección nace como spec HERMANO (misma idea; job oculto `correccion`; la imagen
-- subida como su única referencia). Este enlace dice qué resultado corrige — el historial lo
-- etiqueta "Corrección" y la ronda de prueba mide "aceptado tras corrección". Nullable; aditivo.
alter table produccion.prisma_specs add column correccion_de uuid references produccion.prisma_resultados(id) on delete set null;
create index prisma_specs_correccion_idx on produccion.prisma_specs (correccion_de);

alter table produccion.prisma_resultados enable row level security;
create policy prisma_resultados_master on produccion.prisma_resultados for all using (produccion.auth_role() = 'master') with check (produccion.auth_role() = 'master');
grant select, insert, update, delete on produccion.prisma_resultados to service_role;
