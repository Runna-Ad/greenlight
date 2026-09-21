-- ─────────────────────────────────────────────────────────────
-- 0076 — Disciplina: Lead Creativo / Lead Diseño / Diseñador + paso de REVISIÓN DE DISEÑO
--
-- Pedro (2026-09-18): dos tipos de lead — "Lead Creativo" (el lead de siempre) y "Lead
-- Diseño" — y el rol "Diseñador". Diseño trabaja para ambos equipos: por defecto GLOBAL
-- (sin track), con la opción de acotarlo a uno.
--
-- MODELO: NO son roles nuevos del enum app_role (eso obligaría a enseñarle a cada gate un
-- 5º/6º nivel — ya pasó con specialist_lead y se fusionó de vuelta). El NIVEL sigue siendo
-- lead / creative; lo nuevo es la DISCIPLINA de la persona:
--   lead     + creativo → Lead Creativo      creative + creativo → Especialista
--   lead     + diseno   → Lead Diseño        creative + diseno   → Diseñador
--
-- FLUJO: si una tarea tiene un DISEÑADOR asignado (especialista con disciplina diseno),
-- "Mandar a revisión" va primero al Lead Diseño. Él "Aprueba diseño" (o pide cambios) y la
-- tarea pasa al Lead Creativo de ESA tarea (su es_lead), que aprueba y envía al cliente como
-- siempre. El Lead Creativo PUEDE aprobar sin esperar al diseño (Pedro: override) — queda
-- registrado en activity_log ('diseno_saltado'). Cada nueva entrada a revisión reinicia la
-- aprobación de diseño (una corrección vuelve a pasar por diseño).
--
-- No es un estado nuevo del enum asset_status: la tarea sigue `under_review`; la aprobación
-- de diseño es una marca (diseno_aprobado_at) — así transition_allowed, el trigger guardián,
-- el portal y la Evaluación no cambian.
--
-- Sólo esquema `produccion`. Nada de auth/storage/otros esquemas (proyecto compartido).
-- ─────────────────────────────────────────────────────────────

-- ── 1) Disciplina de la persona ─────────────────────────────────────────────────
-- text + check (no el enum muerto assignment_role): hoy sólo hay dos, y agregar una
-- disciplina (copy, edición) es cambiar el check, sin la danza de `alter type add value`.
alter table produccion.track_members
  add column disciplina text not null default 'creativo'
  check (disciplina in ('creativo', 'diseno'));

comment on column produccion.track_members.disciplina is
  'creativo | diseno. lead+diseno = Lead Diseño, creative+diseno = Diseñador. Diseño con track NULL = global (ambos equipos).';

-- ── 2) Aprobación de diseño en la tarea ────────────────────────────────────────
alter table produccion.ideas
  add column diseno_aprobado_at  timestamptz,
  add column diseno_aprobado_por uuid references produccion.track_members(id) on delete set null;

-- ¿La tarea lleva diseño? = tiene un DISEÑADOR (creative + diseno, no el lead) ACTIVO.
create or replace function produccion.idea_requiere_diseno(p_idea_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from produccion.idea_assignments ia
      join produccion.track_members tm on tm.id = ia.member_id
     where ia.idea_id = p_idea_id and not ia.es_lead and tm.role = 'creative'
       and tm.disciplina = 'diseno' and tm.active
  );
$$;

-- Cada ENTRADA a revisión reinicia la aprobación de diseño: la versión nueva no está vista.
create or replace function produccion.reset_diseno_aprobado()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'under_review' and old.status is distinct from 'under_review' then
    new.diseno_aprobado_at  := null;
    new.diseno_aprobado_por := null;
  end if;
  return new;
end $$;

create trigger ideas_reset_diseno_bu before update of status on produccion.ideas
  for each row execute function produccion.reset_diseno_aprobado();

-- ── 3) Avisos: una revisión con diseño va al Lead Diseño, no al Lead Creativo ────
-- Cuerpo IDÉNTICO al de 0061 salvo lo marcado "0076":
--  · v_diseno: la revisión espera diseño → las patas (a)/(b) (Lead Creativo / admins)
--    NO se avisan todavía; se avisa la pata (f) Lead Diseño. Al aprobar diseño,
--    rpc_task_approve_design avisa a (a)/(b) con la MISMA selección (destinatarios_revision).
--  · (a) excluye a los Lead Diseño: con alcance global recibirían TODA revisión. (d) no: los
--    watchers eligieron verlo todo (opt-in).
--  · Si NINGÚN Lead Diseño activo cubre el track, la revisión va a (a)/(b) como siempre —
--    nunca una revisión sin nadie avisado (el Lead Creativo puede "Aprobar sin diseño").
create or replace function produccion.destinatarios_revision(p_idea_id uuid, p_actor uuid)
returns table (member_id uuid, profile_id uuid)
language sql stable security definer set search_path = '' as $$
  select distinct d.member_id, d.profile_id from (
    -- (a) perfiles admin/lead en scope, que no sean Lead Diseño ni el lead de la tarea.
    select null::uuid as member_id, p.id as profile_id
      from produccion.ideas i
      join produccion.profiles p on true
     where i.id = p_idea_id
       and p.role in ('admin','lead') and p.active
       and (p.notify_scope = 'all'
            or exists (select 1 from produccion.track_members tmx
                        where tmx.profile_id = p.id and tmx.active
                          and (tmx.track = i.track or i.track = any(tmx.tracks))))
       and not exists (select 1 from produccion.track_members tmd
                        where tmd.profile_id = p.id and tmd.active and tmd.disciplina = 'diseno')
       and not exists (
         select 1 from produccion.idea_assignments ia2
           join produccion.track_members tm2 on tm2.id = ia2.member_id
          where ia2.idea_id = p_idea_id and ia2.es_lead and tm2.profile_id = p.id)
       and (p_actor is null or not exists (
            select 1 from produccion.track_members tmz
             where tmz.id = p_actor and tmz.profile_id = p.id))
    union all
    -- (b) el lead ASIGNADO a esta tarea.
    select tm.id, null::uuid
      from produccion.idea_assignments ia
      join produccion.track_members tm on tm.id = ia.member_id
     where ia.idea_id = p_idea_id and ia.es_lead and tm.active
       and (p_actor is null or tm.id <> p_actor)
  ) d;
$$;

create or replace function produccion.fan_out_task_notification()
returns trigger language plpgsql
security definer set search_path = '' as $$
declare
  v_member uuid := nullif(current_setting('produccion.acting_member', true), '')::uuid;
  v_body   text := nullif(current_setting('produccion.notify_body', true), '');
  v_to_lead boolean := coalesce(nullif(current_setting('produccion.notify_to_lead', true), ''), 'false') = 'true';
  v_diseno boolean := false; -- 0076
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

    -- 0076: ¿esta revisión espera diseño?
    v_diseno := new.status = 'under_review' and produccion.idea_requiere_diseno(new.id)
      and exists (select 1 from produccion.track_members tl
                   where tl.role = 'lead' and tl.disciplina = 'diseno' and tl.active
                     and (tl.track is null or tl.track = new.track or new.track = any(tl.tracks)));

    v_titulo := case
      when v_diseno then coalesce(new.naming_base, new.code, 'Una tarea') || ' está lista para revisar diseño'
      when new.status = 'under_review'   then coalesce(new.naming_base, new.code, 'Una tarea') || ' está lista para revisar'
      when new.status = 'in_corrections' then 'Cambios pedidos en ' || coalesce(new.naming_base, new.code, 'una tarea')
      when new.status = 'published'      then coalesce(new.naming_base, new.code, 'Una tarea') || ' se envió al cliente'
      else                                    coalesce(new.naming_base, new.code, 'Una tarea') || ' fue aprobada'
    end;

    select '/' || c.slug || '/tablero' into v_url
      from produccion.briefs b join produccion.clients c on c.id = b.client_id
     where b.id = new.brief_id;

    for r in
      select distinct member_id, profile_id from (
        -- (a)+(b) revisores creativos → under_review SIN diseño pendiente, o cambios del CLIENTE.
        select dr.member_id, dr.profile_id
          from produccion.destinatarios_revision(new.id, v_member) dr
         where (new.status = 'under_review' and not v_diseno)
            or (new.status = 'in_corrections' and v_to_lead)
        union all
        -- (f) 0076: Lead(s) Diseño activos con alcance sobre el track → revisión con diseño.
        select tm.id, null::uuid
          from produccion.track_members tm
         where v_diseno
           and tm.role = 'lead' and tm.disciplina = 'diseno' and tm.active
           and (tm.track is null or tm.track = new.track or new.track = any(tm.tracks))
           and (v_member is null or tm.id <> v_member)
        union all
        -- (c) asignados → cambios del LEAD, aprobación y publicación (siempre — es su tarea).
        select tm.id, tm.profile_id
          from produccion.idea_assignments ia
          join produccion.track_members tm on tm.id = ia.member_id
         where ((new.status = 'in_corrections' and not v_to_lead) or new.status in ('completed','published'))
           and ia.idea_id = new.id
           and tm.active
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

    -- (e) CLIENTE: al PUBLICAR, avisar a los perfiles cliente de ESTE cliente.
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

-- ── 4) Aprobar diseño ──────────────────────────────────────────────────────────
-- QUIÉN puede (Lead Diseño / admin / master) lo decide la app antes de llamar, como el
-- resto de verbos. Aquí: la tarea debe estar en revisión, llevar diseño y no estar ya
-- aprobada. Deja rastro (activity_log + comentario si hay nota) y avisa a los revisores
-- creativos (la misma selección que una revisión sin diseño).
create or replace function produccion.rpc_task_approve_design(
  p_idea_id uuid, p_actor_member uuid default null, p_actor uuid default null, p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  i       produccion.ideas%rowtype;
  v_url   text;
  v_notif uuid;
  v_ch    produccion.notify_channel;
  r       record;
begin
  select * into i from produccion.ideas where id = p_idea_id for update;
  if not found then raise exception 'La tarea no existe.'; end if;
  if i.status <> 'under_review' then raise exception 'La tarea no está en revisión.'; end if;
  if not produccion.idea_requiere_diseno(p_idea_id) then
    raise exception 'Esta tarea no lleva revisión de diseño.';
  end if;
  if i.diseno_aprobado_at is not null then return; end if; -- idempotente (doble click)

  update produccion.ideas
     set diseno_aprobado_at = now(), diseno_aprobado_por = p_actor_member
   where id = p_idea_id;

  if coalesce(btrim(p_note), '') <> '' then
    insert into produccion.comments (idea_id, author_id, author_member_id, body, kind)
    values (p_idea_id, p_actor, p_actor_member, p_note, 'approval');
  end if;

  insert into produccion.activity_log (entity_type, entity_id, actor_id, verb, payload)
  values ('idea', p_idea_id, p_actor, 'diseno_aprobado',
          jsonb_build_object('member', p_actor_member));

  select '/' || c.slug || '/tablero' into v_url
    from produccion.briefs b join produccion.clients c on c.id = b.client_id
   where b.id = i.brief_id;

  for r in select * from produccion.destinatarios_revision(p_idea_id, p_actor_member) loop
    insert into produccion.notifications
      (recipient_id, recipient_member_id, type, entity_type, entity_id, title, body, url)
    values (r.profile_id, r.member_id, 'task_submitted', 'idea', p_idea_id,
            coalesce(i.naming_base, i.code, 'Una tarea') || ': diseño aprobado, lista para revisar',
            nullif(btrim(coalesce(p_note, '')), ''), v_url)
    returning id into v_notif;

    foreach v_ch in array produccion.active_notify_channels() loop
      insert into produccion.notification_deliveries (notification_id, channel, status, sent_at)
      values (v_notif, v_ch,
              case when v_ch = 'in_app' then 'sent' else 'pending' end,
              case when v_ch = 'in_app' then now() else null end);
    end loop;
  end loop;
end $$;

-- ── 5) Aprobar SIN diseño (override del Lead Creativo) queda registrado ─────────
-- Cuerpo IDÉNTICO al de 0038 (la última) + el bloque "0076". Misma firma (una sobrecarga
-- rompería PostgREST: PGRST203).
create or replace function produccion.rpc_task_approve(
  p_idea_id uuid, p_actor_member uuid default null, p_actor uuid default null, p_note text default null
) returns produccion.asset_status
language plpgsql security definer set search_path = '' as $$
begin
  -- 0076: aprobar mientras el diseño está pendiente = override, con rastro. La MISMA
  -- condición que v_diseno del fan-out: si ningún Lead Diseño activo cubre el track, la
  -- revisión nunca fue de diseño y no hay nada que "saltar".
  if exists (select 1 from produccion.ideas i
              where i.id = p_idea_id and i.status = 'under_review' and i.diseno_aprobado_at is null
                and exists (select 1 from produccion.track_members tl
                             where tl.role = 'lead' and tl.disciplina = 'diseno' and tl.active
                               and (tl.track is null or tl.track = i.track or i.track = any(tl.tracks))))
     and produccion.idea_requiere_diseno(p_idea_id) then
    insert into produccion.activity_log (entity_type, entity_id, actor_id, verb, payload)
    values ('idea', p_idea_id, p_actor, 'diseno_saltado',
            jsonb_build_object('member', p_actor_member));
  end if;
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

-- ── 6) El tablero necesita saber si la tarea lleva diseño y si ya se aprobó ─────
-- Idéntica a la 0058 + dos columnas AL FINAL (requiere_diseno, diseno_aprobado_at).
create or replace view produccion.board_tasks as
select
  i.id, i.brief_id, i.code, i.status, i.track, i.naming_base, i.concepto,
  i.tipo_asset, i.formato_code, i.duracion, i.tamanos, i.plataformas,
  i.marca_id, m.name as marca, i.pod_id, i.created_at,
  b.client_id, b.title as brief_title, b.source_tab as brief_tab,
  coalesce(f.n, 0) as file_count,
  coalesce(a.members, '[]'::jsonb) as members,
  coalesce(a.member_ids, '{}'::uuid[]) as member_ids,
  c.slug as client_slug,
  i.trend, i.notas,
  coalesce(a.leads,    '[]'::jsonb)  as leads,
  coalesce(a.team,     '[]'::jsonb)  as team,
  coalesce(a.lead_ids, '{}'::uuid[]) as lead_ids,
  coalesce(a.team_ids, '{}'::uuid[]) as team_ids,
  m.logo_url as marca_logo_url,
  i.delivered_at,
  coalesce(a.requiere_diseno, false) as requiere_diseno,
  i.diseno_aprobado_at
from produccion.ideas i
join produccion.briefs b on b.id = i.brief_id
join produccion.clients c on c.id = b.client_id
left join produccion.marcas m on m.id = i.marca_id
left join lateral (
  select count(*)::int as n from produccion.assets x where x.idea_id = i.id
) f on true
left join lateral (
  select jsonb_agg(
           jsonb_build_object('id', tm.id, 'name', tm.name, 'color', tm.color)
           order by tm.sort_order
         ) as members,
         array_agg(tm.id) as member_ids,
         jsonb_agg(
           jsonb_build_object('id', tm.id, 'name', tm.name, 'color', tm.color)
           order by tm.sort_order
         ) filter (where ia.es_lead) as leads,
         jsonb_agg(
           jsonb_build_object('id', tm.id, 'name', tm.name, 'color', tm.color)
           order by tm.sort_order
         ) filter (where not ia.es_lead) as team,
         array_agg(tm.id) filter (where ia.es_lead)     as lead_ids,
         array_agg(tm.id) filter (where not ia.es_lead) as team_ids,
         bool_or(not ia.es_lead and tm.role = 'creative' and tm.disciplina = 'diseno' and tm.active) as requiere_diseno
    from produccion.idea_assignments ia
    join produccion.track_members tm on tm.id = ia.member_id
   where ia.idea_id = i.id
) a on true
where i.deleted_at is null
  and b.deleted_at is null;

grant select on produccion.board_tasks to service_role;

-- ── 7) Permisos: sólo service_role (candado 0056 / 0061) ───────────────────────
revoke all on function produccion.idea_requiere_diseno(uuid) from public;
revoke all on function produccion.reset_diseno_aprobado() from public;
revoke all on function produccion.destinatarios_revision(uuid, uuid) from public;
revoke all on function produccion.rpc_task_approve_design(uuid, uuid, uuid, text) from public;
grant execute on function produccion.idea_requiere_diseno(uuid) to service_role;
grant execute on function produccion.rpc_task_approve_design(uuid, uuid, uuid, text) to service_role;
