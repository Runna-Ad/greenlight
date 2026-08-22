-- ═══════════════════════════════════════════════════════════════
-- 0045 — H.Ü.E HUB · Fase 1: aprendizaje/analítica + cerebro entrenable
-- ═══════════════════════════════════════════════════════════════
-- Hasta hoy H.Ü.E es 3 acciones advisory (validador de cambios, ortografía,
-- extractor de guión) SIN memoria ni medición: no se registra qué sugerencias
-- se adoptan, no hay dónde darle instrucciones ni una base de conocimiento, ni
-- una vista de "qué está funcionando".
--
-- Esta migración añade la plumbing de CAPTURA (going-forward — sólo registra de
-- aquí en adelante, por eso se aterriza cuanto antes tras el go-live) + el
-- almacén del "Cerebro" (instrucciones versionadas), el KB y la Biblioteca de
-- Ganadores. La UI (HUB) y el loop de auto-aprendizaje se construyen en Fase 1
-- Etapa 2 sobre estas tablas.
--
-- MASTER-ONLY: el HUB es del Master Builder (role='master'). Toda la app
-- lee/escribe estas tablas vía service_role (que bypassa RLS), así que la RLS de
-- abajo (= sólo master por el path directo de PostgREST) es defensa en
-- profundidad; el gate real es server-side (canHue). La captura de adopción la
-- disparan lead/creative durante su trabajo — por eso NO se gatea la escritura a
-- master (va por service_role, nunca bloqueada).
--
-- Nada de esto toca S.P.A.M: todo vive en `produccion` (check-isolation lo exige).

-- ── 1) hue_suggestions — bitácora de adopción (validador + ortografía) ──
-- Una fila por sugerencia OFRECIDA (decision=null); se sella la decisión cuando
-- el humano la aplica / la ignora / la descarta. Alimenta la "tasa de adopción".
create table produccion.hue_suggestions (
  id              uuid primary key default gen_random_uuid(),
  idea_id         uuid not null references produccion.ideas(id) on delete cascade,
  kind            text not null check (kind in ('correction_verdict','ortografia')),
  correccion_id   uuid references produccion.comments(id) on delete set null,  -- sólo veredicto
  target_tabla    text,
  target_fila_id  uuid,
  target_campo    text,
  hecho           text check (hecho in ('si','no','parcial')),                 -- sólo veredicto
  tipo            text,                                                          -- sólo ortografía
  sugerencia      text,
  decision        text check (decision in ('applied','dismissed','ignored')),
  offered_at      timestamptz not null default now(),
  decided_at      timestamptz,
  actor_member_id uuid references produccion.track_members(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index hue_suggestions_idea_idx     on produccion.hue_suggestions (idea_id);
-- UNA fila por (idea, corrección) para los VEREDICTOS: re-correr el validador hace
-- upsert (actualiza el veredicto sin duplicar ni pisar una decisión ya tomada). Los
-- de ortografía llevan correccion_id NULL → NULL es distinto de NULL en un unique, así
-- que cada corrida de ortografía inserta libremente (no colisiona).
create unique index hue_suggestions_corr_uq on produccion.hue_suggestions (idea_id, correccion_id);
create index hue_suggestions_decision_idx on produccion.hue_suggestions (kind, decision);

-- ── 2) hue_instructions — lecciones de entrenamiento versionadas (el Cerebro) ──
-- Cada lección es un registro rastreable/reversible (source human|auto, reason,
-- versión, scope). El Cerebro = el render legible de las instrucciones activas.
create table produccion.hue_instructions (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null default 'global' check (scope in ('global','client','marca')),
  client_id   uuid references produccion.clients(id) on delete cascade,
  marca_id    uuid references produccion.marcas(id)  on delete cascade,
  title       text not null,
  body        text not null,
  version     int  not null default 1,
  active      boolean not null default true,
  source      text not null default 'human' check (source in ('human','auto')),
  reason      text,                                    -- por qué se añadió (auto: cita a los ganadores)
  created_by  uuid references produccion.track_members(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index hue_instructions_active_idx on produccion.hue_instructions (active, scope);
-- updated_at explícito por tabla (el set_updated_at genérico no se auto-adjunta a tablas nuevas)
create trigger set_updated_at_hue_instructions before update on produccion.hue_instructions
  for each row execute function produccion.set_updated_at();

-- ── 3) hue_kb_documents — metadata del KB + texto extraído ──
-- Consumo por defecto (Fase 2) = inyección del documento COMPLETO en el prompt
-- cacheado del writer (el KB de Pedro es delgado: ~32 guiones + un playbook, cabe
-- directo). Por eso se guarda `extracted_text` en claro y NO se construyen
-- embeddings ahora. `indexed_at` queda como SEAM para una futura mejora de
-- retrieval (pgvector + un proveedor de embeddings) SI la biblioteca crece mucho.
create table produccion.hue_kb_documents (
  id             uuid primary key default gen_random_uuid(),
  scope          text not null default 'global' check (scope in ('global','client','marca')),
  client_id      uuid references produccion.clients(id) on delete cascade,
  marca_id       uuid references produccion.marcas(id)  on delete cascade,
  title          text not null,
  storage_path   text not null,                        -- storage://greenlight-kb/<...>
  mime_type      text,
  size_bytes     int,
  extracted_text text,                                 -- texto legible del doc (pdf/docx/txt/md → texto)
  indexed_at     timestamptz,                          -- SEAM retrieval futuro; NO construir embeddings ahora
  uploaded_by    uuid references produccion.track_members(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index hue_kb_documents_scope_idx on produccion.hue_kb_documents (scope, client_id, marca_id);

-- ── 4) hue_top_performers — guiones estrellados (Biblioteca de Ganadores) ──
-- "Top performer" = una ESTRELLA HUMANA (Greenlight no tiene métricas de anuncio
-- en vivo). Un guión entregado estrellado se vuelve ejemplar de aprendizaje.
create table produccion.hue_top_performers (
  id         uuid primary key default gen_random_uuid(),
  idea_id    uuid not null references produccion.ideas(id) on delete cascade,
  starred_by uuid references produccion.track_members(id) on delete set null,
  reason     text,
  starred_at timestamptz not null default now(),
  unique (idea_id)
);

-- ── 5) hue_adaptations — auditoría del auto-aprendizaje ──
-- Cada lección auto-añadida al Cerebro queda visible aquí ("qué aprendió y
-- cambió H.Ü.E"), citando su gatillo, y es reversible (reverted_at).
create table produccion.hue_adaptations (
  id                     uuid primary key default gen_random_uuid(),
  at                     timestamptz not null default now(),
  trigger_summary        text,
  changed_instruction_id uuid references produccion.hue_instructions(id) on delete set null,
  from_version           int,
  to_version             int,
  applied_by             text not null default 'auto',
  reverted_at            timestamptz
);

-- ── 6) hue_settings — interruptor global de auto-aprendizaje (singleton, id=1) ──
-- El master controla si la SÍNTESIS se dispara sola al estrellar un ganador (ON) o
-- sólo cuando él la corre a mano (OFF). Default OFF: la automatización es opt-in; las
-- lecciones auto siguen siendo visibles/reversibles cuando se generen (seatbelt).
create table produccion.hue_settings (
  id            int primary key default 1 check (id = 1),
  auto_learn    boolean not null default false,
  last_synth_at timestamptz,                        -- último run de síntesis (debounce: no re-correr sin ganadores nuevos)
  updated_at    timestamptz not null default now()
);
insert into produccion.hue_settings (id, auto_learn) values (1, false) on conflict (id) do nothing;

-- Uso de snippets AGREGADO en SQL (no traer toda la tabla idea_snippets a la app y
-- agrupar en JS — se truncaría/pesaría al crecer). Devuelve el conteo por snippet.
create or replace function produccion.hue_top_snippets()
returns table (snippet_id uuid, title text, kind text, usos bigint)
language sql stable security definer set search_path = '' as $$
  select s.id, s.title, s.kind::text, count(*) as usos
  from produccion.idea_snippets ix
  join produccion.snippets s on s.id = ix.snippet_id
  where s.kind in ('selling_point', 'legal')
  group by s.id, s.title, s.kind
  order by usos desc
$$;
alter table produccion.hue_settings enable row level security;
create policy hue_settings_master on produccion.hue_settings
  for all using (produccion.auth_role() = 'master') with check (produccion.auth_role() = 'master');
create trigger set_updated_at_hue_settings before update on produccion.hue_settings
  for each row execute function produccion.set_updated_at();
grant select, insert, update, delete on produccion.hue_settings to service_role, authenticated;

-- ── RLS: master-only por el path directo (defensa en profundidad) ──
alter table produccion.hue_suggestions   enable row level security;
alter table produccion.hue_instructions  enable row level security;
alter table produccion.hue_kb_documents  enable row level security;
alter table produccion.hue_top_performers enable row level security;
alter table produccion.hue_adaptations   enable row level security;

create policy hue_suggestions_master on produccion.hue_suggestions
  for all using (produccion.auth_role() = 'master') with check (produccion.auth_role() = 'master');
create policy hue_instructions_master on produccion.hue_instructions
  for all using (produccion.auth_role() = 'master') with check (produccion.auth_role() = 'master');
create policy hue_kb_documents_master on produccion.hue_kb_documents
  for all using (produccion.auth_role() = 'master') with check (produccion.auth_role() = 'master');
create policy hue_top_performers_master on produccion.hue_top_performers
  for all using (produccion.auth_role() = 'master') with check (produccion.auth_role() = 'master');
create policy hue_adaptations_master on produccion.hue_adaptations
  for all using (produccion.auth_role() = 'master') with check (produccion.auth_role() = 'master');

-- Grants explícitos (belt-and-suspenders; las default privileges de 0006 ya cubren
-- tablas futuras creadas por el mismo rol, pero lo dejamos explícito como en 0041).
grant select, insert, update, delete on
  produccion.hue_suggestions, produccion.hue_instructions, produccion.hue_kb_documents,
  produccion.hue_top_performers, produccion.hue_adaptations
  to service_role;
grant select, insert, update, delete on
  produccion.hue_suggestions, produccion.hue_instructions, produccion.hue_kb_documents,
  produccion.hue_top_performers, produccion.hue_adaptations
  to authenticated;
