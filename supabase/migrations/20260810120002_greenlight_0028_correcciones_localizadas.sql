-- Greenlight — correcciones localizadas + verbos del ciclo de revisión (0028)
--
-- Hoy `rpc_task_request_changes` (0010) mete UNA corrección como texto libre y
-- mueve la tarea a `in_corrections`. El comentario existe pero NUNCA se muestra
-- en la plantilla: el especialista sólo ve el estado y un correo. Esto le da a la
-- corrección una UBICACIÓN (qué plano/estático/cabecera, qué campo) y dos estados
-- de resolución (el especialista marca "atendido", el revisor "confirma"), para
-- que la UI la fije EN el campo. Reutilizable tal cual para el portal del cliente
-- (mismo modelo, kind 'client_change', entra por published→in_corrections).
--
-- Todo el movimiento de estado sigue pasando por rpc_move_task (la única puerta).

-- ─────────────────────────────────────────────────────────────
-- 1. La corrección apunta a un lugar + lleva dos estados de resolución
-- ─────────────────────────────────────────────────────────────
-- idea_id sigue siendo el destino del comentario (comment_one_target se respeta);
-- target_* pinpointea el campo DENTRO de esa tarea. target_label es una foto
-- humana ("Plano 2 · Acción") para que el panel lea bien aunque el campo se mueva.
alter table produccion.comments
  add column if not exists target_tabla  text,   -- 'planos' | 'estaticos' | 'ideas' | 'brief'
  add column if not exists target_fila_id uuid,  -- id del plano/estático/idea; null = nivel tarea
  add column if not exists target_campo  text,   -- 'accion' | 'copy_in' | 'dialogo' | 'concepto' | ...
  add column if not exists target_label  text,   -- foto humana del destino
  add column if not exists ronda         int,    -- ronda de revisión (agrupa el panel)
  -- Resolución en DOS lados. resolved_at/resolved_by (a profiles) ya existen de la
  -- 0001 = la CONFIRMACIÓN del revisor. Aquí se agrega el lado del especialista
  -- ("atendido") y la columna paralela a track_members (nadie tiene perfil aún).
  add column if not exists atendido_at   timestamptz,
  add column if not exists atendido_by   uuid references produccion.track_members(id) on delete set null,
  add column if not exists resolved_member_id uuid references produccion.track_members(id) on delete set null;

create index if not exists comments_correction_idx
  on produccion.comments(idea_id, ronda)
  where kind in ('correction_request', 'client_change');

-- ─────────────────────────────────────────────────────────────
-- 2. La ronda de una corrección nueva
-- ─────────────────────────────────────────────────────────────
-- Regla: si no hay correcciones, ronda 1. Si TODAVÍA hay alguna sin resolver, la
-- nueva se une a la ronda actual (el máximo). Si todas están resueltas, empieza
-- una ronda nueva (máximo + 1). Así el panel agrupa "Ronda 1 (cerrada)" vs
-- "Ronda 2 (actual)" sin un contador aparte que se pueda desincronizar.
-- OJO: se cuenta SÓLO 'correction_request' (el flujo interno activo). Cuando se
-- construya el portal del cliente y empiece a escribir 'client_change', hay que
-- volver aquí + a rpc_task_send_corrections/return_review + confirmarCampo +
-- page.tsx para incluir ese kind de forma consistente (no mezclarlo a medias).
-- Y `coalesce(ronda,1)` en TODAS las ramas: un correction_request sin ronda
-- (los que mete el botón legacy del tablero, rpc_task_request_changes) haría que
-- max(ronda) fuera NULL y la ronda nueva saliera NULL para siempre.
create or replace function produccion.correction_next_round(p_idea uuid)
returns int language sql stable security definer set search_path = '' as $$
  select case
    when not exists (
      select 1 from produccion.comments
      where idea_id = p_idea and kind = 'correction_request')
      then 1
    when exists (
      select 1 from produccion.comments
      where idea_id = p_idea and kind = 'correction_request' and resolved_at is null)
      then (select max(coalesce(ronda, 1)) from produccion.comments
             where idea_id = p_idea and kind = 'correction_request')
    else (select max(coalesce(ronda, 1)) + 1 from produccion.comments
           where idea_id = p_idea and kind = 'correction_request')
  end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. Fijar una corrección a un campo (NO mueve el estado)
-- ─────────────────────────────────────────────────────────────
-- Las correcciones se acumulan mientras el revisor revisa (under_review); recién
-- "Mandar a correcciones" mueve la tarea. Por eso esto sólo inserta el comentario.
create or replace function produccion.rpc_add_correction(
  p_idea_id      uuid,
  p_target_tabla text,
  p_target_fila  uuid,
  p_target_campo text,
  p_target_label text,
  p_body         text,
  p_actor_member uuid default null,
  p_actor        uuid default null,
  p_kind         produccion.comment_kind default 'correction_request'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if coalesce(btrim(p_body), '') = '' then
    raise exception 'Escribe qué hay que corregir.';
  end if;
  insert into produccion.comments
    (idea_id, author_id, author_member_id, body, kind,
     target_tabla, target_fila_id, target_campo, target_label, ronda)
  values
    (p_idea_id, p_actor, p_actor_member, p_body, p_kind,
     p_target_tabla, p_target_fila, p_target_campo, p_target_label,
     produccion.correction_next_round(p_idea_id))
  returning id into v_id;
  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 4. Mandar la ronda a correcciones (under_review → in_corrections)
-- ─────────────────────────────────────────────────────────────
-- Exige al menos una corrección SIN resolver — pedir cambios sin cambios no sirve.
-- No inserta comentario (las correcciones YA son los comentarios localizados);
-- sólo mueve el estado (el trigger avisa a los asignados) con un resumen.
create or replace function produccion.rpc_task_send_corrections(
  p_idea_id uuid, p_actor_member uuid default null, p_actor uuid default null
) returns produccion.asset_status
language plpgsql security definer set search_path = '' as $$
declare
  v_n      int;
  v_campos int;
begin
  select count(*), count(distinct coalesce(target_fila_id::text,'') || ':' || coalesce(target_campo,''))
    into v_n, v_campos
    from produccion.comments
   where idea_id = p_idea_id and kind = 'correction_request' and resolved_at is null;

  if coalesce(v_n, 0) = 0 then
    raise exception 'No hay correcciones pendientes que mandar.';
  end if;

  perform set_config('produccion.notify_body',
    v_n || case when v_n = 1 then ' cambio' else ' cambios' end
        || ' en ' || v_campos || case when v_campos = 1 then ' campo' else ' campos' end, true);
  return produccion.rpc_move_task(p_idea_id, 'in_corrections', false, null, null, p_actor_member);
end $$;

-- ─────────────────────────────────────────────────────────────
-- 5. Devolver a revisión (in_corrections → under_review)  [NUEVO]
-- ─────────────────────────────────────────────────────────────
-- El disparo del aviso al Dept Head — NO cada "marcar atendido" (eso spamearía).
-- in_corrections→under_review NO existía en transition_allowed; se agrega.
create or replace function produccion.transition_allowed(
  p_from produccion.asset_status, p_to produccion.asset_status
) returns boolean language sql immutable as $$
  select (p_from, p_to) in (
    ('todo','in_progress'),
    ('in_progress','under_review'),
    ('under_review','in_corrections'),
    ('under_review','completed'),
    ('in_corrections','in_progress'),
    ('in_corrections','under_review'),   -- devolver a revisión (0028)
    ('completed','published'),
    ('published','in_corrections'),      -- client requested changes
    ('published','delivered'),
    ('completed','delivered')
  );
$$;

create or replace function produccion.rpc_task_return_review(
  p_idea_id uuid, p_actor_member uuid default null
) returns produccion.asset_status
language plpgsql security definer set search_path = '' as $$
declare v_pend int;
begin
  select count(*) into v_pend
    from produccion.comments
   where idea_id = p_idea_id and kind = 'correction_request' and resolved_at is null;
  perform set_config('produccion.notify_body',
    case when coalesce(v_pend,0) = 0
      then 'Correcciones atendidas'
      else 'Correcciones atendidas (quedan ' || v_pend || ' por confirmar)' end, true);
  return produccion.rpc_move_task(p_idea_id, 'under_review', false, null, null, p_actor_member);
end $$;

-- ─────────────────────────────────────────────────────────────
-- 6. specialist_lead entra al equipo (lee todo), NO a is_lead/is_delivery
-- ─────────────────────────────────────────────────────────────
-- Lección new-enum-value: un valor nuevo que no se enseña a cada helper cae al
-- bucket 'else' y se degrada en silencio. specialist_lead es equipo interno
-- (ve la plantilla) pero NO revisa/aprueba (fuera de is_lead) ni entrega.
create or replace function produccion.is_team()
returns boolean language sql stable
security definer set search_path = '' as $$
  select coalesce(
    produccion.auth_role() in ('admin','lead','creative','delivery','master','specialist_lead'),
    false);
$$;

-- ─────────────────────────────────────────────────────────────
-- 6b. Reconciliar los dos verbos viejos con el modelo de rondas
-- ─────────────────────────────────────────────────────────────
-- El botón "Mandar cambios" del TABLERO/mi-trabajo sigue usando
-- rpc_task_request_changes (0010) — texto libre, sin campo, y ANTES sin `ronda`.
-- Sin ronda, correction_next_round veía NULL y rompía la separación de rondas
-- de esa tarea. Se le enseña a estampar la ronda (misma regla), para que los dos
-- caminos de "pedir cambios" produzcan datos coherentes.
create or replace function produccion.rpc_task_request_changes(
  p_idea_id uuid, p_body text, p_actor_member uuid default null, p_actor uuid default null
) returns produccion.asset_status
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(btrim(p_body), '') = '' then
    raise exception 'Escribe qué hay que corregir.';
  end if;
  insert into produccion.comments (idea_id, author_id, author_member_id, body, kind, ronda)
  values (p_idea_id, p_actor, p_actor_member, p_body, 'correction_request',
          produccion.correction_next_round(p_idea_id));
  perform set_config('produccion.notify_body', p_body, true);
  return produccion.rpc_move_task(p_idea_id, 'in_corrections', false, null, null, p_actor_member);
end $$;

-- Aprobar CIERRA la ronda: al aprobar, cualquier corrección todavía sin resolver
-- (roja o ámbar) se confirma. Si no, quedaría sin resolver PARA SIEMPRE y
-- correction_next_round —que se apoya en resolved_at— nunca abriría una ronda
-- nueva (un client_change futuro se uniría a la ronda vieja). Espeja la regla del
-- mockup: "aprobar auto-confirma lo que quede atendido".
create or replace function produccion.rpc_task_approve(
  p_idea_id uuid, p_actor_member uuid default null, p_actor uuid default null, p_note text default null
) returns produccion.asset_status
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(btrim(p_note), '') <> '' then
    insert into produccion.comments (idea_id, author_id, author_member_id, body, kind)
    values (p_idea_id, p_actor, p_actor_member, p_note, 'approval');
  end if;
  update produccion.comments
     set resolved_at = now(), resolved_member_id = p_actor_member, resolved_by = p_actor
   where idea_id = p_idea_id and kind = 'correction_request' and resolved_at is null;
  perform set_config('produccion.notify_body', coalesce(p_note, ''), true);
  return produccion.rpc_move_task(p_idea_id, 'completed', false, null, null, p_actor_member);
end $$;

-- ─────────────────────────────────────────────────────────────
-- 7. Grants
-- ─────────────────────────────────────────────────────────────
grant execute on function produccion.correction_next_round(uuid) to anon, authenticated, service_role;
grant execute on function produccion.rpc_add_correction(
  uuid, text, uuid, text, text, text, uuid, uuid, produccion.comment_kind) to anon, authenticated, service_role;
grant execute on function produccion.rpc_task_send_corrections(uuid, uuid, uuid) to anon, authenticated, service_role;
grant execute on function produccion.rpc_task_return_review(uuid, uuid) to anon, authenticated, service_role;
