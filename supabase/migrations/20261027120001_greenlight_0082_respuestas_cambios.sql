-- ─────────────────────────────────────────────────────────────
-- 0082 — Hilo de respuestas bajo cada cambio (corrección interna o cambio del cliente).
--
-- Pedro (2026-10-27): cuando el lead pide un cambio, el especialista puede contestar
-- ("puse esta palabra porque…") y el lead responde ("ok, déjalo" → descarta el cambio,
-- o "hazlo igual porque…"). El hilo es INTERNO: el cliente nunca lo ve, aunque el cambio
-- sea suyo.
--
-- Tabla APARTE y no `comments.parent_id`: `comments` se lee en ~30 sitios (portal del
-- cliente, conteos de rondas, gates de aprobación, H.Ü.E, Performance) y una respuesta
-- ahí colada como kind 'comment' podía aparecer en cualquiera de ellos, incluido el
-- portal. Aquí sólo la lee la página interna de la tarea.
--
-- Borrar el cambio (descartarCorreccion = borrado duro) borra su hilo (cascade).
-- Sólo esquema `produccion`. Aditivo. RLS encendida SIN policies (la app escribe por
-- service_role; nada visible por la llave pública — candado 0056/0061).
-- ─────────────────────────────────────────────────────────────

create table if not exists produccion.correccion_respuestas (
  id               uuid primary key default gen_random_uuid(),
  comment_id       uuid not null references produccion.comments(id) on delete cascade,
  idea_id          uuid not null references produccion.ideas(id) on delete cascade,
  author_member_id uuid references produccion.track_members(id) on delete set null,
  author_id        uuid references produccion.profiles(id) on delete set null,
  body             text not null check (length(btrim(body)) between 1 and 2000),
  created_at       timestamptz not null default now()
);
create index if not exists correccion_respuestas_comment_idx
  on produccion.correccion_respuestas(comment_id, created_at);
create index if not exists correccion_respuestas_idea_idx
  on produccion.correccion_respuestas(idea_id);
comment on table produccion.correccion_respuestas is
  'Hilo interno bajo cada cambio (0082): lead ↔ especialista. El cliente nunca lo ve.';

alter table produccion.correccion_respuestas enable row level security;
revoke all on produccion.correccion_respuestas from public, anon, authenticated;
