-- Greenlight 0081 — CTA con campo propio en cada plano
--
-- Antes un "Botón CTA:" pegado caía en copy_in sin su etiqueta (no se sabía cuál
-- renglón era el botón) y "CTA:" suelto ni se reconocía. Pedro 2026-10-22: el plano
-- lleva una caja CTA debajo de Copy in. Columna nueva, nullable, sin backfill: los
-- CTA viejos ya están mezclados en copy_in sin rótulo y no se pueden separar con
-- seguridad.
--
-- ADITIVA: el código viejo no lee ni escribe `cta`, así que esta migración es segura
-- de aplicar ANTES del deploy del código (y TIENE que ir antes: el código nuevo la lee).
--
-- Numeración: 0078/0079 viven en `prisma` y 0080 (sin_numero_entrega) en main, con el
-- MISMO timestamp 20261022120001 que tenía este archivo al nacer. migrate.mjs identifica
-- cada migración por el timestamp, así que con el repetido se habría marcado como
-- "ya aplicada" sin correr. Por eso 20261022120002 / 0081.

alter table produccion.planos add column if not exists cta text;

-- rpc_import_planos (0030) + cta. El cuerpo es el de 0030 (ninguna migración lo volvió a
-- definir), pero los PERMISOS no: 0056 le quitó la rutina a anon/authenticated y 0061 a
-- PUBLIC; la app la llama como service_role. Por eso al final NO se copia el `grant ... to
-- anon, authenticated` de 0030: se cierra igual que 0061/0077.
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
      (idea_id, orden, titulo, accion, copy_in, cta, sfx, gfx, edicion, dialogo)
    values (
      p_idea_id,
      v_base + v_i,
      nullif(btrim(coalesce(v_p->>'titulo',  '')), ''),
      nullif(btrim(coalesce(v_p->>'accion',  '')), ''),
      nullif(btrim(coalesce(v_p->>'copy_in', '')), ''),
      nullif(btrim(coalesce(v_p->>'cta',     '')), ''),
      nullif(btrim(coalesce(v_p->>'sfx',     '')), ''),
      nullif(btrim(coalesce(v_p->>'gfx',     '')), ''),
      nullif(btrim(coalesce(v_p->>'edicion', '')), ''),
      nullif(btrim(coalesce(v_p->>'dialogo', '')), '')
    );
  end loop;

  return v_i;  -- cuántos planos se crearon
end $$;

revoke all on function produccion.rpc_import_planos(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function produccion.rpc_import_planos(uuid, jsonb, text) to service_role;
