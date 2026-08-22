-- Greenlight · by Rünna — track nullable para roles GLOBALES (0044)
--
-- El track (real/normal) PARTICIONA a los doers: un lead o un especialista
-- pertenece a un equipo y sólo ve/asigna dentro de él. Pero admin y master
-- (Master Builder) tienen VISTA GLOBAL — ven todos los equipos — así que un track
-- que los acote es incorrecto. Hasta hoy la columna era NOT NULL con default
-- 'normal', que los forzaba a un equipo al que no pertenecen. (Pedro 2026-08-21.)
--
-- Nota de esquema: `track` dejó de ser parte de la PK en 0008 (ahora la PK es
-- `id`). Sólo queda el unique(track,name); con track NULL, Postgres trata los
-- NULLs como distintos, así que ese unique deja de aplicar a los globales (que se
-- identifican por profile_id/email de todos modos). Es el comportamiento deseado.

alter table produccion.track_members
  alter column track drop not null;

-- Backfill: admin/master quedan sin track (vista global). lead/creative CONSERVAN
-- su track — su partición es real. Sólo estos dos roles: son los únicos globales.
update produccion.track_members
  set track = null
  where role in ('admin', 'master');

comment on column produccion.track_members.track is
  'real/normal particiona a los doers (lead/creative). NULL = rol global (admin/master), sin track — vista de todos los equipos.';
