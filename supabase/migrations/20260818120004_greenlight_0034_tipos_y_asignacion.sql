-- ═══════════════════════════════════════════════════════════════
-- 0034 — Tipos de cambio (categoría) + hora de asignación
-- ═══════════════════════════════════════════════════════════════
-- La espina de la capa de Performance/Evaluación: cada cambio que pide un revisor
-- INTERNO lleva una CATEGORÍA (los criterios del rúbrica de Pedro), y guardamos
-- CUÁNDO se asignó una tarea. Ambos son captura de datos hacia adelante: la
-- evaluación se llena a medida que se usan. El lado del cliente sigue libre (sin
-- categoría). Nada aquí borra datos; todo es aditivo.

-- ─────────────────────────────────────────────────────────────
-- 1. comments.categoria — el tipo del cambio (slug del vocab en TS)
-- ─────────────────────────────────────────────────────────────
-- Texto, no enum: la rúbrica sigue evolucionando y un enum obligaría a migrar por
-- cada criterio nuevo. Se valida en la capa de app (obligatorio SÓLO para cambios
-- internos); las filas de cliente/legacy quedan en null.
alter table produccion.comments
  add column if not exists categoria text;

-- ─────────────────────────────────────────────────────────────
-- 2. idea_assignments.assigned_at — cuándo se asignó a esta persona
-- ─────────────────────────────────────────────────────────────
-- Hoy no existe rastro de cuándo se asignó una tarea (setAssignees borraba+reinsertaba,
-- clobbering created_at). Con esto, las filas NUEVAS traen su hora real de asignación
-- (default now() al insertar). Para las filas ya existentes reescribimos el now()
-- recién estampado a la fecha de creación de la idea — un proxy honesto de "cuándo
-- empezó", mejor que fingir que todo se asignó hoy. Best-effort, se dice en la UI.
alter table produccion.idea_assignments
  add column if not exists assigned_at timestamptz not null default now();

update produccion.idea_assignments a
   set assigned_at = i.created_at
  from produccion.ideas i
 where a.idea_id = i.id
   and i.created_at is not null;

-- ─────────────────────────────────────────────────────────────
-- 3. rpc_add_correction acepta la categoría
-- ─────────────────────────────────────────────────────────────
-- ⚠️ Mismo footgun que la 0029: un parámetro nuevo con DEFAULT crea una SOBRECARGA
-- y PostgREST devuelve PGRST203 "Could not choose the best candidate function". Hay
-- que BORRAR la firma vigente (la de 12 args de la 0029) antes de crear la nueva de
-- 13. El arg nuevo va al final, entre los opcionales.
drop function if exists produccion.rpc_add_correction(
  uuid, text, uuid, text, text, text, uuid, uuid, produccion.comment_kind, text, int, int);

create or replace function produccion.rpc_add_correction(
  p_idea_id      uuid,
  p_target_tabla text,
  p_target_fila  uuid,
  p_target_campo text,
  p_target_label text,
  p_body         text,
  p_actor_member uuid default null,
  p_actor        uuid default null,
  p_kind         produccion.comment_kind default 'correction_request',
  p_target_quote text default null,
  p_target_start int  default null,
  p_target_end   int  default null,
  p_categoria    text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if coalesce(btrim(p_body), '') = '' then
    raise exception 'Escribe qué hay que corregir.';
  end if;
  insert into produccion.comments
    (idea_id, author_id, author_member_id, body, kind,
     target_tabla, target_fila_id, target_campo, target_label, ronda,
     target_quote, target_start, target_end, categoria)
  values
    (p_idea_id, p_actor, p_actor_member, p_body, p_kind,
     p_target_tabla, p_target_fila, p_target_campo, p_target_label,
     produccion.correction_next_round(p_idea_id),
     nullif(btrim(coalesce(p_target_quote, '')), ''), p_target_start, p_target_end,
     nullif(btrim(coalesce(p_categoria, '')), ''))
  returning id into v_id;
  return v_id;
end $$;

grant execute on function produccion.rpc_add_correction(
  uuid, text, uuid, text, text, text, uuid, uuid, produccion.comment_kind, text, int, int, text)
  to anon, authenticated, service_role;
