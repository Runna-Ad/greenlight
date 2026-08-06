-- Greenlight 0026 — notificar a los especialistas cuando se crea un brief
--
-- Crear un brief inserta tareas con status 'todo' — NO hay cambio de estado, así
-- que el trigger fan_out_task_notification (que sólo dispara en UPDATE of status)
-- no aplica. Este RPC arma, por persona asignada, UNA notificación agregada
-- ("tienes X tareas nuevas") con su entrega por canal (in_app + email). La
-- server action crearBrief lo llama después de rpc_crear_brief y luego dispara
-- el envío (dispatchPendingEmails).
--
-- Se hace en función aparte (no dentro de rpc_crear_brief) para no reescribir esa
-- función ya probada, y porque la notificación es NO crítica: si fallara, el
-- brief ya quedó creado.
--
-- Numeración: NO existe 0017. Timestamp nuevo.

create or replace function produccion.rpc_notificar_brief(p_brief_id uuid)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  v_title text;
  v_notif uuid;
  v_ch    produccion.notify_channel;
  r       record;
  n       int := 0;
begin
  select coalesce(nullif(title, ''), code) into v_title
    from produccion.briefs where id = p_brief_id;
  if v_title is null then return 0; end if;

  -- Una notificación por persona asignada, con su conteo de tareas en el brief.
  for r in
    select ia.member_id, count(distinct i.id) as cnt
      from produccion.idea_assignments ia
      join produccion.ideas i on i.id = ia.idea_id
     where i.brief_id = p_brief_id and ia.member_id is not null
     group by ia.member_id
  loop
    insert into produccion.notifications (recipient_member_id, type, title, body, url)
    values (
      r.member_id,
      'brief_created',
      'Nuevo brief: ' || v_title,
      'Tienes ' || r.cnt || ' tarea' || case when r.cnt = 1 then '' else 's' end
        || ' en este brief. Da click para ir a tus tareas.',
      '/mi-trabajo'
    )
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

grant execute on function produccion.rpc_notificar_brief(uuid)
  to anon, authenticated, service_role;
