-- Greenlight — seed: SÓLO DEMO LOCAL.
--
-- Los DATOS DE REFERENCIA (vocabularios, matriz de validez, snippets) YA NO
-- viven aquí: se mudaron a la migración 0011. Motivo: este archivo nunca se
-- aplica a la base viva — `npm run migrate` sólo corre supabase/migrations.
-- Tenerlos aquí hizo que producción quedara sin la matriz base de
-- size_platform_validity y sin un solo snippet, durante meses y en silencio.
--
-- Regla: si producción lo necesita, va en una migración. Aquí sólo lo que
-- sirve para desarrollar en local.
--
-- scripts/test-db.mjs aplica este archivo después de las migraciones y falla
-- si lanza — así un desfase como el de `on conflict (set, code)` (constraint
-- que la 0003 cambió y este archivo siguió usando) se detecta el mismo día.

-- ── Pods (the 5 tripletas) ──
insert into produccion.pods (name, slug, color) values
  ('Lorem Ipsum','lorem-ipsum','#775cbf'),
  ('Champs','champs','#fbae42'),
  ('4x4 Terrenator','4x4-terrenator','#00cc88'),
  ('Beta Tester','beta-tester','#de5a5f'),
  ('Neptunianos','neptunianos','#6d9eeb')
on conflict (slug) do nothing;



-- ── Clients & marcas ──
insert into produccion.clients (id, name, slug, tagline, brand_color) values
  ('10000000-0000-0000-0000-000000000001','DiDi','didi','Card + Préstamos · cliente principal','#ff6b1a')
on conflict (slug) do nothing;
insert into produccion.marcas (client_id, name, slug) values
  ('10000000-0000-0000-0000-000000000001','Card','card'),
  ('10000000-0000-0000-0000-000000000001','Préstamos','prestamos')
on conflict (client_id, slug) do nothing;


-- ── Demo team (local only; real users come from auth) ──
insert into produccion.profiles (id, email, full_name, initials, role, pod_id) values
  ('20000000-0000-0000-0000-000000000001','lead@runna.mx','Lead Demo','LD','lead',
    (select id from produccion.pods where slug='lorem-ipsum')),
  ('20000000-0000-0000-0000-000000000002','flor@runna.mx','Flor','FL','creative',
    (select id from produccion.pods where slug='champs'))
on conflict (id) do nothing;

-- ── Demo brief → family → idea → assets across statuses ──
insert into produccion.briefs (id, client_id, code, title, brief_name, month, status, created_by) values
  ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
   'DIDI-AGO26-01','Agosto 2026','Local request - August','2026-08-01','active',
   '20000000-0000-0000-0000-000000000001')
on conflict (client_id, code) do nothing;

insert into produccion.delivery_waves (id, brief_id, name, due_date, month) values
  ('31000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','1ra entrega','2026-08-07','AUG')
on conflict do nothing;

insert into produccion.idea_families (id, brief_id, letter, name, tema, insight) values
  ('32000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','A',
   'Mascotas','¿Ya viste el mensaje en las nubes?','Encuentras mensajes en todos lados')
on conflict (brief_id, letter) do nothing;

insert into produccion.ideas
  (id, family_id, brief_id, marca_id, variant_number, pod_id, wave_id, naming_kind,
   naming_base, genero_code, mes_code, plataformas, tipo_code, topico, concepto, selling_points)
values
  ('33000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001',
   (select id from produccion.marcas where slug='card' limit 1),
   1,(select id from produccion.pods where slug='lorem-ipsum'),
   '31000000-0000-0000-0000-000000000001','real','RNTESTCLOUDDOG','WOMAN','AUG26',
   array['TT','FB'],'REAL','Mascotas','POV del perro y del dueño',
   array['Hasta 6% de CASHBACK','How to apply'])
on conflict (family_id, variant_number) do nothing;

insert into produccion.idea_assignments (idea_id, profile_id, role) values
  ('33000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','creativo')
-- La 0008 cambió unique(idea_id, role) por unique(idea_id, member_id).
on conflict do nothing;

-- assets inserted directly with varied statuses (INSERT bypasses the status guard)
insert into produccion.assets
  (idea_id, brief_id, pod_id, wave_id, naming_kind, naming_base, tamano_code,
   plataforma_code, duracion_code, genero_code, idea_code, mes_code, version, status)
values
  ('33000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
   (select id from produccion.pods where slug='lorem-ipsum'),
   '31000000-0000-0000-0000-000000000001','real','RNTESTCLOUDDOG','9:16','TT','25s','WOMAN','A1','AUG26',1,'in_progress'),
  ('33000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
   (select id from produccion.pods where slug='lorem-ipsum'),
   '31000000-0000-0000-0000-000000000001','real','RNTESTCLOUDDOG','9:16','FB','25s','WOMAN','A1','AUG26',1,'under_review'),
  ('33000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
   (select id from produccion.pods where slug='lorem-ipsum'),
   '31000000-0000-0000-0000-000000000001','real','RNTESTCLOUDDOG','1:1','FB','25s','WOMAN','A1','AUG26',1,'todo')
on conflict do nothing;
