-- ─────────────────────────────────────────────────────────────
-- 0085 — Cambio del cliente cerrado "Sin cambio (acordado)".
--
-- Pedro (2026-10-27): el cliente pide algo ("ponlo naranja"), el equipo le explica en el
-- hilo por qué no ("el brandbook no lo permite") y el cliente acepta ("tienes razón,
-- olvídalo"). Hasta hoy el lead sólo podía "Marcar atendido" (el cliente veía "Aplicado"
-- y entraba a "por revisar" sin que se hubiera cambiado nada) o "Descartar" (borrado duro:
-- se perdía la conversación). Ahora lo cierra como RESUELTO sin cambio: queda el registro
-- y el hilo, que ya trae la razón (no se pide una aparte).
--
-- Es una bandera sobre un cambio RESUELTO (resolved_at): todo lo que ya cuenta "resuelto"
-- (rondas, gate de aprobación) lo trata igual sin tocar nada más. Sólo cambios del cliente.
-- Sólo esquema `produccion`. Aditivo.
-- ─────────────────────────────────────────────────────────────

alter table produccion.comments
  add column if not exists sin_cambio boolean not null default false;

alter table produccion.comments drop constraint if exists comments_sin_cambio_ck;
alter table produccion.comments
  add constraint comments_sin_cambio_ck
  check (not sin_cambio or (kind = 'client_change' and resolved_at is not null));
