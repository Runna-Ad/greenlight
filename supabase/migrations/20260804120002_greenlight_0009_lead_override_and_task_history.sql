-- Greenlight — historial de estados por TAREA + override de lead auditado (0009)
--
-- PROBLEMA 1 — no había historial de tareas.
--   `status_events.asset_id` apunta a `assets`, pero desde la 0007 el estado
--   vive en `ideas`. Resultado: mover una tarea no dejaba rastro de ningún tipo.
--   Se comprobó en la base viva: 0 filas en status_events tras mover una tarea.
--
-- PROBLEMA 2 — con el login apagado nadie es lead, así que NADIE puede revertir.
--   El trigger bloquea toda transición no mapeada salvo para is_lead(), y sin
--   JWT is_lead() es false para todos. El flujo normal funciona, pero una
--   tarjeta movida por error hacia adelante no se puede devolver.
--
-- SOLUCIÓN: una ruta de override deliberada y auditada. No se abre el guard
--   para todos — se pasa por rpc_move_task, que decide, y el trigger de
--   historial registra SIEMPRE (incluido quién y por qué), de modo que un
--   override no puede ocurrir sin dejar rastro.

-- ─────────────────────────────────────────────────────────────
-- 1. status_events puede registrar una TAREA, no sólo un archivo
-- ─────────────────────────────────────────────────────────────
alter table produccion.status_events alter column asset_id drop not null;
alter table produccion.status_events
  add column idea_id uuid references produccion.ideas(id) on delete cascade;
alter table produccion.status_events
  add column override boolean not null default false;
alter table produccion.status_events
  add constraint status_events_target
  check (asset_id is not null or idea_id is not null);

create index status_events_idea_idx on produccion.status_events(idea_id);

comment on column produccion.status_events.override is
  'true = movimiento fuera de las transiciones permitidas, hecho por un lead a propósito.';

-- ─────────────────────────────────────────────────────────────
-- 1b. current_profile_id() no debe reventar con claims vacías
-- ─────────────────────────────────────────────────────────────
-- Estaba `current_setting(...)::json->>'sub'`: el cast ocurre ANTES del nullif,
-- así que una cadena vacía lanza "invalid input syntax for type json" en vez de
-- devolver null. En Supabase las claims siempre llegan bien formadas, pero el
-- trigger de historial de abajo llama a esta función en CADA cambio de estado —
-- no puede depender de eso. Con nullif antes del cast la función es total.
create or replace function produccion.current_profile_id()
returns uuid language sql stable as $$
  select nullif(
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub', ''
  )::uuid;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. El guard honra un override TRANSACCIONAL
-- ─────────────────────────────────────────────────────────────
-- `set_config(..., true)` es local a la transacción, así que el permiso dura
-- exactamente lo que dura el movimiento. Sólo rpc_move_task lo enciende, y esa
-- función comprueba antes quién pide el override.
create or replace function produccion.guard_idea_status()
returns trigger language plpgsql
security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    if not produccion.transition_allowed(old.status, new.status)
       and not produccion.is_lead()
       and coalesce(current_setting('produccion.lead_override', true), '') <> 'on' then
      raise exception 'Transición no permitida: % → %', old.status, new.status;
    end if;
    if new.status = 'completed' and new.completed_at is null then new.completed_at := now(); end if;
    if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
    if new.status = 'delivered' and new.delivered_at is null then new.delivered_at := now(); end if;
  end if;
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 3. Historial: se registra SIEMPRE, venga de donde venga el UPDATE
-- ─────────────────────────────────────────────────────────────
-- Deliberadamente un trigger y no un insert dentro de la RPC: así un UPDATE
-- directo a la tabla también queda registrado. Un override no puede ocurrir en
-- silencio porque quien lo hace no controla el registro.
create or replace function produccion.log_idea_status()
returns trigger language plpgsql
security definer set search_path = '' as $$
declare
  v_override boolean := coalesce(current_setting('produccion.lead_override', true), '') = 'on';
  v_actor    uuid;
begin
  if new.status is distinct from old.status then
    begin
      v_actor := nullif(current_setting('produccion.acting_profile', true), '')::uuid;
    exception when others then
      v_actor := null;
    end;

    insert into produccion.status_events (idea_id, from_status, to_status, actor_id, reason, override)
    values (
      new.id, old.status, new.status,
      coalesce(v_actor, produccion.current_profile_id()),
      nullif(current_setting('produccion.override_reason', true), ''),
      v_override and not produccion.transition_allowed(old.status, new.status)
    );
  end if;
  return new;
end $$;

create trigger ideas_status_log_au after update of status on produccion.ideas
  for each row execute function produccion.log_idea_status();

-- ─────────────────────────────────────────────────────────────
-- 4. La única puerta para mover una tarea
-- ─────────────────────────────────────────────────────────────
-- p_as_lead sólo surte efecto si quien llama TIENE derecho a ello. Con el login
-- apagado eso significa service_role (o sea: vino de nuestras server actions,
-- no de un navegador). Cuando se encienda AUTH_ENABLED, el rol del perfil
-- manda y la comprobación ya está puesta.
create or replace function produccion.rpc_move_task(
  p_idea_id uuid,
  p_to      produccion.asset_status,
  p_as_lead boolean default false,
  p_actor   uuid    default null,
  p_reason  text    default null
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
  update produccion.ideas set status = p_to where id = p_idea_id;

  -- No dejar el permiso encendido para el resto de la transacción.
  perform set_config('produccion.lead_override', '', true);
  perform set_config('produccion.override_reason', '', true);

  return p_to;
end $$;

comment on function produccion.rpc_move_task is
  'Única puerta para cambiar el estado de una TAREA. El override de lead exige derecho y siempre queda registrado en status_events.';

grant execute on function produccion.rpc_move_task(
  uuid, produccion.asset_status, boolean, uuid, text) to anon, authenticated, service_role;
