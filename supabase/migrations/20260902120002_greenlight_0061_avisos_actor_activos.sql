-- ─────────────────────────────────────────────────────────────
-- 0061 — Avisos: el actor no se avisa a sí mismo, los dados de baja no reciben nada,
--        y la asignación pasa por una RPC que conoce al actor.
--
-- Hallazgos del reap pre-lanzamiento (2026-09-02, sweep de invariantes):
--  S1 · `asignarTarea` insertaba en idea_assignments DIRECTO por PostgREST, sin poder
--       fijar `produccion.acting_member` (eso sólo lo hacía rpc_move_task). El trigger
--       notify_on_assignment no sabía quién asignaba → un lead que se ponía a sí mismo
--       recibía "…se te asignó" in-app y por correo. Tampoco sellaba `assigned_by`.
--       → rpc_set_assignees: fija el actor, hace el DIFF (conserva assigned_at de quien
--         sigue), sella es_lead y assigned_by. La validación de QUIÉN puede ser lead /
--         especialista sigue en la app (puedeSerLead/puedeSerEspecialista), ANTES de llamar.
--  S3 · La pata (a) del fan_out (admins/leads en scope) no excluía al ACTOR — sólo la (d)
--       lo hacía. Un admin/lead que movía a "En revisión" desde el tablero se avisaba solo.
--  S4 · Las patas (b)/(c) y rpc_notificar_brief no filtraban `track_members.active`: una
--       persona dada de baja seguía recibiendo correos de trabajo vivo.
--  I6 · CREATE FUNCTION concede EXECUTE a PUBLIC por defecto. Con el USAGE del esquema
--       revocado (0056) no es explotable, pero el candado debe ser completo: se revoca
--       de PUBLIC en todas las rutinas y en las futuras (default privileges).
--
-- Sólo esquema `produccion`. Nada de auth/storage/otros esquemas (proyecto compartido).
-- ─────────────────────────────────────────────────────────────

-- ── 1) fan_out_task_notification: (a) sin actor · (b)/(c) sólo activos ─────────
-- Cuerpo IDÉNTICO al de 0059 salvo las tres cláusulas marcadas "0061".
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
                              and (tmx.track = new.track or new.track = any(tmx.tracks))))
           and not exists (
             select 1 from produccion.idea_assignments ia2
               join produccion.track_members tm2 on tm2.id = ia2.member_id
              where ia2.idea_id = new.id and ia2.es_lead and tm2.profile_id = p.id)
           -- 0061: el ACTOR no se avisa a sí mismo (antes sólo (d) lo excluía; un
           -- admin/lead que movía a revisión desde el tablero recibía su propio aviso).
           and (v_member is null or not exists (
                select 1 from produccion.track_members tmz
                 where tmz.id = v_member and tmz.profile_id = p.id))
        union all
        -- (b) miembros lead ASIGNADOS a esta tarea (siempre — es su tarea).
        select tm.id, null::uuid
          from produccion.idea_assignments ia
          join produccion.track_members tm on tm.id = ia.member_id
         where (new.status = 'under_review' or (new.status = 'in_corrections' and v_to_lead))
           and ia.idea_id = new.id and ia.es_lead
           and tm.active -- 0061: dado de baja = sin avisos
           and (v_member is null or tm.id <> v_member)
        union all
        -- (c) asignados → cambios del LEAD, aprobación y publicación (siempre — es su tarea).
        select tm.id, tm.profile_id
          from produccion.idea_assignments ia
          join produccion.track_members tm on tm.id = ia.member_id
         where ((new.status = 'in_corrections' and not v_to_lead) or new.status in ('completed','published'))
           and ia.idea_id = new.id
           and tm.active -- 0061: dado de baja = sin avisos
           and (v_member is null or tm.id <> v_member)
        union all
        -- (d) WATCHERS: notify_watch_all (admin/lead) → TODO dentro de su scope (HOME o grant).
        select null::uuid, p.id
          from produccion.profiles p
         where p.notify_watch_all and p.role in ('admin','lead') and p.active
           and (p.notify_scope = 'all'
                or exists (select 1 from produccion.track_members tmx
                            where tmx.profile_id = p.id and tmx.active
                              and (tmx.track = new.track or new.track = any(tmx.tracks))))
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

-- ── 2) rpc_notificar_brief: sólo asignados ACTIVOS ─────────────────────────────
-- Cuerpo IDÉNTICO al de 0026 salvo el join/filtro marcado "0061".
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
      join produccion.track_members tm on tm.id = ia.member_id
     where i.brief_id = p_brief_id and ia.member_id is not null
       and tm.active -- 0061: dado de baja = sin avisos
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

grant execute on function produccion.rpc_notificar_brief(uuid) to service_role;

-- ── 3) rpc_set_assignees: la asignación con ACTOR conocido ─────────────────────
-- Reemplaza el insert/delete directo de `asignarTarea`. El DIFF conserva `assigned_at`
-- de quien sigue asignado; `assigned_by` = perfil del actor; `es_lead` sellado aquí.
-- El trigger notify_on_assignment lee `produccion.acting_member` → el actor no se
-- avisa a sí mismo. La validación de rol/track es de la app (antes de llamar).
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
begin
  -- Conjunto deseado completo (lead + especialistas), sin nulos ni repetidos.
  select coalesce(array_agg(distinct m), '{}'::uuid[]) into v_deseado
    from unnest(array_remove(coalesce(p_especialista_ids, '{}'::uuid[]) || p_lead_id, null)) m;

  perform set_config('produccion.acting_member', coalesce(p_actor_member::text, ''), true);

  delete from produccion.idea_assignments
   where idea_id = p_idea_id and member_id is not null
     and not (member_id = any(v_deseado));

  insert into produccion.idea_assignments (idea_id, member_id, assigned_by)
  select p_idea_id, m, p_actor_profile from unnest(v_deseado) m
  on conflict (idea_id, member_id) do nothing;

  update produccion.idea_assignments
     set es_lead = (p_lead_id is not null and member_id = p_lead_id)
   where idea_id = p_idea_id;

  perform set_config('produccion.acting_member', '', true);
end $$;

revoke all on function produccion.rpc_set_assignees(uuid, uuid, uuid[], uuid, uuid) from public;
grant execute on function produccion.rpc_set_assignees(uuid, uuid, uuid[], uuid, uuid) to service_role;

-- ── 4) Candado completo: ninguna rutina ejecutable por PUBLIC ──────────────────
-- La app llama TODO como service_role; los helpers internos (auth_role, is_lead,
-- transition_allowed…) nunca tuvieron grant explícito — vivían del EXECUTE implícito a
-- PUBLIC. Al quitarlo, service_role lo recibe explícito (hoy y para rutinas futuras).
revoke execute on all routines in schema produccion from public;
grant execute on all routines in schema produccion to service_role;
alter default privileges in schema produccion revoke execute on routines from public;
alter default privileges in schema produccion grant execute on routines to service_role;
