-- ═══════════════════════════════════════════════════════════════
-- 0013 — TREND y NOTAS editables · la Duración manda sobre el nombre
-- ═══════════════════════════════════════════════════════════════
-- Pedro: "si trends y notas como campos editables, también el de duración […]
-- solamente deja el campo de duración editable y cuando lo muevan que se ajuste
-- el nombre también".
--
-- TREND y NOTAS son las dos cajas libres de la cabecera del deck. Existían en el
-- slide y no tenían dónde guardarse: se llenaban a mano y se perdían.

alter table produccion.ideas add column trend text;
alter table produccion.ideas add column notas text;

-- ─────────────────────────────────────────────────────────────
-- La Duración deja de ser sólo de lectura — y arrastra los nombres
-- ─────────────────────────────────────────────────────────────
-- assets.duracion_code es una COPIA que se hizo al crear el archivo ("copied
-- from idea at creation for filename stability", 0001). Sin esto, cambiar la
-- Duración dejaría los 12 nombres de la tarea diciendo la duración vieja — y
-- el nombre es justo lo que el equipo copia literal al entregar.
--
-- Va en TRIGGER y no en la acción del servidor, por la misma razón por la que
-- rpc_move_task es la única puerta del estado: si la copia se sincronizara desde
-- TypeScript, cualquier otro camino que toque ideas.duracion (el import, un fix
-- a mano, una RPC futura) dejaría los archivos desfasados en silencio.
--
-- '-' es como el sheet escribe "sin duración" (misma convención que
-- parseDuracion en src/lib/plantilla.ts). Guardarlo tal cual metería un token
-- "-" al nombre, así que se normaliza a null aquí también.
create or replace function produccion.propagar_duracion()
returns trigger language plpgsql as $$
declare
  v_dur text := nullif(nullif(trim(coalesce(new.duracion, '')), ''), '-');
begin
  update produccion.assets a
     set duracion_code = case when a.naming_kind = 'static' then null else v_dur end
   where a.idea_id = new.id
     and a.duracion_code is distinct from
         (case when a.naming_kind = 'static' then null else v_dur end);

  -- Cambiar la duración cambia el entregable. Queda en el historial con el
  -- antes y el después, no sólo el valor final.
  insert into produccion.activity_log (entity_type, entity_id, actor_id, verb, payload)
  values ('idea', new.id, produccion.current_profile_id(), 'duracion_cambiada',
          jsonb_build_object('antes', old.duracion, 'despues', new.duracion));

  return null;
end $$;

create trigger ideas_duracion_propaga
  after update of duracion on produccion.ideas
  for each row when (old.duracion is distinct from new.duracion)
  execute function produccion.propagar_duracion();

-- ─────────────────────────────────────────────────────────────
-- board_tasks: el tablero también enseña la duración editada
-- ─────────────────────────────────────────────────────────────
-- create or replace (columnas nuevas AL FINAL) a propósito: un drop view pierde
-- los grants y deja el tablero en 500 — el fallo que arregló la 0006.
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
  i.trend, i.notas
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
         array_agg(tm.id) as member_ids
    from produccion.idea_assignments ia
    join produccion.track_members tm on tm.id = ia.member_id
   where ia.idea_id = i.id
) a on true;

grant select on produccion.board_tasks to anon, authenticated, service_role;
