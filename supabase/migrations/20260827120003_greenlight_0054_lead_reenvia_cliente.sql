-- Greenlight · by Rünna — el LEAD aplica los cambios del cliente y reenvía (0054)
--
-- Cuando el cliente pide cambios, la tarea va a `in_corrections` y AHORA es cancha
-- del LEAD (él triagea; el especialista no la ve hasta que se le reasigne — eso se
-- gobierna en la app, task-actions + visibilidad). El lead decide:
--   (a) HACERLOS ÉL MISMO → edita en `in_corrections` (ya es editable para el lead) y
--       REENVÍA directo al cliente, SIN ronda de revisión (él es el revisor). ← esta RPC.
--   (b) REASIGNAR a un especialista → asignarTarea + rpc_task_start (in_corrections→
--       in_progress) → el especialista lo trabaja normal (server action, sin RPC nueva).
--
-- Esta RPC cubre (a): resuelve los cambios del cliente (enviados sin resolver) y mueve
-- in_corrections→published. Ese salto NO está en el flujo normal (a propósito: evita que
-- un especialista brinque la revisión); aquí es legítimo — el lead ya resolvió los
-- cambios del cliente — así que va como OVERRIDE de lead con un MOTIVO claro (queda en
-- status_events), no como un "fuera de flujo" ciego.

create or replace function produccion.rpc_lead_reenvia_cliente(
  p_idea_id uuid,
  p_actor_member uuid default null,
  p_actor uuid default null
) returns produccion.asset_status
language plpgsql security definer set search_path = '' as $$
declare v_status produccion.asset_status;
begin
  select status into v_status from produccion.ideas where id = p_idea_id;
  if v_status is null then raise exception 'La tarea no existe.'; end if;
  if v_status <> 'in_corrections' then
    raise exception 'Sólo se reenvía al cliente desde En correcciones.';
  end if;

  -- El lead APLICÓ los cambios del cliente → márcalos resueltos (los ENVIADOS sin
  -- resolver: ronda asignada = enviado, resolved_at null = aún no confirmado).
  update produccion.comments
     set resolved_at = now(), resolved_member_id = p_actor_member, resolved_by = p_actor
   where idea_id = p_idea_id and kind = 'client_change'
     and ronda is not null and resolved_at is null;

  perform set_config('produccion.notify_body', 'El lead aplicó los cambios y reenvió la pieza.', true);
  -- Override de lead CON motivo (no flujo normal). El trigger de published avisa a los
  -- asignados (task_published) y al cliente (ready_for_review, 0051).
  return produccion.rpc_move_task(
    p_idea_id, 'published', true, p_actor,
    'El lead aplicó los cambios del cliente y reenvió', p_actor_member);
end $$;

grant execute on function produccion.rpc_lead_reenvia_cliente(uuid, uuid, uuid)
  to anon, authenticated, service_role;
