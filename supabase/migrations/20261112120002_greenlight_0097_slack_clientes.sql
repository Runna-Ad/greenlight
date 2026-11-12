-- ─────────────────────────────────────────────────────────────────────────────
-- 0097 — Slack para clientes, varios espacios de Slack y los interruptores generales.
--
-- Pedro (2026-11-12), opción 1 + opción A:
-- 1) `slack_conexiones`: un espacio de Slack conectado con «Add to Slack», atado a un
--    cliente (DiDi ▸ runna-didi préstamos). El token va CIFRADO por la app (AES-GCM con
--    SLACK_TOKEN_KEY): la base nunca ve el token en claro. El Slack de Runna sigue siendo
--    SLACK_BOT_TOKEN en Vercel (no vive aquí).
-- 2) `slack_instalaciones`: el link de instalación que genera un admin. Su id es el `state`
--    del OAuth: sirve UNA vez y vence (7 días), así un link viejo o copiado no conecta nada.
-- 3) `notif_canales`: los 4 interruptores generales (correo/Slack × equipo/clientes).
-- 4) `profiles.slack_team_id`: el espacio del slack_user_id de un cliente.
-- Todo sólo lo toca el servidor (service_role): sin políticas para anon/authenticated.
-- ─────────────────────────────────────────────────────────────────────────────

-- Un espacio por cliente y un cliente por espacio. Llega PENDIENTE (active = false): una liga
-- reenviada o filtrada no basta para recibir los avisos de un cliente; un admin de Runna ve el
-- nombre del espacio en Integraciones y lo aprueba.
create table produccion.slack_conexiones (
  id             uuid primary key default gen_random_uuid(),
  team_id        text not null unique,
  team_name      text,
  client_id      uuid not null unique references produccion.clients(id) on delete cascade,
  bot_user_id    text,
  token_cifrado  text not null,
  instalado_por  uuid references produccion.profiles(id) on delete set null,
  active         boolean not null default false,
  aprobado_por   uuid references produccion.profiles(id) on delete set null,
  aprobado_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- `redirect_uri`: el regreso EXACTO que se puso en la liga; Slack exige el mismo al canjear.
create table produccion.slack_instalaciones (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references produccion.clients(id) on delete cascade,
  creado_por    uuid references produccion.profiles(id) on delete set null,
  redirect_uri  text not null,
  expira_at     timestamptz not null default now() + interval '7 days',
  usado_at      timestamptz,
  team_id       text,
  created_at    timestamptz not null default now()
);

create table produccion.notif_canales (
  audiencia   text not null check (audiencia in ('equipo', 'clientes')),
  canal       text not null check (canal in ('email', 'slack')),
  activo      boolean not null default true,
  updated_at  timestamptz not null default now(),
  primary key (audiencia, canal)
);

insert into produccion.notif_canales (audiencia, canal, activo) values
  ('equipo', 'email', true), ('equipo', 'slack', true),
  ('clientes', 'email', true), ('clientes', 'slack', true)
on conflict do nothing;

alter table produccion.profiles add column if not exists slack_team_id text;
comment on column produccion.profiles.slack_team_id is
  'Espacio de Slack (team id, T…) del slack_user_id de un cliente.';

-- Sólo el servidor. RLS encendido y sin políticas = nadie con sesión las lee ni escribe.
alter table produccion.slack_conexiones enable row level security;
alter table produccion.slack_instalaciones enable row level security;
alter table produccion.notif_canales enable row level security;
revoke all on produccion.slack_conexiones, produccion.slack_instalaciones, produccion.notif_canales
  from public, anon, authenticated;
grant all on produccion.slack_conexiones, produccion.slack_instalaciones, produccion.notif_canales
  to service_role;

create trigger set_updated_at_slack_conexiones before update on produccion.slack_conexiones
  for each row execute function produccion.set_updated_at();
