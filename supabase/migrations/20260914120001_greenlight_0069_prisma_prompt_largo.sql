-- ═══════════════════════════════════════════════════════════════
-- 0069 — HÜE Prisma: el tope de `prompt_largo` pasa de 120 a 160 palabras
-- ═══════════════════════════════════════════════════════════════
-- Un prompt de imagen compilado lleva un andamio fijo (texto exacto letra por letra, marca,
-- qué conservar, qué mantener en el cuadro, formato, calidad) de ~65 palabras antes de la
-- descripción. Con 120, cualquier pieza con texto y marca "pasaba de largo" aunque H.Ü.E
-- hubiera escrito lo justo (2026-09-14, prueba de Pedro). Con 160 el aviso vuelve a señalar
-- prompts de verdad largos. Editable en el Hub; aquí se deja el default consistente con el seed.
update produccion.prisma_reglas
   set umbral = 160,
       que_es = 'El prompt pasa de 160 palabras.',
       que_en = 'The prompt is over 160 words.',
       updated_at = now()
 where codigo = 'prompt_largo';
