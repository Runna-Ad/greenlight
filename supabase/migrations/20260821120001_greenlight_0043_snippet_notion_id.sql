-- ═══════════════════════════════════════════════════════════════
-- 0043 — notion_block_id en snippets: llave ESTABLE para el sync de legales
-- ═══════════════════════════════════════════════════════════════
-- Los legales viven en un doc de Notion (fuente de verdad, cambian con el tiempo).
-- Al sincronizar necesitamos ACTUALIZAR el mismo snippet en vez de duplicarlo. La
-- llave estable es el ID del BLOQUE de Notion (invariante por bloque, no el texto
-- del título/cuerpo que sí se reescribe). Nullable: los legales creados a mano no
-- tienen bloque de Notion.
--
-- Índice único NO parcial a propósito: Postgres trata los NULL como DISTINTOS, así
-- que un unique normal permite MUCHOS legales manuales (notion_block_id NULL) Y a la
-- vez fuerza unicidad de los valores no-null. Un índice PARCIAL (where not null)
-- rompería `on conflict (notion_block_id)` de supabase-js (no puede añadir el
-- predicado), y el upsert por bloque es justo lo que necesita el sync.
alter table produccion.snippets
  add column if not exists notion_block_id text;

create unique index if not exists snippets_notion_block_uq
  on produccion.snippets (notion_block_id);
