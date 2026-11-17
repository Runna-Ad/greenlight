-- 0099 — Revisor del cliente por tarea (Pedro, 2026-11-17)
--
-- Cada tarea puede tener UN revisor del lado del cliente: un usuario del portal de esa
-- empresa (profiles.role = 'client'). No es obligatorio; sin revisor todo funciona igual.
-- Quién puede ponerlo y cuándo vive en la server action (src/lib/revisor-cliente.ts):
-- el cliente desde que la pieza aparece en su portal; admin/master en «Con Cliente» o
-- «En cambios». El revisor se queda entre rondas: nada lo limpia al cambiar de estado.
--
-- No va en idea_assignments: esa tabla apunta a track_members (sólo equipo) y
-- rpc_set_assignees borra lo que no está en el set del equipo.
--
-- Validez al LEER: el revisor cuenta sólo si su perfil sigue activo, es cliente y es de la
-- empresa de la tarea. La columna no se limpia sola (salvo al borrar el perfil).

alter table produccion.ideas
  add column if not exists revisor_cliente_id  uuid null references produccion.profiles(id) on delete set null,
  add column if not exists revisor_cliente_por uuid null references produccion.profiles(id) on delete set null,
  add column if not exists revisor_cliente_at  timestamptz null;

create index if not exists ideas_revisor_cliente_idx
  on produccion.ideas (revisor_cliente_id)
  where revisor_cliente_id is not null;

-- Live refresh: copiada de la versión EN VIVO (pg_get_functiondef, 2026-11-17, = 0077) y sólo
-- se suma revisor_cliente_id, para que el tablero y el portal se enteren sin recargar.
create or replace function produccion.live_ideas_stmt()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_n       int := 0;
  v_clients uuid[];
  v_ids     uuid[];
begin
  if tg_op = 'INSERT' then
    select count(*), array_agg(distinct produccion.live_client_de(n.brief_id, n.marca_id)), array_agg(n.id)
      into v_n, v_clients, v_ids
      from nuevos n;
  elsif tg_op = 'DELETE' then
    select count(*), array_agg(distinct produccion.live_client_de(v.brief_id, v.marca_id)), array_agg(v.id)
      into v_n, v_clients, v_ids
      from viejos v;
  else
    select count(*), array_agg(distinct produccion.live_client_de(n.brief_id, n.marca_id)), array_agg(n.id)
      into v_n, v_clients, v_ids
      from nuevos n join viejos v on v.id = n.id
     where n.status       is distinct from v.status
        or n.deleted_at   is distinct from v.deleted_at
        or n.published_at is distinct from v.published_at
        or n.delivered_at is distinct from v.delivered_at
        or n.cambios_cliente_en_lead is distinct from v.cambios_cliente_en_lead -- 0077
        or n.revisor_cliente_id is distinct from v.revisor_cliente_id;          -- 0099
  end if;

  if coalesce(v_n, 0) > 0 then
    perform produccion.live_emit(lower(tg_op), 'ideas', v_clients, v_ids);
  end if;
  return null;
end $function$;

revoke execute on function produccion.live_ideas_stmt() from public, anon, authenticated;
