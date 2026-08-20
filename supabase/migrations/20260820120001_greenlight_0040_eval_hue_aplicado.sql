-- 0040 — Evaluación v2: marca cuándo el lead APLICÓ la sugerencia de H.Ü.E sobre una
-- corrección. Alimenta el criterio "Resolución de cambios": si el lead reemplazó el
-- rework del especialista por la versión de H.Ü.E (sobre una nota ya atendida), el
-- arreglo del especialista fue incompleto/erróneo → cuenta en su evaluación.
--
-- Aditiva y nullable, sin backfill: la captura es going-forward (las notas viejas
-- quedan en NULL = "sin rework fallido registrado", que es honesto, no un bug).

alter table produccion.comments
  add column if not exists hue_aplicado_at timestamptz;

comment on column produccion.comments.hue_aplicado_at is
  'Cuándo el lead aplicó la sugerencia de H.Ü.E sobre esta corrección (rework fallido del especialista si la nota estaba atendida). Evaluación v2.';
