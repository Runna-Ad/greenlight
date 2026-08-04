-- Greenlight — a project IS one sheet tab (0005)
--
-- Correction to the earlier model: a project is identified by track AND date.
--   "Real (Card/Préstamos | Brief 24/07)"   → one project
--   "Normal (Card/Préstamos | Brief 24/07)" → a DIFFERENT project
-- Marca (Card | Préstamos) is per-ROW, not per-tab: one project can hold both.

alter table produccion.briefs add column track       produccion.track;
alter table produccion.briefs add column source_tab  text;   -- exact tab name
alter table produccion.briefs add column brief_date  date;   -- parsed from the name

-- A tab maps to exactly one brief per client, so re-syncing a tab updates its
-- brief instead of creating a second one.
create unique index briefs_source_tab_key
  on produccion.briefs(client_id, source_tab) where source_tab is not null;

comment on column produccion.briefs.source_tab is
  'Nombre exacto de la pestaña de Google Sheets de la que vino este proyecto.';
