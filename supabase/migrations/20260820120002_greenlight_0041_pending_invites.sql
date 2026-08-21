-- ═══════════════════════════════════════════════════════════════
-- 0041 — Solicitudes de acceso de CLIENTES (pending_invites)
-- ═══════════════════════════════════════════════════════════════
-- El partner (cliente externo) pide acceso desde /portal/login: escribe su email,
-- su nombre y —opcional— la marca con la que cree estar. Eso NO lo autentica ni le
-- manda un link: crea una SOLICITUD PENDIENTE que un admin revisa. Al aprobarla, el
-- admin elige cliente + marca, se crea el profile del cliente (role='client',
-- scopeado a ese client_id) y HASTA ENTONCES se le manda el magic-link. (Pedro.)
--
-- El insert lo hace el server action con la service-role key (como todo el resto de
-- la app hoy), así que no hace falta abrir una policy de insert para anon. La RLS de
-- abajo es defensa en profundidad para cuando las lecturas pasen al cliente anon:
-- sólo admin/master ven y deciden solicitudes; jamás un cliente ni el equipo general.

create table produccion.pending_invites (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  name            text not null,
  requested_brand text,                                   -- texto libre: la marca que el cliente CREE
  status          text not null default 'pending'
                    check (status in ('pending','approved','rejected')),
  -- se llenan al DECIDIR:
  client_id       uuid references produccion.clients(id) on delete set null,
  marca_id        uuid references produccion.marcas(id)  on delete set null,
  note            text,                                   -- nota interna opcional del admin
  decided_by      uuid references produccion.profiles(id) on delete set null,
  decided_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Una sola solicitud PENDIENTE por email (re-solicitar actualiza la fila viva en vez
-- de acumular duplicados). Ya decidida (approved/rejected) puede volver a solicitar.
create unique index pending_invites_email_pending
  on produccion.pending_invites (lower(email)) where status = 'pending';

create index pending_invites_status_idx on produccion.pending_invites (status, created_at desc);

alter table produccion.pending_invites enable row level security;

-- Sólo admin/master (nivel configuración) leen y deciden. No hay helper is_admin()
-- (admin va dentro de is_lead), así que se comprueba el rol directo.
create policy pending_invites_admin_read on produccion.pending_invites
  for select using (produccion.auth_role() in ('admin','master'));
create policy pending_invites_admin_write on produccion.pending_invites
  for all using (produccion.auth_role() in ('admin','master'))
  with check (produccion.auth_role() in ('admin','master'));

-- mantener updated_at (reusa el trigger genérico si existe; si no, uno propio)
create or replace function produccion.pending_invites_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger pending_invites_touch before update on produccion.pending_invites
  for each row execute function produccion.pending_invites_touch();

grant select, insert, update, delete on produccion.pending_invites to service_role;
grant select, update on produccion.pending_invites to authenticated;
