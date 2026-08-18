-- ═══════════════════════════════════════════════════════════════
-- 0031 — Duración: de un valor único a MÚLTIPLE, con fan-out a los nombres
-- ═══════════════════════════════════════════════════════════════
-- Pedro: la duración son PASTILLAS (10-15, 20-30, 40s…). Cada duración genera su
-- propio juego de entregables: los nombres se despliegan por tamaño × canal ×
-- DURACIÓN (antes sólo tamaño × canal, con una duración compartida).
--
-- SEGURO sobre los datos existentes: hoy cada idea tiene UNA sola duración, así
-- que se convierte en un arreglo de un elemento → exactamente los mismos nombres.
-- El fan-out sólo multiplica cuando alguien AGREGA una segunda pastilla (nuevo).
--
-- El fan-out al CREAR lo hace TS (combosDeTarjeta / import despliegan las
-- duraciones) y al EDITAR una acción de servidor que reconcilia los assets con
-- guardas. Se QUITA el trigger propagar_duracion: un trigger que cree/borre
-- filas de entregables es demasiado opaco y riesgoso; la reconciliación explícita
-- es probable y auditable.

-- 0a) Fuera el trigger que copiaba la duración única a todos los assets. Su
--     cláusula WHEN referencia ideas.duracion → Postgres bloquea el ALTER TYPE
--     ("cannot alter type of a column used in a trigger definition"), así que se
--     suelta ANTES de cambiar el tipo. La duración ahora vive por-asset; el
--     fan-out lo hacen las rutas de creación y la acción guardarDuraciones.
drop trigger if exists ideas_duracion_propaga on produccion.ideas;
drop function if exists produccion.propagar_duracion();

-- 0b) La vista board_tasks selecciona i.duracion → Postgres también bloquea el
--     ALTER TYPE ("cannot alter type of a column used by a view"). Hay que
--     soltarla, cambiar el tipo y recrearla idéntica. Nada más depende de
--     board_tasks (verificado), y el DROP pierde el GRANT → se re-otorga abajo.
drop view if exists produccion.board_tasks;

-- 1) ideas.duracion: text → text[] (el valor único pasa a arreglo de 1; vacío/'-'
--    → arreglo vacío). '-' es como el sheet escribe "sin duración".
alter table produccion.ideas
  alter column duracion type text[]
  using (
    case
      when duracion is null or btrim(duracion) in ('', '-') then '{}'::text[]
      else array[btrim(duracion)]
    end
  );
alter table produccion.ideas
  alter column duracion set default '{}'::text[];

-- 1b) Recrear board_tasks idéntica (0014), ahora con i.duracion = text[]. Se usa
--     create view (no "or replace") porque el tipo de la columna cambió, y se
--     re-otorga el select que el DROP se llevó.
create view produccion.board_tasks as
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

-- 2) Índice único de assets: la duración entra en la clave. duracion_code es
--    nullable (los estáticos no duran) → coalesce a '' para que dos estáticos del
--    mismo tamaño×plataforma sigan colisionando (uno solo) y los videos difieran
--    por duración. Antes: (idea, tamaño, plataforma, versión).
drop index if exists produccion.assets_unique_render;
create unique index assets_unique_render
  on produccion.assets(idea_id, tamano_code, plataforma_code, coalesce(duracion_code, ''), version);

-- 3) (El trigger propagar_duracion ya se soltó en el paso 0a, antes del ALTER.)

-- 4) reglas_para_tarea: la duración es arreglo. Una regla con cond_duracion_min_s
--    aplica si CUALQUIER duración llega al mínimo → se toma la MÁXIMA del arreglo
--    (misma semántica end-anchored de antes: "10-40s" → 40).
create or replace function produccion.reglas_para_tarea(
  p_idea_id uuid, p_texto text default null
) returns setof produccion.reglas
language sql stable security definer set search_path = '' as $$
  with t as (
    select i.plataformas, i.tipo_asset,
           produccion.tipo_group(i.tipo_asset) as grupo,
           case when produccion.tipo_group(i.tipo_asset) = 'video'
                then 'video' else 'static' end as media,
           m.slug as marca_slug,
           b.client_id,
           -- máx. de segundos entre todas las pastillas: "10-40s" → 40, "30s" → 30.
           (select max(nullif((regexp_match(coalesce(d, ''), '(\d+)\s*s?\s*$'))[1], '')::int)
              from unnest(i.duracion) d) as dur_s
      from produccion.ideas i
      join produccion.briefs b on b.id = i.brief_id
      left join produccion.marcas m on m.id = i.marca_id
     where i.id = p_idea_id
  )
  select r.* from produccion.reglas r, t
   where r.activo
     and (r.scope <> 'client' or r.client_id = t.client_id)
     and (r.cond_media      is null or r.cond_media = t.media)
     and (r.cond_tipo_group is null or r.cond_tipo_group = t.grupo)
     and (cardinality(r.cond_plataformas) = 0 or r.cond_plataformas && t.plataformas)
     and (r.cond_marca_slug is null or r.cond_marca_slug = t.marca_slug)
     and (r.cond_duracion_min_s is null or coalesce(t.dur_s, 0) >= r.cond_duracion_min_s)
     and (cardinality(r.cond_texto_contiene) = 0 or exists (
            select 1 from unnest(r.cond_texto_contiene) w
             where upper(coalesce(p_texto, '')) like '%' || w || '%'))
   order by r.sort_order;
$$;
grant execute on function produccion.reglas_para_tarea(uuid, text)
  to anon, authenticated, service_role;

-- 5) rpc_crear_brief: cada asset ya trae SU duración (v_asset->>'duracion_code'),
--    porque TS despliega tamaño × plataforma × duración en los combos. Único
--    cambio vs. 0022: el duracion_code del asset sale del combo, no del task.
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

    insert into produccion.idea_families (brief_id, letter, name)
    values (
      v_brief_id,
      coalesce(nullif(v_task->>'family_letter',''), 'X'),
      nullif(left(coalesce(v_task->>'concepto',''), 120), '')
    )
    on conflict (brief_id, letter) do update set letter = excluded.letter
    returning id into v_family_id;

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
      -- duracion ahora es text[]: llega como arreglo JSON en el payload.
      coalesce(
        (select array_agg(x) from jsonb_array_elements_text(v_task->'duracion') x),
        '{}'::text[]),
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

    for v_member in select * from jsonb_array_elements_text(coalesce(v_task->'member_ids','[]'::jsonb))
    loop
      insert into produccion.idea_assignments (idea_id, member_id)
      values (v_idea_id, v_member::uuid)
      on conflict (idea_id, member_id) do nothing;
    end loop;

    -- assets: los combos válidos (tamaño × plataforma × duración) que ya calculó
    -- TS. Cada combo trae su duracion_code (null en estáticos).
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
        case when v_kind = 'static' then null else nullif(v_asset->>'duracion_code','') end,
        nullif(v_task->>'genero_code',''),
        nullif(v_task->>'formato_code',''),
        v_idea_code,
        coalesce(v_mes, 'SINMES'),
        1,
        'todo'
      )
      on conflict (idea_id, tamano_code, plataforma_code, coalesce(duracion_code, ''), version) do nothing;
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

grant execute on function produccion.rpc_crear_brief(jsonb)
  to anon, authenticated, service_role;

-- 6) rpc_set_duraciones: editar las PASTILLAS de una tarea y reconciliar sus
--    entregables ATÓMICAMENTE (una sola transacción — reemplaza al viejo trigger
--    y a la reconciliación en JS, que borraba fila por fila con carreras).
--
--    Cada duración es su propio archivo (tamaño × plataforma × duración):
--      • agrega las filas que faltan, copiando los tokens de un hermano del mismo
--        tamaño×plataforma, y NACEN en 'todo'/versión 1 (nunca heredan el estado
--        del hermano — un entregable nuevo no está "completado");
--      • borra las filas de las duraciones quitadas, PERO sólo si están vírgenes.
--    GUARDA DURA: si una duración quitada ya tiene entrega subida o en revisión
--    (storage_path, versión > 1, o estado ≠ 'todo'), se ABORTA con error — nunca
--    se destruye trabajo ya producido ni su historial (asset_versions / comments /
--    status_events cuelgan con on delete cascade). Los estáticos no duran: sólo se
--    guarda el arreglo. NO deja la tarea sin entregables (siempre queda ≥ 1 fila).
create or replace function produccion.rpc_set_duraciones(
  p_idea_id uuid, p_duraciones text[]
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_durs text[];
  v_kind produccion.naming_kind;
  v_bad  text;
begin
  if not exists (select 1 from produccion.ideas where id = p_idea_id) then
    raise exception 'rpc_set_duraciones: la tarea no existe';
  end if;

  -- limpiar + dedupe preservando el orden de la primera aparición
  select coalesce(array_agg(d order by ord), '{}'::text[]) into v_durs
  from (
    select btrim(x) as d, min(ord) as ord
    from unnest(p_duraciones) with ordinality as t(x, ord)
    where btrim(x) <> ''
    group by btrim(x)
  ) s;

  -- ¿la idea tiene assets? y ¿de qué tipo? (todas las filas comparten naming_kind)
  select naming_kind into v_kind
  from produccion.assets where idea_id = p_idea_id limit 1;

  -- Sin assets, o estático (una imagen no dura): sólo se guarda el arreglo.
  if v_kind is null or v_kind = 'static' then
    update produccion.ideas set duracion = v_durs where id = p_idea_id;
    return;
  end if;

  -- VIDEO: reconciliar. Las duraciones objetivo son las pastillas, o {null} si no
  -- hay ninguna (un video sin duración = una fila por par, sin token).

  -- (a) GUARDA: ¿alguna duración QUITADA tiene ya trabajo producido? → abortar.
  with target_durs as (
    select d from unnest(
      case when cardinality(v_durs) = 0 then array[null]::text[] else v_durs end
    ) as d
  ),
  desired as (
    select distinct a.tamano_code, a.plataforma_code, td.d as duracion_code
    from produccion.assets a cross join target_durs td
    where a.idea_id = p_idea_id
  )
  select string_agg(distinct coalesce(a.duracion_code, '(sin duración)'), ', ')
    into v_bad
  from produccion.assets a
  where a.idea_id = p_idea_id
    and (a.storage_path is not null or a.version > 1 or a.status <> 'todo')
    and not exists (
      select 1 from desired d
      where d.tamano_code = a.tamano_code
        and d.plataforma_code = a.plataforma_code
        and coalesce(d.duracion_code, '') = coalesce(a.duracion_code, '')
    );
  if v_bad is not null then
    raise exception
      'No se pueden quitar duraciones con entregas ya subidas o en revisión: %', v_bad;
  end if;

  -- (b) INSERTAR las filas que faltan (par × duración), en 'todo'/versión 1,
  --     copiando los tokens de un hermano representativo del mismo par.
  with target_durs as (
    select d from unnest(
      case when cardinality(v_durs) = 0 then array[null]::text[] else v_durs end
    ) as d
  ),
  rep as (
    select distinct on (tamano_code, plataforma_code)
      idea_id, brief_id, track, naming_kind, naming_base, tamano_code,
      plataforma_code, genero_code, formato_code, idea_code, mes_code
    from produccion.assets
    where idea_id = p_idea_id
    order by tamano_code, plataforma_code, id
  ),
  desired as (
    select r.*, td.d as new_dur
    from rep r cross join target_durs td
  )
  insert into produccion.assets (
    idea_id, brief_id, track, naming_kind, naming_base,
    tamano_code, plataforma_code, duracion_code,
    genero_code, formato_code, idea_code, mes_code, version, status
  )
  select
    des.idea_id, des.brief_id, des.track, des.naming_kind, des.naming_base,
    des.tamano_code, des.plataforma_code, des.new_dur,
    des.genero_code, des.formato_code, des.idea_code, des.mes_code, 1, 'todo'
  from desired des
  where not exists (
    select 1 from produccion.assets a
    where a.idea_id = p_idea_id
      and a.tamano_code = des.tamano_code
      and a.plataforma_code = des.plataforma_code
      and coalesce(a.duracion_code, '') = coalesce(des.new_dur, '')
  );

  -- (c) BORRAR las filas de las duraciones quitadas. Las producidas ya se
  --     rechazaron en (a), así que aquí sólo caen filas vírgenes.
  with target_durs as (
    select d from unnest(
      case when cardinality(v_durs) = 0 then array[null]::text[] else v_durs end
    ) as d
  ),
  desired as (
    select distinct a.tamano_code, a.plataforma_code, td.d as duracion_code
    from produccion.assets a cross join target_durs td
    where a.idea_id = p_idea_id
  )
  delete from produccion.assets a
  where a.idea_id = p_idea_id
    and not exists (
      select 1 from desired d
      where d.tamano_code = a.tamano_code
        and d.plataforma_code = a.plataforma_code
        and coalesce(d.duracion_code, '') = coalesce(a.duracion_code, '')
    );

  update produccion.ideas set duracion = v_durs where id = p_idea_id;
end $$;

grant execute on function produccion.rpc_set_duraciones(uuid, text[])
  to anon, authenticated, service_role;
