-- 0095 — `delivered_at` significa "Greenlit DESDE cuándo", no "alguna vez fue Greenlit"
--
-- Bug visto el 2026-11-09 con A1 CMCOOKINGSP (DiDi, Brief 16/10): la tarea ya había
-- sido Greenlit y devuelta a Con Cliente dos veces (22 y 28 de octubre). Al moverla
-- a Greenlit por tercera vez, `guard_idea_status` NO re-estampó `delivered_at` (sólo
-- lo pone si está en null) y nada lo había limpiado al salir de delivered. Resultado:
--   · el tablero la dio por "Greenlit hace más de 7 días" (esGreenlitReciente) y no la
--     mostró en la columna Greenlit: fue derecho al archivo de Entregas;
--   · Entregas enseñó "Greenlit el 22 oct" para un movimiento de ese mismo día;
--   · brief_estado.greenlit_at habría usado la fecha vieja.
-- Misma familia que la 0077: un estado que se deriva de "pasó alguna vez" nunca se apaga.
--
-- Qué cambia: al SALIR de delivered se limpia `delivered_at`; al ENTRAR se estampa
-- (como antes, si viene vacío — y ahora siempre viene vacío tras una salida).
-- Qué NO cambia, a propósito:
--   · `completed_at` es inmutable por diseño (performance/data.ts, evaluacion.ts: la
--     tarea aprobada es la unidad del mes y el mes debe ser reproducible).
--   · `published_at` significa "el cliente ya la vio alguna vez" (portal-data.ts la usa
--     así incluso en in_corrections).
-- Backfill: las tareas que hoy no están en delivered pero conservan una fecha vieja
-- (2 en la base viva el 2026-11-09) quedan sin fecha. Nadie las lee así: tablero,
-- Entregas, bundle y brief_estado exigen status = 'delivered' para usar la fecha.

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
    -- 0095: Greenlit "desde cuándo": se limpia al salir y se vuelve a estampar al entrar.
    if old.status = 'delivered' and new.status <> 'delivered' then new.delivered_at := null; end if;
    if new.status = 'delivered' and new.delivered_at is null then new.delivered_at := now(); end if;
  end if;
  return new;
end $$;

comment on column produccion.ideas.delivered_at is
  'Greenlit DESDE cuándo. La pone guard_idea_status al entrar a delivered y la limpia al salir (0095). Null = hoy no está Greenlit.';

-- Backfill: fechas huérfanas de tareas que ya no están Greenlit.
update produccion.ideas
   set delivered_at = null
 where status <> 'delivered'
   and delivered_at is not null;
