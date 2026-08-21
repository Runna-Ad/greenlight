-- ═══════════════════════════════════════════════════════════════
-- 0042 — Un track_member por cuenta (integridad para el login)
-- ═══════════════════════════════════════════════════════════════
-- Al encender el login, la primera vez que alguien entra se le liga (o se le crea)
-- su fila en track_members y se le pone profile_id. Sin esta garantía, un doble
-- login concurrente (dos pestañas, doble-click) podría crear DOS filas para la
-- misma persona (el clásico read-then-write). Un índice único parcial lo vuelve
-- imposible y además habilita `on conflict (profile_id)` para un upsert atómico.
--
-- Parcial (where profile_id is not null): las 14 personas de hoy tienen profile_id
-- NULL y Postgres permite múltiples NULL, así que no rompe los datos actuales.
create unique index if not exists track_members_profile_uq
  on produccion.track_members (profile_id) where profile_id is not null;
