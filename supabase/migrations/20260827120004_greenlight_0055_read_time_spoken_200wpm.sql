-- ─────────────────────────────────────────────────────────────
-- read-time del plano: sólo lo HABLADO, a 200 palabras/min.
--
-- Antes (migración 0002): ceil(TODOS los tokens / 2.5) = 150 pal/min. Dos problemas
-- (Pedro, 2026-08-27):
--   1) contaba lo NO hablado — etiquetas de locutor "(Actriz 1)", "(Ambas)" y los
--      marcadores de negrita "**" — inflando el conteo (~13% de los tokens reales).
--   2) 150 pal/min era muy lento: un guión que el sistema marcaba "de 32s" se leía
--      relajado en ~20s → el writer escribía de menos y el video salía corto.
-- Ahora: se limpia lo no hablado y se mide a 200 pal/min (0.3s/palabra) →
--   read_time = ceil(palabras_habladas × 3 / 10).
-- Espejo EXACTO de soloHablado()/readTimeS() en src/lib/plantilla.ts (contract test
-- en scripts/test-db.mjs verifica que TS === este trigger, palabra por palabra).
-- ─────────────────────────────────────────────────────────────
create or replace function produccion.set_plano_read_time()
returns trigger language plpgsql as $$
declare hablado text; words int;
begin
  -- Quita "(...)" (etiquetas de locutor) y "**" (negrita) — no se leen en voz alta.
  -- Mismo orden que soloHablado() en TS: primero los paréntesis, luego los asteriscos.
  hablado := trim(
    regexp_replace(
      regexp_replace(coalesce(new.dialogo, ''), '\([^)]*\)', ' ', 'g'),
      '\*\*', ' ', 'g'
    )
  );
  if length(hablado) = 0 then
    new.read_time_s := 0;
  else
    words := array_length(regexp_split_to_array(hablado, '\s+'), 1);
    new.read_time_s := ceil(words * 3.0 / 10.0);  -- 200 pal/min
  end if;
  return new;
end $$;

-- Recalcula las filas existentes con el nuevo modelo (el trigger BIU corre en el update).
update produccion.planos set dialogo = dialogo where dialogo is not null;
