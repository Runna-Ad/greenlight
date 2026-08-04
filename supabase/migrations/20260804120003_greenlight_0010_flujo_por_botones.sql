-- Greenlight — flujo dirigido por botones + notificaciones (0010)
--
-- El trabajo empuja la tarjeta: el asignado pulsa "Empezar", "Mandar a
-- revisión"; el lead "Aprobar" o "Mandar cambios". El arrastre se queda como
-- escotilla del lead.
--
-- Todo pasa por rpc_move_task (0009), que sigue siendo la ÚNICA puerta del
-- estado. Los verbos de abajo no mueven nada por su cuenta — delegan. Si cada
-- uno hiciera su propio `update ideas set status`, habría dos puertas y el
-- registro de override dejaría de significar algo.

-- ─────────────────────────────────────────────────────────────
-- 1. Destinatarios que todavía no tienen cuenta
-- ─────────────────────────────────────────────────────────────
-- `notifications.recipient_id` referencia `profiles`, pero a quien hay que
-- avisar son los `track_members` — y ninguno tiene cuenta. Mismo patrón que ya
-- se usó en la 0008 (idea_assignments.member_id) y la 0009 (status_events.idea_id):
-- una columna paralela, no perfiles inventados.
alter table produccion.notifications alter column recipient_id drop not null;
alter table produccion.notifications
  add column recipient_member_id uuid references produccion.track_members(id) on delete cascade;
alter table produccion.notifications
  add constraint notifications_has_recipient
  check (recipient_id is not null or recipient_member_id is not null);

create index notifications_member_unread_idx
  on produccion.notifications(recipient_member_id) where read_at is null;

-- El fan-out escribe LAS DOS columnas: member_id siempre, y profile_id cuando
-- ya existe. Así, el día que se encienda el login, las notificaciones nuevas ya
-- llegan atadas al perfil sin migrar nada.
comment on column produccion.notifications.recipient_member_id is
  'Destinatario del pool del sheet. Se llena siempre; recipient_id se llena además cuando esa persona ya tiene cuenta.';

-- Mismo problema, mismas tablas hermanas.
alter table produccion.comments
  add column author_member_id uuid references produccion.track_members(id) on delete set null;
alter table produccion.status_events
  add column actor_member_id uuid references produccion.track_members(id) on delete set null;

-- RLS: además del perfil, dejar leer por el vínculo member→profile.
drop policy if exists notif_own on produccion.notifications;
create policy notif_own on produccion.notifications for select using (
  recipient_id = produccion.current_profile_id()
  or recipient_member_id in (
       select id from produccion.track_members where profile_id = produccion.current_profile_id())
);
drop policy if exists notif_own_update on produccion.notifications;
create policy notif_own_update on produccion.notifications for update using (
  recipient_id = produccion.current_profile_id()
  or recipient_member_id in (
       select id from produccion.track_members where profile_id = produccion.current_profile_id())
);

-- ─────────────────────────────────────────────────────────────
-- 2. Canales activos — el punto donde se enchufan correo y Slack
-- ─────────────────────────────────────────────────────────────
-- Hoy sólo la app. Añadir correo y Slack después = `create or replace` de esta
-- función devolviendo los 3 canales (entrarán como 'pending') + un despachador
-- que lea notification_deliveries. Sin tocar el trigger, ni las RPC, ni la app.
create or replace function produccion.active_notify_channels()
returns produccion.notify_channel[] language sql immutable as $$
  select array['in_app']::produccion.notify_channel[];
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. rpc_move_task acepta quién la movió (del pool, no un perfil)
-- ─────────────────────────────────────────────────────────────
-- ⚠️ Hay que BORRAR la firma vieja de 5 argumentos antes de crear la de 6.
-- Un parámetro nuevo con DEFAULT crea una SOBRECARGA, y PostgREST resuelve por
-- nombre de argumento: con dos candidatas devuelve PGRST203 "Could not choose
-- the best candidate function" y el tablero deja de mover tarjetas en
-- producción. src/app/(app)/[cliente]/tablero/actions.ts se actualiza en el
-- mismo commit.
drop function if exists produccion.rpc_move_task(
  uuid, produccion.asset_status, boolean, uuid, text);

create or replace function produccion.rpc_move_task(
  p_idea_id      uuid,
  p_to           produccion.asset_status,
  p_as_lead      boolean default false,
  p_actor        uuid    default null,
  p_reason       text    default null,
  p_actor_member uuid    default null
) returns produccion.asset_status
language plpgsql security definer set search_path = '' as $$
declare
  v_from     produccion.asset_status;
  v_req_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  v_actor_role produccion.app_role;
  v_may_override boolean;
begin
  select status into v_from from produccion.ideas where id = p_idea_id;
  if v_from is null then
    raise exception 'La tarea no existe.';
  end if;
  if v_from = p_to then
    return v_from;
  end if;

  select role into v_actor_role from produccion.profiles where id = p_actor;

  v_may_override :=
       v_req_role = 'service_role'
    or produccion.is_lead()
    or v_actor_role in ('admin', 'lead');

  if not produccion.transition_allowed(v_from, p_to) then
    if not (p_as_lead and v_may_override) then
      raise exception 'Transición no permitida: % → %', v_from, p_to;
    end if;
    perform set_config('produccion.lead_override', 'on', true);
    perform set_config('produccion.override_reason',
                       coalesce(p_reason, 'Movimiento de lead fuera del flujo'), true);
  end if;

  perform set_config('produccion.acting_profile', coalesce(p_actor::text, ''), true);
  perform set_config('produccion.acting_member',  coalesce(p_actor_member::text, ''), true);
  update produccion.ideas set status = p_to where id = p_idea_id;

  -- No dejar nada encendido para el resto de la transacción.
  perform set_config('produccion.lead_override', '', true);
  perform set_config('produccion.override_reason', '', true);
  perform set_config('produccion.notify_body', '', true);

  return p_to;
end $$;

comment on function produccion.rpc_move_task is
  'Única puerta para cambiar el estado de una TAREA. El override de lead exige derecho y siempre queda registrado en status_events.';

grant execute on function produccion.rpc_move_task(
  uuid, produccion.asset_status, boolean, uuid, text, uuid) to anon, authenticated, service_role;

-- El registro de historial ahora también guarda a la persona del pool.
create or replace function produccion.log_idea_status()
returns trigger language plpgsql
security definer set search_path = '' as $$
declare
  v_override boolean := coalesce(current_setting('produccion.lead_override', true), '') = 'on';
  v_actor    uuid;
  v_member   uuid;
begin
  if new.status is distinct from old.status then
    begin
      v_actor := nullif(current_setting('produccion.acting_profile', true), '')::uuid;
    exception when others then v_actor := null;
    end;
    begin
      v_member := nullif(current_setting('produccion.acting_member', true), '')::uuid;
    exception when others then v_member := null;
    end;

    insert into produccion.status_events
      (idea_id, from_status, to_status, actor_id, actor_member_id, reason, override)
    values (
      new.id, old.status, new.status,
      coalesce(v_actor, produccion.current_profile_id()),
      v_member,
      nullif(current_setting('produccion.override_reason', true), ''),
      v_override and not produccion.transition_allowed(old.status, new.status)
    );
  end if;
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 4. Las notificaciones las genera un TRIGGER, no cada verbo
-- ─────────────────────────────────────────────────────────────
-- Razón concreta: arrastrar una tarjeta llama a rpc_move_task directo, sin
-- pasar por ningún verbo. Si las notificaciones vivieran en los verbos,
-- arrastrar registraría en status_events pero no avisaría a nadie — el mismo
-- split-brain que la 0009 evitó para el historial. Un trigger cubre las dos
-- rutas y no se puede evadir.
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
      else null end;
    if v_type is null then return new; end if;

    v_titulo := case new.status
      when 'under_review'   then coalesce(new.naming_base, new.code, 'Una tarea') || ' está lista para revisar'
      when 'in_corrections' then 'Cambios pedidos en ' || coalesce(new.naming_base, new.code, 'una tarea')
      else                       coalesce(new.naming_base, new.code, 'Una tarea') || ' fue aprobada'
    end;

    select '/' || c.slug || '/tablero' into v_url
      from produccion.briefs b join produccion.clients c on c.id = b.client_id
     where b.id = new.brief_id;

    for r in
      -- A revisión → los leads. Hoy no hay ninguno marcado, así que caen los
      -- perfiles admin/lead (o sea Pedro). Cuando existan leads de verdad se
      -- dan de alta como datos y este mismo query los recoge.
      select null::uuid as member_id, p.id as profile_id
        from produccion.profiles p
       where new.status = 'under_review' and p.role in ('admin','lead') and p.active
      union all
      -- Cambios o aprobación → quienes la trabajan.
      select tm.id, tm.profile_id
        from produccion.idea_assignments ia
        join produccion.track_members tm on tm.id = ia.member_id
       where new.status in ('in_corrections','completed')
         and ia.idea_id = new.id
         -- nunca notificarse a uno mismo
         and (v_member is null or tm.id <> v_member)
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

create trigger ideas_notify_au after update of status on produccion.ideas
  for each row execute function produccion.fan_out_task_notification();

-- ─────────────────────────────────────────────────────────────
-- 5. Los cuatro verbos del flujo
-- ─────────────────────────────────────────────────────────────
create or replace function produccion.rpc_task_start(
  p_idea_id uuid, p_actor_member uuid default null
) returns produccion.asset_status
language sql security definer set search_path = '' as $$
  select produccion.rpc_move_task(p_idea_id, 'in_progress', false, null, null, p_actor_member);
$$;

create or replace function produccion.rpc_task_submit_review(
  p_idea_id uuid, p_actor_member uuid default null, p_note text default null
) returns produccion.asset_status
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('produccion.notify_body', coalesce(p_note, ''), true);
  return produccion.rpc_move_task(p_idea_id, 'under_review', false, null, null, p_actor_member);
end $$;

create or replace function produccion.rpc_task_request_changes(
  p_idea_id uuid, p_body text, p_actor_member uuid default null, p_actor uuid default null
) returns produccion.asset_status
language plpgsql security definer set search_path = '' as $$
begin
  -- Pedir cambios sin decir cuáles no sirve de nada.
  if coalesce(btrim(p_body), '') = '' then
    raise exception 'Escribe qué hay que corregir.';
  end if;

  insert into produccion.comments (idea_id, author_id, author_member_id, body, kind)
  values (p_idea_id, p_actor, p_actor_member, p_body, 'correction_request');

  perform set_config('produccion.notify_body', p_body, true);
  return produccion.rpc_move_task(p_idea_id, 'in_corrections', false, null, null, p_actor_member);
end $$;

create or replace function produccion.rpc_task_approve(
  p_idea_id uuid, p_actor_member uuid default null, p_actor uuid default null, p_note text default null
) returns produccion.asset_status
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(btrim(p_note), '') <> '' then
    insert into produccion.comments (idea_id, author_id, author_member_id, body, kind)
    values (p_idea_id, p_actor, p_actor_member, p_note, 'approval');
  end if;
  perform set_config('produccion.notify_body', coalesce(p_note, ''), true);
  return produccion.rpc_move_task(p_idea_id, 'completed', false, null, null, p_actor_member);
end $$;

grant execute on function produccion.rpc_task_start(uuid, uuid) to anon, authenticated, service_role;
grant execute on function produccion.rpc_task_submit_review(uuid, uuid, text) to anon, authenticated, service_role;
grant execute on function produccion.rpc_task_request_changes(uuid, text, uuid, uuid) to anon, authenticated, service_role;
grant execute on function produccion.rpc_task_approve(uuid, uuid, uuid, text) to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 6. Las dos RPC huérfanas: avisar, no borrar
-- ─────────────────────────────────────────────────────────────
-- Operan sobre assets.status, que desde la 0007 ya no es el flujo de la tarea.
-- No las llama nadie. Borrarlas es destructivo sin ganancia y asset_versions
-- sigue siendo el modelo correcto para subir archivos (P4) — sólo hay que
-- dejar escrito que no son la vía para el estado de la tarea.
comment on function produccion.rpc_submit_version is
  'SÓLO archivos (asset_versions). El estado de la TAREA vive en ideas.status — usa rpc_task_submit_review.';
comment on function produccion.rpc_request_correction is
  'OBSOLETA para el flujo: mueve assets.status, no ideas.status. Usa rpc_task_request_changes.';

-- ─────────────────────────────────────────────────────────────
-- 7. La matriz de obligatorios, espejada en SQL
-- ─────────────────────────────────────────────────────────────
-- Espejo de src/lib/required.ts, atado con contract test en test-db.mjs (mismo
-- patrón que buildFilename y canMove). Todavía no bloquea nada por sí sola: la
-- puerta de hoy está en import.ts. Esto fija el contrato y prepara el trigger
-- diferido de una migración futura.
create or replace function produccion.tipo_group(p_tipo text)
returns text language sql immutable as $$
  select case btrim(coalesce(p_tipo, ''))
    when 'Copies' then 'copies'
    when 'Images' then 'images'
    else 'video'   -- desconocido → el grupo más exigente
  end;
$$;

create or replace function produccion.missing_required(p_row jsonb)
returns text[] language sql immutable as $$
  select coalesce(array_agg(campo order by orden), '{}')
  from (
    select campo, orden from (
      values
        ('Asignación',1),('Marca',2),('# Entrega',3),
        ('Tipo de Asset',4),('Concepto',5),('Plataforma',6),
        ('Naming',7),('# Idea',8),('Tamaño',9),('Duración',10)
    ) as t(campo, orden)
    where
      case
        when orden <= 6 then true
        when produccion.tipo_group(p_row->>'Tipo de Asset') = 'copies' then false
        when produccion.tipo_group(p_row->>'Tipo de Asset') = 'images' then campo <> 'Duración'
        else true
      end
      -- "-" es como el sheet escribe "no aplica"
      and coalesce(btrim(p_row->>campo), '') in ('', '-')
  ) faltantes;
$$;

comment on function produccion.missing_required is
  'Espejo SQL de missingRequired() en src/lib/required.ts. Atado con contract test.';

-- ─────────────────────────────────────────────────────────────
-- 8. board_tasks expone member_ids para /mi-trabajo
-- ─────────────────────────────────────────────────────────────
-- `create or replace view` sólo admite AÑADIR columnas al final — no reordenar.
-- Se hace así a propósito para conservar los grants: un `drop view` los pierde
-- y deja el tablero en 500 (el fallo que arregló la 0006).
create or replace view produccion.board_tasks as
select
  i.id, i.brief_id, i.code, i.status, i.track, i.naming_base, i.concepto,
  i.tipo_asset, i.formato_code, i.duracion, i.tamanos, i.plataformas,
  i.marca_id, m.name as marca, i.pod_id, i.created_at,
  b.client_id, b.title as brief_title, b.source_tab as brief_tab,
  coalesce(f.n, 0) as file_count,
  coalesce(a.members, '[]'::jsonb) as members,
  coalesce(a.member_ids, '{}'::uuid[]) as member_ids
from produccion.ideas i
join produccion.briefs b on b.id = i.brief_id
left join produccion.marcas m on m.id = i.marca_id
left join lateral (
  select count(*)::int as n from produccion.assets x where x.idea_id = i.id
) f on true
left join lateral (
  select jsonb_agg(
           jsonb_build_object('id', tm.id, 'name', tm.name, 'color', tm.color)
           order by tm.sort_order
         ) as members,
         array_agg(tm.id) as member_ids
    from produccion.idea_assignments ia
    join produccion.track_members tm on tm.id = ia.member_id
   where ia.idea_id = i.id
) a on true;

grant select on produccion.board_tasks to anon, authenticated, service_role;
