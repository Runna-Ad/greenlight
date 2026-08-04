-- Greenlight — Google Sheets import (0004)
-- Rows land in a STAGING table first; the lead reviews/edits, then approves.
-- Nothing reaches the board until a human says so.

create type produccion.sync_source_kind as enum ('csv', 'apps_script');
create type produccion.staged_status   as enum ('pending', 'approved', 'rejected');
create type produccion.diff_status     as enum ('new', 'updated', 'unchanged');

-- ── Where a client's sheet lives ──
create table produccion.sheet_sources (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references produccion.clients(id) on delete cascade,
  kind           produccion.sync_source_kind not null default 'csv',
  spreadsheet_id text,          -- for kind='csv'
  script_url     text,          -- for kind='apps_script'
  script_secret  text,          -- shared secret sent to the Apps Script
  tabs           text[] not null default '{}',  -- tabs to watch (csv mode)
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger set_updated_at_sheet_sources before update on produccion.sheet_sources
  for each row execute function produccion.set_updated_at();

-- ── One row per sync run (audit + "what did that button do?") ──
create table produccion.sync_runs (
  id             uuid primary key default gen_random_uuid(),
  source_id      uuid not null references produccion.sheet_sources(id) on delete cascade,
  client_id      uuid not null references produccion.clients(id) on delete cascade,
  tabs           text[] not null default '{}',
  count_new      int not null default 0,
  count_updated  int not null default 0,
  count_unchanged int not null default 0,
  error          text,
  actor_id       uuid references produccion.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index sync_runs_client_idx on produccion.sync_runs(client_id, created_at desc);

-- ── The review queue ──
create table produccion.staged_rows (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references produccion.clients(id) on delete cascade,
  sync_run_id  uuid references produccion.sync_runs(id) on delete set null,
  source_tab   text not null,
  source_row   int,                       -- row number in the sheet, for reference
  track        produccion.track,
  natural_key  text not null,             -- semantic identity (survives row moves)
  row_hash     text not null,             -- content fingerprint
  diff         produccion.diff_status not null default 'new',
  status       produccion.staged_status not null default 'pending',
  data         jsonb not null,            -- the 21 sheet columns, verbatim
  edited       jsonb,                     -- lead's corrections, applied on approve
  idea_id      uuid references produccion.ideas(id) on delete set null, -- set once approved
  reviewed_by  uuid references produccion.profiles(id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
-- One live staged row per identity per client: re-syncing UPDATES rather than duplicating.
create unique index staged_rows_identity_key
  on produccion.staged_rows(client_id, natural_key);
create index staged_rows_pending_idx
  on produccion.staged_rows(client_id, status) where status = 'pending';
create trigger set_updated_at_staged_rows before update on produccion.staged_rows
  for each row execute function produccion.set_updated_at();

-- ── RLS: leads manage sync; the team can see what's queued ──
alter table produccion.sheet_sources enable row level security;
alter table produccion.sync_runs     enable row level security;
alter table produccion.staged_rows   enable row level security;

create policy sheet_sources_read  on produccion.sheet_sources for select using (produccion.is_team());
create policy sheet_sources_write on produccion.sheet_sources for all
  using (produccion.is_lead()) with check (produccion.is_lead());

create policy sync_runs_read  on produccion.sync_runs for select using (produccion.is_team());
create policy sync_runs_write on produccion.sync_runs for all
  using (produccion.is_lead()) with check (produccion.is_lead());

create policy staged_rows_read  on produccion.staged_rows for select using (produccion.is_team());
create policy staged_rows_write on produccion.staged_rows for all
  using (produccion.is_lead()) with check (produccion.is_lead());

-- ── Upsert a fetched row into staging ──
-- Re-importing an unchanged row is a no-op. An edited row that is still pending
-- gets refreshed. An already-APPROVED row is never silently overwritten — it is
-- flagged 'updated' so the lead decides what to do.
create or replace function produccion.rpc_stage_row(
  p_client_id  uuid,
  p_run_id     uuid,
  p_tab        text,
  p_row        int,
  p_track      produccion.track,
  p_key        text,
  p_hash       text,
  p_data       jsonb
) returns produccion.diff_status language plpgsql
security definer set search_path = '' as $$
declare
  v_existing produccion.staged_rows;
  v_diff produccion.diff_status;
begin
  if not produccion.is_lead() then
    raise exception 'Solo un lead puede sincronizar';
  end if;

  select * into v_existing from produccion.staged_rows
   where client_id = p_client_id and natural_key = p_key;

  if not found then
    insert into produccion.staged_rows
      (client_id, sync_run_id, source_tab, source_row, track, natural_key, row_hash, diff, data)
    values (p_client_id, p_run_id, p_tab, p_row, p_track, p_key, p_hash, 'new', p_data);
    return 'new';
  end if;

  if v_existing.row_hash = p_hash then
    return 'unchanged';
  end if;

  -- content changed in the sheet
  v_diff := 'updated';
  if v_existing.status = 'pending' then
    update produccion.staged_rows
       set data = p_data, row_hash = p_hash, diff = v_diff,
           source_row = p_row, sync_run_id = p_run_id
     where id = v_existing.id;
  else
    -- already approved/rejected: surface the change, don't clobber the decision
    update produccion.staged_rows
       set diff = v_diff, sync_run_id = p_run_id
     where id = v_existing.id;
  end if;
  return v_diff;
end $$;
