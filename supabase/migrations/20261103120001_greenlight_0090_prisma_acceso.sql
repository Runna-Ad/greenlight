-- ══════════════════════════════════════════════════════════════════════════════
-- 0090 — Equipo: quién puede usar HÜE Prisma, persona por persona
-- ══════════════════════════════════════════════════════════════════════════════
-- Lo decide el Master Builder en Configuración › Equipo. El Master siempre entra (tieneAccesoPrisma, roles.ts).
-- Quien ya inició sesión conserva el acceso; una persona nueva entra sin él hasta que se lo den.
-- Aditivo; sólo `produccion`.

alter table produccion.track_members
  add column prisma_acceso boolean not null default false;

update produccion.track_members set prisma_acceso = true where profile_id is not null;
