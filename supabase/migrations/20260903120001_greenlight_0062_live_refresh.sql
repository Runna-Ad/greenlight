-- ─────────────────────────────────────────────────────────────
-- 0062 — LIVE REFRESH: la plataforma se entera sola de los cambios (Realtime Broadcast).
--
-- Pedro (2026-09-03): "la plataforma debe refrescarse sola cuando cambia un estado — tarea
-- nueva asignada, de en progreso a en revisión, etc. — para que nadie tenga que recargar".
--
-- CÓMO. Un trigger POR SENTENCIA en `ideas` / `idea_assignments` emite UN mensaje de
-- Realtime Broadcast por destinatario (`realtime.send`) en un canal PRIVADO por persona:
-- `greenlight:user:<profile_id>`. El navegador (LiveRefresh, en el layout) escucha su
-- canal y hace `router.refresh()`. El payload NO lleva contenido (kind + slug del cliente
-- + ids): la vista se re-lee por el camino normal (service-role + gates de código).
--
-- POR QUÉ Broadcast y no Postgres Changes: Postgres Changes exige que `authenticated`
-- tenga SELECT sobre la tabla (y RLS por fila) — eso reabriría la puerta que la 0056
-- cerró (la anon key es pública). Broadcast no toca tablas de produccion.
--
-- POR QUÉ un canal POR PERSONA (y no "equipo" / "cliente"): la política de autorización
-- de Realtime corre como `authenticated`, que NO tiene `usage` sobre produccion (0056).
-- Con topic = 'greenlight:user:' || auth.uid() la política no necesita leer NADA de
-- produccion — el candado queda intacto. QUIÉN recibe QUÉ lo decide el trigger (que corre
-- como definer): equipo activo → todo; cuenta de cliente → sólo lo de su cliente.
-- 14 personas × 1 mensaje por sentencia: trivial (retención de realtime.messages: días).
--
-- POR SENTENCIA (transition tables), no por fila: un import de 300 tareas emite 1 aviso
-- por persona, no 300. El debounce del navegador colapsa el resto.
--
-- Toca `realtime.messages` (una sola policy con prefijo greenlight_) y llama a
-- `realtime.send` / `realtime.topic` — excepción explícita y ACOTADA en check-isolation.
-- En PGlite (test-db) no existe el esquema realtime: la emisión va envuelta en exception
-- y la policy en un DO condicional. Un aviso NUNCA tumba el write que lo originó.
-- ─────────────────────────────────────────────────────────────

-- ── 1) A qué cliente pertenece una tarea (brief → marca, como en el resto de la app) ──
create or replace function produccion.live_client_de(p_brief_id uuid, p_marca_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select b.client_id from produccion.briefs b where b.id = p_brief_id),
    (select m.client_id from produccion.marcas m where m.id = p_marca_id));
$$;

-- ── 2) Emitir: un mensaje por destinatario, en SU canal privado ──────────────
create or replace function produccion.live_emit(
  p_kind text, p_tabla text, p_client_ids uuid[], p_idea_ids uuid[]
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_payload jsonb;
  r record;
begin
  v_payload := jsonb_build_object(
    'kind',  p_kind,
    'tabla', p_tabla,
    'client_slugs', coalesce(
      (select array_agg(c.slug) from produccion.clients c where c.id = any(p_client_ids)),
      '{}'::text[]),
    -- Tope: un import grande no necesita listar 300 ids — el navegador sólo re-lee.
    'idea_ids', coalesce(p_idea_ids[1:20], '{}'::uuid[]),
    'at', now());

  for r in
    select p.id
      from produccion.profiles p
     where p.active
       and (p.role <> 'client' or p.client_id = any(p_client_ids))
  loop
    begin
      perform realtime.send(v_payload, 'cambio', 'greenlight:user:' || r.id::text, true);
    exception when others then
      -- Un aviso NUNCA tumba el write que lo originó. Si no existe `realtime.send`
      -- (PGlite, o Realtime apagado) no tiene sentido seguir iterando: fuera. Cualquier
      -- otro fallo es de ESE destinatario — se sigue con los demás (reap 2026-09-03).
      if sqlstate = '42883' then return; end if;
    end;
  end loop;
end $$;

-- ── 3) ideas: alta / baja / cambio de estado (o papelera / publicación / entrega) ──
create or replace function produccion.live_ideas_stmt()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_n       int := 0;
  v_clients uuid[];
  v_ids     uuid[];
begin
  if tg_op = 'INSERT' then
    select count(*), array_agg(distinct produccion.live_client_de(n.brief_id, n.marca_id)), array_agg(n.id)
      into v_n, v_clients, v_ids
      from nuevos n;
  elsif tg_op = 'DELETE' then
    select count(*), array_agg(distinct produccion.live_client_de(v.brief_id, v.marca_id)), array_agg(v.id)
      into v_n, v_clients, v_ids
      from viejos v;
  else
    -- Sólo las filas cuyo valor REALMENTE cambió (un `set status = status` no avisa).
    select count(*), array_agg(distinct produccion.live_client_de(n.brief_id, n.marca_id)), array_agg(n.id)
      into v_n, v_clients, v_ids
      from nuevos n join viejos v on v.id = n.id
     where n.status       is distinct from v.status
        or n.deleted_at   is distinct from v.deleted_at
        or n.published_at is distinct from v.published_at
        or n.delivered_at is distinct from v.delivered_at;
  end if;

  if coalesce(v_n, 0) > 0 then
    perform produccion.live_emit(lower(tg_op), 'ideas', v_clients, v_ids);
  end if;
  return null;
end $$;

drop trigger if exists ideas_live_ai on produccion.ideas;
create trigger ideas_live_ai after insert on produccion.ideas
  referencing new table as nuevos
  for each statement execute function produccion.live_ideas_stmt();

drop trigger if exists ideas_live_au on produccion.ideas;
-- Sin `update of <columnas>`: Postgres no admite lista de columnas junto con transition
-- tables. El filtro de qué columnas importan vive en la función (`is distinct from`);
-- un autosave de otro campo entra, no encuentra cambios vigilados y sale sin emitir.
create trigger ideas_live_au after update on produccion.ideas
  referencing old table as viejos new table as nuevos
  for each statement execute function produccion.live_ideas_stmt();

drop trigger if exists ideas_live_ad on produccion.ideas;
create trigger ideas_live_ad after delete on produccion.ideas
  referencing old table as viejos
  for each statement execute function produccion.live_ideas_stmt();

-- ── 4) idea_assignments: asignar / reasignar / quitar ────────────────────────
create or replace function produccion.live_assign_stmt()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_n       int := 0;
  v_clients uuid[];
  v_ids     uuid[];
begin
  if tg_op = 'DELETE' then
    -- Nota: en un borrado EN CASCADA (se borró la idea) este join ya no encuentra la idea
    -- → 0 avisos aquí; el `delete` lo emite ideas_live_ad. No dependas de `assign` ahí.
    select count(*), array_agg(distinct produccion.live_client_de(i.brief_id, i.marca_id)), array_agg(distinct i.id)
      into v_n, v_clients, v_ids
      from viejos v join produccion.ideas i on i.id = v.idea_id;
  elsif tg_op = 'UPDATE' then
    -- Sólo si cambió QUIÉN o su papel (mismo criterio "cambio real" que en ideas).
    select count(*), array_agg(distinct produccion.live_client_de(i.brief_id, i.marca_id)), array_agg(distinct i.id)
      into v_n, v_clients, v_ids
      from nuevos n join viejos v on v.id = n.id
      join produccion.ideas i on i.id = n.idea_id
     where n.member_id is distinct from v.member_id
        or n.es_lead   is distinct from v.es_lead
        or n.idea_id   is distinct from v.idea_id;
  else
    select count(*), array_agg(distinct produccion.live_client_de(i.brief_id, i.marca_id)), array_agg(distinct i.id)
      into v_n, v_clients, v_ids
      from nuevos n join produccion.ideas i on i.id = n.idea_id;
  end if;

  if coalesce(v_n, 0) > 0 then
    perform produccion.live_emit('assign', 'idea_assignments', v_clients, v_ids);
  end if;
  return null;
end $$;

drop trigger if exists assign_live_ai on produccion.idea_assignments;
create trigger assign_live_ai after insert on produccion.idea_assignments
  referencing new table as nuevos
  for each statement execute function produccion.live_assign_stmt();

drop trigger if exists assign_live_au on produccion.idea_assignments;
create trigger assign_live_au after update on produccion.idea_assignments
  referencing old table as viejos new table as nuevos
  for each statement execute function produccion.live_assign_stmt();

drop trigger if exists assign_live_ad on produccion.idea_assignments;
create trigger assign_live_ad after delete on produccion.idea_assignments
  referencing old table as viejos
  for each statement execute function produccion.live_assign_stmt();

-- ── 5) Autorización del canal: cada quien SÓLO su propio topic ───────────────
-- Corre como `authenticated` sin tocar produccion (0056 intacto). `realtime.topic()`
-- es el topic al que intenta unirse; `auth.uid()` es el sub del JWT (= profiles.id).
do $$
begin
  if to_regclass('realtime.messages') is null then return; end if;  -- PGlite / sin Realtime
  execute $p$ drop policy if exists greenlight_live_propio on realtime.messages $p$;
  execute $p$
    create policy greenlight_live_propio on realtime.messages
      for select to authenticated
      using (realtime.topic() = 'greenlight:user:' || (select auth.uid())::text)
  $p$;
end $$;

-- Candado 0061: nada de esto es ejecutable por la llave pública (lo llama el trigger).
revoke execute on function produccion.live_client_de(uuid, uuid) from public, anon, authenticated;
revoke execute on function produccion.live_emit(text, text, uuid[], uuid[]) from public, anon, authenticated;
revoke execute on function produccion.live_ideas_stmt() from public, anon, authenticated;
revoke execute on function produccion.live_assign_stmt() from public, anon, authenticated;
