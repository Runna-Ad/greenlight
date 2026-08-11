-- Greenlight — correcciones ancladas a una SELECCIÓN de texto (0029)
--
-- Hoy una corrección apunta a un CAMPO entero (target_tabla/fila/campo). Esto
-- añade la opción de anclarla a un TROZO del texto de ese campo: el revisor
-- resalta "6% de CASHBACK*" en el Copy in y la corrección queda pegada a esa
-- frase, no a todo el campo.
--
-- El ANCLA DE RECORD es el TEXTO citado (target_quote), NO los offsets: los
-- campos son <textarea> y el especialista EDITA el texto para arreglarlo, así
-- que los offsets se desincronizan al instante. El resaltado en vivo es
-- best-effort (se re-encuentra el quote por contenido); los offsets sólo sirven
-- para la posición inicial. Todo es aditivo: una corrección de campo entero deja
-- estas columnas en null.

-- ─────────────────────────────────────────────────────────────
-- 1. Columnas del ancla por selección
-- ─────────────────────────────────────────────────────────────
alter table produccion.comments
  add column if not exists target_quote text,  -- el substring resaltado (ancla de record)
  add column if not exists target_start int,   -- offset inicial al pedir (best-effort)
  add column if not exists target_end   int;   -- offset final al pedir (best-effort)

-- ─────────────────────────────────────────────────────────────
-- 2. rpc_add_correction acepta el quote + offsets
-- ─────────────────────────────────────────────────────────────
-- ⚠️ Hay que BORRAR la firma vieja de 9 args antes de crear la nueva. Un
-- parámetro con DEFAULT crea una SOBRECARGA y PostgREST resuelve por nombre de
-- argumento: con dos candidatas devuelve PGRST203 "Could not choose the best
-- candidate function" (mismo footgun que rpc_move_task en la 0010). Los args
-- nuevos van entre los opcionales (todos con default), después de p_kind.
drop function if exists produccion.rpc_add_correction(
  uuid, text, uuid, text, text, text, uuid, uuid, produccion.comment_kind);

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
  p_target_end   int  default null
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
     target_quote, target_start, target_end)
  values
    (p_idea_id, p_actor, p_actor_member, p_body, p_kind,
     p_target_tabla, p_target_fila, p_target_campo, p_target_label,
     produccion.correction_next_round(p_idea_id),
     nullif(btrim(coalesce(p_target_quote, '')), ''), p_target_start, p_target_end)
  returning id into v_id;
  return v_id;
end $$;

grant execute on function produccion.rpc_add_correction(
  uuid, text, uuid, text, text, text, uuid, uuid, produccion.comment_kind, text, int, int)
  to anon, authenticated, service_role;
