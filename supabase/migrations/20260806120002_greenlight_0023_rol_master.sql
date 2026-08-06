-- Greenlight 0023 — rol "Master Builder"
--
-- El tier superior de la jerarquía (por encima de admin), el dueño de la
-- plataforma (Pedro). Va en su PROPIO archivo: `alter type ... add value` no se
-- puede USAR en la misma transacción donde se añade (scripts/migrate.mjs envuelve
-- cada archivo en una). Todo lo que lo use va en la 0024.
--
-- Numeración: NO existe 0017 (Notion, diferido). Timestamp nuevo.

alter type produccion.app_role add value if not exists 'master';
