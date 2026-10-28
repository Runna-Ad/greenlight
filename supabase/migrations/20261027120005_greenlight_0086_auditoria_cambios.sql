-- ─────────────────────────────────────────────────────────────
-- 0086 — Auditoría del flujo de cambios y comentarios (2026-10-27).
--
-- Lo que la base ahora hace cumplir (antes sólo lo cuidaba la app, o nadie):
--   1. Aprobar NO cierra cambios del cliente con la conversación abierta
--      (rpc_task_approve), igual que enviar la pieza (rpc_lead_reenvia_cliente).
--   8. Esa revisión bloquea las filas (FOR UPDATE): una respuesta del cliente en el mismo
--      segundo ya no se cuela como "aplicado".
--  10. rpc_lead_reenvia_cliente revisa que quien la llama sea lead.
--   4. El cliente no contesta en un cambio ya cerrado ni en una pieza fuera de su portal.
--   5. Si el cliente contesta y la tarea no tiene lead asignado, avisa a los leads/admins
--      de su alcance (antes: a nadie).
--   7. rpc_client_approve se niega fuera de published (antes: "¡Aprobado!" sin aprobar).
--   9. Borrar una fila (plano, estático, copy) con cambios del cliente SIN CERRAR se niega:
--      antes se borraban el cambio y toda su conversación.
-- Sólo esquema `produccion`. Mismas firmas: nada de la app vieja se rompe.
-- ─────────────────────────────────────────────────────────────

-- ── La regla de "conversación abierta" (espejo de bloqueoEnvioPieza en correcciones.ts) ──
-- Por cada cambio del cliente enviado y sin cerrar, mira la ÚLTIMA respuesta visible:
--   del equipo para el cliente → espera al cliente; del cliente → el lead decide.
-- Devuelve el texto del bloqueo, o null si se puede seguir. BLOQUEA esas filas hasta el
-- final de la transacción (rpc_responder_cambio bloquea la misma fila antes de insertar).
create or replace function produccion.motivo_bloqueo_envio(p_idea uuid, p_accion text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_espera  int;
  v_decidir int;
  v_partes  text[] := '{}';
begin
  perform 1 from produccion.comments c
   where c.idea_id = p_idea and c.kind = 'client_change'
     and c.ronda is not null and c.resolved_at is null
   for update;

  select count(*) filter (where u.para_cliente), count(*) filter (where u.de_cliente)
    into v_espera, v_decidir
    from produccion.comments c
    cross join lateral (
      select r.de_cliente, r.para_cliente
        from produccion.correccion_respuestas r
       where r.comment_id = c.id and (r.de_cliente or r.para_cliente)
       order by r.created_at desc
       limit 1
    ) u
   where c.idea_id = p_idea and c.kind = 'client_change'
     and c.ronda is not null and c.resolved_at is null;

  if v_espera > 0 then
    v_partes := v_partes || (v_espera || ' cambio'
      || case when v_espera = 1 then ' espera' else 's esperan' end || ' respuesta del cliente');
  end if;
  if v_decidir > 0 then
    v_partes := v_partes || ('el cliente contestó en ' || v_decidir || ' cambio'
      || case when v_decidir = 1 then '' else 's' end
      || ': márcalo aplicado o "Sin cambio (acordado)"');
  end if;
  if cardinality(v_partes) = 0 then return null; end if;
  return 'No se puede ' || p_accion || ' todavía: ' || array_to_string(v_partes, '; ') || '.';
end $$;

revoke all on function produccion.motivo_bloqueo_envio(uuid, text) from public, anon, authenticated;
grant execute on function produccion.motivo_bloqueo_envio(uuid, text) to service_role;

-- ── 1 + 8. Aprobar (base 0038) ──────────────────────────────────────────────────────────
create or replace function produccion.rpc_task_approve(
  p_idea_id uuid, p_actor_member uuid default null, p_actor uuid default null, p_note text default null
) returns produccion.asset_status
language plpgsql security definer set search_path = '' as $$
declare v_motivo text;
begin
  v_motivo := produccion.motivo_bloqueo_envio(p_idea_id, 'aprobar la pieza');
  if v_motivo is not null then raise exception '%', v_motivo; end if;

  if coalesce(btrim(p_note), '') <> '' then
    insert into produccion.comments (idea_id, author_id, author_member_id, body, kind)
    values (p_idea_id, p_actor, p_actor_member, p_note, 'approval');
  end if;
  update produccion.comments
     set resolved_at = now(), resolved_member_id = p_actor_member, resolved_by = p_actor
   where idea_id = p_idea_id and resolved_at is null
     and (kind = 'correction_request'
       or (kind = 'client_change' and ronda is not null));
  perform set_config('produccion.notify_body', coalesce(p_note, ''), true);
  return produccion.rpc_move_task(p_idea_id, 'completed', false, null, null, p_actor_member);
end $$;

-- ── 1 + 8 + 10. El lead envía la pieza (base 0077) ─────────────────────────────────────
create or replace function produccion.rpc_lead_reenvia_cliente(
  p_idea_id uuid,
  p_actor_member uuid default null,
  p_actor uuid default null
) returns produccion.asset_status
language plpgsql security definer set search_path = '' as $$
declare
  v_status produccion.asset_status;
  v_motivo text;
begin
  select status into v_status from produccion.ideas where id = p_idea_id;
  if v_status is null then raise exception 'La tarea no existe.'; end if;
  if v_status <> 'in_corrections' then
    raise exception 'Sólo se reenvía al cliente desde En correcciones.';
  end if;
  -- 10. Sólo un lead (perfil lead/admin/master, o miembro lead de la tarea o del equipo).
  -- Antes con el rol del server (service_role) rpc_move_task aceptaba a cualquier actor.
  if not (
    exists (select 1 from produccion.profiles p
             where p.id = p_actor and p.active and p.role::text in ('master', 'admin', 'lead'))
    or exists (select 1 from produccion.track_members tm
                where tm.id = p_actor_member and tm.active
                  and (tm.es_lead or tm.role::text = 'lead' or exists (
                        select 1 from produccion.idea_assignments ia
                         where ia.idea_id = p_idea_id and ia.member_id = tm.id and ia.es_lead)))
  ) then
    raise exception 'Sólo un lead reenvía al cliente.';
  end if;

  v_motivo := produccion.motivo_bloqueo_envio(p_idea_id, 'enviar la pieza');
  if v_motivo is not null then raise exception '%', v_motivo; end if;

  update produccion.comments
     set resolved_at = now(), resolved_member_id = p_actor_member, resolved_by = p_actor
   where idea_id = p_idea_id and resolved_at is null
     and (kind = 'correction_request' or (kind = 'client_change' and ronda is not null));

  perform set_config('produccion.notify_body', 'El lead aplicó los cambios y reenvió la pieza.', true);
  return produccion.rpc_move_task(
    p_idea_id, 'published', true, p_actor,
    'El lead aplicó los cambios del cliente y reenvió', p_actor_member);
end $$;

-- ── 7. El cliente aprueba (base 0036): sólo desde published ─────────────────────────────
create or replace function produccion.rpc_client_approve(
  p_idea_id uuid
) returns produccion.asset_status
language plpgsql security definer set search_path = '' as $$
declare v_status produccion.asset_status;
begin
  select status into v_status from produccion.ideas
   where id = p_idea_id and published_at is not null;
  if v_status is null then raise exception 'Esta idea no está disponible para revisión.'; end if;
  -- Pestaña vieja (la pieza ya está en cambios o ya se aprobó): antes insertaba el
  -- "Aprobado por el cliente." y avisaba al equipo sin aprobar nada.
  if v_status <> 'published' then
    raise exception 'Esta pieza ya no está esperando tu aprobación. Recarga la página.';
  end if;

  insert into produccion.comments (idea_id, body, kind)
  values (p_idea_id, 'Aprobado por el cliente.', 'approval');

  perform set_config('produccion.notify_body', 'El cliente aprobó la idea.', true);
  return produccion.rpc_move_task(p_idea_id, 'delivered', false, null, null, null);
end $$;

-- ── 9. Borrar una fila con cambios del cliente sin cerrar (base 0039) ───────────────────
-- Se sigue borrando lo de siempre (correcciones internas, cambios cerrados, borradores).
-- Si la tarea entera se está borrando (cascada desde ideas), la idea ya no se ve y no se
-- frena nada.
create or replace function produccion.trg_borrar_correcciones_huerfanas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- tg_argv[0] = 'planos' | 'estaticos' | 'copies' | 'copies_temas' (la tabla dueña).
  if exists (
    select 1 from produccion.comments c
      join produccion.ideas i on i.id = c.idea_id
     where c.target_tabla = tg_argv[0] and c.target_fila_id = old.id
       and c.kind = 'client_change' and c.ronda is not null and c.resolved_at is null
  ) then
    raise exception 'Lo que intentas borrar tiene cambios del cliente sin cerrar. Ciérralos (aplicado o "Sin cambio") antes de borrarlo.';
  end if;
  delete from produccion.comments
   where target_tabla = tg_argv[0]
     and target_fila_id = old.id;
  return old;
end;
$$;

-- ── 4 + 5. Respuestas (base 0083) ───────────────────────────────────────────────────────
create or replace function produccion.rpc_responder_cambio(
  p_comment_id    uuid,
  p_idea_id       uuid,
  p_body          text,
  p_de_cliente    boolean,
  p_para_cliente  boolean,
  p_actor_member  uuid default null,
  p_actor_profile uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_kind     text;
  v_ronda    int;
  v_autor_m  uuid;
  v_resuelto timestamptz;
  v_id       uuid;
  v_naming   text;
  v_slug     text;
  v_client   uuid;
  v_track    text;
  v_actor    text;
  v_snippet  text;
  v_type     text;
  v_title    text;
  v_url      text;
  v_portal   text;
  v_notif    uuid;
  v_avisados int := 0;
  v_ch       produccion.notify_channel;
  r          record;
begin
  if coalesce(p_de_cliente, false) and coalesce(p_para_cliente, false) then
    raise exception 'Una respuesta no puede ser del cliente y para el cliente.';
  end if;

  -- FOR UPDATE: bloquea el cambio mientras se cuenta y se inserta (tope de 100), y espera
  -- si el lead está enviando la pieza en ese momento (motivo_bloqueo_envio bloquea igual).
  select c.kind::text, c.ronda, c.author_member_id, c.resolved_at
    into v_kind, v_ronda, v_autor_m, v_resuelto
    from produccion.comments c
   where c.id = p_comment_id and c.idea_id = p_idea_id
   for update;
  if v_kind is null or v_kind not in ('correction_request', 'client_change') then
    raise exception 'Ese cambio ya no existe.';
  end if;
  if v_kind = 'client_change' and v_ronda is null then
    raise exception 'Ese cambio ya no existe.'; -- borrador del cliente: no se ve en la tarea
  end if;
  -- Nada cruza al cliente fuera de un cambio SUYO.
  if (p_de_cliente or p_para_cliente) and v_kind <> 'client_change' then
    raise exception 'Este cambio es interno: el cliente no participa.';
  end if;
  -- Al cliente sólo le llega algo de una pieza que VE en su portal; y el cliente sólo
  -- escribe desde una pieza que ve (antes sólo se revisaba en un sentido).
  if (p_para_cliente or p_de_cliente) and not exists (
    select 1 from produccion.ideas i
     where i.id = p_idea_id and i.deleted_at is null and i.published_at is not null
       and i.status::text in ('published', 'in_corrections', 'delivered')
  ) then
    raise exception 'Esta pieza ya no está en el portal del cliente.';
  end if;
  -- 4. Un cambio cerrado (aplicado o sin cambio) ya no recibe respuestas del cliente: nadie
  -- las veía (ni el letrero del lead ni el bloqueo cuentan cambios cerrados).
  if p_de_cliente and v_resuelto is not null then
    raise exception 'Este cambio ya está cerrado. Si algo sigue sin estar bien, pide un cambio nuevo cuando recibas la pieza.';
  end if;
  if (select count(*) from produccion.correccion_respuestas where comment_id = p_comment_id) >= 100 then
    raise exception 'Este cambio ya tiene demasiadas respuestas.';
  end if;

  insert into produccion.correccion_respuestas
    (comment_id, idea_id, author_member_id, author_id, body, de_cliente, para_cliente)
  values (p_comment_id, p_idea_id, p_actor_member, p_actor_profile, btrim(p_body),
          coalesce(p_de_cliente, false), coalesce(p_para_cliente, false))
  returning id into v_id;

  -- Un aviso que falla NO se lleva la respuesta: se registra y se sigue (patrón 0051).
  begin
    select coalesce(i.naming_base, i.code, 'una tarea'), cl.slug, cl.id, i.track::text,
           '/' || cl.slug || '/portal?marca=' || coalesce(i.marca_id::text, '__none__')
             || '&brief=' || i.brief_id || '&tarea=' || i.id
      into v_naming, v_slug, v_client, v_track, v_portal
      from produccion.ideas i
      join produccion.briefs b on b.id = i.brief_id
      join produccion.clients cl on cl.id = b.client_id
     where i.id = p_idea_id;
    select tm.name into v_actor from produccion.track_members tm where tm.id = p_actor_member;
    v_snippet := left(regexp_replace(btrim(p_body), '\s+', ' ', 'g'), 160);

    if p_para_cliente then
      -- El equipo → el CLIENTE: los perfiles cliente activos de ESTE cliente.
      v_type  := 'change_reply_client';
      v_title := 'El equipo respondió a tu cambio en ' || v_naming;
      v_url   := v_portal;
      for r in
        select p.id as profile_id from produccion.profiles p
         where p.role = 'client' and p.active and p.client_id = v_client
      loop
        insert into produccion.notifications (recipient_id, type, entity_type, entity_id, title, body, url)
        values (r.profile_id, v_type, 'idea', p_idea_id, v_title, v_snippet, v_url)
        returning id into v_notif;
        foreach v_ch in array produccion.active_notify_channels() loop
          insert into produccion.notification_deliveries (notification_id, channel, status, sent_at)
          values (v_notif, v_ch, case when v_ch = 'in_app' then 'sent' else 'pending' end,
                  case when v_ch = 'in_app' then now() else null end);
        end loop;
      end loop;
    else
      v_type := 'change_reply';
      v_url  := '/' || v_slug || '/tareas/' || p_idea_id;
      -- El master puede actuar como cliente (para probar el portal): el aviso lo dice.
      v_title := case when p_de_cliente and exists (
                        select 1 from produccion.profiles p where p.id = p_actor_profile and p.role = 'master')
                      then 'Master (como cliente) respondió en ' || v_naming
                      when p_de_cliente then 'El cliente respondió en ' || v_naming
                      else coalesce(v_actor, 'Alguien del equipo') || ' respondió en ' || v_naming end;
      for r in
        select distinct tm.profile_id
          from produccion.track_members tm
         where tm.active and tm.profile_id is not null
           and (p_actor_member is null or tm.id <> p_actor_member)
           and (p_actor_profile is null or tm.profile_id <> p_actor_profile)
           and tm.id in (
             -- El cliente escribió → los LEADS de la tarea + quien del equipo ya le contestó.
             select ia.member_id from produccion.idea_assignments ia
              where p_de_cliente and ia.idea_id = p_idea_id and ia.es_lead
             union
             select cr.author_member_id from produccion.correccion_respuestas cr
              where p_de_cliente and cr.comment_id = p_comment_id and cr.para_cliente
             -- Interno → los asignados + quien pidió el cambio + quien ya respondió adentro.
             union
             select ia.member_id from produccion.idea_assignments ia
              where not p_de_cliente and ia.idea_id = p_idea_id
             union
             select v_autor_m where not p_de_cliente
             union
             select cr.author_member_id from produccion.correccion_respuestas cr
              where not p_de_cliente and cr.comment_id = p_comment_id
                and not cr.de_cliente and not cr.para_cliente
           )
      loop
        insert into produccion.notifications (recipient_id, type, entity_type, entity_id, title, body, url)
        values (r.profile_id, v_type, 'idea', p_idea_id, v_title, v_snippet, v_url)
        returning id into v_notif;
        v_avisados := v_avisados + 1;
        foreach v_ch in array produccion.active_notify_channels() loop
          insert into produccion.notification_deliveries (notification_id, channel, status, sent_at)
          values (v_notif, v_ch, case when v_ch = 'in_app' then 'sent' else 'pending' end,
                  case when v_ch = 'in_app' then now() else null end);
        end loop;
      end loop;
      -- 5. El cliente escribió y en la tarea no hubo a quién avisar (sin lead asignado) →
      -- los leads y admins de su alcance (mismo criterio que "cambios pedidos", fan_out 0061).
      if p_de_cliente and v_avisados = 0 then
        for r in
          select p.id as profile_id
            from produccion.profiles p
           where p.role in ('admin', 'lead') and p.active
             and (p_actor_profile is null or p.id <> p_actor_profile)
             and (p.notify_scope = 'all'
                  or exists (select 1 from produccion.track_members tmx
                              where tmx.profile_id = p.id and tmx.active
                                and (tmx.track::text = v_track or v_track = any(tmx.tracks::text[]))))
        loop
          insert into produccion.notifications (recipient_id, type, entity_type, entity_id, title, body, url)
          values (r.profile_id, v_type, 'idea', p_idea_id, v_title, v_snippet, v_url)
          returning id into v_notif;
          foreach v_ch in array produccion.active_notify_channels() loop
            insert into produccion.notification_deliveries (notification_id, channel, status, sent_at)
            values (v_notif, v_ch, case when v_ch = 'in_app' then 'sent' else 'pending' end,
                    case when v_ch = 'in_app' then now() else null end);
          end loop;
        end loop;
      end if;
    end if;
  exception when others then
    insert into produccion.activity_log (entity_type, entity_id, verb, payload)
    values ('idea', p_idea_id, 'notify_failed', jsonb_build_object('error', sqlerrm, 'respuesta', v_id));
  end;

  return v_id;
end $$;

revoke all on function produccion.rpc_responder_cambio(uuid, uuid, text, boolean, boolean, uuid, uuid) from public;
grant execute on function produccion.rpc_responder_cambio(uuid, uuid, text, boolean, boolean, uuid, uuid) to service_role;
