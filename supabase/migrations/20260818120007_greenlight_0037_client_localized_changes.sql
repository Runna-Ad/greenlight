-- ═══════════════════════════════════════════════════════════════
-- 0037 — Cambios LOCALIZADOS del cliente desde el portal
-- ═══════════════════════════════════════════════════════════════
-- Antes el cliente pedía cambios con UN textarea suelto (0036,
-- rpc_client_request_changes). Pedro: el cliente debe pedir cambios IGUAL que un
-- lead — seleccionar el texto → escribir el cambio — con la ÚNICA diferencia de
-- que NO elige tipo de cambio (creatividad/hook/…): eso es interno y alimenta la
-- Evaluación; el cliente no puntúa a nadie.
--
-- Cada cambio del cliente es un comentario kind='client_change' anclado al campo
-- (target_*), SIN categoria. Se guarda al instante (resolved_at null = "pin"
-- pendiente de enviar), igual que un lead fija una corrección mientras revisa.
-- El botón "Pedir cambios" del portal ENVÍA todos los pendientes: los marca
-- resueltos (para separarlos de una próxima ronda) y mueve published→in_corrections
-- por la única puerta de estado (rpc_move_task). rpc_client_request_changes (0036)
-- se mantiene por compatibilidad; el portal ya no la usa.

-- ─────────────────────────────────────────────────────────────
-- Un cambio localizado (un "pin"). Sólo mientras la idea siga en la cancha del
-- cliente (published). Devuelve el id del comentario nuevo.
-- ─────────────────────────────────────────────────────────────
create or replace function produccion.rpc_client_add_change(
  p_idea_id      uuid,
  p_target_tabla text,
  p_target_fila  uuid,
  p_target_campo text,
  p_target_label text,
  p_body         text,
  p_target_quote text default null,
  p_target_start int  default null,
  p_target_end   int  default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_status produccion.asset_status; v_id uuid;
begin
  if coalesce(btrim(p_body), '') = '' then
    raise exception 'Escribe qué quieres cambiar.';
  end if;
  -- Sólo sobre lo que YA se le envió al cliente y sigue en su cancha.
  select status into v_status from produccion.ideas
   where id = p_idea_id and published_at is not null;
  if v_status is null then raise exception 'Esta idea no está disponible para revisión.'; end if;
  if v_status <> 'published' then
    raise exception 'Esta idea ya no está en revisión del cliente.';
  end if;

  insert into produccion.comments
    (idea_id, body, kind, target_tabla, target_fila_id, target_campo, target_label,
     target_quote, target_start, target_end)
  values
    (p_idea_id, btrim(p_body), 'client_change', p_target_tabla, p_target_fila, p_target_campo,
     p_target_label, nullif(btrim(coalesce(p_target_quote, '')), ''), p_target_start, p_target_end)
  returning id into v_id;
  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Enviar TODOS los cambios pendientes del cliente al equipo: los marca resueltos
-- y mueve published→in_corrections. El texto viaja en el aviso (notify_body).
-- ─────────────────────────────────────────────────────────────
create or replace function produccion.rpc_client_submit_changes(
  p_idea_id uuid
) returns produccion.asset_status
language plpgsql security definer set search_path = '' as $$
declare v_status produccion.asset_status; v_n int;
begin
  select status into v_status from produccion.ideas
   where id = p_idea_id and published_at is not null;
  if v_status is null then raise exception 'Esta idea no está disponible para revisión.'; end if;

  select count(*) into v_n from produccion.comments
   where idea_id = p_idea_id and kind = 'client_change' and resolved_at is null;
  if v_n = 0 then raise exception 'No hay cambios que enviar.'; end if;

  update produccion.comments
     set resolved_at = now()
   where idea_id = p_idea_id and kind = 'client_change' and resolved_at is null;

  perform set_config('produccion.notify_body',
    'El cliente pidió ' || v_n || case when v_n = 1 then ' cambio.' else ' cambios.' end, true);

  -- Si sigue con el cliente (published), vuelve a cambios. Si ya se movió, sólo
  -- quedan resueltos los pins (no se re-mueve).
  if v_status = 'published' then
    return produccion.rpc_move_task(p_idea_id, 'in_corrections', false, null, null, null);
  end if;
  return v_status;
end $$;

grant execute on function produccion.rpc_client_add_change(uuid, text, uuid, text, text, text, text, int, int)
  to anon, authenticated, service_role;
grant execute on function produccion.rpc_client_submit_changes(uuid)
  to anon, authenticated, service_role;
