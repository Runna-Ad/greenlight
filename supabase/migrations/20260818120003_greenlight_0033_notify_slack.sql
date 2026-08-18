-- ═══════════════════════════════════════════════════════════════
-- 0033 — track_members.notify_slack (para "Mi perfil": email y/o Slack)
-- ═══════════════════════════════════════════════════════════════
-- "Mi perfil" deja a cada persona elegir sus notificaciones: email + Slack, o
-- sólo email. La tabla ya tiene notify_email; falta la bandera de Slack. Default
-- true (como profiles.notify_slack en 0001) — nadie pierde avisos por el cambio.
alter table produccion.track_members
  add column if not exists notify_slack boolean not null default true;
