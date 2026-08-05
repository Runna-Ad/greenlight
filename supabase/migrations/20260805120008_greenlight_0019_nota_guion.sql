-- ═══════════════════════════════════════════════════════════════
-- 0019 — Nota del guión editable
-- ═══════════════════════════════════════════════════════════════
-- La nota de arriba del cuerpo ("1 actriz / 1 actor en todo el video · #
-- outfits") venía FIJA, derivada del tipo. Pedro la quiere editable. El texto
-- del tipo se queda como PLACEHOLDER (sigue guiando); lo que se escriba aquí
-- lo reemplaza. Un solo campo de texto (regla de Pedro: no parsers).
alter table produccion.ideas add column nota_guion text;
