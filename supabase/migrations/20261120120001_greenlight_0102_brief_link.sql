-- 0102 — «Link a Brief»: el Google Sheet de cada brief (Pedro, 2026-11-20)
--
-- En la lista de Briefs, junto al nombre del brief, un link al sheet donde vive. Sólo para
-- el equipo; admin/master lo pone o lo cambia (server action ponerLinkBrief). El card junta
-- las pestañas Real y Normal del mismo día: el link se guarda en cada una de ellas.
--
-- Sólo agrega una columna vacía: no toca ningún dato existente.

alter table produccion.briefs
  add column if not exists brief_url text null
    check (brief_url is null or (brief_url ~ '^https://' and length(brief_url) <= 2000));
