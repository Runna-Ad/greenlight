-- ═══════════════════════════════════════════════════════════════
-- 0015 — El 5º verbo: "Enviar a cliente"
-- ═══════════════════════════════════════════════════════════════
-- Decisión de Pedro: enviar al cliente es un paso APARTE de aprobar. El lead
-- primero aprueba (revisión Rünna, completed) y después publica
-- (completed→published). Dos puertas: nada llega al cliente sin pasar por él.
--
-- completed→published YA está permitida en transition_allowed (0002:86), así
-- que el verbo no necesita override — delega en rpc_move_task (la única
-- puerta), igual que los otros cuatro (0010).

create or replace function produccion.rpc_task_send_client(
  p_idea_id uuid, p_actor_member uuid default null,
  p_actor uuid default null, p_note text default null
) returns produccion.asset_status
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(btrim(p_note), '') <> '' then
    -- kind 'comment' y no uno nuevo: comment_kind es un enum, y un valor nuevo
    -- exigiría un archivo de migración aparte (lección de la 0011).
    insert into produccion.comments (idea_id, author_id, author_member_id, body, kind)
    values (p_idea_id, p_actor, p_actor_member, p_note, 'comment');
  end if;
  perform set_config('produccion.notify_body', coalesce(p_note, ''), true);
  return produccion.rpc_move_task(p_idea_id, 'published', false, null, null, p_actor_member);
end $$;

grant execute on function produccion.rpc_task_send_client(uuid, uuid, uuid, text)
  to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- fan_out: publicar también avisa
-- ─────────────────────────────────────────────────────────────
-- La versión de la 0010 mapeaba sólo under_review/in_corrections/completed:
-- publicar movía la tarea sin avisar a nadie. Tres cambios, conservando todo
-- lo demás literal:
--   a) rama 'published' → type 'task_published' + título "…se envió al cliente"
--   b) los destinatarios de estado final incluyen 'published'
--   c) DISTINCT: hoy es imposible el aviso doble (0 track_members con
--      profile_id), pero el día que se llenen, un lead con perfil recibiría
--      dos avisos de under_review — se cierra desde ya.
create or replace function produccion.fan_out_task_notification()
returns trigger language plpgsql
security definer set search_path = '' as $$
declare
  v_member uuid := nullif(current_setting('produccion.acting_member', true), '')::uuid;
  v_body   text := nullif(current_setting('produccion.notify_body', true), '');
  v_type   text;
  v_titulo text;
  v_url    text;
  v_notif  uuid;
  v_ch     produccion.notify_channel;
  r        record;
begin
  if new.status is not distinct from old.status then return new; end if;

  -- Una notificación rota NUNCA puede tumbar el movimiento de una tarea.
  -- Se prefiere perder el aviso a bloquear el trabajo — pero entonces el fallo
  -- tiene que quedar registrado, o es invisible dos veces.
  begin
    v_type := case new.status
      when 'under_review'   then 'task_submitted'
      when 'in_corrections' then 'task_changes_requested'
      when 'completed'      then 'task_approved'
      when 'published'      then 'task_published'
      else null end;
    if v_type is null then return new; end if;

    v_titulo := case new.status
      when 'under_review'   then coalesce(new.naming_base, new.code, 'Una tarea') || ' está lista para revisar'
      when 'in_corrections' then 'Cambios pedidos en ' || coalesce(new.naming_base, new.code, 'una tarea')
      when 'published'      then coalesce(new.naming_base, new.code, 'Una tarea') || ' se envió al cliente'
      else                       coalesce(new.naming_base, new.code, 'Una tarea') || ' fue aprobada'
    end;

    select '/' || c.slug || '/tablero' into v_url
      from produccion.briefs b join produccion.clients c on c.id = b.client_id
     where b.id = new.brief_id;

    for r in
      select distinct member_id, profile_id from (
        -- A revisión → los perfiles admin/lead (hoy: Pedro)…
        -- Se excluye a quien YA va a ser avisado como miembro lead de esta
        -- tarea: sin esto, el día que track_members.profile_id se llene, la
        -- misma persona recibiría el aviso dos veces (una por perfil, otra
        -- por miembro).
        select null::uuid as member_id, p.id as profile_id
          from produccion.profiles p
         where new.status = 'under_review' and p.role in ('admin','lead') and p.active
           and not exists (
             select 1 from produccion.idea_assignments ia2
               join produccion.track_members tm2 on tm2.id = ia2.member_id
              where ia2.idea_id = new.id and ia2.es_lead and tm2.profile_id = p.id)
        union all
        -- …y los miembros marcados como lead ASIGNADOS a esta tarea.
        select tm.id, null::uuid
          from produccion.idea_assignments ia
          join produccion.track_members tm on tm.id = ia.member_id
         where new.status = 'under_review'
           and ia.idea_id = new.id and ia.es_lead
           and (v_member is null or tm.id <> v_member)
        union all
        -- Cambios, aprobación o publicación → quienes la trabajan.
        select tm.id, tm.profile_id
          from produccion.idea_assignments ia
          join produccion.track_members tm on tm.id = ia.member_id
         where new.status in ('in_corrections','completed','published')
           and ia.idea_id = new.id
           -- nunca notificarse a uno mismo
           and (v_member is null or tm.id <> v_member)
      ) dest
    loop
      insert into produccion.notifications
        (recipient_id, recipient_member_id, type, entity_type, entity_id, title, body, url)
      values (r.profile_id, r.member_id, v_type, 'idea', new.id, v_titulo, v_body, v_url)
      returning id into v_notif;

      foreach v_ch in array produccion.active_notify_channels() loop
        insert into produccion.notification_deliveries (notification_id, channel, status, sent_at)
        values (v_notif, v_ch,
                case when v_ch = 'in_app' then 'sent' else 'pending' end,
                case when v_ch = 'in_app' then now() else null end);
      end loop;
    end loop;

  exception when others then
    insert into produccion.activity_log (entity_type, entity_id, verb, payload)
    values ('idea', new.id, 'notify_failed',
            jsonb_build_object('error', sqlerrm, 'to', new.status::text));
  end;

  return new;
end $$;
