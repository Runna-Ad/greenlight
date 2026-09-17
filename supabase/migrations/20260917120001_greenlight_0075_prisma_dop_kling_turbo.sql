-- ═══════════════════════════════════════════════════════════════
-- 0075 — HÜE Prisma · DoP son 3 modelos y Kling Turbo tiene su página (sólo datos)
-- ═══════════════════════════════════════════════════════════════
-- Leído en la cuenta de Rünna en higgsfield.ai (2026-09-17): "Higgsfield DoP" hoy son Higgsfield Standard / Turbo /
-- Lite (720p, 3–5 s; 10 / 7 / 5 créditos) con su propia página (?model=standard|turbo|lite), y Kling 3.0 Turbo
-- vive en ?model=kling3_0_turbo (no en la de Kling 3.0). Pedro: "you fix the dop name". El código (catalogo.ts)
-- ya lo dice; esto pone al día las filas vivas de 0071 SÓLO si nadie las editó en el Hub (updated_by is null),
-- igual que 0072/0073. Los modelos se guardan SIN costo: la app toma el costo de las constantes por id.
-- El id "higgsfield" se queda (Standard): los resultados viejos lo guardan. Sin cambios de esquema.
update produccion.prisma_herramientas
   set modelos = '[{"id":"higgsfield","etiqueta":"Higgsfield DoP Standard","rol":"fino","como_llegar_es":"En Higgsfield: Video → Higgsfield Standard → sube la foto → elige ese preset de cámara → pega el texto.","como_llegar_en":"In Higgsfield: Video → Higgsfield Standard → upload the photo → pick that camera preset → paste the text.","url":"https://higgsfield.ai/ai/video?model=standard"},{"id":"higgsfield-turbo","etiqueta":"Higgsfield DoP Turbo","rol":"fino","como_llegar_es":"En Higgsfield: Video → Higgsfield Turbo → sube la foto → elige ese preset de cámara → pega el texto.","como_llegar_en":"In Higgsfield: Video → Higgsfield Turbo → upload the photo → pick that camera preset → paste the text.","url":"https://higgsfield.ai/ai/video?model=turbo"},{"id":"higgsfield-lite","etiqueta":"Higgsfield DoP Lite","rol":"fino","como_llegar_es":"En Higgsfield: Video → Higgsfield Lite → sube la foto → elige ese preset de cámara → pega el texto.","como_llegar_en":"In Higgsfield: Video → Higgsfield Lite → upload the photo → pick that camera preset → paste the text.","url":"https://higgsfield.ai/ai/video?model=lite"}]'::jsonb, updated_at = now()
 where tool = 'higgsfield' and updated_by is null;

update produccion.prisma_herramientas
   set modelos = (
         select jsonb_agg(case when e.m->>'id' = 'kling-3.0-turbo'
                               then jsonb_set(e.m, '{url}', '"https://higgsfield.ai/ai/video?model=kling3_0_turbo"'::jsonb)
                               else e.m end order by e.ord)
           from jsonb_array_elements(modelos) with ordinality as e(m, ord)
       ),
       updated_at = now()
 where tool = 'kling' and updated_by is null and jsonb_array_length(modelos) > 0;
