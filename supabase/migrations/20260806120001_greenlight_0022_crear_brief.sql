-- Greenlight 0022 — captura de brief nuevo (crear a mano, no del sheet)
--
-- Hasta hoy sólo se podían crear tareas importando del Google Sheet
-- (sync/import.ts), que inserta fila por fila SIN transacción. Para un brief
-- capturado a mano eso dejaría un brief a medias si algo falla en la tarea 8 de
-- 12. Este RPC crea TODO (brief → familias → ideas → asignaciones → assets) en
-- UNA transacción (la de la función): todo-o-nada.
--
-- TS resuelve fuera (label→code, member_ids, marca_id, familia+variante, combos
-- válidos tamaño×plataforma) y pasa un payload limpio; el RPC sólo inserta. Los
-- nombres de archivo los sigue poniendo el trigger set_asset_filename; el code
-- de la idea (A1) lo pone set_idea_code. Ver src/lib/intake-crear.ts.
--
-- Numeración: NO existe 0017 (era Notion, diferida). Timestamp nuevo.

create or replace function produccion.rpc_crear_brief(payload jsonb)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_client_id  uuid := (payload->>'client_id')::uuid;
  v_code_base  text := coalesce(nullif(trim(payload->>'code'), ''), 'BRIEF');
  v_code       text;
  v_i          int := 1;
  v_brief_id   uuid;
  v_mes        text := nullif(trim(payload->>'mes_code'), '');
  v_track      produccion.track := nullif(payload->>'track','')::produccion.track;
  v_task       jsonb;
  v_family_id  uuid;
  v_idea_id    uuid;
  v_idea_code  text;
  v_kind       produccion.naming_kind;
  v_asset      jsonb;
  v_member     text;
  v_tasks      int := 0;
  v_assets     int := 0;
begin
  if v_client_id is null then
    raise exception 'rpc_crear_brief: falta client_id';
  end if;
  if jsonb_array_length(coalesce(payload->'tasks','[]'::jsonb)) = 0 then
    raise exception 'rpc_crear_brief: el brief no trae tareas';
  end if;

  -- code único por cliente (unique (client_id, code)). Si choca, sufija -2, -3…
  v_code := v_code_base;
  while exists (
    select 1 from produccion.briefs where client_id = v_client_id and code = v_code
  ) loop
    v_i := v_i + 1;
    v_code := v_code_base || '-' || v_i::text;
  end loop;

  insert into produccion.briefs
    (client_id, code, title, brief_name, track, brief_date, status, created_by)
  values
    (v_client_id,
     v_code,
     coalesce(nullif(trim(payload->>'title'), ''), v_code),
     nullif(trim(payload->>'brief_name'), ''),
     v_track,
     nullif(payload->>'brief_date','')::date,
     'active',
     nullif(payload->>'created_by','')::uuid)
  returning id into v_brief_id;

  for v_task in select * from jsonb_array_elements(payload->'tasks')
  loop
    v_kind := coalesce(nullif(v_task->>'naming_kind',''), 'real')::produccion.naming_kind;

    -- familia find-or-create por (brief, letra). El do update deja que RETURNING
    -- devuelva el id tanto si es nueva como si ya existía.
    insert into produccion.idea_families (brief_id, letter, name)
    values (
      v_brief_id,
      coalesce(nullif(v_task->>'family_letter',''), 'X'),
      nullif(left(coalesce(v_task->>'concepto',''), 120), '')
    )
    on conflict (brief_id, letter) do update set letter = excluded.letter
    returning id into v_family_id;

    -- la idea (code lo deriva set_idea_code de letra+variante)
    insert into produccion.ideas (
      family_id, brief_id, track, marca_id, variant_number,
      naming_base, naming_kind, genero_code, formato_code, mes_code,
      plataformas, tamanos, duracion, tipo_code, tipo_asset,
      entrega_num, entrega_final, concepto, selling_points,
      comentarios_creativo, peloteo_raw, trend, created_by
    ) values (
      v_family_id,
      v_brief_id,
      coalesce(v_track, 'real'),
      nullif(v_task->>'marca_id','')::uuid,
      coalesce((v_task->>'variant_number')::int, 1),
      nullif(v_task->>'naming_base',''),
      v_kind,
      nullif(v_task->>'genero_code',''),
      nullif(v_task->>'formato_code',''),
      v_mes,
      coalesce(
        (select array_agg(x) from jsonb_array_elements_text(v_task->'plataformas') x),
        '{}'::text[]),
      coalesce(
        (select array_agg(x) from jsonb_array_elements_text(v_task->'tamanos') x),
        '{}'::text[]),
      nullif(v_task->>'duracion',''),
      nullif(v_task->>'tipo_code',''),
      nullif(v_task->>'tipo_asset',''),
      nullif(v_task->>'entrega_num',''),
      nullif(v_task->>'entrega_final',''),
      nullif(v_task->>'concepto',''),
      coalesce(
        (select array_agg(x) from jsonb_array_elements_text(v_task->'selling_points') x),
        '{}'::text[]),
      nullif(v_task->>'comentarios_creativo',''),
      nullif(v_task->>'peloteo_raw',''),
      nullif(v_task->>'trend',''),
      nullif(payload->>'created_by','')::uuid
    )
    returning id, code into v_idea_id, v_idea_code;
    v_tasks := v_tasks + 1;

    -- asignaciones (multi-persona, sin rol) — member_id → track_members
    for v_member in select * from jsonb_array_elements_text(coalesce(v_task->'member_ids','[]'::jsonb))
    loop
      insert into produccion.idea_assignments (idea_id, member_id)
      values (v_idea_id, v_member::uuid)
      on conflict (idea_id, member_id) do nothing;
    end loop;

    -- assets: los combos válidos que ya calculó TS (WYSIWYG con el preview).
    -- El nombre lo pone el trigger; idea_code = code derivado de la idea.
    for v_asset in select * from jsonb_array_elements(coalesce(v_task->'assets','[]'::jsonb))
    loop
      insert into produccion.assets (
        idea_id, brief_id, track, naming_kind, naming_base,
        tamano_code, plataforma_code, duracion_code,
        genero_code, formato_code, idea_code, mes_code, version, status
      ) values (
        v_idea_id,
        v_brief_id,
        coalesce(v_track, 'real'),
        v_kind,
        coalesce(nullif(v_task->>'naming_base',''), 'SINNAMING'),
        v_asset->>'tamano_code',
        v_asset->>'plataforma_code',
        case when v_kind = 'static' then null else nullif(v_task->>'duracion','') end,
        nullif(v_task->>'genero_code',''),
        nullif(v_task->>'formato_code',''),
        v_idea_code,
        coalesce(v_mes, 'SINMES'),
        1,
        'todo'
      )
      on conflict (idea_id, tamano_code, plataforma_code, version) do nothing;
      v_assets := v_assets + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'brief_id', v_brief_id,
    'code', v_code,
    'created_tasks', v_tasks,
    'created_assets', v_assets
  );
end $$;

-- Grants explícitos (una tabla/función nueva no hereda; ver lección de grants).
grant execute on function produccion.rpc_crear_brief(jsonb)
  to anon, authenticated, service_role;
