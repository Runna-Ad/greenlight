-- ═══════════════════════════════════════════════════════════════
-- 0048 — H.Ü.E aprende de tus ediciones (borrador → publicado)
-- ═══════════════════════════════════════════════════════════════
-- El loop de Ganadores mina patrones de BUENOS resultados. Esto añade el
-- segundo motor: aprender de las CORRECCIONES humanas — "H.Ü.E escribió X, el
-- equipo mandó Y". Para eso guardamos el BORRADOR que H.Ü.E generó (antes se
-- descartaba al importar/editar) y, en la síntesis, lo comparamos contra el
-- guión ya publicado, leído EN VIVO de los planos (sin snapshot en el seam de
-- publicar: hay varios caminos de transición; leer los planos actuales de una
-- tarea ya publicada es robusto y suficiente para minar patrones recurrentes).
--
-- Seatbelts (idénticos al loop de Ganadores): las lecciones `auto_edit` son
-- VISIBLES (badge + reason), INACTIVAS hasta que el master las active,
-- REVERSIBLES, deduplicadas y con tope. Detrás del switch `auto_learn_edits`.
-- MASTER-ONLY vía RLS (auth_role='master'); la app escribe por service_role.
-- Todo vive en `produccion` (check-isolation lo exige).

-- ── 1) hue_generations — el BORRADOR que H.Ü.E generó (going-forward) ──
create table produccion.hue_generations (
  id           uuid primary key default gen_random_uuid(),
  idea_id      uuid not null references produccion.ideas(id) on delete cascade,
  kind         text not null check (kind in ('guion','copy')),
  draft        jsonb not null,                       -- PlanoParsed[] | EstaticoParsed que devolvió el writer
  model        text,
  generated_by uuid references produccion.track_members(id) on delete set null,
  generated_at timestamptz not null default now(),
  -- Se sella al IMPORTAR el borrador a la tarea. El loop de ediciones sólo compara
  -- generaciones IMPORTADAS (las que de verdad se usaron), no una regeneración
  -- posterior que nunca se importó — esa compararía un borrador contra un guión que
  -- salió de OTRO borrador y envenenaría el corpus con "correcciones" ficticias.
  imported_at  timestamptz
);
-- La generación MÁS reciente por idea primero (la síntesis usa la última por tarea).
create index hue_generations_idea_idx on produccion.hue_generations (idea_id, generated_at desc);

alter table produccion.hue_generations enable row level security;
create policy hue_generations_master on produccion.hue_generations
  for all using (produccion.auth_role() = 'master') with check (produccion.auth_role() = 'master');
grant select, insert, update, delete on produccion.hue_generations to service_role, authenticated;

-- ── 2) hue_instructions.source += 'auto_edit' ──
-- Distingue las lecciones aprendidas de EDICIONES de las de ganadores ('auto').
alter table produccion.hue_instructions drop constraint hue_instructions_source_check;
alter table produccion.hue_instructions add constraint hue_instructions_source_check
  check (source in ('human','auto','auto_edit'));

-- ── 3) hue_settings — switch + debounce del loop de ediciones ──
-- auto_learn_edits es INDEPENDIENTE de auto_learn (Ganadores): son dos señales
-- distintas y el master las controla por separado. Default OFF (opt-in).
alter table produccion.hue_settings add column auto_learn_edits    boolean not null default false;
alter table produccion.hue_settings add column last_synth_edits_at timestamptz;
