-- ─────────────────────────────────────────────────────────────
-- 0064 — H.Ü.E lee las REFERENCIAS de la tarea (Tier 1: Google Docs / Slides / Sheets /
--        Drive + YouTube) y las usa como inspiración al escribir el guión.
--
-- Pedro (2026-09-03): "¿puede H.Ü.E checar las referencias de la tarea (Drive, TikTok…)
-- y aprender de ellas al crear el guion? Sólo como ADICIÓN a lo que ya usa y sólo si lo
-- puede usar con precisión". Tier 1 = las fuentes que son TEXTO exacto. TikTok/IG (sólo
-- caption) y video real quedan para tiers posteriores.
--
-- Caché POR URL: la lectura se hace al GUARDAR la referencia (after(), no bloquea) y, si
-- falta, al generar (con tope de tiempo). Nunca se lee dos veces la misma liga si la
-- lectura está fresca. El texto se guarda RECORTADO (tope en la app): es material de
-- terceros, sólo inspiración — no es verdad de marca.
--
-- Sólo esquema `produccion`. Aditivo. RLS encendida SIN policies (la app escribe por
-- service_role; nada de esto es visible por la llave pública — candado 0056/0061).
-- ─────────────────────────────────────────────────────────────

create table if not exists produccion.referencia_lecturas (
  url        text primary key,                 -- URL canónica (ver clasificarReferencia)
  tipo       text not null,                    -- doc | slides | sheet | drive | youtube | otro
  estado     text not null check (estado in ('leida','parcial','privada','no_soportada','error')),
  titulo     text,
  texto      text,                             -- recortado (LECTURA_MAX_CHARS); null si no se leyó
  chars      int  not null default 0,
  error      text,                             -- por qué no se pudo (para el badge y el log)
  leida_at   timestamptz not null default now(),
  created_at timestamptz not null default now()
);
comment on table produccion.referencia_lecturas is
  'Caché de lecturas de referencias (0064): lo que H.Ü.E pudo leer de cada liga. Sólo inspiración; no es verdad de marca.';

alter table produccion.referencia_lecturas enable row level security;
revoke all on produccion.referencia_lecturas from public, anon, authenticated;

-- Qué referencias entraron a cada generación (para medir después si sirven: el loop
-- borrador→publicado ya vive en hue_generations).
alter table produccion.hue_generations add column if not exists referencias jsonb;
comment on column produccion.hue_generations.referencias is
  'Referencias leídas que entraron al prompt: [{url, tipo, estado, chars}] (0064).';
