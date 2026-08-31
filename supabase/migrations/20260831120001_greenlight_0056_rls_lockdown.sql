-- ─────────────────────────────────────────────────────────────
-- 0056 — RLS LOCKDOWN: cerrar la puerta pública al esquema `produccion`.
--
-- CONTEXTO (build-then-lock, decisión de Pedro): la app se construyó con RLS
-- permisivo para testear sin fricción. Ésta es la vuelta de llave deliberada.
--
-- EL HUECO QUE CIERRA. La 0006 concedió `produccion` a los roles de PostgREST
-- (`anon`, `authenticated`) asumiendo que RLS filtraría — pero (a) la mitad de las
-- 44 tablas nunca llegó a tener RLS, y (b) la anon key es PÚBLICA: viaja en el
-- bundle del navegador. Con esa llave + la URL del proyecto, cualquiera podía
-- pegarle directo a la API REST (`/rest/v1/ideas`, `/rest/v1/rpc/rpc_task_approve`)
-- y leer o mover datos SALTÁNDOSE por completo los gates del código. Ésa era la
-- única exposición real que quedaba.
--
-- POR QUÉ ESTE ENFOQUE (y no escribir políticas RLS por tabla). Auditado el
-- 2026-08-31: el 100% de las lecturas/escrituras de datos va por el cliente
-- SERVICE-ROLE (`src/lib/supabase-admin.ts`); la anon key se usa SÓLO para AUTH
-- (login Google, logout, magic link, getUser) y no corre ni una query de datos.
-- No hay Realtime. Escribir políticas para `authenticated` sería re-implementar
-- TODO el modelo de permisos una segunda vez en SQL, para un camino que la app no
-- usa — dos fuentes de verdad que driftan (justo la clase de bug que cazó la
-- barrida de invariantes). Se le quita el acceso a la llave pública y punto; los
-- gates de código (ya auditados) siguen siendo la frontera.
--
-- REQUISITO PREVIO (ya hecho en este mismo cambio): el amarre de cliente del proxy
-- (`src/lib/supabase/middleware.ts`) leía `profiles`/`clients` con el cliente de
-- SESIÓN (rol `authenticated`). Se movió a service-role. Era la ÚNICA lectura de
-- datos fuera de service-role — sin ese cambio, esta migración rompería el amarre.
--
-- REVERSIBLE: re-conceder es un `grant` (ver 0006). No borra ni un dato.
-- ─────────────────────────────────────────────────────────────

-- ── 1) Quitarle el esquema a las llaves públicas ────────────────────────────
-- `usage` es el interruptor maestro: sin él, `anon`/`authenticated` no pueden
-- resolver NINGÚN objeto de produccion (tablas, vistas como board_tasks, ni RPCs),
-- aunque quedara un grant suelto por ahí.
revoke usage on schema produccion from anon, authenticated;

revoke all privileges on all tables    in schema produccion from anon, authenticated;
revoke all privileges on all sequences in schema produccion from anon, authenticated;
revoke all privileges on all routines  in schema produccion from anon, authenticated;

-- ── 2) Que lo FUTURO nazca cerrado ──────────────────────────────────────────
-- La 0006 dejó `alter default privileges ... grant all ... to anon, authenticated`,
-- así que una tabla creada mañana volvería a quedar expuesta sola. Se revierte ese
-- default (mismo grantor: el rol que corre las migraciones).
alter default privileges in schema produccion revoke all on tables    from anon, authenticated;
alter default privileges in schema produccion revoke all on sequences from anon, authenticated;
alter default privileges in schema produccion revoke all on functions from anon, authenticated;

-- ── 3) service_role conserva TODO (por aquí va la app entera) ───────────────
-- Explícito y no negociable: si esto faltara, la aplicación dejaría de funcionar.
grant usage on schema produccion to service_role;
grant all privileges on all tables    in schema produccion to service_role;
grant all privileges on all sequences in schema produccion to service_role;
grant all privileges on all routines  in schema produccion to service_role;
alter default privileges in schema produccion grant all on tables    to service_role;
alter default privileges in schema produccion grant all on sequences to service_role;
alter default privileges in schema produccion grant all on functions to service_role;

-- ── 4) RLS en TODA tabla que aún no la tenga (segundo cerrojo) ──────────────
-- Deny-by-default: una tabla con RLS y sin políticas no deja pasar a nadie que no
-- tenga BYPASSRLS. `service_role` (BYPASSRLS en Supabase) y el owner siguen
-- pasando, así que la app no se entera. Es defensa en profundidad por si algún día
-- alguien vuelve a conceder el esquema por error.
-- Dinámico a propósito: enumerar 44 nombres a mano es una lista que se desactualiza;
-- esto no puede saltarse una tabla ni hoy ni mañana. Idempotente.
do $$
declare r record;
begin
  for r in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'produccion'
       and c.relkind = 'r'
       and not c.relrowsecurity
  loop
    execute format('alter table produccion.%I enable row level security', r.relname);
  end loop;
end $$;
