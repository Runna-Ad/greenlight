-- ═══════════════════════════════════════════════════════════════
-- 0049 — Invariante de scope de tenant (defensa en profundidad)
-- ═══════════════════════════════════════════════════════════════
-- El aislamiento multi-tenant de H.Ü.E (global / client / marca) dependía SÓLO de
-- un invariante mantenido a mano en el código: una fila scope='marca' guarda
-- client_id = NULL, si no el filtro OR del writer (`client_id.eq.<cliente>`) la
-- pesca para una marca HERMANA del mismo cliente (Card → Préstamos). El sync de
-- legales de Notion ROMPÍA ese invariante en `snippets` (guardaba el client_id de
-- la marca) → el legal de una marca se filtraba al guión de otra.
--
-- El código ya se corrigió (reap 2026-08-26: legales-actions guarda NULL, y el
-- writer usa marca_id+global para el legal). Esta migración (a) REPARA los datos
-- existentes en prod y (b) hace que la BASE haga cumplir el invariante en las
-- tablas del Cerebro/KB, para que ningún writer futuro —ni un fix a mano por SQL—
-- pueda re-introducir la fuga. Todo en `produccion` (check-isolation lo exige).

-- ── 1) REPARA datos: legales de marca con client_id colado → NULL ──────────────
-- (el bug del sync; el código ya guarda NULL going-forward, esto limpia lo viejo)
update produccion.snippets
   set client_id = null
 where scope = 'marca' and client_id is not null;

-- ── 2) Normaliza cualquier fila inconsistente de Cerebro/KB antes del CHECK ─────
--     (hoy resolverScope ya escribe filas consistentes; esto es un seguro por si
--      alguna quedó torcida por un fix a mano antes del constraint)
update produccion.hue_instructions set client_id = null, marca_id = null where scope = 'global';
update produccion.hue_instructions set marca_id = null where scope = 'client';
update produccion.hue_instructions set client_id = null where scope = 'marca';
update produccion.hue_kb_documents  set client_id = null, marca_id = null where scope = 'global';
update produccion.hue_kb_documents  set marca_id = null where scope = 'client';
update produccion.hue_kb_documents  set client_id = null where scope = 'marca';

-- ── 3) CHECK: ata scope ↔ qué id está poblado (S1 del reap DB) ──────────────────
--     Guardado en DO block → re-ejecutable sin fallar (M6: hygiene de replay).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'hue_instructions_scope_ck') then
    alter table produccion.hue_instructions add constraint hue_instructions_scope_ck check (
      (scope = 'global' and client_id is null     and marca_id is null) or
      (scope = 'client' and client_id is not null and marca_id is null) or
      (scope = 'marca'  and marca_id  is not null and client_id is null)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'hue_kb_documents_scope_ck') then
    alter table produccion.hue_kb_documents add constraint hue_kb_documents_scope_ck check (
      (scope = 'global' and client_id is null     and marca_id is null) or
      (scope = 'client' and client_id is not null and marca_id is null) or
      (scope = 'marca'  and marca_id  is not null and client_id is null)
    );
  end if;
end $$;

-- NOTA (follow-on, requiere auditar el dominio de `snippets.scope` primero):
-- añadir el MISMO CHECK a produccion.snippets cerraría el invariante también ahí.
-- Se omite aquí porque snippets tiene otros kinds (selling_point, …) y su columna
-- scope podría contener valores fuera de (global,client,marca); un CHECK ciego
-- tumbaría la migración. La reparación (1) + los fixes de código ya cierran la
-- fuga del legal; el CHECK sobre snippets es hardening adicional para otro día.
