-- ─────────────────────────────────────────────────────────────
-- 0084 · EL RELOJ de los correos agrupados — se corre A MANO, una vez (Pedro).
--
-- Por qué no es una migración: toca esquemas fuera de `produccion` (cron, net, vault), y
-- check-isolation prohíbe eso en migraciones porque el proyecto se comparte con S.P.A.M.
-- Aquí no se toca NADA de S.P.A.M: un esquema propio (`greenlight_privado`), un job con
-- nombre propio, y se LEE un solo secreto con nombre propio.
--
-- Qué hace: cada minuto mira si a algún correo agrupado ya le llegó su turno. Sólo si hay
-- algo, despierta a la app (POST /api/avisos/enviar) con el secreto. Sin el reloj, lo que
-- espera su turno sale con el siguiente envío normal de la app (más tarde, pero sale).
--
-- ANTES de correrlo:
--   1. Que la migración 0084 esté aplicada y la app con 0084 en producción.
--   2. Un secreto largo y aleatorio, el MISMO en dos lugares:
--      · Vercel → greenlight → Settings → Environment Variables → CRON_SECRET (Production).
--      · Supabase → Project Settings → Vault → Add new secret, con el nombre
--        greenlight_cron_secret (por el formulario, NO en el SQL Editor: ahí el secreto
--        quedaría escrito en el historial de consultas, que ven también los de S.P.A.M).
--   Luego: Supabase → SQL Editor → pegar este archivo → Run.
-- Para apagarlo: select cron.unschedule('greenlight-correos-agrupados');
-- ─────────────────────────────────────────────────────────────

-- Esquema PRIVADO: no lo expone la API y no tiene permisos por defecto, así que ningún
-- "grant execute on all routines in schema produccion" futuro puede abrir esta función
-- (que lee un secreto).
create schema if not exists greenlight_privado;
revoke all on schema greenlight_privado from public, anon, authenticated, service_role;

create or replace function greenlight_privado.tick_correos()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_secret text;
begin
  if not exists (
    select 1 from produccion.notification_deliveries d
     where d.channel = 'email'
       and (
         (d.status = 'pending' and (d.not_before is null or d.not_before <= now()))
         or (d.status = 'sending' and coalesce(d.claimed_at, d.created_at) < now() - interval '15 minutes')
       )
  ) then
    return; -- nada cuyo turno haya llegado: no se despierta a nadie
  end if;
  select s.decrypted_secret into v_secret
    from vault.decrypted_secrets s
   where s.name = 'greenlight_cron_secret';
  if v_secret is null then
    -- Que se NOTE (queda en los logs de Postgres): hay correos esperando y nadie los manda.
    raise warning 'greenlight: hay correos esperando turno pero falta el secreto greenlight_cron_secret en Vault';
    return;
  end if;
  perform net.http_post(
    url := 'https://runna-greenlight.vercel.app/api/avisos/enviar',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end $$;

revoke all on function greenlight_privado.tick_correos() from public, anon, authenticated, service_role;

select cron.schedule('greenlight-correos-agrupados', '* * * * *', 'select greenlight_privado.tick_correos()');
