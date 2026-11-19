-- 0100 — Carpeta de Google Drive por paquete (Pedro, 2026-11-19)
--
-- Cuando un paquete queda Greenlit, el equipo arma sus archivos finales en UNA carpeta de
-- Google Drive y pega aquí su link. El cliente lo abre desde su Archivo para revisar que
-- todo esté, en orden y bien nombrado. Es sólo un link: Greenlight no descarga ni lee la
-- carpeta.
--
-- Quién lo pone y cuándo vive en la server action (admin/master, con el paquete ya
-- Greenlit): desde Briefs mientras sigue ahí, o desde Entregas después.

alter table produccion.paquetes
  add column if not exists drive_url text null
    check (drive_url is null or (drive_url ~ '^https://' and length(drive_url) <= 2000)),
  add column if not exists drive_por uuid null,   -- quién lo puso (perfil); sin FK, como fecha_por
  add column if not exists drive_at  timestamptz null;
