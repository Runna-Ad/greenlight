-- ═══════════════════════════════════════════════════════════════
-- 0014 — Lead vs Team en las asignaciones · logo de marca
-- ═══════════════════════════════════════════════════════════════
-- El wireframe de Pedro separa "LEAD ASIGNADO" de "TEAM ASIGNADO". Hoy el
-- esquema no distingue: idea_assignments.role es un enum de ESPECIALIDADES
-- (creativo/produccion/…), nullable y sin uso desde la 0008. No se mete 'lead'
-- ahí — especialidad y jerarquía son cosas distintas, y un `alter type add
-- value` obligaría a otro archivo (lección de la 0011).

-- Quién PUEDE ser lead (el pool del selector). Nadie marcado a propósito: los
-- nombres del wireframe son placeholder; el pool real lo define Pedro como
-- DATO, no como migración.
alter table produccion.track_members add column es_lead boolean not null default false;

-- Quién ES el lead DE ESTA tarea. Se reusa idea_assignments porque la
-- asignación ya vive aquí y setAssignees() ya reemplaza el conjunto entero.
alter table produccion.idea_assignments add column es_lead boolean not null default false;
create index idea_assign_lead_idx on produccion.idea_assignments(idea_id) where es_lead;

-- La banda de marca del workspace lleva el logo (clients.logo_url existía
-- desde la 0001; marcas no lo tenía).
alter table produccion.marcas add column logo_url text;

-- ─────────────────────────────────────────────────────────────
-- board_tasks: leads y team, por separado
-- ─────────────────────────────────────────────────────────────
-- SOLO columnas nuevas AL FINAL, con create or replace — jamás drop view, que
-- pierde los grants y deja el tablero en 500 (el fallo que arregló la 0006).
-- members/member_ids se CONSERVAN como el conjunto completo: los usan
-- board.tsx, my-tasks.tsx y el .contains() de /mi-trabajo.
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
  coalesce(a.team_ids, '{}'::uuid[]) as team_ids
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
) a on true;

grant select on produccion.board_tasks to anon, authenticated, service_role;
