-- ─────────────────────────────────────────────────────────────
-- 0084 — Correos AGRUPADOS (Pedro, 2026-10-27, opción 1, para clientes y equipo).
--
-- El primer correo a una persona sale YA. Lo que le llegue en los 10 minutos siguientes
-- espera y sale junto, en UN correo ("3 piezas listas para tu revisión"). Así un cliente
-- no recibe 10 correos seguidos cuando el lead le manda 10 tareas una tras otra.
--
-- La regla vive en la app (src/lib/notif-routing.ts · planEnvio, src/lib/notif-email.ts).
-- Aquí:
--   · to_email   → a qué dirección salió (para saber cuándo fue su último correo).
--   · not_before → "no antes de": lo que espera su turno no se reclama hasta entonces.
--   · claimed_at → cuándo se reclamó (antes se medía lo "atascado" con created_at, y una
--                  fila que esperó su turno parecía atascada nada más reclamarla).
--   · rpc_reclamar_emails → el reclamo, atómico de verdad (FOR UPDATE SKIP LOCKED). El
--     reclamo anterior (update ... status in (pending, sending)) dejaba que dos envíos a la
--     vez reclamaran la MISMA fila: la segunda la volvía a pasar de sending a sending.
--   · El RELOJ que despierta a la app cada minuto (pg_cron + pg_net + Vault) NO va aquí:
--     toca esquemas fuera de `produccion` y check-isolation lo prohíbe en migraciones. Vive
--     en supabase/manual/0084_reloj_correos.sql y lo corre Pedro a mano, una vez.
--     Sin el reloj, lo que espera su turno sale con el siguiente envío de la app.
-- Las cuentas (invitaciones, accesos, bienvenidas) no pasan por aquí: siguen al instante.
-- Sólo esquema `produccion`. Aditivo.
-- ─────────────────────────────────────────────────────────────

alter table produccion.notification_deliveries
  add column if not exists to_email   text,
  add column if not exists not_before timestamptz,
  add column if not exists claimed_at timestamptz,
  add column if not exists intentos   int not null default 0;

comment on column produccion.notification_deliveries.to_email is
  'Dirección (en minúsculas) a la que salió o va a salir el correo (0084).';
comment on column produccion.notification_deliveries.not_before is
  'Espera su turno de agrupado: no se reclama antes de esta hora (0084).';
comment on column produccion.notification_deliveries.claimed_at is
  'Cuándo lo reclamó un envío; mide lo atascado en sending (0084).';
comment on column produccion.notification_deliveries.intentos is
  'Fallos (SMTP) + rescates de sending atascado. Con 3 se da por fallido: nunca se reenvía sin fin (0084).';

-- "¿Cuándo fue el último correo a esta dirección?" — una consulta por envío.
create index if not exists notif_deliveries_ultimo_envio_idx
  on produccion.notification_deliveries (to_email)
  where status in ('sent', 'sending');

-- ── Reclamar la cola ──────────────────────────────────────────────────────────
-- Toma las pendientes cuyo turno ya llegó + las atascadas en 'sending' (>15 min desde que
-- se reclamaron), las pasa a 'sending' y las devuelve. SKIP LOCKED: dos envíos a la vez se
-- reparten filas distintas, nunca la misma.
drop function if exists produccion.rpc_reclamar_emails(int);
create function produccion.rpc_reclamar_emails(p_limit int default 50)
returns table (id uuid, notification_id uuid, created_at timestamptz, intentos int)
language plpgsql security definer set search_path = '' as $$
begin
  -- Ya rescatada 2 veces (= 3 envíos posibles; el correo pudo haber salido y sólo falló
  -- marcarlo): se da por fallida en vez de reintentarla cada 15 minutos para siempre.
  update produccion.notification_deliveries d
     set status = 'failed', error = 'atascada en sending 3 veces'
   where d.channel = 'email' and d.status = 'sending' and d.intentos >= 2
     and coalesce(d.claimed_at, d.created_at) < now() - interval '15 minutes';

  return query
  with c as (
    select d.id
      from produccion.notification_deliveries d
     where d.channel = 'email'
       and (
         (d.status = 'pending' and (d.not_before is null or d.not_before <= now()))
         or (d.status = 'sending' and coalesce(d.claimed_at, d.created_at) < now() - interval '15 minutes')
       )
     order by d.created_at
     limit greatest(1, least(coalesce(p_limit, 50), 200))
     for update skip locked
  )
  -- Sólo el RESCATE de una atascada cuenta como intento (reclamar algo pendiente, o que
  -- esperó su turno, no).
  update produccion.notification_deliveries d
     set status = 'sending', claimed_at = now(),
         intentos = d.intentos + case when d.status = 'sending' then 1 else 0 end
    from c
   where d.id = c.id
  returning d.id, d.notification_id, d.created_at, d.intentos;
end $$;

revoke all on function produccion.rpc_reclamar_emails(int) from public, anon, authenticated;
grant execute on function produccion.rpc_reclamar_emails(int) to service_role;

-- ── ¿Sale ya o espera su turno? ───────────────────────────────────────────────
-- La decisión y la reserva van JUNTAS y con un candado por dirección: dos envíos a la vez
-- para la misma persona ya no pueden ver los dos "nada reciente" y mandar los dos. Lo que se
-- reserva queda en 'sending' con su `to_email` y `claimed_at`: para el siguiente envío ESO
-- ya cuenta como "le escribimos hace un momento". Usa el reloj de la base (no el del server).
-- Devuelve null = mándalo ya (filas reservadas); una hora = esperan hasta entonces.
drop function if exists produccion.rpc_reservar_envio(text, uuid[]);
create function produccion.rpc_reservar_envio(p_email text, p_ids uuid[])
returns table (hasta timestamptz, ids uuid[])
language plpgsql security definer set search_path = '' as $$
declare
  v_email  text := lower(btrim(p_email));
  v_ultimo timestamptz;
  v_hasta  timestamptz;
  v_ids    uuid[];
begin
  perform pg_advisory_xact_lock(hashtext('greenlight-correo:' || v_email));

  select max(coalesce(d.sent_at, d.claimed_at)) into v_ultimo
    from produccion.notification_deliveries d
   where d.to_email = v_email
     and d.status in ('sent', 'sending')
     and not (d.id = any(p_ids))
     and coalesce(d.sent_at, d.claimed_at) > now() - interval '10 minutes';

  if v_ultimo is not null then
    v_hasta := v_ultimo + interval '10 minutes';
    with u as (
      update produccion.notification_deliveries d
         set status = 'pending', claimed_at = null, not_before = v_hasta, to_email = v_email
       where d.id = any(p_ids) and d.status = 'sending'
      returning d.id
    ) select coalesce(array_agg(u.id), '{}') into v_ids from u;
    return query select v_hasta, v_ids;
    return;
  end if;

  -- Sólo se manda lo que de verdad se apartó aquí (otra corrida pudo haber tomado alguna).
  -- clock_timestamp(): `claimed_at` cambia siempre (el candado de abajo exige que cambie).
  with u as (
    update produccion.notification_deliveries d
       set to_email = v_email, claimed_at = clock_timestamp()
     where d.id = any(p_ids) and d.status = 'sending'
    returning d.id
  ) select coalesce(array_agg(u.id), '{}') into v_ids from u;
  return query select null::timestamptz, v_ids;
end $$;

revoke all on function produccion.rpc_reservar_envio(text, uuid[]) from public, anon, authenticated;
grant execute on function produccion.rpc_reservar_envio(text, uuid[]) to service_role;

-- ── Candado contra versiones VIEJAS de la app ─────────────────────────────────
-- Todas las versiones de Greenlight comparten esta base (producción, previews viejas, un
-- rollback). El despachador viejo reclamaba con `update ... set status='sending'` sin tocar
-- `claimed_at`: ignoraría la espera y podría reenviar lo que el nuevo ya apartó. Las RPCs de
-- arriba SIEMPRE ponen `claimed_at` nuevo; un paso a 'sending' sin eso se ignora en silencio,
-- así una versión vieja reclama cero filas y no manda nada.
create or replace function produccion.trg_entregas_sin_reclamo_viejo()
returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'sending' and new.claimed_at is not distinct from old.claimed_at then
    return null;
  end if;
  return new;
end $$;

revoke all on function produccion.trg_entregas_sin_reclamo_viejo() from public, anon, authenticated;

drop trigger if exists entregas_sin_reclamo_viejo on produccion.notification_deliveries;
create trigger entregas_sin_reclamo_viejo
  before update on produccion.notification_deliveries
  for each row execute function produccion.trg_entregas_sin_reclamo_viejo();
