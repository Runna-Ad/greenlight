-- Greenlight — a TASK is a sheet row, not a file (0007)
--
-- Correction: one sheet row = one unit of work (one person, one assignment,
-- one status). Its Tamaño × Plataforma combinations are the FILES it delivers
-- — export variants of the same creative, not separate tasks.
--
-- Before this, the board showed one card per file: 32 rows became 227 cards.
-- Status and assignment now live on `ideas` (the task); `assets` remain the
-- generated deliverables listed inside a task.

alter table produccion.ideas
  add column status produccion.asset_status not null default 'todo';

alter table produccion.ideas add column completed_at timestamptz;
alter table produccion.ideas add column delivered_at timestamptz;

create index ideas_status_idx on produccion.ideas(brief_id, status);

-- Same transition rules as before, now enforced at the task level.
create or replace function produccion.guard_idea_status()
returns trigger language plpgsql
security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    if not produccion.transition_allowed(old.status, new.status)
       and not produccion.is_lead() then
      raise exception 'Transición no permitida: % → %', old.status, new.status;
    end if;
    if new.status = 'completed' and new.completed_at is null then new.completed_at := now(); end if;
    if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
    if new.status = 'delivered' and new.delivered_at is null then new.delivered_at := now(); end if;
  end if;
  return new;
end $$;

create trigger ideas_status_guard_bu before update of status on produccion.ideas
  for each row execute function produccion.guard_idea_status();

-- Existing rows: the task inherits the least-advanced state of its files, so
-- nothing already in progress is silently marked done.
update produccion.ideas i
   set status = coalesce((
     select a.status from produccion.assets a
      where a.idea_id = i.id
      order by array_position(
        array['todo','in_progress','under_review','in_corrections','completed','published','delivered']::text[],
        a.status::text)
      limit 1), 'todo');

comment on column produccion.ideas.status is
  'Estado de la TAREA (una fila del sheet). Los archivos que entrega viven en assets.';
