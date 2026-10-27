-- ─────────────────────────────────────────────────────────────
-- 0083 — Respuestas con el CLIENTE + avisos de respuesta.
--
-- Pedro (2026-10-27): el destino de una respuesta se decide SOLO, por etapa:
--   · Cambio del cliente aún en la cancha del lead → el lead le contesta AL CLIENTE, y el
--     cliente puede contestar (le llega al lead).
--   · El lead se lo pasó a un especialista → especialista ↔ lead, interno.
--   · Si lo último del hilo lo escribió el cliente, la respuesta del lead va al cliente.
-- La regla vive en la app (src/lib/correcciones.ts · destinoRespuesta) y aquí sólo se
-- GUARDA y se VALIDA: nada interno puede marcarse para el cliente fuera de un cambio suyo.
--
-- Marcas por respuesta (0082 = todo interno):
--   de_cliente   → la escribió el cliente (desde su portal).
--   para_cliente → la escribió el equipo PARA el cliente.
-- El portal SÓLO carga respuestas con una de las dos. Las demás siguen siendo internas.
--
-- Avisos (bell + email; el email se apaga en Mi perfil con 'change_reply' /
-- 'change_reply_client'). `recipient_member_id` va en null a propósito: así la
-- preferencia por-evento MANDA (con member lleno, el email de "tu tarea" es forzoso).
-- Sólo esquema `produccion`. Aditivo.
-- ─────────────────────────────────────────────────────────────

alter table produccion.correccion_respuestas
  add column if not exists de_cliente   boolean not null default false,
  add column if not exists para_cliente boolean not null default false;

alter table produccion.correccion_respuestas
  drop constraint if exists correccion_respuestas_un_sentido;
alter table produccion.correccion_respuestas
  add constraint correccion_respuestas_un_sentido check (not (de_cliente and para_cliente));

comment on column produccion.correccion_respuestas.de_cliente is
  'La escribió el cliente desde su portal (0083). Visible para el cliente.';
comment on column produccion.correccion_respuestas.para_cliente is
  'La escribió el equipo para el cliente (0083). Visible para el cliente.';

-- ── Guardar una respuesta + avisar a quien le toca ─────────────────────────────
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
  v_id       uuid;
  v_naming   text;
  v_slug     text;
  v_client   uuid;
  v_actor    text;
  v_snippet  text;
  v_type     text;
  v_title    text;
  v_url      text;
  v_portal   text;
  v_notif    uuid;
  v_ch       produccion.notify_channel;
  r          record;
begin
  if coalesce(p_de_cliente, false) and coalesce(p_para_cliente, false) then
    raise exception 'Una respuesta no puede ser del cliente y para el cliente.';
  end if;

  -- FOR UPDATE: bloquea el cambio mientras se cuenta y se inserta, así el tope de 100 no
  -- se rebasa con envíos simultáneos.
  select c.kind::text, c.ronda, c.author_member_id into v_kind, v_ronda, v_autor_m
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
  -- Al cliente sólo le llega algo de una pieza que VE en su portal (no en la papelera, ya
  -- enviada, en un estado de portal). Mismo criterio que ESTADOS_PORTAL (portal-bucket.ts).
  if p_para_cliente and not exists (
    select 1 from produccion.ideas i
     where i.id = p_idea_id and i.deleted_at is null and i.published_at is not null
       and i.status::text in ('published', 'in_corrections', 'delivered')
  ) then
    raise exception 'Esta pieza ya no está en el portal del cliente.';
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
    -- El link del portal lleva marca + brief + tarea (como los del panel del portal): con
    -- sólo ?tarea= un cliente con varias marcas caía de vuelta al inicio.
    select coalesce(i.naming_base, i.code, 'una tarea'), cl.slug, cl.id,
           '/' || cl.slug || '/portal?marca=' || coalesce(i.marca_id::text, '__none__')
             || '&brief=' || i.brief_id || '&tarea=' || i.id
      into v_naming, v_slug, v_client, v_portal
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
        foreach v_ch in array produccion.active_notify_channels() loop
          insert into produccion.notification_deliveries (notification_id, channel, status, sent_at)
          values (v_notif, v_ch, case when v_ch = 'in_app' then 'sent' else 'pending' end,
                  case when v_ch = 'in_app' then now() else null end);
        end loop;
      end loop;
    end if;
  exception when others then
    insert into produccion.activity_log (entity_type, entity_id, verb, payload)
    values ('idea', p_idea_id, 'notify_failed', jsonb_build_object('error', sqlerrm, 'respuesta', v_id));
  end;

  return v_id;
end $$;

revoke all on function produccion.rpc_responder_cambio(uuid, uuid, text, boolean, boolean, uuid, uuid) from public;
grant execute on function produccion.rpc_responder_cambio(uuid, uuid, text, boolean, boolean, uuid, uuid) to service_role;

-- Prefs del cliente: el aviso de respuesta emailea por default (como ready_for_review).
insert into produccion.notification_prefs (profile_id, event_type, email)
select p.id, 'change_reply_client', true
  from produccion.profiles p where p.role = 'client'
on conflict do nothing;
