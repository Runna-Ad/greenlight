-- ─────────────────────────────────────────────────────────────
-- 0057 — PAPELERA de 30 días: borrar deja de ser irreversible.
--
-- ANTES: `eliminarTarea`/`eliminarBrief` hacían DELETE duro. Los FK con ON DELETE
-- CASCADE se llevaban por delante planos, estáticos, assets, asignaciones,
-- comentarios, referencias, snippets, autoría, historial de estados y bitácora —
-- y borrar un BRIEF se llevaba además TODAS sus tareas. Sin deshacer, sin copia.
-- Un clic de más y el trabajo de una semana se iba para siempre.
--
-- AHORA: borrar SELLA (`deleted_at`), no destruye. El Master Builder puede
-- restaurar durante 30 días desde la Papelera. Pasados los 30 días el borrado
-- duro ocurre de forma perezosa (al abrir la Papelera o al vaciarla a mano) — sin
-- cron: nada que agendar, nada que se caiga en silencio. (Pedro, 2026-09-01)
--
-- POR QUÉ SÓLO ideas Y briefs (y no sus hijos): los hijos SIEMPRE se consultan a
-- través de su padre (`where idea_id = …` / `where brief_id = …`), así que al
-- filtrar el padre quedan inalcanzables solos. Marcarlos también obligaría a
-- filtrar en decenas de queries más — la clase de bug "la misma regla en N
-- lugares" que cazó la barrida de invariantes. Un solo sello, en la raíz.
--
-- El árbol COMPLETO viaja junto (Pedro): borrar un brief sella el brief Y sus
-- tareas; restaurarlo devuelve todo tal cual estaba.
-- ─────────────────────────────────────────────────────────────

alter table produccion.ideas
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references produccion.profiles(id) on delete set null;

alter table produccion.briefs
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references produccion.profiles(id) on delete set null;

-- Índices PARCIALES: sólo indexan lo borrado (poquísimas filas), que es justo lo
-- que la Papelera consulta. La ruta caliente (`deleted_at is null`) no paga nada.
create index if not exists ideas_deleted_idx  on produccion.ideas  (deleted_at) where deleted_at is not null;
create index if not exists briefs_deleted_idx on produccion.briefs (deleted_at) where deleted_at is not null;

-- ── board_tasks: la vista que alimenta tablero, bundles y Mi Trabajo ──────────
-- Filtrar AQUÍ es el punto de apalancamiento: una sola línea saca lo borrado de
-- todas las superficies que leen la vista, sin tocar cada loader. Idéntica a la
-- 0032 + el filtro (create or replace exige mismas columnas, mismo orden).
-- Se excluye por partida doble (tarea sellada O brief sellado) por si algún día
-- se sella un brief sin sellar sus tareas.
create or replace view produccion.board_tasks as
select
  i.id, i.brief_id, i.code, i.status, i.track, i.naming_base, i.concepto,
  i.tipo_asset, i.formato_code, i.duracion, i.tamanos, i.plataformas,
  i.marca_id, m.name as marca, i.pod_id, i.created_at,
  b.client_id, b.title as brief_title, b.source_tab as brief_tab,
  coalesce(f.n, 0) as file_count,
  coalesce(a.members, '[]'::jsonb) as members,
  coalesce(a.member_ids, '{}'::uuid[]) as member_ids,
  c.slug as client_slug,
  i.trend, i.notas,
  coalesce(a.leads,    '[]'::jsonb)  as leads,
  coalesce(a.team,     '[]'::jsonb)  as team,
  coalesce(a.lead_ids, '{}'::uuid[]) as lead_ids,
  coalesce(a.team_ids, '{}'::uuid[]) as team_ids,
  m.logo_url as marca_logo_url
from produccion.ideas i
join produccion.briefs b on b.id = i.brief_id
join produccion.clients c on c.id = b.client_id
left join produccion.marcas m on m.id = i.marca_id
left join lateral (
  select count(*)::int as n from produccion.assets x where x.idea_id = i.id
) f on true
left join lateral (
  select jsonb_agg(
           jsonb_build_object('id', tm.id, 'name', tm.name, 'color', tm.color)
           order by tm.sort_order
         ) as members,
         array_agg(tm.id) as member_ids,
         jsonb_agg(
           jsonb_build_object('id', tm.id, 'name', tm.name, 'color', tm.color)
           order by tm.sort_order
         ) filter (where ia.es_lead) as leads,
         jsonb_agg(
           jsonb_build_object('id', tm.id, 'name', tm.name, 'color', tm.color)
           order by tm.sort_order
         ) filter (where not ia.es_lead) as team,
         array_agg(tm.id) filter (where ia.es_lead)     as lead_ids,
         array_agg(tm.id) filter (where not ia.es_lead) as team_ids
    from produccion.idea_assignments ia
    join produccion.track_members tm on tm.id = ia.member_id
   where ia.idea_id = i.id
) a on true
where i.deleted_at is null
  and b.deleted_at is null;

-- OJO: NO se re-concede a anon/authenticated. La 0056 les revocó `produccion`
-- entero (la anon key es pública); `create or replace view` conserva los permisos
-- vigentes, así que sólo se reafirma service_role. El test "Candado RLS 0056"
-- vigila que esto no se reabra.
grant select on produccion.board_tasks to service_role;
