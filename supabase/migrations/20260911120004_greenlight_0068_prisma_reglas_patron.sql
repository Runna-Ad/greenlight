-- ═══════════════════════════════════════════════════════════════
-- 0068 — HÜE Prisma: el patrón de `texto_no_latino` con escapes (F2)
-- ═══════════════════════════════════════════════════════════════
-- La 0067 sembró el patrón con los rangos escritos con los caracteres crudos. Uno de esos
-- extremos (U+0600, ARABIC NUMBER SIGN) es un carácter de FORMATO (\p{Cf}), y el filtro de
-- lectura del diagnóstico (regexSegura) rechaza cualquier patrón con caracteres de control o
-- formato: la regla quedaba descartada en silencio. Con escapes \uXXXX el patrón es texto
-- llano (ASCII) y el motor (flag u) lo entiende igual: cirílico, hebreo, árabe, kana, CJK, hangul.
update produccion.prisma_reglas
   set patron = '[\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]',
       updated_at = now()
 where codigo = 'texto_no_latino';
