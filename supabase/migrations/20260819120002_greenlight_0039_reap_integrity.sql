-- ═══════════════════════════════════════════════════════════════
-- 0039 — Reap: integridad de correcciones localizadas (S1)
-- ═══════════════════════════════════════════════════════════════
-- Del reap full-platform (tasks/reap-2026-08-19.md), hallazgo S1.
--
-- `comments.target_fila_id` (0028) es polimórfico (apunta a planos O estaticos vía
-- target_tabla) y por eso NO tiene FK ni lo cubre el cascade de ideas. Cuando se
-- borra un plano/estático — `borrarPlano` (borrado suelto) o `rpc_import_planos`
-- modo 'replace' (borra todos y re-inserta con PKs nuevas) — cada corrección que le
-- apuntaba queda HUÉRFANA: sigue contando como sin resolver, así que
-- `correction_next_round` nunca cierra la ronda, y la UI no puede ubicarla/confirmarla
-- (sólo la limpia aprobar o descartar a mano).
--
-- Fix: un trigger BEFORE DELETE en planos/estaticos borra las correcciones ancladas
-- a esa fila (el contenido que referían ya no existe → la corrección es moot). Esto
-- desbloquea el cierre de ronda y mantiene la integridad que el FK no puede dar.
-- Nota: en 'replace' esto borra las correcciones ancladas de esa idea — es correcto
-- (se está reemplazando el guión entero); si algún día se quiere preservar, el camino
-- es re-mapear por `orden` en el import, no quitar este trigger.

create or replace function produccion.trg_borrar_correcciones_huerfanas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- tg_argv[0] = 'planos' | 'estaticos' (la tabla dueña, pasada por cada trigger).
  delete from produccion.comments
   where target_tabla = tg_argv[0]
     and target_fila_id = old.id;
  return old;
end;
$$;

drop trigger if exists before_delete_plano_correcciones on produccion.planos;
create trigger before_delete_plano_correcciones
  before delete on produccion.planos
  for each row execute function produccion.trg_borrar_correcciones_huerfanas('planos');

drop trigger if exists before_delete_estatico_correcciones on produccion.estaticos;
create trigger before_delete_estatico_correcciones
  before delete on produccion.estaticos
  for each row execute function produccion.trg_borrar_correcciones_huerfanas('estaticos');
