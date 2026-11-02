-- ═══════════════════════════════════════════════════════════════
-- 0074 — HÜE Prisma · F6b: el VIGÍA (prisma_fuentes + prisma_propuestas)
-- ═══════════════════════════════════════════════════════════════
-- Las herramientas cambian cada pocas semanas. El vigía lee FUENTES (docs oficiales, Help Center y blog de
-- Higgsfield), se queda con lo NUEVO desde la última lectura y H.Ü.E PROPONE cambios al conocimiento con una
-- cita literal. Nada se publica solo: el master aprueba en Hub › Prisma › Vigía y la app escribe con los
-- mismos validadores del Hub (prisma_reglas / prisma_herramientas). Descartar guarda el porqué y la huella
-- impide que la misma propuesta vuelva. Aditivo; sólo `produccion`; mismo patrón de seguridad que prisma_*
-- (RLS master-only, la app escribe por service_role).

create table produccion.prisma_fuentes (
  id              uuid primary key default gen_random_uuid(),
  url             text not null unique check (url ~ '^https://' and char_length(url) <= 300),
  nombre          text not null check (char_length(nombre) between 1 and 80),
  tool            text check (tool is null or tool ~ '^[a-z0-9_]{2,30}$'),
  origen          text not null default 'oficial' check (origen in ('oficial','comunidad')),
  activa          boolean not null default true,
  -- La última lectura: con qué se compara la siguiente (sólo lo NUEVO llega a H.Ü.E).
  ultimo_hash     text check (ultimo_hash is null or ultimo_hash ~ '^[0-9a-f]{64}$'),
  ultimo_texto    text check (ultimo_texto is null or char_length(ultimo_texto) <= 300000),
  ultima_lectura  timestamptz,
  ultimo_error    text check (ultimo_error is null or char_length(ultimo_error) <= 300),
  updated_by      uuid references produccion.track_members(id) on delete set null,
  updated_at      timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create table produccion.prisma_propuestas (
  id            uuid primary key default gen_random_uuid(),
  -- sha256 de (tipo | tool | contenido canónico): la misma propuesta nunca entra dos veces.
  huella        text not null unique check (huella ~ '^[0-9a-f]{64}$'),
  tipo          text not null check (tipo in ('nota','regla','modelo','limite','fortaleza','deprecacion','codigo')),
  tool          text check (tool is null or tool ~ '^[a-z0-9_]{2,30}$'),
  origen        text not null check (origen in ('oficial','comunidad')),
  -- Qué fuentes la dijeron (una de comunidad se enseña con 2 o más).
  fuentes       uuid[] not null default '{}' check (cardinality(fuentes) <= 20),
  resumen_es    text not null check (char_length(resumen_es) between 1 and 300),
  contenido     jsonb not null check (jsonb_typeof(contenido) = 'object' and octet_length(contenido::text) <= 8000),
  cita          text not null check (char_length(cita) between 1 and 600),
  cita_url      text not null check (cita_url ~ '^https://' and char_length(cita_url) <= 300),
  cita_fecha    date not null default current_date,
  estado        text not null default 'pendiente' check (estado in ('pendiente','aprobada','descartada')),
  motivo        text check (motivo is null or char_length(motivo) <= 300),
  decidido_por  uuid references produccion.track_members(id) on delete set null,
  decidido_at   timestamptz,
  created_at    timestamptz not null default now(),
  constraint prisma_propuestas_decision_check check ((estado = 'pendiente') = (decidido_at is null))
);
create index prisma_propuestas_estado_idx on produccion.prisma_propuestas (estado, created_at desc);

alter table produccion.prisma_fuentes enable row level security;
alter table produccion.prisma_propuestas enable row level security;
create policy prisma_fuentes_master on produccion.prisma_fuentes for all using (produccion.auth_role() = 'master') with check (produccion.auth_role() = 'master');
create policy prisma_propuestas_master on produccion.prisma_propuestas for all using (produccion.auth_role() = 'master') with check (produccion.auth_role() = 'master');
grant select, insert, update, delete on produccion.prisma_fuentes to service_role;
grant select, insert, update, delete on produccion.prisma_propuestas to service_role;

-- Una propuesta que ya existía y la vuelve a decir OTRA fuente: se suma la fuente, en un solo UPDATE
-- (sin leer-y-escribir). Sólo service_role la llama.
create or replace function produccion.prisma_propuesta_sumar(p_huella text, p_fuente uuid)
returns void language sql security invoker set search_path = '' as $$
  update produccion.prisma_propuestas
     set fuentes = array_append(fuentes, p_fuente)
   where huella = p_huella and not (p_fuente = any(fuentes)) and cardinality(fuentes) < 20;
$$;
revoke all on function produccion.prisma_propuesta_sumar(text, uuid) from public;
grant execute on function produccion.prisma_propuesta_sumar(text, uuid) to service_role;

-- Un solo vigía a la vez en TODAS las instancias (botón "Revisar ahora" y cron): candado con vencimiento
-- (15 min, por si una corrida muere) y pausa mínima entre corridas. Una fila.
create table produccion.prisma_vigia_estado (
  id               smallint primary key default 1 check (id = 1),
  corriendo_desde  timestamptz,
  ultima_corrida   timestamptz
);
insert into produccion.prisma_vigia_estado (id) values (1);
alter table produccion.prisma_vigia_estado enable row level security;
create policy prisma_vigia_estado_master on produccion.prisma_vigia_estado for all using (produccion.auth_role() = 'master') with check (produccion.auth_role() = 'master');
grant select, update on produccion.prisma_vigia_estado to service_role;

create or replace function produccion.prisma_vigia_tomar(p_espera_seg integer)
returns boolean language sql security invoker set search_path = '' as $$
  with t as (
    update produccion.prisma_vigia_estado
       set corriendo_desde = now(), ultima_corrida = now()
     where id = 1
       and (corriendo_desde is null or corriendo_desde < now() - interval '15 minutes')
       and (ultima_corrida is null or ultima_corrida <= now() - make_interval(secs => greatest(p_espera_seg, 0)))
    returning 1
  )
  select exists (select 1 from t);
$$;
create or replace function produccion.prisma_vigia_soltar()
returns void language sql security invoker set search_path = '' as $$
  update produccion.prisma_vigia_estado set corriendo_desde = null where id = 1;
$$;
revoke all on function produccion.prisma_vigia_tomar(integer) from public;
revoke all on function produccion.prisma_vigia_soltar() from public;
grant execute on function produccion.prisma_vigia_tomar(integer) to service_role;
grant execute on function produccion.prisma_vigia_soltar() to service_role;

-- ── Seed: FUENTES_BASE de lib/prisma/vigia.ts (generado, no transcrito). La primera lectura de cada
--    una es la LÍNEA BASE: no propone nada; desde la segunda, sólo lo nuevo. ──
insert into produccion.prisma_fuentes (url, nombre, tool, origen) values
  ('https://higgsfield.ai/creator-hub/help-center/getting-started/how-do-i-write-a-good-prompt', 'Higgsfield — cómo escribir un buen prompt', null, 'oficial'),
  ('https://higgsfield.ai/creator-hub/help-center/credits/how-credits-work', 'Higgsfield — cómo funcionan los créditos', null, 'oficial'),
  ('https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-nano-banana', 'Higgsfield — Nano Banana', 'nanobanana', 'oficial'),
  ('https://ai.google.dev/gemini-api/docs/image-generation', 'Google — generación de imágenes (Gemini)', 'nanobanana', 'oficial'),
  ('https://higgsfield.ai/blog/gpt-image-2-5-higgsfield', 'Higgsfield — GPT Image 2.5', 'chatgpt', 'oficial'),
  ('https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide', 'OpenAI — guía de prompts de imagen', 'chatgpt', 'oficial'),
  ('https://higgsfield.ai/blog/Seedream-5.0-Lite-Review-How-to-Comparison', 'Higgsfield — Seedream 5.0 Lite', 'seedream', 'oficial'),
  ('https://higgsfield.ai/blog/How-to-Use-Google-Veo-3.1-Complete-Guide-for-the-New-Model', 'Higgsfield — Veo 3.1', 'veo', 'oficial'),
  ('https://ai.google.dev/gemini-api/docs/veo', 'Google — Veo (Gemini API)', 'veo', 'oficial'),
  ('https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-kling', 'Higgsfield — Kling', 'kling', 'oficial'),
  ('https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-seedance', 'Higgsfield — Seedance', 'seedance', 'oficial'),
  ('https://higgsfield.ai/blog/seedance-2-5-prompting-guide', 'Higgsfield — guía de prompts de Seedance 2.5', 'seedance', 'oficial'),
  ('https://higgsfield.ai/blog/gemini-omni-flash-vfx-video-editing', 'Higgsfield — Gemini Omni Flash', 'gemini_omni', 'oficial'),
  ('https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-dop', 'Higgsfield — DoP (presets de cámara)', 'higgsfield', 'oficial');
