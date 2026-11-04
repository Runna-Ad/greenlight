-- ══════════════════════════════════════════════════════════════════════════════
-- 0091 — Admin › Actividad: quién hizo qué, por persona y por proyecto
-- ══════════════════════════════════════════════════════════════════════════════
-- Se LEE lo que la app ya registra (status_events, comments, correccion_respuestas, prisma_*). Sólo se agrega
-- `prisma_actividad` para lo que hoy no queda en ningún lado (PSD abierto, descargas, errores del navegador…) y
-- origen (archivo + cliente) en el gasto de Gemini. El tiempo trabajado NO se mide.
-- Honestidad con los NULL: una llamada sin costo reportado se cuenta aparte y nunca como US$0.
-- Aditivo; sólo `produccion`. Los resúmenes corren por service_role; pantalla y acción exigen canAdmin.

-- ── 1) Lo que hace el navegador en Formatos y nada más registra ─────────────────
create table produccion.prisma_actividad (
  id         bigint generated always as identity primary key,
  member_id  uuid references produccion.track_members(id) on delete set null,
  accion     text not null check (accion in ('psd_abierto', 'descarga_zip', 'descarga_png', 'descarga_psd', 'edicion', 'error', 'trabajo_recuperado', 'trabajo_borrado')),
  archivo    text check (char_length(archivo) <= 200),
  client_id  uuid references produccion.clients(id) on delete set null,
  detalle    text check (char_length(detalle) <= 300),
  created_at timestamptz not null default now()
);
create index prisma_actividad_created_at on produccion.prisma_actividad (created_at);
create index prisma_actividad_member_id  on produccion.prisma_actividad (member_id);

alter table produccion.prisma_actividad enable row level security;
create policy prisma_actividad_admin on produccion.prisma_actividad for select using (produccion.auth_role() in ('master', 'admin'));
-- Una bitácora sólo crece: los privilegios por defecto de 0056 le darían también update y delete a service_role.
revoke all on produccion.prisma_actividad from service_role;
grant select, insert on produccion.prisma_actividad to service_role;

-- ── 2) El gasto de Gemini sabe de qué archivo y cliente vino, y ampliar ≠ rellenar ──
alter table produccion.prisma_gemini_gastos
  add column archivo   text check (char_length(archivo) <= 200),
  add column client_id uuid references produccion.clients(id) on delete set null;
alter table produccion.prisma_gemini_gastos drop constraint prisma_gemini_gastos_ruta_check;
alter table produccion.prisma_gemini_gastos add constraint prisma_gemini_gastos_ruta_check
  check (ruta in ('tamano', 'copia', 'fondo_plano', 'leer', 'fondo_ampliar', 'rellenar_hueco'));

-- ── 3) UNA sola lista de eventos: los tres resúmenes salen de aquí y no pueden discrepar ──
-- Fechas (incluyentes) en hora de México, como 0088. Persona: el miembro; si sólo hay perfil, el miembro ligado a ese
-- perfil; si no, el perfil (un cliente del portal). Miembro borrado (null) = «Sin persona», y su gasto sigue contando.
-- `ronda` identifica una ronda de cambios (tarea + número) para contar rondas distintas, no renglones.
create function produccion.prisma_actividad_eventos(p_desde date, p_hasta date)
returns table (
  fila_id text, tipo text,
  persona_id uuid, persona text, color text,
  client_id uuid, cliente text,
  tipo_elemento text, elemento text,
  ronda text, usd numeric, ruta text, de text, a text, override boolean, detalle text,
  created_at timestamptz
)
language sql stable set search_path = '' as $$
  with w as (
    select (p_desde::timestamp) at time zone 'America/Mexico_City' as ini,
           ((p_hasta + 1)::timestamp) at time zone 'America/Mexico_City' as fin
  ),
  -- La tarea y la ronda de cada cambio, una vez: una petición puede colgar de la tarea, de una pieza o del brief.
  cambios as (
    select c.id, c.kind, c.author_member_id, c.author_id, c.resolved_member_id, c.resolved_by, c.resolved_at, c.created_at,
           b.client_id,
           b.code || coalesce(' · ' || coalesce(i.code, i.naming_base), '') as tarea,
           coalesce(c.idea_id, a.idea_id, c.brief_id)::text || ':' || coalesce(c.ronda, 1)::text as ronda
    from produccion.comments c
    left join produccion.assets a on a.id = c.asset_id
    left join produccion.ideas i on i.id = coalesce(c.idea_id, a.idea_id)
    left join produccion.briefs b on b.id = coalesce(c.brief_id, i.brief_id)
    where c.kind in ('correction_request', 'client_change')
  ),
  crudos as (
    -- Greenlight
    select 'movimiento:' || se.id::text as fila_id, 'movimiento' as tipo, se.actor_member_id as member_id, se.actor_id as profile_id,
           b.client_id, 'tarea' as tipo_elemento, b.code || coalesce(' · ' || coalesce(i.code, i.naming_base), '') as elemento,
           null::text as ronda, null::numeric as usd, null::text as ruta,
           se.from_status::text as de, se.to_status::text as a, se.override, null::text as detalle, se.created_at
    from produccion.status_events se
    left join produccion.assets ast on ast.id = se.asset_id
    join produccion.ideas i on i.id = coalesce(se.idea_id, ast.idea_id)
    join produccion.briefs b on b.id = i.brief_id
    cross join w where se.created_at >= w.ini and se.created_at < w.fin
    union all
    select 'cambio_pedido:' || c.id::text, 'cambio_pedido', c.author_member_id, c.author_id, c.client_id, 'tarea', c.tarea,
           c.ronda, null, null, null, null, false, null, c.created_at
    from cambios c cross join w where c.created_at >= w.ini and c.created_at < w.fin
    union all
    select 'cambio_resuelto:' || c.id::text, 'cambio_resuelto', c.resolved_member_id, c.resolved_by, c.client_id, 'tarea', c.tarea,
           c.ronda, null, null, null, null, false, null, c.resolved_at
    from cambios c cross join w
    where c.resolved_at >= w.ini and c.resolved_at < w.fin and (c.resolved_member_id is not null or c.resolved_by is not null)
    union all
    select 'respuesta:' || r.id::text, 'respuesta', r.author_member_id, r.author_id, c.client_id, 'tarea', c.tarea,
           c.ronda, null, null, null, null, false, null, r.created_at
    from produccion.correccion_respuestas r
    join cambios c on c.id = r.comment_id
    cross join w where r.created_at >= w.ini and r.created_at < w.fin
    -- HÜE Prisma. Una variante o una corrección nacen como spec hermano: eso no es un prompt nuevo (origen_spec_id, correccion_de).
    union all
    select 'prompt:' || s.id::text, 'prompt', s.created_by, null, s.client_id, null, null,
           null, null, null, null, null, false, null, s.created_at
    from produccion.prisma_specs s cross join w
    where s.created_at >= w.ini and s.created_at < w.fin and s.origen_spec_id is null and s.correccion_de is null
    union all
    select 'evento:' || e.id::text, e.tipo, e.user_id, null, e.client_id, null, null,
           null, null, null, null, null, false, null, e.created_at
    from produccion.prisma_eventos e cross join w
    where e.created_at >= w.ini and e.created_at < w.fin and e.tipo in ('variante', 'refinado')
    union all
    select 'resultado:' || r.id::text, 'resultado', r.created_by, null, r.client_id, null, null,
           null, null, null, null, null, false, null, r.created_at
    from produccion.prisma_resultados r cross join w where r.created_at >= w.ini and r.created_at < w.fin
    -- Formatos: «subiendo» es un anuncio que todavía no llegó, no un trabajo.
    union all
    select 'lote:' || l.id::text, 'lote', l.created_by, null, l.client_id, 'archivo', l.nombre,
           null, null, null, null, null, false, null, l.created_at
    from produccion.prisma_formatos_lotes l cross join w
    where l.created_at >= w.ini and l.created_at < w.fin and l.estado = 'listo'
    union all
    select 'salida:' || s.id::text, 'error', l.created_by, null, l.client_id, 'archivo', l.nombre,
           null, null, null, null, null, false, s.error, s.updated_at
    from produccion.prisma_formatos_salidas s
    join produccion.prisma_formatos_lotes l on l.id = s.lote_id
    cross join w where s.updated_at >= w.ini and s.updated_at < w.fin and s.estado = 'error' and s.error is not null
    union all
    select 'actividad:' || x.id::text, x.accion, x.member_id, null, x.client_id,
           case when x.archivo is null then null else 'archivo' end, x.archivo,
           null, null, null, null, null, false, x.detalle, x.created_at
    from produccion.prisma_actividad x cross join w where x.created_at >= w.ini and x.created_at < w.fin
    -- IA. `usd` null se queda null: «sin costo reportado», jamás 0.
    union all
    select 'ia:' || g.id::text, 'ia', g.member_id, null, g.client_id,
           case when g.archivo is null then null else 'archivo' end, g.archivo,
           null, g.usd, g.ruta, null, null, false, null, g.created_at
    from produccion.prisma_gemini_gastos g cross join w where g.created_at >= w.ini and g.created_at < w.fin
  )
  select e.fila_id, e.tipo,
         coalesce(tm.id, e.profile_id), coalesce(tm.name, p.full_name, 'Sin persona'), tm.color,
         e.client_id, coalesce(cl.name, 'Sin cliente'),
         e.tipo_elemento, e.elemento,
         e.ronda, e.usd, e.ruta, e.de, e.a, e.override, e.detalle, e.created_at
  from crudos e
  left join lateral (
    select v.id from produccion.track_members v
    where v.id = e.member_id or (e.member_id is null and v.profile_id = e.profile_id)
    order by (v.id = e.member_id) desc nulls last, v.active desc, v.id limit 1
  ) enlace on true
  left join produccion.track_members tm on tm.id = enlace.id
  left join produccion.profiles p on p.id = e.profile_id
  left join produccion.clients cl on cl.id = e.client_id;
$$;

-- ── 4) Por persona (con una fila de total: las rondas distintas no se pueden sumar en la app) ──
create function produccion.prisma_actividad_personas(p_desde date, p_hasta date)
returns table (
  es_total boolean, persona_id uuid, persona text, color text,
  movimientos int, cambios int, rondas int, respuestas int,
  prompts int, variantes int, resultados int, lotes int, psd_abiertos int, descargas int, ediciones int,
  ia_llamadas int, ia_usd numeric, ia_sin_costo int, errores int, ultima timestamptz
)
language sql stable set search_path = '' as $$
  select grouping(e.persona) = 1, e.persona_id, e.persona, e.color,
    (count(*) filter (where e.tipo = 'movimiento'))::int,
    (count(*) filter (where e.tipo = 'cambio_pedido'))::int,
    (count(distinct e.ronda))::int,
    (count(*) filter (where e.tipo = 'respuesta'))::int,
    (count(*) filter (where e.tipo = 'prompt'))::int,
    (count(*) filter (where e.tipo in ('variante', 'refinado')))::int,
    (count(*) filter (where e.tipo = 'resultado'))::int,
    (count(*) filter (where e.tipo = 'lote'))::int,
    (count(*) filter (where e.tipo = 'psd_abierto'))::int,
    (count(*) filter (where e.tipo in ('descarga_zip', 'descarga_png', 'descarga_psd')))::int,
    (count(*) filter (where e.tipo = 'edicion'))::int,
    (count(*) filter (where e.tipo = 'ia'))::int,
    sum(e.usd),
    (count(*) filter (where e.tipo = 'ia' and e.usd is null))::int,
    (count(*) filter (where e.tipo = 'error'))::int,
    max(e.created_at)
  from produccion.prisma_actividad_eventos(p_desde, p_hasta) e
  group by grouping sets ((e.persona_id, e.persona, e.color), ())
  having count(*) > 0
  order by grouping(e.persona) desc, (e.persona_id is null), max(e.created_at) desc;
$$;

-- ── 5) Por proyecto: cliente → archivo PSD o tarea. nivel: 'total' | 'cliente' | 'elemento' ──
create function produccion.prisma_actividad_proyectos(p_desde date, p_hasta date)
returns table (
  nivel text, client_id uuid, cliente text, tipo_elemento text, elemento text,
  movimientos int, cambios int, rondas int, respuestas int,
  prompts int, variantes int, resultados int, lotes int, psd_abiertos int, descargas int, ediciones int,
  ia_llamadas int, ia_usd numeric, ia_sin_costo int, errores int, ultima timestamptz
)
language sql stable set search_path = '' as $$
  select case when grouping(e.cliente) = 1 then 'total' when grouping(e.elemento) = 1 then 'cliente' else 'elemento' end,
    e.client_id, e.cliente, e.tipo_elemento, e.elemento,
    (count(*) filter (where e.tipo = 'movimiento'))::int,
    (count(*) filter (where e.tipo = 'cambio_pedido'))::int,
    (count(distinct e.ronda))::int,
    (count(*) filter (where e.tipo = 'respuesta'))::int,
    (count(*) filter (where e.tipo = 'prompt'))::int,
    (count(*) filter (where e.tipo in ('variante', 'refinado')))::int,
    (count(*) filter (where e.tipo = 'resultado'))::int,
    (count(*) filter (where e.tipo = 'lote'))::int,
    (count(*) filter (where e.tipo = 'psd_abierto'))::int,
    (count(*) filter (where e.tipo in ('descarga_zip', 'descarga_png', 'descarga_psd')))::int,
    (count(*) filter (where e.tipo = 'edicion'))::int,
    (count(*) filter (where e.tipo = 'ia'))::int,
    sum(e.usd),
    (count(*) filter (where e.tipo = 'ia' and e.usd is null))::int,
    (count(*) filter (where e.tipo = 'error'))::int,
    max(e.created_at)
  from produccion.prisma_actividad_eventos(p_desde, p_hasta) e
  group by grouping sets ((e.client_id, e.cliente, e.tipo_elemento, e.elemento), (e.client_id, e.cliente), ())
  having count(*) > 0
  order by grouping(e.cliente) desc, (e.client_id is null), e.cliente, grouping(e.elemento) desc, max(e.created_at) desc;
$$;

-- ── 6) Línea de tiempo: lo último primero, con tope de 200 aunque pidan más ──
create function produccion.prisma_actividad_linea(p_desde date, p_hasta date, p_limite int default 100)
returns table (
  fila_id text, tipo text, persona text, color text, cliente text, tipo_elemento text, elemento text,
  usd numeric, ruta text, de text, a text, override boolean, detalle text, created_at timestamptz
)
language sql stable set search_path = '' as $$
  select e.fila_id, e.tipo, e.persona, e.color, e.cliente, e.tipo_elemento, e.elemento,
         e.usd, e.ruta, e.de, e.a, e.override, e.detalle, e.created_at
  from produccion.prisma_actividad_eventos(p_desde, p_hasta) e
  order by e.created_at desc, e.fila_id
  limit least(greatest(coalesce(p_limite, 100), 1), 200);
$$;

revoke all on function produccion.prisma_actividad_eventos(date, date) from public, anon, authenticated;
revoke all on function produccion.prisma_actividad_personas(date, date) from public, anon, authenticated;
revoke all on function produccion.prisma_actividad_proyectos(date, date) from public, anon, authenticated;
revoke all on function produccion.prisma_actividad_linea(date, date, int) from public, anon, authenticated;
grant execute on function produccion.prisma_actividad_eventos(date, date) to service_role;
grant execute on function produccion.prisma_actividad_personas(date, date) to service_role;
grant execute on function produccion.prisma_actividad_proyectos(date, date) to service_role;
grant execute on function produccion.prisma_actividad_linea(date, date, int) to service_role;
