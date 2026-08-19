-- ═══════════════════════════════════════════════════════════════
-- 0036 — Acciones del CLIENTE desde el portal: Aprobar / Pedir cambios
-- ═══════════════════════════════════════════════════════════════
-- El partner revisa lo que se le envió (published) y decide. Dos RPC finas que
-- pasan por rpc_move_task (la ÚNICA puerta del estado, igual que los verbos del
-- equipo) — así el historial y las notificaciones quedan consistentes. Se hacen
-- como RPC (no un UPDATE directo desde el server action) porque rpc_move_task tiene
-- sobrecargas y llamarla por PostgREST sería ambiguo; aquí se invoca desde plpgsql
-- con args posicionales, sin ambigüedad.
--
-- El texto del cliente viaja en el aviso (notify_body) para que el equipo LO VEA
-- en su notificación al volver la tarea a cambios. (Mostrar el hilo client_change
-- dentro de la pantalla de la tarea es un paso aparte.)

-- ─────────────────────────────────────────────────────────────
-- El cliente PIDE CAMBIOS (texto libre): comentario + published→in_corrections
-- ─────────────────────────────────────────────────────────────
create or replace function produccion.rpc_client_request_changes(
  p_idea_id uuid,
  p_body    text
) returns produccion.asset_status
language plpgsql security definer set search_path = '' as $$
declare v_status produccion.asset_status;
begin
  if coalesce(btrim(p_body), '') = '' then
    raise exception 'Escribe qué quieres cambiar.';
  end if;
  -- Sólo sobre lo que YA se le envió al cliente.
  select status into v_status from produccion.ideas
   where id = p_idea_id and published_at is not null;
  if v_status is null then raise exception 'Esta idea no está disponible para revisión.'; end if;

  insert into produccion.comments (idea_id, body, kind)
  values (p_idea_id, p_body, 'client_change');

  perform set_config('produccion.notify_body',
    'El cliente pidió cambios: ' || left(p_body, 140), true);

  -- Si está con el cliente (published), vuelve a cambios. Si ya estaba en cambios
  -- o entregado, sólo queda el comentario (no se re-mueve).
  if v_status = 'published' then
    return produccion.rpc_move_task(p_idea_id, 'in_corrections', false, null, null, null);
  end if;
  return v_status;
end $$;

-- ─────────────────────────────────────────────────────────────
-- El cliente APRUEBA: comentario + published→delivered
-- ─────────────────────────────────────────────────────────────
create or replace function produccion.rpc_client_approve(
  p_idea_id uuid
) returns produccion.asset_status
language plpgsql security definer set search_path = '' as $$
declare v_status produccion.asset_status;
begin
  select status into v_status from produccion.ideas
   where id = p_idea_id and published_at is not null;
  if v_status is null then raise exception 'Esta idea no está disponible para revisión.'; end if;

  insert into produccion.comments (idea_id, body, kind)
  values (p_idea_id, 'Aprobado por el cliente.', 'approval');

  perform set_config('produccion.notify_body', 'El cliente aprobó la idea.', true);

  if v_status = 'published' then
    return produccion.rpc_move_task(p_idea_id, 'delivered', false, null, null, null);
  end if;
  return v_status;
end $$;

grant execute on function produccion.rpc_client_request_changes(uuid, text)
  to anon, authenticated, service_role;
grant execute on function produccion.rpc_client_approve(uuid)
  to anon, authenticated, service_role;
