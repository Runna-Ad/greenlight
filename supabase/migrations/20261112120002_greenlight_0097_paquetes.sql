-- ─────────────────────────────────────────────────────────────
-- 0097 — Brief › Paquete › Tarea
--
-- POR QUÉ (Pedro 2026-11-12): un brief de DiDi ("Brief 30/10") trae varios
-- PAQUETES (columna "Package Name" del sheet, antes "Brief Name"): un grupo de
-- tareas del mismo tema o evento. Hasta hoy Greenlight guardaba un brief por
-- PESTAÑA y le ponía de nombre el paquete de la primera fila: la pestaña Real del
-- 30/10 tiene 6 paquetes y el portal la habría llamado sólo "LT AfterBF".
--
-- QUÉ:
--   · `paquetes`: su propio registro (opción B de Pedro) porque lleva FECHA DE
--     ENTREGA, que pone un admin. La fecha del brief es la más lejana de sus
--     paquetes (se calcula, no se guarda).
--   · Un paquete pertenece al BRIEF del cliente, que es (cliente, brief_date):
--     las pestañas Real y Normal del mismo día son UN brief, y un paquete puede
--     tener tareas de las dos ("LT After BF": 2 real, 1 normal).
--   · `clave` = el nombre sin acentos, espacios ni mayúsculas. "LT AfterBF" (pestaña
--     Real) y "LT After BF" (pestaña Normal) son el mismo paquete. La pone un
--     trigger; la app usa la MISMA regla (src/lib/paquetes.ts, prueba de contrato).
--   · `ideas.paquete_id` (la app lo lee de `ideas`; board_tasks no cambia, ver abajo).
--   · `briefs.brief_date` se rellena desde la pestaña en los briefs del sync que no
--     la tenían.
--
-- Acceso: sólo service_role, como todo `produccion` desde 0056. "Sólo un admin pone
-- la fecha" se valida en la server action.
-- ─────────────────────────────────────────────────────────────

create or replace function produccion.paquete_clave(nombre text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    translate(lower(coalesce(nombre, '')),
              'áàâäãéèêëíìîïóòôöõúùûüñç',
              'aaaaaeeeeiiiiooooouuuunc'),
    '[^a-z0-9]', '', 'g')
$$;

create table produccion.paquetes (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references produccion.clients(id) on delete cascade,
  brief_date    date not null,
  nombre        text not null check (length(btrim(nombre)) > 0),
  clave         text not null check (clave <> ''),
  -- La fecha comprometida con el cliente. null = aún sin fecha.
  fecha_entrega date,
  fecha_por     uuid,          -- quién la puso (perfil); sin FK, como deleted_by
  fecha_at      timestamptz,
  created_at    timestamptz not null default now(),
  unique (client_id, brief_date, clave)
);

create index paquetes_brief_idx on produccion.paquetes (client_id, brief_date);

create or replace function produccion._paquete_clave_trg()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nombre := btrim(new.nombre);
  new.clave := produccion.paquete_clave(new.nombre);
  return new;
end;
$$;

create trigger paquete_clave
  before insert or update of nombre on produccion.paquetes
  for each row execute function produccion._paquete_clave_trg();

alter table produccion.paquetes enable row level security;
revoke all on produccion.paquetes from public, anon, authenticated;
grant select, insert, update, delete on produccion.paquetes to service_role;
revoke all on function produccion.paquete_clave(text) from public, anon, authenticated;
revoke all on function produccion._paquete_clave_trg() from public, anon, authenticated;
grant execute on function produccion.paquete_clave(text) to service_role;

alter table produccion.ideas
  add column paquete_id uuid references produccion.paquetes(id) on delete set null;
create index ideas_paquete_idx on produccion.ideas (paquete_id) where paquete_id is not null;

-- board_tasks NO se toca: la vista viva trae columnas de la rama de Diseño (0076,
-- aplicada en vivo y aún no en `main`), y redefinirla desde aquí las borraría (Postgres lo
-- rechaza: "cannot drop columns from view"). La app lee `ideas.paquete_id` directo.

-- ── Backfill 1: brief_date de los briefs del sync, desde la pestaña ──
-- "Real (Card/Préstamos | Brief 30/10)" → 30 de octubre del año en que se creó el brief;
-- si eso cae más de 62 días DESPUÉS de crearlo, es del año anterior (un brief de
-- diciembre sincronizado en enero). Misma regla que dateSortFrom() en src/lib/sheet-sync.ts.
with p as (
  select b.id, b.created_at,
         (regexp_match(b.source_tab, '\|\s*(?:brief\s*)?(\d{1,2})\s*/\s*(\d{1,2})\s*\)\s*$', 'i'))[1]::int as dia,
         (regexp_match(b.source_tab, '\|\s*(?:brief\s*)?(\d{1,2})\s*/\s*(\d{1,2})\s*\)\s*$', 'i'))[2]::int as mes
    from produccion.briefs b
   where b.brief_date is null
     and b.source_tab ~* '\|\s*(?:brief\s*)?\d{1,2}\s*/\s*\d{1,2}\s*\)\s*$'
), f as (
  select id, created_at,
         make_date(extract(year from created_at)::int, mes, dia) as fecha
    from p
   where mes between 1 and 12 and dia between 1 and 31
     -- Un día que no existe en ese mes ("Brief 31/02") se salta en vez de tumbar la migración.
     and dia <= extract(day from (make_date(extract(year from created_at)::int, mes, 1)
                                  + interval '1 month' - interval '1 day'))
)
update produccion.briefs b
   set brief_date = case when f.fecha > (f.created_at::date + 62)
                         then (f.fecha - interval '1 year')::date
                         else f.fecha end
  from f
 where b.id = f.id;

-- ── Backfill 2: paquetes desde la fila del sheet de cada tarea ──
-- La fila guardada (staged_rows) trae el nombre del paquete en la columna que antes se
-- llamaba "Brief Name"; si el lead lo editó en la revisión del sync, manda lo editado.
-- Si dos filas escriben distinto el mismo paquete, el nombre que se queda es el de la
-- fila más vieja.
with filas as (
  select distinct on (s.idea_id)
         s.idea_id,
         btrim(coalesce(nullif(btrim(s.edited->>'Brief Name'), ''), s.data->>'Brief Name')) as nombre,
         s.created_at
    from produccion.staged_rows s
   where s.idea_id is not null
   order by s.idea_id, s.created_at desc
), con_brief as (
  select f.idea_id, f.nombre, f.created_at, b.client_id, b.brief_date
    from filas f
    join produccion.ideas i on i.id = f.idea_id
    join produccion.briefs b on b.id = i.brief_id
   where b.brief_date is not null
     and produccion.paquete_clave(f.nombre) <> ''
)
insert into produccion.paquetes (client_id, brief_date, nombre, clave)
select distinct on (client_id, brief_date, produccion.paquete_clave(nombre))
       client_id, brief_date, nombre, produccion.paquete_clave(nombre)
  from con_brief
 order by client_id, brief_date, produccion.paquete_clave(nombre), created_at
on conflict (client_id, brief_date, clave) do nothing;

with filas as (
  select distinct on (s.idea_id)
         s.idea_id,
         btrim(coalesce(nullif(btrim(s.edited->>'Brief Name'), ''), s.data->>'Brief Name')) as nombre
    from produccion.staged_rows s
   where s.idea_id is not null
   order by s.idea_id, s.created_at desc
)
update produccion.ideas i
   set paquete_id = pq.id
  from filas f, produccion.briefs b, produccion.paquetes pq
 where f.idea_id = i.id
   and b.id = i.brief_id
   and pq.client_id = b.client_id
   and pq.brief_date = b.brief_date
   and pq.clave = produccion.paquete_clave(f.nombre)
   and i.paquete_id is null;
