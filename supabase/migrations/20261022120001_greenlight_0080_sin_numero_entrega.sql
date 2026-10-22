-- ═══════════════════════════════════════════════════════════════
-- 0080 — "# Entrega" deja de ser obligatorio
-- ═══════════════════════════════════════════════════════════════
-- Pedro 2026-10-22: DiDi pasó a un sheet nuevo y ya no usa la columna "# Entrega".
-- La app (src/lib/required.ts) la quitó de los obligatorios; este es su espejo SQL,
-- atado con el contract test de scripts/test-db.mjs.
--
-- Nada en la base llama a esta función (sólo el contract test), así que aplicarla no
-- cambia ningún flujo en vivo. La columna ideas.entrega_num se queda: las tareas
-- viejas conservan su valor; las nuevas la dejan en null.

create or replace function produccion.missing_required(p_row jsonb)
returns text[] language sql immutable as $$
  select coalesce(array_agg(campo order by orden), '{}')
  from (
    select campo, orden from (
      values
        ('Asignación',1),('Marca',2),
        ('Tipo de Asset',3),('Concepto',4),('Plataforma',5),
        ('Naming',6),('# Idea',7),('Tamaño',8),('Duración',9)
    ) as t(campo, orden)
    where
      case
        when orden <= 5 then true
        when produccion.tipo_group(p_row->>'Tipo de Asset') = 'copies' then false
        when produccion.tipo_group(p_row->>'Tipo de Asset') = 'images' then campo <> 'Duración'
        else true
      end
      -- "-" es como el sheet escribe "no aplica"
      and coalesce(btrim(p_row->>campo), '') in ('', '-')
  ) faltantes;
$$;

comment on function produccion.missing_required is
  'Espejo SQL de missingRequired() en src/lib/required.ts. Atado con contract test.';
