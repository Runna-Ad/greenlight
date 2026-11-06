-- ─────────────────────────────────────────────────────────────
-- 0094 · EL RELOJ de Notion — se corre A MANO, una vez (Pedro, 2026-11-06).
--
-- Qué hace: cada hora (minuto 7) despierta a la app (POST /api/notion/sync) con el MISMO
-- secreto del reloj de correos (greenlight_cron_secret en Vault = CRON_SECRET en Vercel,
-- ya probados iguales el 2026-11-03). La app baja de Notion los legales y las páginas de
-- marca (Onboarding y Lineamientos de DiDi Card y DiDi Préstamos) para que H.Ü.E escriba
-- y revise con los selling points y cifras de hoy.
--
-- Por qué no es una migración: usa cron/net/vault (fuera de `produccion`); igual que 0084.
-- ANTES de correrlo: la app con /api/notion/sync en PRODUCCIÓN (si no, la llamada da 404).
-- Correr: Supabase → SQL Editor → pegar este archivo → Run.
-- Para apagarlo: select cron.unschedule('greenlight-notion-sync');
-- ─────────────────────────────────────────────────────────────

create schema if not exists greenlight_privado;
revoke all on schema greenlight_privado from public, anon, authenticated, service_role;

create or replace function greenlight_privado.tick_notion()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_secret text;
begin
  select s.decrypted_secret into v_secret
    from vault.decrypted_secrets s
   where s.name = 'greenlight_cron_secret';
  if v_secret is null then
    raise warning 'greenlight: falta el secreto greenlight_cron_secret en Vault; Notion no se sincroniza';
    return;
  end if;
  perform net.http_post(
    url := 'https://runna-greenlight.vercel.app/api/notion/sync',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end $$;

revoke all on function greenlight_privado.tick_notion() from public, anon, authenticated, service_role;

-- Idempotente: si ya existía el job, se reemplaza.
select cron.unschedule(jobid) from cron.job where jobname = 'greenlight-notion-sync';
select cron.schedule('greenlight-notion-sync', '7 * * * *', $$select greenlight_privado.tick_notion()$$);
