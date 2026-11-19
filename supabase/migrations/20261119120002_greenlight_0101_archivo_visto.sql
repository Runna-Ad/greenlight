-- 0101 — Cuándo abrió el cliente su Archivo por última vez (Pedro, 2026-11-19)
--
-- El menú del cliente lleva «Archivo» con un número rojo, como el correo: cuántos paquetes
-- se aprobaron o recibieron su carpeta de Drive desde su última visita. Abrir el Archivo
-- lo pone en cero. Va en el perfil (no en el navegador) para que valga en cualquier equipo.
-- Null = nunca lo ha abierto: todo lo del Archivo cuenta como nuevo.

alter table produccion.profiles
  add column if not exists archivo_visto_at timestamptz null;
