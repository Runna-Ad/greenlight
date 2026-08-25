-- ═══════════════════════════════════════════════════════════════
-- 0047 — Los cambios del CLIENTE avisan al LEAD, no al especialista
-- ═══════════════════════════════════════════════════════════════
-- Cuando el cliente pide cambios desde el portal, la tarea va a `in_corrections`
-- y el trigger `fan_out_task_notification` avisaba a QUIENES LA TRABAJAN (el
-- especialista asignado) — igual que cuando un LEAD pide cambios. Pedro: un cambio
-- del CLIENTE debe avisar al LEAD (él triagea/decide), no caer directo en el
-- especialista.
--
-- El trigger corre por CAMBIO DE ESTADO y no sabe QUIÉN causó el `in_corrections`
-- (lead vs cliente). Se distingue con una bandera de sesión que la RPC del cliente
-- prende antes de mover la tarea (igual que ya hace con `notify_body`).

-- ── 1) La RPC del cliente prende la bandera notify_to_lead ──
create or replace function produccion.rpc_client_submit_changes(
  p_idea_id uuid
) returns produccion.asset_status
language plpgsql security definer set search_path = '' as $$
declare v_status produccion.asset_status; v_n int; v_round int;
begin
  select status into v_status from produccion.ideas
   where id = p_idea_id and published_at is not null;
  if v_status is null then raise exception 'Esta idea no está disponible para revisión.'; end if;

  select count(*) into v_n from produccion.comments
   where idea_id = p_idea_id and kind = 'client_change' and ronda is null;
  if v_n = 0 then raise exception 'No hay cambios que enviar.'; end if;

  v_round := produccion.correction_next_round(p_idea_id);
  update produccion.comments
     set ronda = v_round
   where idea_id = p_idea_id and kind = 'client_change' and ronda is null;

  perform set_config('produccion.notify_body',
    'El cliente pidió ' || v_n || case when v_n = 1 then ' cambio.' else ' cambios.' end, true);
  -- El cambio lo pidió el CLIENTE → el aviso va al LEAD (lo lee el trigger).
  perform set_config('produccion.notify_to_lead', 'true', true);

  if v_status = 'published' then
    return produccion.rpc_move_task(p_idea_id, 'in_corrections', false, null, null, null);
  end if;
  return v_status;
end $$;

grant execute on function produccion.rpc_client_submit_changes(uuid)
  to anon, authenticated, service_role;

-- ── 2) El trigger enruta in_corrections según quién lo causó ──
-- Base: la versión de 0015; único cambio: in_corrections avisa a LEADS cuando
-- `notify_to_lead` está prendida (cambio del cliente), y a los ASIGNADOS cuando no
-- (cambio pedido por el lead → el especialista reworkea). completed/published
-- siguen avisando a los asignados.
create or replace function produccion.fan_out_task_notification()
returns trigger language plpgsql
security definer set search_path = '' as $$
declare
  v_member uuid := nullif(current_setting('produccion.acting_member', true), '')::uuid;
  v_body   text := nullif(current_setting('produccion.notify_body', true), '');
  -- ¿El in_corrections lo causó el CLIENTE? → avisar al lead, no al especialista.
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
        -- A LEADS → under_review (a revisión) O in_corrections causado por el CLIENTE.
        -- (a) perfiles admin/lead (excluyendo al que ya sale como miembro lead).
        select null::uuid as member_id, p.id as profile_id
          from produccion.profiles p
         where (new.status = 'under_review' or (new.status = 'in_corrections' and v_to_lead))
           and p.role in ('admin','lead') and p.active
           and not exists (
             select 1 from produccion.idea_assignments ia2
               join produccion.track_members tm2 on tm2.id = ia2.member_id
              where ia2.idea_id = new.id and ia2.es_lead and tm2.profile_id = p.id)
        union all
        -- (b) miembros lead ASIGNADOS a esta tarea.
        select tm.id, null::uuid
          from produccion.idea_assignments ia
          join produccion.track_members tm on tm.id = ia.member_id
         where (new.status = 'under_review' or (new.status = 'in_corrections' and v_to_lead))
           and ia.idea_id = new.id and ia.es_lead
           and (v_member is null or tm.id <> v_member)
        union all
        -- A QUIENES LA TRABAJAN (asignados) → cambios pedidos por el LEAD
        -- (in_corrections SIN bandera), aprobación y publicación.
        select tm.id, tm.profile_id
          from produccion.idea_assignments ia
          join produccion.track_members tm on tm.id = ia.member_id
         where ((new.status = 'in_corrections' and not v_to_lead) or new.status in ('completed','published'))
           and ia.idea_id = new.id
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
