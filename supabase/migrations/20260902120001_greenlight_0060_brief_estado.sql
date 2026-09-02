-- ─────────────────────────────────────────────────────────────
-- 0060 — brief_estado: qué briefs siguen "en curso", calculado en la BD
--
-- POR QUÉ: la lista de briefs (/briefs) decide qué briefs enseñar con la regla
-- "sigue con trabajo, o se entregó hace ≤7 días" (Pedro 2026-09-01). Para
-- decidirlo la app se traía TODOS los board_tasks del cliente y filtraba en JS.
-- Eso crece con el histórico y PostgREST corta en silencio al tope de filas: el
-- día que un cliente pase de ~1000 tareas, las tareas NO entregadas de un brief
-- pueden quedar fuera del corte y el brief PARECER terminado (desaparece de la
-- lista). Un `.limit()` no lo arregla — lo agrava. Hace falta contar en SQL.
--
-- QUÉ ES: una vista (se calcula al leer; no envejece, no necesita writer ni cron —
-- un rollup materializado sí lo necesitaría). Una fila por brief VIVO con:
--   n_tareas      tareas vivas (fuera de la papelera)
--   n_pendientes  las que aún NO están entregadas
--   greenlit_at   fecha de la ÚLTIMA entrega cuando TODAS están entregadas (≥1
--                 tarea) — la MISMA definición que greenlitDeBundle() en
--                 src/lib/bundle.ts (contract test en scripts/test-db.mjs).
-- Con eso la app pide primero qué briefs siguen en curso (filas = nº de briefs,
-- pequeño) y luego SÓLO las tareas de esos briefs: el working set, igual que
-- cargarWorkload/cargarEvaluacion. board_tasks no cambia.
--
-- "Entregada" = status 'delivered' CON delivered_at (el trigger lo pone al pasar
-- a delivered; una fila con status delivered y fecha null sería anómala y cuenta
-- como pendiente, igual que en JS — mejor enseñar de más que ocultar trabajo).
-- ─────────────────────────────────────────────────────────────
create or replace view produccion.brief_estado as
select
  b.id                                   as brief_id,
  b.client_id,
  c.slug                                 as client_slug,
  count(i.id)::int                       as n_tareas,
  count(i.id) filter (
    where i.status <> 'delivered' or i.delivered_at is null
  )::int                                 as n_pendientes,
  case
    when count(i.id) > 0
     and count(i.id) filter (where i.status <> 'delivered' or i.delivered_at is null) = 0
    then max(i.delivered_at)
  end                                    as greenlit_at
from produccion.briefs b
join produccion.clients c on c.id = b.client_id
left join produccion.ideas i on i.brief_id = b.id and i.deleted_at is null
where b.deleted_at is null
group by b.id, b.client_id, c.slug;

-- Sin re-conceder a anon/authenticated (la 0056 les revocó `produccion`; el test
-- "Candado RLS 0056" vigila que no se reabra).
grant select on produccion.brief_estado to service_role;
