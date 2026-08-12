-- Greenlight 0030 — importar varios planos de un guión pegado (atómico)
--
-- El importador "Pegar guión" parsea el texto en TS (src/lib/guion.ts, puro) y
-- manda un arreglo jsonb de planos YA resueltos; este RPC los inserta en UNA
-- transacción (todo-o-nada). modo='replace' borra los planos actuales antes;
-- 'append' los agrega al final (orden = max+1…). El read_time_s lo pone el
-- trigger desde el diálogo (0002); hook_narrativo/hook_visual/es_cierre quedan
-- en su default.
--
-- Espeja rpc_crear_brief (0022): TS resuelve, el RPC sólo inserta; grants
-- explícitos (los nuevos objetos no heredan permisos). Numeración: NO existe
-- 0017 (era Notion, diferida) — timestamp nuevo, nunca se recicla 0017.

create or replace function produccion.rpc_import_planos(
  p_idea_id uuid,
  p_planos  jsonb,
  p_modo    text default 'append'
) returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  v_base int;
  v_i    int := 0;
  v_p    jsonb;
begin
  if p_modo not in ('append', 'replace') then
    raise exception 'rpc_import_planos: modo inválido (%). Usa append o replace.', p_modo;
  end if;
  if jsonb_typeof(p_planos) is distinct from 'array' or jsonb_array_length(p_planos) = 0 then
    raise exception 'rpc_import_planos: no hay planos que importar.';
  end if;

  -- 'replace' arranca de cero; 'append' continúa después del último orden.
  if p_modo = 'replace' then
    delete from produccion.planos where idea_id = p_idea_id;
    v_base := 0;
  else
    select coalesce(max(orden), 0) into v_base
      from produccion.planos where idea_id = p_idea_id;
  end if;

  for v_p in select value from jsonb_array_elements(p_planos) loop
    v_i := v_i + 1;
    -- nullif(btrim(...)) → un campo vacío o con puros espacios queda NULL, no "".
    insert into produccion.planos
      (idea_id, orden, titulo, accion, copy_in, sfx, gfx, edicion, dialogo)
    values (
      p_idea_id,
      v_base + v_i,
      nullif(btrim(coalesce(v_p->>'titulo',  '')), ''),
      nullif(btrim(coalesce(v_p->>'accion',  '')), ''),
      nullif(btrim(coalesce(v_p->>'copy_in', '')), ''),
      nullif(btrim(coalesce(v_p->>'sfx',     '')), ''),
      nullif(btrim(coalesce(v_p->>'gfx',     '')), ''),
      nullif(btrim(coalesce(v_p->>'edicion', '')), ''),
      nullif(btrim(coalesce(v_p->>'dialogo', '')), '')
    );
  end loop;

  return v_i;  -- cuántos planos se crearon
end $$;

grant execute on function produccion.rpc_import_planos(uuid, jsonb, text)
  to anon, authenticated, service_role;
