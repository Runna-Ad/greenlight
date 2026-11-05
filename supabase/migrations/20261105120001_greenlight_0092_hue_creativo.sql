-- 0092 — Equipo: quién puede crear guión y copy con H.Ü.E, persona por persona
-- Igual que HÜE Prisma (0090): lo decide el Master Builder en Configuración › Equipo y el Master
-- siempre entra (tieneHueCreativo, roles.ts). Quien ya inició sesión conserva el botón; una persona
-- nueva entra sin él hasta que se lo den.
-- Aditivo; sólo `produccion`.

alter table produccion.track_members
  add column hue_creativo boolean not null default false;

update produccion.track_members set hue_creativo = true where profile_id is not null;
