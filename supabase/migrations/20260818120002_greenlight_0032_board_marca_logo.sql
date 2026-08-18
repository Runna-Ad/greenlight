-- ═══════════════════════════════════════════════════════════════
-- 0032 — board_tasks expone el logo de la marca (para los cards del tablero)
-- ═══════════════════════════════════════════════════════════════
-- Los cards del tablero muestran la MARCA (Card / Préstamos) en vez del código
-- A2/B1; con su logo chiquito al lado si lo tiene. La vista ya hace join con
-- marcas (m), así que sólo se AGREGA la columna m.logo_url al final del select.
--
-- create or replace: se permite porque sólo se AÑADE una columna al final (no se
-- cambia el tipo ni el orden de las existentes). Idéntica a 0031 + marca_logo_url.
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
) a on true;
grant select on produccion.board_tasks to anon, authenticated, service_role;
