-- Rünna On Deck — P1 RLS, helpers, RPCs, workflow triggers (0002)
-- Auth model: 17 trusted internal users → permissive read, guarded write.
-- Clients (role='client') are HARD-scoped to published content of their own client.

-- ─────────────────────────────────────────────────────────────
-- Auth helpers. current_profile_id() reads the Supabase JWT claim ('sub');
-- works identically in PGlite tests via set_config('request.jwt.claims', …).
-- ─────────────────────────────────────────────────────────────
create or replace function produccion.current_profile_id()
returns uuid language sql stable as $$
  select nullif(
    current_setting('request.jwt.claims', true)::json->>'sub', ''
  )::uuid;
$$;

create or replace function produccion.auth_role()
returns produccion.app_role language sql stable
security definer set search_path = '' as $$
  select role from produccion.profiles
  where id = produccion.current_profile_id() and active;
$$;

create or replace function produccion.is_lead()
returns boolean language sql stable
security definer set search_path = '' as $$
  select coalesce(produccion.auth_role() in ('lead','admin'), false);
$$;

create or replace function produccion.is_delivery()
returns boolean language sql stable
security definer set search_path = '' as $$
  select coalesce(produccion.auth_role() in ('delivery','lead','admin'), false);
$$;

create or replace function produccion.is_client_user()
returns boolean language sql stable
security definer set search_path = '' as $$
  select coalesce(produccion.auth_role() = 'client', false);
$$;

create or replace function produccion.current_client_id()
returns uuid language sql stable
security definer set search_path = '' as $$
  select client_id from produccion.profiles where id = produccion.current_profile_id();
$$;

create or replace function produccion.is_assigned(p_idea_id uuid)
returns boolean language sql stable
security definer set search_path = '' as $$
  select exists (
    select 1 from produccion.idea_assignments
    where idea_id = p_idea_id and profile_id = produccion.current_profile_id()
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- read-time on planos — auto from dialogo (es-MX VO ≈ 2.5 words/sec).
-- ─────────────────────────────────────────────────────────────
create or replace function produccion.set_plano_read_time()
returns trigger language plpgsql as $$
declare words int;
begin
  if new.dialogo is null or length(trim(new.dialogo)) = 0 then
    new.read_time_s := 0;
  else
    words := array_length(regexp_split_to_array(trim(new.dialogo), '\s+'), 1);
    new.read_time_s := ceil(words / 2.5);
  end if;
  return new;
end $$;
create trigger planos_read_time_biu before insert or update on produccion.planos
  for each row execute function produccion.set_plano_read_time();

-- ─────────────────────────────────────────────────────────────
-- Status transitions
-- ─────────────────────────────────────────────────────────────
create or replace function produccion.transition_allowed(
  p_from produccion.asset_status, p_to produccion.asset_status
) returns boolean language sql immutable as $$
  select (p_from, p_to) in (
    ('todo','in_progress'),
    ('in_progress','under_review'),
    ('under_review','in_corrections'),
    ('under_review','completed'),
    ('in_corrections','in_progress'),
    ('completed','published'),
    ('published','in_corrections'),   -- client requested changes
    ('published','delivered'),        -- approved + delivery-verified
    ('completed','delivered')
  );
$$;

-- BEFORE UPDATE: validate the move (leads may move backward freely) + stamp timestamps.
create or replace function produccion.guard_asset_status()
returns trigger language plpgsql
security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    if not produccion.transition_allowed(old.status, new.status)
       and not produccion.is_lead() then
      raise exception 'Transición no permitida: % → %', old.status, new.status;
    end if;
    if new.status = 'completed'  and new.completed_at is null then new.completed_at := now(); end if;
    if new.status = 'published'  and new.published_at is null then new.published_at := now(); end if;
    if new.status = 'delivered'  and new.delivered_at is null then new.delivered_at := now(); end if;
  end if;
  return new;
end $$;
create trigger assets_status_guard_bu before update of status on produccion.assets
  for each row execute function produccion.guard_asset_status();

-- AFTER UPDATE: append-only status_events + activity_log.
create or replace function produccion.log_asset_status()
returns trigger language plpgsql
security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    insert into produccion.status_events(asset_id, from_status, to_status, actor_id)
      values (new.id, old.status, new.status, produccion.current_profile_id());
    insert into produccion.activity_log(entity_type, entity_id, actor_id, verb, payload)
      values ('asset', new.id, produccion.current_profile_id(), 'status_changed',
              jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end $$;
create trigger assets_status_log_au after update of status on produccion.assets
  for each row execute function produccion.log_asset_status();

-- ─────────────────────────────────────────────────────────────
-- RPCs (SECURITY DEFINER — enforce role inside)
-- ─────────────────────────────────────────────────────────────

-- Generate assets for an idea across valid size×platform combos (validity matrix).
-- Skips invalid combos and ones that already exist. Returns a summary.
create or replace function produccion.rpc_generate_assets(
  p_idea_id   uuid,
  p_sizes     text[],
  p_platforms text[],
  p_duracion  text default null
) returns jsonb language plpgsql
security definer set search_path = '' as $$
declare
  v_idea   produccion.ideas;
  v_media  text;
  v_size   text;
  v_plat   text;
  v_created int := 0;
  v_invalid int := 0;
  v_existing int := 0;
begin
  if not produccion.is_lead() then
    raise exception 'Solo un lead puede generar entregables';
  end if;

  select * into v_idea from produccion.ideas where id = p_idea_id;
  if not found then raise exception 'Idea no encontrada'; end if;

  v_media := case when v_idea.naming_kind = 'static' then 'static' else 'video' end;

  foreach v_size in array p_sizes loop
    foreach v_plat in array p_platforms loop
      if not exists (
        select 1 from produccion.size_platform_validity
        where media = v_media and tamano = v_size and plataforma = v_plat
      ) then
        v_invalid := v_invalid + 1;
        continue;
      end if;

      begin
        insert into produccion.assets
          (idea_id, brief_id, pod_id, wave_id, naming_kind, naming_base,
           tamano_code, plataforma_code, duracion_code, genero_code, formato_code,
           idea_code, mes_code, version)
        values
          (v_idea.id, v_idea.brief_id, v_idea.pod_id, v_idea.wave_id,
           v_idea.naming_kind, v_idea.naming_base, v_size, v_plat,
           case when v_idea.naming_kind = 'static' then null else p_duracion end,
           v_idea.genero_code, v_idea.formato_code, v_idea.code, v_idea.mes_code, 1);
        v_created := v_created + 1;
      exception when unique_violation then
        v_existing := v_existing + 1;
      end;
    end loop;
  end loop;

  return jsonb_build_object('created', v_created, 'skipped_invalid', v_invalid,
                            'skipped_existing', v_existing);
end $$;

-- Submit a new version of an asset's deliverable → V+1, prior superseded, status→under_review.
create or replace function produccion.rpc_submit_version(
  p_asset_id uuid, p_storage_path text, p_notes text default null
) returns int language plpgsql
security definer set search_path = '' as $$
declare v_asset produccion.assets; v_new int;
begin
  select * into v_asset from produccion.assets where id = p_asset_id;
  if not found then raise exception 'Asset no encontrado'; end if;
  if not (produccion.is_lead() or produccion.is_assigned(v_asset.idea_id)) then
    raise exception 'No estás asignado a esta idea';
  end if;

  update produccion.asset_versions set superseded_at = now()
    where asset_id = p_asset_id and superseded_at is null;

  v_new := v_asset.version + 1;
  insert into produccion.asset_versions(asset_id, version, filename_snapshot, storage_path, notes, submitted_by)
    values (p_asset_id, v_new, v_asset.filename, p_storage_path, p_notes, produccion.current_profile_id());

  update produccion.assets
    set version = v_new, storage_path = p_storage_path,
        status = case when status in ('in_corrections','in_progress','todo') then 'under_review' else status end
    where id = p_asset_id;

  return v_new;
end $$;

-- Lead requests a correction → comment + status flip + (P5) notification.
create or replace function produccion.rpc_request_correction(
  p_asset_id uuid, p_body text, p_mentions uuid[] default '{}'
) returns uuid language plpgsql
security definer set search_path = '' as $$
declare v_asset produccion.assets; v_comment uuid;
begin
  if not produccion.is_lead() then
    raise exception 'Solo un lead puede solicitar correcciones';
  end if;
  select * into v_asset from produccion.assets where id = p_asset_id;
  if not found then raise exception 'Asset no encontrado'; end if;

  insert into produccion.comments(asset_id, author_id, body, mentions, kind)
    values (p_asset_id, produccion.current_profile_id(), p_body, p_mentions, 'correction_request')
    returning id into v_comment;

  update produccion.assets set status = 'in_corrections' where id = p_asset_id;
  return v_comment;
end $$;

-- ─────────────────────────────────────────────────────────────
-- RLS — enable on every table, then policies.
-- ─────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'pods','profiles','clients','marcas','vocab_terms','size_platform_validity',
    'briefs','delivery_waves','idea_families','ideas','planos','assets','asset_versions',
    'idea_assignments','snippets','idea_snippets','references','idea_references',
    'comments','gary_reviews','status_events','activity_log','notifications','notification_deliveries'
  ] loop
    execute format('alter table produccion.%I enable row level security', t);
  end loop;
end $$;

-- Team = any active internal (non-client) profile.
create or replace function produccion.is_team()
returns boolean language sql stable
security definer set search_path = '' as $$
  select coalesce(produccion.auth_role() in ('admin','lead','creative','delivery'), false);
$$;

-- Reference-data + work tables: team reads all; leads write. (Read = is_team.)
do $$
declare t text;
begin
  foreach t in array array[
    'pods','clients','marcas','vocab_terms','size_platform_validity',
    'briefs','delivery_waves','idea_families','snippets','references'
  ] loop
    execute format($f$
      create policy %1$s_team_read on produccion.%1$I
        for select using (produccion.is_team());
      create policy %1$s_lead_write on produccion.%1$I
        for all using (produccion.is_lead()) with check (produccion.is_lead());
    $f$, t);
  end loop;
end $$;

-- profiles: team reads all; a user updates own row; leads manage.
create policy profiles_team_read on produccion.profiles
  for select using (produccion.is_team() or id = produccion.current_profile_id());
create policy profiles_self_update on produccion.profiles
  for update using (id = produccion.current_profile_id());
create policy profiles_lead_all on produccion.profiles
  for all using (produccion.is_lead()) with check (produccion.is_lead());

-- ideas: team read all; leads full; assigned creatives may update their ideas.
create policy ideas_team_read on produccion.ideas for select using (produccion.is_team());
create policy ideas_lead_all on produccion.ideas for all
  using (produccion.is_lead()) with check (produccion.is_lead());
create policy ideas_assigned_update on produccion.ideas for update
  using (produccion.is_assigned(id));

-- planos: team read; leads + assigned creatives write.
create policy planos_team_read on produccion.planos for select using (produccion.is_team());
create policy planos_write on produccion.planos for all
  using (produccion.is_lead() or produccion.is_assigned(idea_id))
  with check (produccion.is_lead() or produccion.is_assigned(idea_id));

-- assets: team read; leads full; assigned creatives update; delivery updates.
create policy assets_team_read on produccion.assets for select using (produccion.is_team());
create policy assets_lead_all on produccion.assets for all
  using (produccion.is_lead()) with check (produccion.is_lead());
create policy assets_assigned_update on produccion.assets for update
  using (produccion.is_assigned(idea_id) or produccion.is_delivery());

-- Team-read + owner-write for the rest of the collaborative tables.
do $$
declare t text;
begin
  foreach t in array array[
    'asset_versions','idea_assignments','idea_snippets','idea_references',
    'gary_reviews','status_events','activity_log'
  ] loop
    execute format($f$
      create policy %1$s_team_read on produccion.%1$I for select using (produccion.is_team());
      create policy %1$s_team_write on produccion.%1$I for all
        using (produccion.is_team()) with check (produccion.is_team());
    $f$, t);
  end loop;
end $$;

-- comments: team reads all + writes; author edits own.
create policy comments_team on produccion.comments for select using (produccion.is_team());
create policy comments_insert on produccion.comments for insert with check (produccion.is_team());
create policy comments_author_update on produccion.comments for update
  using (author_id = produccion.current_profile_id() or produccion.is_lead());

-- notifications: recipient reads/updates own.
create policy notif_own on produccion.notifications for select
  using (recipient_id = produccion.current_profile_id());
create policy notif_own_update on produccion.notifications for update
  using (recipient_id = produccion.current_profile_id());

-- ── CLIENT PORTAL scoping — clients see ONLY published content of their own client ──
create policy ideas_client_read on produccion.ideas for select using (
  produccion.is_client_user()
  and published_at is not null
  and brief_id in (
    select b.id from produccion.briefs b where b.client_id = produccion.current_client_id()
  )
);
create policy assets_client_read on produccion.assets for select using (
  produccion.is_client_user()
  and status in ('published','delivered')
  and brief_id in (
    select b.id from produccion.briefs b where b.client_id = produccion.current_client_id()
  )
);
create policy planos_client_read on produccion.planos for select using (
  produccion.is_client_user()
  and idea_id in (
    select i.id from produccion.ideas i
    join produccion.briefs b on b.id = i.brief_id
    where i.published_at is not null and b.client_id = produccion.current_client_id()
  )
);
-- Clients may comment on their own published ideas (change requests).
create policy comments_client on produccion.comments for select using (
  produccion.is_client_user() and idea_id in (
    select i.id from produccion.ideas i
    join produccion.briefs b on b.id = i.brief_id
    where i.published_at is not null and b.client_id = produccion.current_client_id()
  )
);
create policy comments_client_insert on produccion.comments for insert with check (
  produccion.is_client_user() and idea_id in (
    select i.id from produccion.ideas i
    join produccion.briefs b on b.id = i.brief_id
    where i.published_at is not null and b.client_id = produccion.current_client_id()
  )
);
