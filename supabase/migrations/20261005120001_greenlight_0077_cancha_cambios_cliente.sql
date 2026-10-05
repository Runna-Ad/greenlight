-- ═══════════════════════════════════════════════════════════════
-- 0077 — Cambios del CLIENTE: la "cancha del lead" es un ESTADO explícito
-- ═══════════════════════════════════════════════════════════════
-- Bug (Pedro 2026-10-05): el cliente pide cambios → la tarea va a in_corrections y es
-- del LEAD (el especialista no la ve). El lead se la asignó a la especialista desde el
-- picker normal… y la tarea SIGUIÓ invisible para ella (tablero, Mi Trabajo, bundle).
--
-- Causa: "cancha del lead" se DERIVABA de `existe un client_change con ronda not null`
-- — cualquier ronda, para siempre. Nada lo apagaba: ni asignar desde el picker, ni una
-- ronda interna posterior. Una tarea con historial de cliente quedaba en cancha del lead
-- cada vez que volvía a in_corrections, y el especialista la perdía.
--
-- Fix: una bandera en la tarea, con un ciclo de vida claro:
--   · ON  → rpc_client_submit_changes (el cliente envía su lote).
--   · OFF → el lead ENRUTA a un especialista (asignar uno NUEVO desde cualquier picker,
--           o "Reasignar" en el banner — aunque sea la misma persona), o la tarea SALE
--           de in_corrections por cualquier camino (reenviar al cliente, mover, aprobar).
-- Todas las superficies (tablero, Mi Trabajo, bundle, tarea) leen ESTA bandera.
--
-- Además:
--   · El cliente ya no puede "enviar" fuera de published (pestaña vieja): antes estampaba
--     la ronda sin mover el estado ni avisar a nadie → cambios huérfanos.
--   · El aviso al lead dice qué hacer: hacerlos él o asignarlos a un especialista.
--   · Reenviar al cliente cierra TAMBIÉN las correcciones internas abiertas (antes sólo
--     las del cliente → llegaban al cliente con correcciones internas sin resolver).
-- Sólo esquema `produccion` (proyecto compartido). No toca fan_out_task_notification
-- (su versión viva es la de 0076, rama roles-diseno).

-- ── 1) La bandera ─────────────────────────────────────────────
alter table produccion.ideas
  add column if not exists cambios_cliente_en_lead boolean not null default false;

comment on column produccion.ideas.cambios_cliente_en_lead is
  'true = el cliente envió cambios y el lead aún no los enruta (cancha del lead). 0077.';

-- ── 2) Salir de in_corrections apaga la bandera (cualquier camino) ─────────────
create or replace function produccion.apagar_cancha_cliente()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from 'in_corrections' then
    new.cambios_cliente_en_lead := false;
  end if;
  return new;
end $$;

revoke all on function produccion.apagar_cancha_cliente() from public;

drop trigger if exists ideas_cancha_cliente_bu on produccion.ideas;
create trigger ideas_cancha_cliente_bu before update of status on produccion.ideas
  for each row execute function produccion.apagar_cancha_cliente();

-- ── 3) El lead ENRUTA los cambios del cliente a su(s) especialista(s) ──────────
-- Apaga la bandera y avisa a los especialistas asignados (no-lead, activos, menos el
-- actor): "te toca". Idempotente: sin bandera no hace nada y devuelve 0.
create or replace function produccion.rpc_enrutar_cambios_cliente(
  p_idea_id uuid, p_actor_member uuid default null
) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_naming text; v_url text; v_notif uuid; v_ch produccion.notify_channel; r record; n int := 0;
begin
  update produccion.ideas set cambios_cliente_en_lead = false
   where id = p_idea_id and cambios_cliente_en_lead
  returning coalesce(naming_base, code, 'una tarea') into v_naming;
  if v_naming is null then return 0; end if;

  select '/' || c.slug || '/tareas/' || p_idea_id into v_url
    from produccion.ideas i join produccion.briefs b on b.id = i.brief_id
    join produccion.clients c on c.id = b.client_id where i.id = p_idea_id;

  for r in
    select tm.id as member_id, tm.profile_id
      from produccion.idea_assignments ia
      join produccion.track_members tm on tm.id = ia.member_id
     where ia.idea_id = p_idea_id and not ia.es_lead and tm.active
       and (p_actor_member is null or tm.id <> p_actor_member)
  loop
    insert into produccion.notifications
      (recipient_id, recipient_member_id, type, entity_type, entity_id, title, body, url)
    values (r.profile_id, r.member_id, 'task_changes_requested', 'idea', p_idea_id,
            'Cambios del cliente en ' || v_naming,
            'El lead te asignó los cambios que pidió el cliente.', v_url)
    returning id into v_notif;
    foreach v_ch in array produccion.active_notify_channels() loop
      insert into produccion.notification_deliveries (notification_id, channel, status, sent_at)
      values (v_notif, v_ch,
              case when v_ch = 'in_app' then 'sent' else 'pending' end,
              case when v_ch = 'in_app' then now() else null end);
    end loop;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function produccion.rpc_enrutar_cambios_cliente(uuid, uuid) from public;
grant execute on function produccion.rpc_enrutar_cambios_cliente(uuid, uuid) to service_role;

-- ── 4) rpc_set_assignees: asignar un especialista NUEVO en cancha del lead = enrutar ──
-- Cuerpo IDÉNTICO al de 0061 + el enrutado al final. Sólo cuenta un especialista que
-- ENTRA (no quien ya estaba): cambiar sólo el lead no le pasa la tarea a nadie. Para
-- enrutar a la MISMA persona que ya estaba, está "Reasignar" en el banner.
create or replace function produccion.rpc_set_assignees(
  p_idea_id          uuid,
  p_lead_id          uuid,
  p_especialista_ids uuid[],
  p_actor_member     uuid,
  p_actor_profile    uuid
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_deseado uuid[];
  v_nuevos  uuid[];
begin
  select coalesce(array_agg(distinct m), '{}'::uuid[]) into v_deseado
    from unnest(array_remove(coalesce(p_especialista_ids, '{}'::uuid[]) || p_lead_id, null)) m;

  perform set_config('produccion.acting_member', coalesce(p_actor_member::text, ''), true);

  delete from produccion.idea_assignments
   where idea_id = p_idea_id and member_id is not null
     and not (member_id = any(v_deseado));

  with ins as (
    insert into produccion.idea_assignments (idea_id, member_id, assigned_by)
    select p_idea_id, m, p_actor_profile from unnest(v_deseado) m
    on conflict (idea_id, member_id) do nothing
    returning member_id
  )
  select coalesce(array_agg(member_id), '{}'::uuid[]) into v_nuevos from ins;

  update produccion.idea_assignments
     set es_lead = (p_lead_id is not null and member_id = p_lead_id)
   where idea_id = p_idea_id;

  perform set_config('produccion.acting_member', '', true);

  -- 0077: entró un ESPECIALISTA nuevo mientras los cambios del cliente esperaban al lead.
  if exists (select 1 from unnest(v_nuevos) m
              where p_lead_id is null or m <> p_lead_id) then
    perform produccion.rpc_enrutar_cambios_cliente(p_idea_id, p_actor_member);
  end if;
end $$;

revoke all on function produccion.rpc_set_assignees(uuid, uuid, uuid[], uuid, uuid) from public;
grant execute on function produccion.rpc_set_assignees(uuid, uuid, uuid[], uuid, uuid) to service_role;

-- ── 5) El cliente envía: SÓLO desde published, prende la bandera, aviso accionable ──
-- Base: 0047. Cambios: guard de estado (antes, fuera de published estampaba la ronda sin
-- mover ni avisar), bandera ON, y el cuerpo del aviso dice qué hacer.
create or replace function produccion.rpc_client_submit_changes(
  p_idea_id uuid
) returns produccion.asset_status
language plpgsql security definer set search_path = '' as $$
declare v_status produccion.asset_status; v_n int; v_round int;
begin
  select status into v_status from produccion.ideas
   where id = p_idea_id and published_at is not null and deleted_at is null;
  if v_status is null then raise exception 'Esta idea no está disponible para revisión.'; end if;
  if v_status <> 'published' then
    raise exception 'Esta pieza ya no está esperando tu revisión. Recarga la página.';
  end if;

  select count(*) into v_n from produccion.comments
   where idea_id = p_idea_id and kind = 'client_change' and ronda is null;
  if v_n = 0 then raise exception 'No hay cambios que enviar.'; end if;

  v_round := produccion.correction_next_round(p_idea_id);
  update produccion.comments
     set ronda = v_round
   where idea_id = p_idea_id and kind = 'client_change' and ronda is null;

  perform set_config('produccion.notify_body',
    'El cliente pidió ' || v_n || case when v_n = 1 then ' cambio' else ' cambios' end
      || '. Hazlos tú o asígnalos a un especialista.', true);
  perform set_config('produccion.notify_to_lead', 'true', true);

  v_status := produccion.rpc_move_task(p_idea_id, 'in_corrections', false, null, null, null);
  -- Después del movimiento (el trigger de 0077 apaga la bandera FUERA de in_corrections).
  update produccion.ideas set cambios_cliente_en_lead = true where id = p_idea_id;
  perform set_config('produccion.notify_to_lead', '', true);
  return v_status;
end $$;

grant execute on function produccion.rpc_client_submit_changes(uuid)
  to service_role;

-- ── 6) El lead reenvía: cierra TODO lo abierto de la ronda (cliente E internas) ──
-- Base: 0054. Único cambio: también resuelve `correction_request` abiertas — si no,
-- la pieza llegaba al cliente con correcciones internas sin cerrar, y la siguiente
-- ronda del cliente se pegaba a la vieja (correction_next_round ve algo sin resolver).
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

  update produccion.comments
     set resolved_at = now(), resolved_member_id = p_actor_member, resolved_by = p_actor
   where idea_id = p_idea_id and resolved_at is null
     and (kind = 'correction_request' or (kind = 'client_change' and ronda is not null));

  perform set_config('produccion.notify_body', 'El lead aplicó los cambios y reenvió la pieza.', true);
  return produccion.rpc_move_task(
    p_idea_id, 'published', true, p_actor,
    'El lead aplicó los cambios del cliente y reenvió', p_actor_member);
end $$;

grant execute on function produccion.rpc_lead_reenvia_cliente(uuid, uuid, uuid)
  to service_role;

-- ── 7) Live refresh: el enrutado SÓLO cambia la bandera (no el estado) ─────────────
-- Base: 0062 (sin cambios en otras ramas). Sin esto, "Asignar" a la MISMA especialista
-- apagaba la bandera sin emitir nada: su tablero/Mi Trabajo no se enteraba hasta recargar.
create or replace function produccion.live_ideas_stmt()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_n       int := 0;
  v_clients uuid[];
  v_ids     uuid[];
begin
  if tg_op = 'INSERT' then
    select count(*), array_agg(distinct produccion.live_client_de(n.brief_id, n.marca_id)), array_agg(n.id)
      into v_n, v_clients, v_ids
      from nuevos n;
  elsif tg_op = 'DELETE' then
    select count(*), array_agg(distinct produccion.live_client_de(v.brief_id, v.marca_id)), array_agg(v.id)
      into v_n, v_clients, v_ids
      from viejos v;
  else
    select count(*), array_agg(distinct produccion.live_client_de(n.brief_id, n.marca_id)), array_agg(n.id)
      into v_n, v_clients, v_ids
      from nuevos n join viejos v on v.id = n.id
     where n.status       is distinct from v.status
        or n.deleted_at   is distinct from v.deleted_at
        or n.published_at is distinct from v.published_at
        or n.delivered_at is distinct from v.delivered_at
        or n.cambios_cliente_en_lead is distinct from v.cambios_cliente_en_lead; -- 0077
  end if;

  if coalesce(v_n, 0) > 0 then
    perform produccion.live_emit(lower(tg_op), 'ideas', v_clients, v_ids);
  end if;
  return null;
end $$;

-- ── 8) Backfill: qué tareas siguen HOY en cancha del lead ─────────────────────────
-- in_corrections QUE ENTRÓ DESDE published (la mandó el cliente — no un "Pedir cambios"
-- del lead tras un reasignar viejo) + la ronda ACTUAL es del cliente + ningún
-- especialista entró DESPUÉS (si entró, el lead ya la enrutó — el caso de Pedro).
update produccion.ideas i
   set cambios_cliente_en_lead = true
 where i.status = 'in_corrections'
   and (select se.from_status from produccion.status_events se
         where se.idea_id = i.id and se.to_status = 'in_corrections'
         order by se.created_at desc limit 1) = 'published'
   and exists (
     select 1 from produccion.comments c
      where c.idea_id = i.id and c.kind = 'client_change'
        and c.ronda = (select max(coalesce(c2.ronda, 1)) from produccion.comments c2
                        where c2.idea_id = i.id
                          and (c2.kind = 'correction_request'
                               or (c2.kind = 'client_change' and c2.ronda is not null))))
   and not exists (
     select 1 from produccion.idea_assignments ia
      where ia.idea_id = i.id and not ia.es_lead
        and ia.assigned_at > (select max(se.created_at) from produccion.status_events se
                               where se.idea_id = i.id and se.to_status = 'in_corrections'));
