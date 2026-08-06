-- Greenlight 0024 — atributos de persona para el panel de Equipo
--
-- Las "personas" de Greenlight son track_members (los 14; la fuente real en la
-- beta sin login), NO profiles (el espejo de auth, hoy sólo Pedro). Los atributos
-- que el panel administra viven en track_members; al encender el login se
-- siembran al profile de cada quien vía track_members.profile_id. NUNCA crear
-- profiles falsos con uuid inventado (lección 0008: rompería el login de Google).

alter table produccion.track_members
  add column if not exists role          produccion.app_role not null default 'creative',
  add column if not exists email         text,
  add column if not exists slack_user_id text;

-- Un valor de enum nuevo ('master') obliga a auditar cada filtro que ramifica por
-- rol (lección new-enum-value). Los 3 helpers RLS que definen "quién puede" deben
-- reconocer master como el tope. Sólo participan cuando el login esté encendido,
-- pero se dejan correctos desde ya.
create or replace function produccion.is_lead()
returns boolean language sql stable
security definer set search_path = '' as $$
  select coalesce(produccion.auth_role() in ('lead','admin','master'), false);
$$;

create or replace function produccion.is_delivery()
returns boolean language sql stable
security definer set search_path = '' as $$
  select coalesce(produccion.auth_role() in ('delivery','lead','admin','master'), false);
$$;

create or replace function produccion.is_team()
returns boolean language sql stable
security definer set search_path = '' as $$
  select coalesce(produccion.auth_role() in ('admin','lead','creative','delivery','master'), false);
$$;
