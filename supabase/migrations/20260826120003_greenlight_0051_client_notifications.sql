-- ═══════════════════════════════════════════════════════════════
-- 0051 — Notificaciones al CLIENTE + minors de integridad
-- ═══════════════════════════════════════════════════════════════
-- Hasta ahora el cliente NO recibía NADA cuando le mandaban una pieza a revisar
-- (el 'published' avisaba a los asignados, no al cliente). Esto añade el evento
-- `ready_for_review`: cuando una tarea se PUBLICA (se envía al cliente), se avisa a
-- los perfiles cliente de ESE cliente, con título de cara al cliente y URL del PORTAL
-- (no del tablero interno). La tabla notification_prefs ya es genérica → el cliente
-- entra sin rework. Además, tres minors de integridad del reap (M2/M3 + CHECK snippets).
-- Todo en `produccion` (check-isolation lo exige).

-- ── 1) fan_out + pata CLIENTE (ready_for_review al publicar) ────────────────────
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
        select null::uuid as member_id, p.id as profile_id
          from produccion.profiles p
         where (new.status = 'under_review' or (new.status = 'in_corrections' and v_to_lead))
           and p.role in ('admin','lead') and p.active
           and (p.notify_scope = 'all'
                or exists (select 1 from produccion.track_members tmx
                            where tmx.profile_id = p.id and tmx.track = new.track and tmx.active))
           and not exists (
             select 1 from produccion.idea_assignments ia2
               join produccion.track_members tm2 on tm2.id = ia2.member_id
              where ia2.idea_id = new.id and ia2.es_lead and tm2.profile_id = p.id)
        union all
        select tm.id, null::uuid
          from produccion.idea_assignments ia
          join produccion.track_members tm on tm.id = ia.member_id
         where (new.status = 'under_review' or (new.status = 'in_corrections' and v_to_lead))
           and ia.idea_id = new.id and ia.es_lead
           and (v_member is null or tm.id <> v_member)
        union all
        select tm.id, tm.profile_id
          from produccion.idea_assignments ia
          join produccion.track_members tm on tm.id = ia.member_id
         where ((new.status = 'in_corrections' and not v_to_lead) or new.status in ('completed','published'))
           and ia.idea_id = new.id
           and (v_member is null or tm.id <> v_member)
        union all
        select null::uuid, p.id
          from produccion.profiles p
         where p.notify_watch_all and p.role in ('admin','lead') and p.active
           and (p.notify_scope = 'all'
                or exists (select 1 from produccion.track_members tmx
                            where tmx.profile_id = p.id and tmx.track = new.track and tmx.active))
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

-- ── 2) Prefs del cliente: sembrar ready_for_review (existentes + nuevos) ────────
insert into produccion.notification_prefs (profile_id, event_type, email)
select p.id, 'ready_for_review', true
  from produccion.profiles p where p.role = 'client'
 on conflict (profile_id, event_type) do nothing;

-- El trigger seed (0050) sólo sembraba roles internos; ahora también el cliente.
create or replace function produccion.seed_notification_defaults()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update produccion.profiles set notify_scope =
    case when new.role in ('admin','master') then 'all'
         when new.role = 'lead' then 'my_track'
         else 'only_mine' end
   where id = new.id;

  if new.role = 'client' then
    insert into produccion.notification_prefs (profile_id, event_type, email)
    values (new.id, 'ready_for_review', true)
    on conflict (profile_id, event_type) do nothing;
  elsif new.role in ('admin','master','lead','creative') then
    insert into produccion.notification_prefs (profile_id, event_type, email)
    select new.id, ev.event_type,
      case
        when new.role = 'lead' and ev.event_type in
          ('task_submitted','task_changes_requested','task_approved','task_published','brief_created') then true
        when new.role = 'creative' and ev.event_type in ('task_assigned','task_changes_requested') then true
        else false
      end
    from (values
      ('task_assigned'), ('task_submitted'), ('task_changes_requested'),
      ('task_approved'), ('task_published'), ('brief_created')
    ) as ev(event_type)
    on conflict (profile_id, event_type) do nothing;
  end if;
  return new;
end $$;

-- ── 3) M3 — limpiar field_edits huérfanos al borrar un plano/estático/copy ──────
-- field_edits es polimórfico (tabla + fila_id, sin FK), como comments; al borrar la
-- fila dueña quedaban huérfanos (append-only, no bloquea rondas, pero pierde autoría).
-- Espeja los triggers before_delete de correcciones (0039/0046). + CHECK del dominio.
alter table produccion.field_edits drop constraint if exists field_edits_tabla_ck;
alter table produccion.field_edits add constraint field_edits_tabla_ck
  check (tabla in ('planos', 'estaticos', 'copies'));

create or replace function produccion.limpiar_field_edits_huerfanos()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from produccion.field_edits where tabla = tg_argv[0] and fila_id = old.id;
  return old;
end $$;

drop trigger if exists before_delete_plano_field_edits on produccion.planos;
create trigger before_delete_plano_field_edits before delete on produccion.planos
  for each row execute function produccion.limpiar_field_edits_huerfanos('planos');
drop trigger if exists before_delete_estatico_field_edits on produccion.estaticos;
create trigger before_delete_estatico_field_edits before delete on produccion.estaticos
  for each row execute function produccion.limpiar_field_edits_huerfanos('estaticos');
drop trigger if exists before_delete_copy_field_edits on produccion.copies;
create trigger before_delete_copy_field_edits before delete on produccion.copies
  for each row execute function produccion.limpiar_field_edits_huerfanos('copies');

-- ── 4) M2 — política de LECTURA para notification_deliveries (era deny-all) ──────
-- Tenía RLS on y CERO policies → deny-all bajo anon/authenticated. La app la lee por
-- service_role, pero una lectura propia (el día del anon-read) debe poder ver SUS
-- entregas. El dispatcher escribe por service_role (se salta RLS), así que sólo SELECT.
drop policy if exists notif_deliveries_own on produccion.notification_deliveries;
create policy notif_deliveries_own on produccion.notification_deliveries for select using (
  exists (select 1 from produccion.notifications n
           where n.id = notification_id
             and (n.recipient_id = produccion.current_profile_id()
                  or n.recipient_member_id in (
                      select id from produccion.track_members where profile_id = produccion.current_profile_id())))
);
grant select on produccion.notification_deliveries to authenticated;

-- NOTA: el CHECK de scope en `snippets` (backlog 5) se DEJA FUERA — aunque los datos de
-- prod hoy son todos scope='marca' consistentes, las pruebas (y por ende algún camino de
-- creación de snippets de la app) insertan filas que NO cumplen el invariante 3-vías. Un
-- CHECK ciego rompería esos inserts. La fuga del legal ya está cerrada por el código
-- (legales-actions guarda client_id=NULL) + los CHECK de 0049 en hue_*. Añadir el CHECK de
-- snippets requiere primero normalizar TODOS los caminos de creación — follow-up aparte.
