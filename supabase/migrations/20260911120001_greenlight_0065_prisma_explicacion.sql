-- ═══════════════════════════════════════════════════════════════
-- 0065 — HÜE Prisma: la explicación del prompt se cachea POR IDIOMA
-- ═══════════════════════════════════════════════════════════════
-- Antes había UNA columna `explicacion` con un prefijo casero "[es]\n" / "[en]\n"
-- como caché: pedir la explicación en el otro idioma PISABA la anterior y, al
-- volver, se cobraba otra vez al modelo. Ahora cada idioma tiene su casilla: lo ya
-- pagado no se vuelve a pedir. Sólo `produccion` (check-isolation lo exige). Los
-- datos existentes se migran ANTES de soltar la columna vieja.

alter table produccion.prisma_prompts
  add column explicacion_es text,   -- "por qué está así", en español (generada 1 vez)
  add column explicacion_en text;   -- lo mismo en inglés (generada 1 vez)

-- Backfill: el prefijo mide 5 caracteres ("[es]" + salto de línea) → el texto empieza en el 6.
update produccion.prisma_prompts set explicacion_es = substr(explicacion, 6) where explicacion like E'[es]\n%';
update produccion.prisma_prompts set explicacion_en = substr(explicacion, 6) where explicacion like E'[en]\n%';
-- Sin prefijo (antes de la caché casera) la explicación se generaba en español (0063): a la casilla de español.
update produccion.prisma_prompts set explicacion_es = explicacion where explicacion is not null and explicacion not like E'[es]\n%' and explicacion not like E'[en]\n%';

alter table produccion.prisma_prompts drop column explicacion;
