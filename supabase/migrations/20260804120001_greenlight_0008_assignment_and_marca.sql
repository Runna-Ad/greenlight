-- Greenlight — asignación de personas a tareas + rescate de Marca (0008)
--
-- PROBLEMA 1 — a quién apunta una asignación.
--   `idea_assignments.profile_id` exige un `profiles`, y hoy sólo existe UN
--   profile (Pedro, admin). Las 14 personas del equipo viven en
--   `track_members` como nombres sueltos (track, name) — sin cuenta, sin id.
--   Crear 14 profiles con uuid inventado rompería el login más adelante: cuando
--   Vero entre con Google, su `auth.users.id` no va a coincidir con la fila que
--   inventamos hoy, y `idea_assignments.profile_id` no tiene ON UPDATE CASCADE.
--   SOLUCIÓN: `track_members` gana un id estable y las asignaciones apuntan ahí.
--   `track_members.profile_id` queda nulo hasta que esa persona tenga cuenta —
--   ese es el punto de unión el día que se encienda AUTH_ENABLED.
--
-- PROBLEMA 2 — la Asignación del sheet es MULTI-PERSONA y no trae rol.
--   Datos reales del Brief 24/07: "Galie, Mony", "Vero, Sebas", "Clau J".
--   El `unique (idea_id, role)` original permitía una sola persona por rol y
--   obligaba a inventar un rol que el sheet nunca tuvo.
--
-- PROBLEMA 3 — el import tiraba dos columnas obligatorias del sheet.
--   `Asignación` se usaba para la llave de dedup pero nunca se guardaba, y
--   `Marca` (Card / Préstamos, presente en las 32 filas) tampoco. Ambas se
--   recuperan de `staged_rows.data`, que sí guardó las 21 columnas verbatim —
--   no hace falta re-sincronizar.

-- ─────────────────────────────────────────────────────────────
-- 1. track_members: identidad estable + puente a profiles
-- ─────────────────────────────────────────────────────────────
alter table produccion.track_members
  add column id uuid not null default gen_random_uuid();

alter table produccion.track_members drop constraint track_members_pkey;
alter table produccion.track_members add primary key (id);
alter table produccion.track_members add constraint track_members_track_name_key unique (track, name);

-- Se llena cuando la persona tenga cuenta real (P7 / pre-lanzamiento).
alter table produccion.track_members
  add column profile_id uuid references produccion.profiles(id) on delete set null;

comment on column produccion.track_members.profile_id is
  'Nulo hasta que la persona tenga cuenta. Es el punto de unión con auth cuando se encienda AUTH_ENABLED.';

-- ─────────────────────────────────────────────────────────────
-- 2. idea_assignments: apunta a una persona del pool, sin rol obligatorio
-- ─────────────────────────────────────────────────────────────
alter table produccion.idea_assignments
  add column member_id uuid references produccion.track_members(id) on delete cascade;

alter table produccion.idea_assignments alter column profile_id drop not null;
alter table produccion.idea_assignments alter column role drop not null;

-- Una tarea puede llevar varias personas; lo que no puede es repetir a una.
alter table produccion.idea_assignments drop constraint idea_assignments_idea_id_role_key;
alter table produccion.idea_assignments
  add constraint idea_assignments_idea_member_key unique (idea_id, member_id);

-- Una asignación sin persona no es una asignación.
alter table produccion.idea_assignments
  add constraint idea_assignments_has_person
  check (member_id is not null or profile_id is not null);

create index idea_assign_idea_idx on produccion.idea_assignments(idea_id);
create index idea_assign_member_idx on produccion.idea_assignments(member_id);

-- ─────────────────────────────────────────────────────────────
-- 3. Rescate: Asignación del sheet → idea_assignments
-- ─────────────────────────────────────────────────────────────
-- "Galie, Mony" → dos filas. El match es por nombre DENTRO del mismo track
-- (hay una "Clau J" en real y una "Clau T" en normal — no se deben cruzar),
-- insensible a acentos y mayúsculas.
insert into produccion.idea_assignments (idea_id, member_id)
select distinct s.idea_id, tm.id
from produccion.staged_rows s
cross join lateral unnest(string_to_array(s.data->>'Asignación', ',')) as nombre
join produccion.track_members tm
  on tm.track = s.track
 and lower(translate(tm.name, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'))
   = lower(translate(btrim(nombre), 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'))
where s.idea_id is not null
  and coalesce(btrim(s.data->>'Asignación'), '') <> ''
on conflict (idea_id, member_id) do nothing;

-- ─────────────────────────────────────────────────────────────
-- 4. Rescate: Marca del sheet → ideas.marca_id
-- ─────────────────────────────────────────────────────────────
update produccion.ideas i
   set marca_id = m.id
  from produccion.staged_rows s
  join produccion.briefs b on b.id = (
        select brief_id from produccion.ideas x where x.id = s.idea_id)
  join produccion.marcas m
    on m.client_id = b.client_id
   and lower(translate(m.name, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'))
     = lower(translate(btrim(s.data->>'Marca'), 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'))
 where s.idea_id = i.id
   and i.marca_id is null
   and coalesce(btrim(s.data->>'Marca'), '') <> '';

-- ─────────────────────────────────────────────────────────────
-- 5. Lectura del tablero: una vista que ya trae personas y conteo de archivos
-- ─────────────────────────────────────────────────────────────
-- Evita el N+1 desde el server component y mantiene el conteo de archivos
-- pegado a la tarea (los archivos son entregables de la fila, no tareas).
create view produccion.board_tasks as
select
  i.id,
  i.brief_id,
  i.code,
  i.status,
  i.track,
  i.naming_base,
  i.concepto,
  i.tipo_asset,
  i.formato_code,
  i.duracion,
  i.tamanos,
  i.plataformas,
  i.marca_id,
  m.name as marca,
  i.pod_id,
  i.created_at,
  b.client_id,
  b.title       as brief_title,
  b.source_tab  as brief_tab,
  coalesce(f.n, 0) as file_count,
  coalesce(a.members, '[]'::jsonb) as members
from produccion.ideas i
join produccion.briefs b on b.id = i.brief_id
left join produccion.marcas m on m.id = i.marca_id
left join lateral (
  select count(*)::int as n from produccion.assets x where x.idea_id = i.id
) f on true
left join lateral (
  select jsonb_agg(
           jsonb_build_object('id', tm.id, 'name', tm.name, 'color', tm.color)
           order by tm.sort_order
         ) as members
    from produccion.idea_assignments ia
    join produccion.track_members tm on tm.id = ia.member_id
   where ia.idea_id = i.id
) a on true;

comment on view produccion.board_tasks is
  'Una fila = una TAREA (una fila del sheet), con sus personas y cuántos archivos entrega.';

grant select on produccion.board_tasks to anon, authenticated, service_role;
