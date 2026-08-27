-- Greenlight · by Rünna — notificaciones respetan el grant multi-track del lead (0053)
--
-- 0052 dio a los leads un grant multi-track (`track_members.lead_tracks`): un lead
-- puede VER/ASIGNAR/CREAR en uno o ambos tracks. Pero el fan-out de notificaciones
-- (fan_out_task_notification) acotaba el scope `my_track` con `tmx.track = new.track`
-- — SÓLO el track HOME. Efecto: un lead con grant de ambos tracks NO recibía avisos
-- `my_track` de las tareas del OTRO track (sólo del home).
--
-- Fix: la condición de track de `my_track` ahora empata el track HOME **o** el grant
-- (`new.track = any(tmx.lead_tracks)`). Para no-leads (lead_tracks NULL) el `= any(NULL)`
-- es NULL → cae al empate por track home = comportamiento IDÉNTICO al anterior.
--
-- ⚠️ Esta función se redefine en cadena (0047 → 0050 → 0051). Se REPRODUCE la versión
-- 0051 COMPLETA (incluye la pata (e) CLIENTE `ready_for_review` al publicar) y sólo se
-- tocan los DOS empates de track — patas (a) admin/lead y (d) watchers. (No basar un
-- `create or replace` en una versión vieja: borraría lo que agregó la última.)

create or replace function produccion.fan_out_task_notification()
returns trigger language plpgsql
security definer set search_path = '' as $$
declare
  v_member uuid := nullif(current_setting('produccion.acting_member', true), '')::uuid;
  v_body   text := nullif(current_setting('produccion.notify_body', true), '');
  v_to_lead boolean := coalesce(nullif(current_setting('produccion.notify_to_lead', true), ''), 'false') = 'true';
  v_type   text;
  v_titulo text;
  v_url    text;
  v_notif  uuid;
  v_ch     produccion.notify_channel;
  r        record;
begin
  if new.status is not distinct from old.status then return new; end if;

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
        -- (a) perfiles admin/lead → under_review O in_corrections del CLIENTE, ACOTADO por scope.
        --     'all' → siempre; 'my_track' → track HOME o grant multi-track del lead (0053).
        select null::uuid as member_id, p.id as profile_id
          from produccion.profiles p
         where (new.status = 'under_review' or (new.status = 'in_corrections' and v_to_lead))
           and p.role in ('admin','lead') and p.active
           and (p.notify_scope = 'all'
                or exists (select 1 from produccion.track_members tmx
                            where tmx.profile_id = p.id and tmx.active
                              and (tmx.track = new.track or new.track = any(tmx.lead_tracks))))
           and not exists (
             select 1 from produccion.idea_assignments ia2
               join produccion.track_members tm2 on tm2.id = ia2.member_id
              where ia2.idea_id = new.id and ia2.es_lead and tm2.profile_id = p.id)
        union all
        -- (b) miembros lead ASIGNADOS a esta tarea (siempre — es su tarea).
        select tm.id, null::uuid
          from produccion.idea_assignments ia
          join produccion.track_members tm on tm.id = ia.member_id
         where (new.status = 'under_review' or (new.status = 'in_corrections' and v_to_lead))
           and ia.idea_id = new.id and ia.es_lead
           and (v_member is null or tm.id <> v_member)
        union all
        -- (c) asignados → cambios del LEAD, aprobación y publicación (siempre — es su tarea).
        select tm.id, tm.profile_id
          from produccion.idea_assignments ia
          join produccion.track_members tm on tm.id = ia.member_id
         where ((new.status = 'in_corrections' and not v_to_lead) or new.status in ('completed','published'))
           and ia.idea_id = new.id
           and (v_member is null or tm.id <> v_member)
        union all
        -- (d) WATCHERS: notify_watch_all (admin/lead) → TODO dentro de su scope (HOME o grant).
        select null::uuid, p.id
          from produccion.profiles p
         where p.notify_watch_all and p.role in ('admin','lead') and p.active
           and (p.notify_scope = 'all'
                or exists (select 1 from produccion.track_members tmx
                            where tmx.profile_id = p.id and tmx.active
                              and (tmx.track = new.track or new.track = any(tmx.lead_tracks))))
           and (v_member is null or not exists (
                select 1 from produccion.track_members tmz
                 where tmz.id = v_member and tmz.profile_id = p.id))
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

    -- (e) CLIENTE: al PUBLICAR (se envió al cliente), avisar a los perfiles cliente de
    --     ESTE cliente. Va aparte del loop porque lleva TIPO/título/URL propios (de cara
    --     al cliente, apunta al PORTAL, no al tablero interno). El cliente no es actor.
    if new.status = 'published' then
      for r in
        select p.id as profile_id, c.slug
          from produccion.profiles p
          join produccion.briefs b on b.id = new.brief_id
          join produccion.clients c on c.id = b.client_id
         where p.role = 'client' and p.active and p.client_id = b.client_id
      loop
        insert into produccion.notifications
          (recipient_id, type, entity_type, entity_id, title, url)
        values (r.profile_id, 'ready_for_review', 'idea', new.id,
                coalesce(new.naming_base, new.code, 'Una pieza') || ' está lista para tu revisión',
                '/' || r.slug || '/portal')
        returning id into v_notif;

        foreach v_ch in array produccion.active_notify_channels() loop
          insert into produccion.notification_deliveries (notification_id, channel, status, sent_at)
          values (v_notif, v_ch,
                  case when v_ch = 'in_app' then 'sent' else 'pending' end,
                  case when v_ch = 'in_app' then now() else null end);
        end loop;
      end loop;
    end if;

  exception when others then
    insert into produccion.activity_log (entity_type, entity_id, verb, payload)
    values ('idea', new.id, 'notify_failed',
            jsonb_build_object('error', sqlerrm, 'to', new.status::text));
  end;

  return new;
end $$;
