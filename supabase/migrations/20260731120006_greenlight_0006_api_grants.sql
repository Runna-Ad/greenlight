-- Greenlight — expose `produccion` to the Supabase API (0006)
--
-- A newly created schema grants nothing to the PostgREST roles, so every API
-- call fails with "permission denied for schema produccion" even after the
-- schema is added to the exposed list. `public` only works out of the box
-- because Supabase grants it at project creation.
--
-- Granting to anon/authenticated is safe: RLS is enabled on every table in this
-- schema, so those roles still see only what a policy allows. service_role
-- bypasses RLS by design and is used exclusively server-side.

-- These roles exist on Supabase but not in a bare Postgres (e.g. the PGlite
-- harness used for local tests), so create them if absent to keep the same
-- migration runnable in both places.
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I noinherit', r);
    end if;
  end loop;
end $$;

grant usage on schema produccion to anon, authenticated, service_role;

grant all on all tables    in schema produccion to anon, authenticated, service_role;
grant all on all sequences in schema produccion to anon, authenticated, service_role;
grant all on all functions in schema produccion to anon, authenticated, service_role;

-- Anything created later inherits the same grants, so a future migration can't
-- silently produce a table the API can't reach.
alter default privileges in schema produccion
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema produccion
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema produccion
  grant all on functions to anon, authenticated, service_role;
