-- ═══════════════════════════════════════════════════════════════
-- 0021 — Trend ← columna "Referencias" del sheet
-- ═══════════════════════════════════════════════════════════════
-- Pedro: el campo Trend se llena con la columna "Referencias" (el link/nota de
-- referencia que sigue la pieza), no queda en blanco. Los datos ya están en el
-- sheet importado (staged_rows.data->>'Referencias'); se copian a ideas.trend
-- donde esté vacío. El import de aquí en adelante ya lo mapea directo.
--
-- Se empareja por naming_base (las variantes de una misma pieza comparten
-- naming y la misma referencia). Sólo se llena donde trend es null, para no
-- pisar lo que alguien ya haya editado.
update produccion.ideas i
   set trend = sub.ref
  from (
    select distinct on (data->>'Naming')
           data->>'Naming' as naming,
           nullif(btrim(data->>'Referencias'), '') as ref
      from produccion.staged_rows
     where nullif(btrim(data->>'Referencias'), '') is not null
  ) sub
 where i.trend is null
   and i.naming_base = sub.naming
   and sub.ref is not null;
