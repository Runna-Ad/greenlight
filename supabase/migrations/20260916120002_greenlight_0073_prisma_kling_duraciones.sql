-- ═══════════════════════════════════════════════════════════════
-- 0073 — HÜE Prisma · Kling 3.0 acepta de 3 a 15 s (sólo datos)
-- ═══════════════════════════════════════════════════════════════
-- En Higgsfield, Kling 3.0 genera cualquier duración de 3 a 15 s (Help Center "How do I use Kling?").
-- Pedro (2026-09-16): "change kling durations to 3-15 in the hub". Las constantes del código (tools.ts)
-- ya lo dicen; esto pone al día la fila viva de 0071 SÓLO si nadie la editó a mano (`updated_by is null`),
-- igual que 0072. 5 s sigue primero (el default). Sin cambios de esquema.
update produccion.prisma_herramientas
   set limites = jsonb_set(limites, '{duraciones}', '[5,3,4,6,7,8,9,10,11,12,13,14,15]'::jsonb), updated_at = now()
 where tool = 'kling' and updated_by is null;
