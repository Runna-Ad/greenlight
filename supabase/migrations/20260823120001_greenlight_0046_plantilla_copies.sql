-- ═══════════════════════════════════════════════════════════════
-- 0046 — Plantilla "Copies": temas con cuota
-- ═══════════════════════════════════════════════════════════════
-- El único tipo de entregable sin plantilla. Forma acordada (Pedro): el lead define
-- TEMAS, cada uno con una CUOTA (cuántos copies), y el copy llena, por tema, una lista
-- de copies {headline, descripción}, con un contador X/cuota. Copies NO generan archivos
-- (intake-crear ya lo maneja); `tipo_group='copies'` ya existe para el motor de reglas.
-- Se difirió porque Copies no está en el deck del cliente (ese slide enlaza a otra hoja),
-- así que no había forma que copiar. Espeja la plantilla de `estaticos` (0012).
--
-- Dos tablas: `copies_temas` (el tema + su cuota, del lead) y `copies` (los copies bajo
-- cada tema). Un tema existe con 0 copies (lleva su cuota). RLS/trigger/grant EXPLÍCITOS
-- por tabla — las tablas nuevas NO heredan los loops "por cada tabla existente" de 0002/0006.

create table produccion.copies_temas (
  id         uuid primary key default gen_random_uuid(),
  idea_id    uuid not null references produccion.ideas(id) on delete cascade,
  tema       text,
  cuota      int  not null default 1 check (cuota >= 0),
  orden      int  not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idea_id, orden)
);
create index copies_temas_idea_idx on produccion.copies_temas(idea_id);

create table produccion.copies (
  id          uuid primary key default gen_random_uuid(),
  tema_id     uuid not null references produccion.copies_temas(id) on delete cascade,
  headline    text,
  descripcion text,
  orden       int  not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tema_id, orden)
);
create index copies_tema_idx on produccion.copies(tema_id);

-- ── RLS (explícita por tabla) ──
alter table produccion.copies_temas enable row level security;
create policy copies_temas_team_read on produccion.copies_temas
  for select using (produccion.is_team());
create policy copies_temas_write on produccion.copies_temas
  for all using (produccion.is_lead() or produccion.is_assigned(idea_id))
  with check (produccion.is_lead() or produccion.is_assigned(idea_id));
create policy copies_temas_client_read on produccion.copies_temas for select using (
  produccion.is_client_user()
  and idea_id in (
    select i.id from produccion.ideas i
    join produccion.briefs b on b.id = i.brief_id
    where i.published_at is not null and b.client_id = produccion.current_client_id()
  )
);

alter table produccion.copies enable row level security;
-- `copies` llega por tema_id → hay que SALTAR a copies_temas para llegar al idea_id.
create policy copies_team_read on produccion.copies
  for select using (produccion.is_team());
create policy copies_write on produccion.copies
  for all using (
    tema_id in (select t.id from produccion.copies_temas t
                 where produccion.is_lead() or produccion.is_assigned(t.idea_id))
  ) with check (
    tema_id in (select t.id from produccion.copies_temas t
                 where produccion.is_lead() or produccion.is_assigned(t.idea_id))
  );
create policy copies_client_read on produccion.copies for select using (
  produccion.is_client_user()
  and tema_id in (
    select t.id from produccion.copies_temas t
    join produccion.ideas i on i.id = t.idea_id
    join produccion.briefs b on b.id = i.brief_id
    where i.published_at is not null and b.client_id = produccion.current_client_id()
  )
);

-- ── updated_at (trigger explícito por tabla) ──
create trigger set_updated_at_copies_temas before update on produccion.copies_temas
  for each row execute function produccion.set_updated_at();
create trigger set_updated_at_copies before update on produccion.copies
  for each row execute function produccion.set_updated_at();

-- ── limpieza de correcciones huérfanas al borrar (como planos/estaticos en 0039) ──
-- `comments.target_fila_id` es polimórfico SIN FK: al borrar un copy/tema hay que
-- limpiar a mano los pins (correcciones internas + client_change) que lo apuntaban, o
-- quedan huérfanos con resolved_at=null → la ronda no cierra, el badge miente y
-- "Ver campo" no salta. Copies es entregable al cliente, así que este agujero es real
-- (el cliente ancla cambios en un copy y el equipo lo borra). Reusa la función genérica
-- de 0039 (`tg_argv[0]` = tabla dueña). El trigger en `copies` cubre TAMBIÉN el borrado
-- en cascada al borrar su tema (row-level before delete dispara por cada fila).
drop trigger if exists before_delete_copy_correcciones on produccion.copies;
create trigger before_delete_copy_correcciones
  before delete on produccion.copies
  for each row execute function produccion.trg_borrar_correcciones_huerfanas('copies');

drop trigger if exists before_delete_tema_correcciones on produccion.copies_temas;
create trigger before_delete_tema_correcciones
  before delete on produccion.copies_temas
  for each row execute function produccion.trg_borrar_correcciones_huerfanas('copies_temas');

-- ── grant explícito (como estaticos en 0012) ──
grant all on produccion.copies_temas, produccion.copies to anon, authenticated, service_role;
