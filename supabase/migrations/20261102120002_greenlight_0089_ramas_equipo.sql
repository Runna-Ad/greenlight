-- ══════════════════════════════════════════════════════════════════════════════
-- 0089 — Equipo: la rama de cada persona (Creativo, Diseño o Producción)
-- ══════════════════════════════════════════════════════════════════════════════
-- Una persona está en UNA rama; dentro de ella sigue siendo Lead o Especialista, con sus tracks. Por ahora sólo es un
-- dato: no cambia qué ve ni qué puede hacer nadie. Admin y Master son globales: su rama se ignora (ramaDe, equipo.ts).
-- Columna nueva a propósito, aparte de `disciplina` (0076): en la base viva esa columna ya decide quién recibe avisos
-- de revisión (fan_out_task_notification), y marcar a alguien de Diseño aquí no debe cambiar eso.
-- Aditivo; sólo `produccion`. Quien ya está en el equipo queda en Creativo.

alter table produccion.track_members
  add column rama text not null default 'creativo' check (rama in ('creativo', 'diseno', 'produccion'));
