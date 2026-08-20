-- ═══════════════════════════════════════════════════════════════
-- 0038 — Cambios del cliente = correcciones de PRIMERA CLASE (lifecycle completo)
-- ═══════════════════════════════════════════════════════════════
-- Pedro (override): un client_change debe tener EXACTAMENTE el mismo lifecycle que
-- una corrección interna — el especialista lo marca atendido (ámbar), el lead lo
-- confirma (verde), cuenta para el gate de aprobación y para las rondas — con la
-- ÚNICA diferencia de que se muestra que vino del cliente (badge "Cliente") y de
-- que NO lleva categoría de rúbrica (no puntúa en Evaluación).
--
-- CLAVE — reconciliar `resolved_at`: antes rpc_client_submit_changes ponía
-- resolved_at=now() al ENVIAR (para separar el lote de una próxima ronda). Eso
-- CHOCA con el lifecycle, donde resolved_at = "el lead confirmó" (verde) — un
-- cambio recién enviado saldría "confirmado" en vez de "sin atender". Solución:
-- usar la columna `ronda` como marcador de ENVIADO (null = borrador/pin sin enviar,
-- asignada = enviado + en una ronda), liberando `resolved_at` para el lifecycle.
-- Así un client_change enviado entra OPEN (rojo) y sigue el mismo flujo.
--
-- Firmas SIN cambio → `create or replace` (no hace falta drop): correction_next_round(uuid),
-- rpc_task_approve(uuid,uuid,uuid,text), rpc_client_submit_changes(uuid).

-- ─────────────────────────────────────────────────────────────
-- 1. La ronda de una corrección nueva — ahora cuenta client_change ENVIADOS
--    (0028 lo dejó pendiente: "cuando el portal escriba client_change, incluirlo").
--    Borrador (ronda is null) NO cuenta; enviado (ronda is not null) sí.
-- ─────────────────────────────────────────────────────────────
create or replace function produccion.correction_next_round(p_idea uuid)
returns int language sql stable security definer set search_path = '' as $$
  with activas as (
    select ronda, resolved_at from produccion.comments
    where idea_id = p_idea
      and (kind = 'correction_request'
        or (kind = 'client_change' and ronda is not null))
  )
  select case
    when not exists (select 1 from activas) then 1
    when exists (select 1 from activas where resolved_at is null)
      then (select max(coalesce(ronda, 1)) from activas)
    else (select max(coalesce(ronda, 1)) + 1 from activas)
  end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. Aprobar CIERRA la ronda — ahora también los client_change enviados sin resolver.
-- ─────────────────────────────────────────────────────────────
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
   where idea_id = p_idea_id and resolved_at is null
     and (kind = 'correction_request'
       or (kind = 'client_change' and ronda is not null));
  perform set_config('produccion.notify_body', coalesce(p_note, ''), true);
  return produccion.rpc_move_task(p_idea_id, 'completed', false, null, null, p_actor_member);
end $$;

-- ─────────────────────────────────────────────────────────────
-- 3. Enviar los cambios del cliente: asignar RONDA (marca enviado) — NO resolved_at.
--    Borrador = ronda is null; enviado = ronda asignada. Entran OPEN al lifecycle.
--    La ronda se calcula UNA vez (antes de asignarla) y se estampa a todo el lote.
-- ─────────────────────────────────────────────────────────────
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

  if v_status = 'published' then
    return produccion.rpc_move_task(p_idea_id, 'in_corrections', false, null, null, null);
  end if;
  return v_status;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 4. "Pedir cambios" (under_review→in_corrections) y "Devolver a revisión" cuentan
--    los client_change enviados sin resolver — antes miraban SÓLO correction_request,
--    así el botón "Pedir cambios" del lead reventaba ("no hay correcciones") cuando
--    los pendientes eran del cliente. Mismo predicado que 0038.
-- ─────────────────────────────────────────────────────────────
create or replace function produccion.rpc_task_send_corrections(
  p_idea_id uuid, p_actor_member uuid default null, p_actor uuid default null
) returns produccion.asset_status
language plpgsql security definer set search_path = '' as $$
declare v_n int; v_campos int;
begin
  select count(*), count(distinct coalesce(target_fila_id::text,'') || ':' || coalesce(target_campo,''))
    into v_n, v_campos
    from produccion.comments
   where idea_id = p_idea_id and resolved_at is null
     and (kind = 'correction_request' or (kind = 'client_change' and ronda is not null));

  if coalesce(v_n, 0) = 0 then
    raise exception 'No hay correcciones pendientes que mandar.';
  end if;

  perform set_config('produccion.notify_body',
    v_n || case when v_n = 1 then ' cambio' else ' cambios' end
        || ' en ' || v_campos || case when v_campos = 1 then ' campo' else ' campos' end, true);
  return produccion.rpc_move_task(p_idea_id, 'in_corrections', false, null, null, p_actor_member);
end $$;

create or replace function produccion.rpc_task_return_review(
  p_idea_id uuid, p_actor_member uuid default null
) returns produccion.asset_status
language plpgsql security definer set search_path = '' as $$
declare v_pend int;
begin
  select count(*) into v_pend
    from produccion.comments
   where idea_id = p_idea_id and resolved_at is null
     and (kind = 'correction_request' or (kind = 'client_change' and ronda is not null));
  perform set_config('produccion.notify_body',
    case when coalesce(v_pend,0) = 0
      then 'Correcciones atendidas'
      else 'Correcciones atendidas (quedan ' || v_pend || ' por confirmar)' end, true);
  return produccion.rpc_move_task(p_idea_id, 'under_review', false, null, null, p_actor_member);
end $$;

-- ─────────────────────────────────────────────────────────────
-- 5. Data migration: los client_change YA ENVIADOS (resolved_at set en el flujo
--    viejo) reciben una RONDA (dejan de ser "borradores"). Sólo se RE-ABREN (limpiar
--    resolved_at) los de tareas AÚN en el ciclo de revisión (in_corrections/
--    under_review), para que el equipo los confirme; en tareas terminadas
--    (entregadas/cerradas/publicadas) se quedan CONFIRMADOS — NO resucitar trabajo
--    ya aprobado ni colapsar rondas históricas en una. Los borradores (resolved_at
--    null, sin enviar) quedan igual (ronda null).
-- ─────────────────────────────────────────────────────────────
update produccion.comments c
   set ronda = coalesce(
         c.ronda,
         greatest(1, (select max(coalesce(c2.ronda, 1)) from produccion.comments c2
                       where c2.idea_id = c.idea_id and c2.kind = 'correction_request'))),
       resolved_at        = case when i.status in ('in_corrections','under_review') then null else c.resolved_at end,
       resolved_by        = case when i.status in ('in_corrections','under_review') then null else c.resolved_by end,
       resolved_member_id = case when i.status in ('in_corrections','under_review') then null else c.resolved_member_id end
  from produccion.ideas i
 where c.kind = 'client_change' and c.resolved_at is not null and i.id = c.idea_id;

grant execute on function produccion.correction_next_round(uuid) to anon, authenticated, service_role;
grant execute on function produccion.rpc_task_approve(uuid, uuid, uuid, text) to anon, authenticated, service_role;
grant execute on function produccion.rpc_client_submit_changes(uuid) to anon, authenticated, service_role;
grant execute on function produccion.rpc_task_send_corrections(uuid, uuid, uuid) to anon, authenticated, service_role;
grant execute on function produccion.rpc_task_return_review(uuid, uuid) to anon, authenticated, service_role;
