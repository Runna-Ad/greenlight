-- 0093 — Mover planos y agregar uno debajo de otro (pedido del equipo, 2026-11-05).
--
-- El equipo parte un plano en dos: necesita un plano NUEVO justo debajo del que parte,
-- y poder subir/bajar cualquier plano. `planos` tiene `unique (idea_id, orden)` NO
-- diferible, así que un `orden = orden + 1` en bloque choca fila por fila. Cada cambio
-- se hace en DOS pasos dentro de una sola función (una transacción): primero a negativos
-- (nunca chocan con los positivos), luego al número final.
--
-- Las dos funciones renumeran antes los planos de la tarea a 1..n por su orden actual:
-- después de borrar uno quedaban huecos (1, 2, 4) y el encabezado decía "Plano 4" en el
-- tercero. Sólo cambia `orden`; el texto, las correcciones y las referencias van por id.
--
-- Sólo las llama la app (service_role), igual que rpc_import_planos (0056/0061).

create or replace function produccion._planos_renumerar(p_idea_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  -- Paso 1: todos a negativo según su posición (1..n → -1..-n).
  update produccion.planos p
     set orden = -r.pos
    from (select id, row_number() over (order by orden, created_at, id) as pos
            from produccion.planos where idea_id = p_idea_id) r
   where p.id = r.id;
  -- Paso 2: de vuelta a positivo.
  update produccion.planos set orden = -orden where idea_id = p_idea_id and orden < 0;
end $$;

revoke all on function produccion._planos_renumerar(uuid) from public, anon, authenticated;
grant execute on function produccion._planos_renumerar(uuid) to service_role;

-- Sube (p_dir = -1) o baja (p_dir = 1) un plano un lugar. En la orilla no hace nada.
-- Devuelve la idea, para que la app recargue la lista.
create or replace function produccion.rpc_plano_mover(p_plano_id uuid, p_dir int)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_idea  uuid;
  v_orden int;
  v_otro  uuid;
begin
  if p_dir not in (-1, 1) then
    raise exception 'rpc_plano_mover: dirección inválida (%). Usa -1 o 1.', p_dir;
  end if;
  select idea_id into v_idea from produccion.planos where id = p_plano_id;
  if v_idea is null then
    raise exception 'rpc_plano_mover: el plano ya no existe.';
  end if;
  -- Candado: dos clics seguidos (o dos personas) no se cruzan a medias.
  perform 1 from produccion.planos where idea_id = v_idea for update;
  perform produccion._planos_renumerar(v_idea);

  select orden into v_orden from produccion.planos where id = p_plano_id;
  select id into v_otro from produccion.planos where idea_id = v_idea and orden = v_orden + p_dir;
  if v_otro is null then
    return v_idea; -- ya está hasta arriba / hasta abajo
  end if;

  update produccion.planos set orden = -1 where id = p_plano_id;
  update produccion.planos set orden = v_orden where id = v_otro;
  update produccion.planos set orden = v_orden + p_dir where id = p_plano_id;
  return v_idea;
end $$;

revoke all on function produccion.rpc_plano_mover(uuid, int) from public, anon, authenticated;
grant execute on function produccion.rpc_plano_mover(uuid, int) to service_role;

-- Crea un plano vacío justo DEBAJO de p_plano_id; los de abajo bajan un lugar.
-- Devuelve el id del plano nuevo.
create or replace function produccion.rpc_plano_insertar_debajo(p_plano_id uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_idea  uuid;
  v_orden int;
  v_nuevo uuid;
begin
  select idea_id into v_idea from produccion.planos where id = p_plano_id;
  if v_idea is null then
    raise exception 'rpc_plano_insertar_debajo: el plano ya no existe.';
  end if;
  perform 1 from produccion.planos where idea_id = v_idea for update;
  perform produccion._planos_renumerar(v_idea);

  select orden into v_orden from produccion.planos where id = p_plano_id;
  -- Los de abajo, +1 en dos pasos (negativo y de vuelta).
  update produccion.planos set orden = -(orden + 1) where idea_id = v_idea and orden > v_orden;
  update produccion.planos set orden = -orden where idea_id = v_idea and orden < 0;

  insert into produccion.planos (idea_id, orden) values (v_idea, v_orden + 1)
  returning id into v_nuevo;
  return v_nuevo;
end $$;

revoke all on function produccion.rpc_plano_insertar_debajo(uuid) from public, anon, authenticated;
grant execute on function produccion.rpc_plano_insertar_debajo(uuid) to service_role;
