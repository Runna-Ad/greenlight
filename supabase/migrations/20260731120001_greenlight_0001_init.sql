-- Rünna On Deck — P1 schema (0001)
-- All objects live in schema `produccion` to stay isolated from S.P.A.M's `public`.
-- Tested locally via PGlite (scripts/test-db.mjs) before any remote push.

create schema if not exists produccion;

-- ─────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────
create type produccion.app_role       as enum ('admin','lead','creative','delivery','client');
create type produccion.brief_status   as enum ('draft','active','delivered','archived');
create type produccion.asset_status   as enum
  ('todo','in_progress','under_review','in_corrections','completed','published','delivered');
create type produccion.assignment_role as enum ('creativo','produccion','diseno','copy','edicion');
create type produccion.comment_kind   as enum ('comment','correction_request','approval','client_change');
create type produccion.snippet_kind   as enum ('instruccion','legal','consideracion','referencia');
create type produccion.naming_kind    as enum ('real','normal','static');
create type produccion.notify_channel as enum ('email','slack','in_app');
create type produccion.vocab_set      as enum
  ('plataforma','tipo','formato','tamano','duracion','genero','origen_idea','red');

-- ─────────────────────────────────────────────────────────────
-- Shared updated_at trigger (attach explicitly per table — never an
-- information_schema loop, which only snapshots tables existing today).
-- ─────────────────────────────────────────────────────────────
create or replace function produccion.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────
-- People & org
-- ─────────────────────────────────────────────────────────────
create table produccion.pods (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  slug       text not null unique,
  color      text not null default '#775cbf',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- profiles.id references auth.users(id) on the real DB. auth is NOT created here
-- (Supabase manages it); the FK is added in a guarded block so PGlite tests pass.
create table produccion.profiles (
  id            uuid primary key,
  email         text not null unique,
  full_name     text not null,
  initials      text unique,                     -- feeds filenames; team members only
  role          produccion.app_role not null default 'creative',
  pod_id        uuid references produccion.pods(id) on delete set null,
  specialties   text[] not null default '{}',    -- real_person/ugc/normal_video/static/copies
  slack_user_id text,
  client_id     uuid,                            -- set only for role='client' (scoping)
  notify_email  boolean not null default true,
  notify_slack  boolean not null default true,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index profiles_role_idx on produccion.profiles(role) where active;
create index profiles_pod_idx  on produccion.profiles(pod_id);

do $$ begin
  if exists (select 1 from information_schema.schemata where schema_name = 'auth') then
    alter table produccion.profiles
      add constraint profiles_auth_fk foreign key (id) references auth.users(id) on delete cascade;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Clients & marcas (DiDi → Card, Préstamos)
-- ─────────────────────────────────────────────────────────────
create table produccion.clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  tagline     text,
  logo_url    text,
  brand_color text not null default '#775cbf',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- profiles.client_id FK (added after clients exists)
alter table produccion.profiles
  add constraint profiles_client_fk foreign key (client_id)
  references produccion.clients(id) on delete set null;

create table produccion.marcas (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references produccion.clients(id) on delete cascade,
  name       text not null,                       -- 'Card', 'Préstamos'
  slug       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (client_id, slug)
);

-- ─────────────────────────────────────────────────────────────
-- Controlled vocabularies (one table — anti-drift). code = filename token.
-- ─────────────────────────────────────────────────────────────
create table produccion.vocab_terms (
  id         uuid primary key default gen_random_uuid(),
  set        produccion.vocab_set not null,
  code       text not null,                       -- UPPERCASE token, [A-Z0-9]+
  label_es   text not null,
  sort_order int not null default 0,
  active     boolean not null default true,
  meta       jsonb not null default '{}',
  unique (set, code),
  constraint vocab_code_shape check (code ~ '^[A-Z0-9]+$')
);

-- Size↔platform validity matrix (Margaret's rules). Only VALID combos are rows.
create table produccion.size_platform_validity (
  media      text not null check (media in ('video','static')),
  tamano     text not null,                       -- '1:1','9:16','4:5','16:9','1.91:1'
  plataforma text not null,                       -- 'TT','FB','GG'
  primary key (media, tamano, plataforma)
);

-- ─────────────────────────────────────────────────────────────
-- Briefs → waves → idea families → ideas
-- ─────────────────────────────────────────────────────────────
create table produccion.briefs (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references produccion.clients(id) on delete cascade,
  code        text not null,                      -- 'DIDI-AGO26-01'
  title       text not null,
  brief_name  text,                               -- client's own brief label
  month       date,
  status      produccion.brief_status not null default 'draft',
  description text,
  drive_url   text,
  created_by  uuid references produccion.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (client_id, code)
);
create index briefs_client_idx on produccion.briefs(client_id);

create table produccion.delivery_waves (
  id         uuid primary key default gen_random_uuid(),
  brief_id   uuid not null references produccion.briefs(id) on delete cascade,
  name       text not null,                       -- '1ra entrega'
  due_date   date,
  month      text,
  status     text not null default 'open',
  notes      text,
  created_at timestamptz not null default now()
);
create index waves_brief_idx on produccion.delivery_waves(brief_id);

create table produccion.idea_families (
  id         uuid primary key default gen_random_uuid(),
  brief_id   uuid not null references produccion.briefs(id) on delete cascade,
  letter     text not null,                       -- 'A','B'
  name       text,
  tema       text,
  insight    text,
  origen     text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (brief_id, letter)
);

create table produccion.ideas (
  id             uuid primary key default gen_random_uuid(),
  family_id      uuid not null references produccion.idea_families(id) on delete cascade,
  brief_id       uuid not null references produccion.briefs(id) on delete cascade,
  marca_id       uuid references produccion.marcas(id) on delete set null,
  variant_number int not null default 1,
  code           text,                            -- 'A1' — set by set_idea_code() trigger
  pod_id         uuid references produccion.pods(id) on delete set null,
  wave_id        uuid references produccion.delivery_waves(id) on delete set null,

  -- filename-feeding fields (per idea)
  naming_base    text,                            -- 'SPAPVOYTOURISM'
  naming_kind    produccion.naming_kind not null default 'real',
  genero_code    text,                            -- 'WOMAN','MAN','NA' (NA → omitted)
  formato_code   text,                            -- STOCK/ILLUS/AI (for normal/static)
  mes_code       text,                            -- 'AUG26'

  -- creative content
  plataformas    text[] not null default '{}',    -- ['TT','FB','GG']
  tipo_code      text,
  topico         text,
  concepto       text,
  comunicacion   text,
  selling_points text[] not null default '{}',
  comentarios_creativo  text,
  comentarios_produccion text,
  comentarios_diseno    text,

  -- lead intake peloteo (brief), structured + raw
  p_tema      text,
  p_mensaje   text,
  p_insight   text,
  p_personaje text,
  p_locacion  text,
  p_hook      text,
  p_graficos  text,
  peloteo_raw text,

  due_date     date,
  published_at timestamptz,
  created_by   uuid references produccion.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (family_id, variant_number)
);
create index ideas_brief_idx  on produccion.ideas(brief_id);
create index ideas_family_idx on produccion.ideas(family_id);

-- ideas.code = family letter || variant_number (e.g. A1). A generated column can't
-- reach the parent table, so compute it via trigger.
create or replace function produccion.set_idea_code()
returns trigger language plpgsql as $$
declare v_letter text;
begin
  select letter into v_letter from produccion.idea_families where id = new.family_id;
  new.code := coalesce(v_letter,'?') || new.variant_number::text;
  return new;
end $$;
create trigger ideas_code_bi before insert or update of family_id, variant_number
  on produccion.ideas for each row execute function produccion.set_idea_code();

-- ─────────────────────────────────────────────────────────────
-- Planos — the structured execution script (team writes this)
-- ─────────────────────────────────────────────────────────────
create table produccion.planos (
  id             uuid primary key default gen_random_uuid(),
  idea_id        uuid not null references produccion.ideas(id) on delete cascade,
  orden          int not null default 1,
  titulo         text,                            -- 'Plano 1 - int. locación - MS'
  hook_narrativo text,
  hook_visual    text,
  accion         text,                            -- ACCIÓN + COPY IN + GFX/SFX column
  copy_in        text,
  gfx_sfx        text,
  edicion        text,
  dialogo        text,                            -- DIÁLOGO column
  read_time_s    numeric,                         -- auto-calculated from dialogo
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (idea_id, orden)
);
create index planos_idea_idx on produccion.planos(idea_id);

-- ─────────────────────────────────────────────────────────────
-- Assets — the deliverables (one per size × platform under an idea)
-- ─────────────────────────────────────────────────────────────
create table produccion.assets (
  id            uuid primary key default gen_random_uuid(),
  idea_id       uuid not null references produccion.ideas(id) on delete cascade,
  brief_id      uuid not null references produccion.briefs(id) on delete cascade, -- denorm for board
  pod_id        uuid references produccion.pods(id) on delete set null,           -- denorm
  wave_id       uuid references produccion.delivery_waves(id) on delete set null,
  status        produccion.asset_status not null default 'todo',

  -- filename tokens (copied from idea at creation for filename stability)
  naming_kind   produccion.naming_kind not null,
  naming_base   text not null,
  tamano_code   text not null,                    -- '9:16' (converted to 9x16 in filename)
  plataforma_code text not null,                  -- 'TT'/'FB'/'GG' (or combo like GGFBTT)
  duracion_code text,                             -- '25s' (null for static)
  genero_code   text,                             -- null/'NA' → omitted from filename
  formato_code  text,                             -- for normal/static kinds
  idea_code     text not null,                    -- 'A1' → written IDEAA1
  mes_code      text not null,                    -- 'AUG26'
  version       int not null default 1,

  filename         text not null default '',      -- computed by trigger
  filename_override text,                          -- validated manual override
  storage_path  text,
  entrega_link  text,                             -- auto-filled on upload (delivery)

  due_date      date,
  sort_order    int not null default 0,
  completed_at  timestamptz,
  published_at  timestamptz,
  delivered_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index assets_idea_idx   on produccion.assets(idea_id);
create index assets_brief_idx  on produccion.assets(brief_id);
create index assets_status_idx on produccion.assets(status);
-- one asset per (idea, size, platform, version)
create unique index assets_unique_render
  on produccion.assets(idea_id, tamano_code, plataforma_code, version);

create table produccion.asset_versions (
  id               uuid primary key default gen_random_uuid(),
  asset_id         uuid not null references produccion.assets(id) on delete cascade,
  version          int not null,
  filename_snapshot text,
  storage_path     text,
  notes            text,
  submitted_by     uuid references produccion.profiles(id) on delete set null,
  submitted_at     timestamptz not null default now(),
  superseded_at    timestamptz,
  unique (asset_id, version)
);

-- Assignments live at IDEA level (the pod/people work an idea; assets inherit).
create table produccion.idea_assignments (
  id          uuid primary key default gen_random_uuid(),
  idea_id     uuid not null references produccion.ideas(id) on delete cascade,
  profile_id  uuid not null references produccion.profiles(id) on delete cascade,
  role        produccion.assignment_role not null,
  assigned_by uuid references produccion.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (idea_id, role)
);
create index idea_assign_profile_idx on produccion.idea_assignments(profile_id);

-- ─────────────────────────────────────────────────────────────
-- Reuse layer: snippets & references
-- ─────────────────────────────────────────────────────────────
create table produccion.snippets (
  id          uuid primary key default gen_random_uuid(),
  kind        produccion.snippet_kind not null,
  title       text not null,
  body        text not null,
  tags        text[] not null default '{}',
  scope       text not null default 'global' check (scope in ('global','client','marca','brief')),
  client_id   uuid references produccion.clients(id) on delete cascade,
  marca_id    uuid references produccion.marcas(id) on delete cascade,
  brief_id    uuid references produccion.briefs(id) on delete cascade,
  active      boolean not null default true,
  usage_count int not null default 0,
  created_by  uuid references produccion.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table produccion.idea_snippets (
  idea_id       uuid not null references produccion.ideas(id) on delete cascade,
  snippet_id    uuid not null references produccion.snippets(id) on delete cascade,
  position      int not null default 0,
  override_body text,
  primary key (idea_id, snippet_id)
);

create table produccion.references (
  id           uuid primary key default gen_random_uuid(),
  url          text not null unique,
  title        text,
  platform     text,                              -- tiktok/pinterest/drive/ig/other
  thumbnail_url text,
  added_by     uuid references produccion.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table produccion.idea_references (
  idea_id      uuid not null references produccion.ideas(id) on delete cascade,
  reference_id uuid not null references produccion.references(id) on delete cascade,
  note         text,
  position     int not null default 0,
  primary key (idea_id, reference_id)
);

-- ─────────────────────────────────────────────────────────────
-- Collaboration & audit
-- ─────────────────────────────────────────────────────────────
create table produccion.comments (
  id          uuid primary key default gen_random_uuid(),
  idea_id     uuid references produccion.ideas(id) on delete cascade,
  asset_id    uuid references produccion.assets(id) on delete cascade,
  brief_id    uuid references produccion.briefs(id) on delete cascade,
  parent_id   uuid references produccion.comments(id) on delete cascade,
  author_id   uuid references produccion.profiles(id) on delete set null,
  body        text not null,
  mentions    uuid[] not null default '{}',
  kind        produccion.comment_kind not null default 'comment',
  resolved_at timestamptz,
  resolved_by uuid references produccion.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  -- exactly one target
  constraint comment_one_target check (
    (idea_id is not null)::int + (asset_id is not null)::int + (brief_id is not null)::int = 1
  )
);
create index comments_idea_idx  on produccion.comments(idea_id);
create index comments_asset_idx on produccion.comments(asset_id);

create table produccion.gary_reviews (
  id         uuid primary key default gen_random_uuid(),
  idea_id    uuid not null references produccion.ideas(id) on delete cascade,
  issues     jsonb not null default '[]',         -- [{field, quote, suggestion, severity}]
  model      text,
  status     text not null default 'flagged',     -- flagged | clean | overridden
  overridden_by uuid references produccion.profiles(id) on delete set null,
  overridden_at timestamptz,
  created_at timestamptz not null default now()
);
create index gary_idea_idx on produccion.gary_reviews(idea_id);

create table produccion.status_events (
  id          uuid primary key default gen_random_uuid(),
  asset_id    uuid not null references produccion.assets(id) on delete cascade,
  from_status produccion.asset_status,
  to_status   produccion.asset_status not null,
  actor_id    uuid references produccion.profiles(id) on delete set null,
  reason      text,
  created_at  timestamptz not null default now()
);
create index status_events_asset_idx on produccion.status_events(asset_id);

create table produccion.activity_log (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id   uuid not null,
  actor_id    uuid references produccion.profiles(id) on delete set null,
  verb        text not null,
  payload     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index activity_entity_idx on produccion.activity_log(entity_type, entity_id);

create table produccion.notifications (
  id          uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references produccion.profiles(id) on delete cascade,
  type        text not null,
  entity_type text,
  entity_id   uuid,
  title       text not null,
  body        text,
  url         text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_recipient_idx on produccion.notifications(recipient_id) where read_at is null;

create table produccion.notification_deliveries (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null references produccion.notifications(id) on delete cascade,
  channel         produccion.notify_channel not null,
  status          text not null default 'pending', -- pending|sent|failed|skipped
  provider_id     text,
  error           text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index notif_deliveries_pending_idx
  on produccion.notification_deliveries(status) where status = 'pending';

-- ─────────────────────────────────────────────────────────────
-- updated_at triggers (one explicit trigger per table with the column)
-- ─────────────────────────────────────────────────────────────
create trigger set_updated_at_profiles before update on produccion.profiles
  for each row execute function produccion.set_updated_at();
create trigger set_updated_at_clients before update on produccion.clients
  for each row execute function produccion.set_updated_at();
create trigger set_updated_at_briefs before update on produccion.briefs
  for each row execute function produccion.set_updated_at();
create trigger set_updated_at_ideas before update on produccion.ideas
  for each row execute function produccion.set_updated_at();
create trigger set_updated_at_planos before update on produccion.planos
  for each row execute function produccion.set_updated_at();
create trigger set_updated_at_assets before update on produccion.assets
  for each row execute function produccion.set_updated_at();
create trigger set_updated_at_snippets before update on produccion.snippets
  for each row execute function produccion.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Filename builder — 3 variants (real / normal / static), token-driven.
-- Génro 'NA'/null → omitted. Static drops duration & uses STATIC not VIDEO.
-- Sizes convert ':' → 'x'. Everything uppercased, spaces stripped.
-- ─────────────────────────────────────────────────────────────
create or replace function produccion.norm_token(t text)
returns text language sql immutable as $$
  select upper(replace(replace(coalesce(t,''), ':', 'x'), ' ', ''));
$$;

create or replace function produccion.build_filename(
  p_kind    produccion.naming_kind,
  p_base    text,
  p_tamano  text,
  p_duracion text,
  p_genero  text,
  p_formato text,
  p_idea    text,
  p_plataforma text,
  p_version int,
  p_mes     text
) returns text language plpgsql immutable as $$
declare
  parts text[] := '{}';
  g text := produccion.norm_token(p_genero);
begin
  parts := array_append(parts, produccion.norm_token(p_base));
  parts := array_append(parts, produccion.norm_token(p_tamano));

  if p_kind <> 'static' then
    parts := array_append(parts, produccion.norm_token(p_duracion));
  end if;

  -- genero omitted when NA/empty
  if g <> '' and g <> 'NA' then
    parts := array_append(parts, g);
  end if;

  -- token 5: REAL for real, formato for normal/static
  if p_kind = 'real' then
    parts := array_append(parts, 'REAL');
  else
    parts := array_append(parts, produccion.norm_token(p_formato));
  end if;

  -- filetype
  parts := array_append(parts, case when p_kind = 'static' then 'STATIC' else 'VIDEO' end);

  parts := array_append(parts, 'IDEA' || produccion.norm_token(p_idea));
  parts := array_append(parts, produccion.norm_token(p_plataforma));
  parts := array_append(parts, 'V' || coalesce(p_version,1)::text);
  parts := array_append(parts, produccion.norm_token(p_mes));
  parts := array_append(parts, 'RN');   -- fixed Rünna signature

  return array_to_string(parts, '_');
end $$;

-- Asset filename trigger: use validated override if present, else build from tokens.
create or replace function produccion.set_asset_filename()
returns trigger language plpgsql as $$
begin
  if new.filename_override is not null and length(trim(new.filename_override)) > 0 then
    if new.filename_override !~ '^[A-Z0-9]+(_[A-Z0-9]+)+$' then
      raise exception 'filename_override "%" no cumple el formato (MAYÚSCULAS_TOKENS)', new.filename_override;
    end if;
    new.filename := new.filename_override;
  else
    new.filename := produccion.build_filename(
      new.naming_kind, new.naming_base, new.tamano_code, new.duracion_code,
      new.genero_code, new.formato_code, new.idea_code, new.plataforma_code,
      new.version, new.mes_code);
  end if;
  return new;
end $$;
create trigger assets_filename_biu before insert or update on produccion.assets
  for each row execute function produccion.set_asset_filename();
