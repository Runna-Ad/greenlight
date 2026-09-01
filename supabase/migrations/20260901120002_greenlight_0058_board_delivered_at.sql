-- ─────────────────────────────────────────────────────────────
-- 0058 — board_tasks expone `delivered_at`
--
-- POR QUÉ: un BRIEF pasa a "Greenlit" cuando TODAS sus tareas vivas están entregadas,
-- y a partir de ahí se queda 7 días a la vista antes de vivir sólo en Entregas — la
-- misma regla que ya siguen las tareas en el tablero (Pedro 2026-09-01). Para calcular
-- ese "greenlit" y su fecha hace falta el `delivered_at` de cada tarea, y la vista no
-- lo exponía: el tablero se lo traía en una consulta APARTE sólo para las delivered.
--
-- Es exponer un dato que YA existe en `ideas`, no guardar estado nuevo: el greenlit del
-- brief se DERIVA de sus tareas, así que si alguien reabre una entregada, el brief
-- vuelve solo a la lista. Nada que backfillear, nada que se pueda desincronizar.
--
-- `create or replace view` con la columna AÑADIDA AL FINAL (mismo tipo y orden en las
-- demás), igual que hizo la 0032 con marca_logo_url. Idéntica a la 0057 + delivered_at.
-- ─────────────────────────────────────────────────────────────
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
  m.logo_url as marca_logo_url,
  i.delivered_at
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

-- Sin re-conceder a anon/authenticated (la 0056 les revocó `produccion`; el test
-- "Candado RLS 0056" vigila que no se reabra).
grant select on produccion.board_tasks to service_role;
