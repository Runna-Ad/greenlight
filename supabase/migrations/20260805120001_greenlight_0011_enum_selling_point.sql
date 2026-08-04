-- Greenlight — nuevo tipo de snippet: selling_point (0011)
--
-- Va SOLO en este archivo a propósito. Postgres no deja USAR un valor de enum
-- en la misma transacción donde se añade, y scripts/migrate.mjs envuelve cada
-- archivo en una transacción. Si esto viviera junto a los inserts de la 0012,
-- fallaría con "unsafe use of new value of enum type".
alter type produccion.snippet_kind add value if not exists 'selling_point';
