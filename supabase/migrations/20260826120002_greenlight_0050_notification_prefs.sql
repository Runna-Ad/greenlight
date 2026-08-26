-- ═══════════════════════════════════════════════════════════════
-- 0050 — Preferencias de notificación por persona (evento × canal + scope)
-- ═══════════════════════════════════════════════════════════════
-- Antes: los destinatarios estaban HARDCODEADOS por rol en el trigger, y la única
-- preferencia era `notify_email` (binario, todo-o-nada). Consecuencias: un LEAD
-- recibía TODA la actividad de TODOS los tracks (firehose, sin poder acotar a su
-- marca), y no existía un aviso de "se te asignó una tarea".
--
-- Ahora, cada persona decide QUÉ le llega por EMAIL (por tipo de evento) y con qué
-- SCOPE (todo / su track / sólo lo suyo). El in-app (campana) sigue siendo AMPLIO:
-- llega todo lo que le corresponde DENTRO de su scope (feed de actividad barato); el
-- email es el canal CURADO. Defaults sensatos por rol → funciona sin tocar nada, y
-- se afina desde Mi perfil. Todo en `produccion` (check-isolation lo exige).

-- ── 1) Ejes por persona: scope + "ver todo" (opt-in del firehose) ──────────────
alter table produccion.profiles
  add column if not exists notify_scope text not null default 'my_track'
    check (notify_scope in ('all','my_track','only_mine')),
  add column if not exists notify_watch_all boolean not null default false;

-- Defaults por rol para las cuentas que YA existen (going-forward lo pone el provision):
--   admin/master → 'all' (ven todo; el email por-evento sigue en off por defecto);
--   lead → 'my_track' (acota el firehose a su marca); creative/client → 'only_mine'.
update produccion.profiles set notify_scope = 'all'       where role in ('admin','master');
update produccion.profiles set notify_scope = 'my_track'  where role = 'lead';
update produccion.profiles set notify_scope = 'only_mine' where role not in ('admin','master','lead');

-- ── 2) Matriz evento × email/slack por persona ─────────────────────────────────
-- Una fila por (persona, tipo de evento). `email`/`slack` = ¿quiere ESE canal para
-- ESE evento? El in-app no se modela aquí (siempre llega lo que está en scope).
create table if not exists produccion.notification_prefs (
  profile_id uuid not null references produccion.profiles(id) on delete cascade,
  event_type text not null,
  email      boolean not null default false,
  slack      boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (profile_id, event_type)
);

alter table produccion.notification_prefs enable row level security;
-- Cada quien ve/gestiona LO SUYO; admin/master ven todo (para el panel de equipo).
-- La app escribe por service_role (se salta RLS); esto es para el día del anon-read.
create policy notification_prefs_self on produccion.notification_prefs
  for all using (profile_id = produccion.current_profile_id() or produccion.auth_role() in ('admin','master'))
  with check (profile_id = produccion.current_profile_id() or produccion.auth_role() in ('admin','master'));
grant select, insert, update, delete on produccion.notification_prefs to authenticated;

-- Semilla de defaults por rol para las cuentas existentes. Catálogo de eventos y su
-- default de EMAIL por rol (in-app siempre; esto es sólo el email):
--   admin  : todo OFF (opta por evento; la campana ya le muestra todo)
--   lead   : submitted/changes/approved/published/brief ON
--   creative: task_assigned + task_changes_requested ON
insert into produccion.notification_prefs (profile_id, event_type, email)
select p.id, ev.event_type,
       case
         when p.role = 'lead' and ev.event_type in
           ('task_submitted','task_changes_requested','task_approved','task_published','brief_created') then true
         when p.role not in ('admin','master','lead') and ev.event_type in
           ('task_assigned','task_changes_requested') then true
         else false
       end
  from produccion.profiles p
  cross join (values
    ('task_assigned'), ('task_submitted'), ('task_changes_requested'),
    ('task_approved'), ('task_published'), ('brief_created')
  ) as ev(event_type)
 where p.role in ('admin','master','lead','creative')  -- clientes: Fase 3 (sus eventos aún no existen)
 on conflict (profile_id, event_type) do nothing;

-- ── 3) NUEVO evento: "se te asignó una tarea" (task_assigned) ───────────────────
-- Trigger AFTER INSERT en idea_assignments. setAssignees hace DIFF (sólo inserta las
-- asignaciones NUEVAS, conserva assigned_at), así el trigger dispara exactamente una
-- vez por asignación nueva — sin re-avisos espurios. No se auto-avisa al que asignó.
create or replace function produccion.notify_on_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_actor  uuid := nullif(current_setting('produccion.acting_member', true), '')::uuid;
  v_titulo text;
  v_url    text;
  v_notif  uuid;
  v_ch     produccion.notify_channel;
  v_profile uuid;
begin
  if new.member_id is null then return new; end if;             -- vía antigua (sin member): se ignora
  if v_actor is not null and v_actor = new.member_id then return new; end if;  -- auto-asignación

  begin
    select tm.profile_id into v_profile
      from produccion.track_members tm where tm.id = new.member_id and tm.active;
    if v_profile is null then return new; end if;               -- miembro sin cuenta aún

    select coalesce(i.naming_base, i.code, 'Una tarea') || ' se te asignó',
           '/' || c.slug || '/tareas/' || i.id
      into v_titulo, v_url
      from produccion.ideas i
      join produccion.briefs b on b.id = i.brief_id
      join produccion.clients c on c.id = b.client_id
     where i.id = new.idea_id;

    insert into produccion.notifications
      (recipient_id, recipient_member_id, type, entity_type, entity_id, title, url)
    values (v_profile, new.member_id, 'task_assigned', 'idea', new.idea_id, v_titulo, v_url)
    returning id into v_notif;

    foreach v_ch in array produccion.active_notify_channels() loop
      insert into produccion.notification_deliveries (notification_id, channel, status, sent_at)
      values (v_notif, v_ch,
              case when v_ch = 'in_app' then 'sent' else 'pending' end,
              case when v_ch = 'in_app' then now() else null end);
    end loop;
  exception when others then
    insert into produccion.activity_log (entity_type, entity_id, verb, payload)
    values ('idea', new.idea_id, 'notify_failed',
            jsonb_build_object('error', sqlerrm, 'evento', 'task_assigned'));
  end;

  return new;
end $$;

drop trigger if exists trg_notify_on_assignment on produccion.idea_assignments;
create trigger trg_notify_on_assignment
  after insert on produccion.idea_assignments
  for each row execute function produccion.notify_on_assignment();

-- ── 4) fan_out SCOPE-AWARE + leg "watch_all" (opt-in del firehose) ─────────────
-- Cambios vs 0047: (a) la pata de LEADS/admins ahora respeta notify_scope (un lead
-- 'my_track' sólo recibe eventos de SU track); (d) NUEVA pata: quien prendió
-- notify_watch_all recibe TODOS los eventos dentro de su scope (el admin que quiere
-- "cada movimiento"). El resto igual. El email lo cura la capa de envío por evento;
-- el in-app llega a todos los elegibles-en-scope (campana amplia).
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
        --     'all' → siempre; 'my_track' → sólo si tienen un track_member en el track de la tarea.
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
        -- (d) WATCHERS: quien prendió notify_watch_all (admin/lead) recibe TODOS los
        --     eventos dentro de su scope. Es el opt-in del "avísame de cada movimiento".
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

  exception when others then
    insert into produccion.activity_log (entity_type, entity_id, verb, payload)
    values ('idea', new.id, 'notify_failed',
            jsonb_build_object('error', sqlerrm, 'to', new.status::text));
  end;

  return new;
end $$;

-- ── 5) Semilla de defaults al CREAR una cuenta (una vez, sin clobber en re-login) ──
-- El seed de la sección 1/2 cubre las cuentas EXISTENTES; esto cubre las FUTURAS. Se
-- dispara SÓLO en INSERT (no en el upsert de re-login), así nunca pisa lo que la
-- persona haya personalizado después. Espeja los mismos defaults por rol.
create or replace function produccion.seed_notification_defaults()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update produccion.profiles set notify_scope =
    case when new.role in ('admin','master') then 'all'
         when new.role = 'lead' then 'my_track'
         else 'only_mine' end
   where id = new.id;

  if new.role in ('admin','master','lead','creative') then
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

drop trigger if exists trg_seed_notification_defaults on produccion.profiles;
create trigger trg_seed_notification_defaults
  after insert on produccion.profiles
  for each row execute function produccion.seed_notification_defaults();
