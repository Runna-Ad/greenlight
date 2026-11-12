-- ─────────────────────────────────────────────────────────────────────────────
-- 0096 — Bot de Slack «Greenlight»: avisos por DM a cada persona del equipo.
--
-- Pedro (2026-11-12), opción 2: hoy en el Slack de Runna; el código queda listo para un
-- segundo espacio (DiDi) si su admin aprueba la app. Mismo patrón que SnapTrack.
--
-- 1) `slack` entra a los canales activos: cada aviso nuevo crea también una entrega
--    'slack' pendiente (las funciones de fan_out ya recorren active_notify_channels()).
-- 2) `track_members.slack_team_id`: el espacio de Slack al que pertenece el
--    `slack_user_id` de la persona. null = el espacio de Runna (la conexión de siempre).
-- 3) `rpc_reclamar_slack`: igual que el reclamo de correos pero SÓLO filas 'slack'
--    (el de correos ya filtra channel = 'email', así que no se pisan).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function produccion.active_notify_channels()
returns produccion.notify_channel[] language sql immutable as $$
  select array['in_app','email','slack']::produccion.notify_channel[];
$$;

alter table produccion.track_members
  add column if not exists slack_team_id text;

comment on column produccion.track_members.slack_team_id is
  'Espacio de Slack (team id, T…) del slack_user_id. null = el espacio de Runna.';

-- ── Reclamar entregas de Slack ────────────────────────────────────────────────
-- Pendientes cuyo turno llegó (not_before) o atascadas en 'sending' más de 15 min; las pasa
-- a 'sending' y las devuelve. SKIP LOCKED: dos envíos a la vez se reparten filas distintas.
drop function if exists produccion.rpc_reclamar_slack(int);
create function produccion.rpc_reclamar_slack(p_limit int default 50)
returns table (id uuid, notification_id uuid, created_at timestamptz, intentos int)
language plpgsql security definer set search_path = '' as $$
begin
  -- Rescatada ya 2 veces: se da por fallida (el DM pudo haber salido y sólo falló marcarlo).
  update produccion.notification_deliveries d
     set status = 'failed', error = 'atascada en sending 3 veces'
   where d.channel = 'slack' and d.status = 'sending' and d.intentos >= 2
     and coalesce(d.claimed_at, d.created_at) < now() - interval '15 minutes';

  return query
  with c as (
    select d.id
      from produccion.notification_deliveries d
     where d.channel = 'slack'
       and (
         (d.status = 'pending' and (d.not_before is null or d.not_before <= now()))
         or (d.status = 'sending' and coalesce(d.claimed_at, d.created_at) < now() - interval '15 minutes')
       )
     order by d.created_at
     limit greatest(1, least(coalesce(p_limit, 50), 200))
     for update skip locked
  )
  update produccion.notification_deliveries d
     set status = 'sending', claimed_at = now(),
         intentos = d.intentos + case when d.status = 'sending' then 1 else 0 end
    from c
   where d.id = c.id
  returning d.id, d.notification_id, d.created_at, d.intentos;
end $$;

-- Ahora cada aviso deja 3 entregas (in_app, email, slack): la cola se busca por canal.
create index if not exists notif_deliveries_cola_idx
  on produccion.notification_deliveries (channel, created_at)
  where status in ('pending', 'sending');

revoke all on function produccion.rpc_reclamar_slack(int) from public, anon, authenticated;
grant execute on function produccion.rpc_reclamar_slack(int) to service_role;
