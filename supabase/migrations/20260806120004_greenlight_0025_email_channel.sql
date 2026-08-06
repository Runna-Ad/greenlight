-- Greenlight 0025 — habilitar el canal de EMAIL en las notificaciones
--
-- Hasta hoy sólo se entregaba in-app (la campanita): active_notify_channels()
-- devolvía sólo ['in_app']. Ahora también 'email', así el fan-out crea una fila
-- 'email' en notification_deliveries (status 'pending') por cada notificación.
-- El dispatcher (en el Vercel de Greenlight, Gmail SMTP como "Brooklyn" de
-- SnapTrack, sender unique@runna.com.mx) drena esa cola y decide por persona si
-- envía (según notify_email + si tiene email); las que no aplican → 'skipped'.
--
-- IMPORTANTE: sólo afecta notificaciones NUEVAS. Las viejas no tienen fila
-- 'email', así que no hay ráfaga histórica al encender esto.
--
-- Numeración: NO existe 0017 (Notion, diferida). Timestamp nuevo.

create or replace function produccion.active_notify_channels()
returns produccion.notify_channel[] language sql immutable as $$
  select array['in_app','email']::produccion.notify_channel[];
$$;

-- Preferencia por persona: ¿quiere recibir emails? (in-app siempre le llega).
alter table produccion.track_members
  add column if not exists notify_email boolean not null default true;
