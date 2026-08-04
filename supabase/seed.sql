-- Rünna On Deck — seed (reference data + demo brief)
-- Reference data (pods, vocab, validity, snippets) is production-real.
-- Demo client/brief/ideas/assets are for local dev; safe to delete later.
-- NOTE: profiles here use fixed UUIDs. On the real DB these must match auth.users
-- (created at deploy via Supabase admin API); the auth FK is skipped under PGlite.

-- ── Pods (the 5 tripletas) ──
insert into produccion.pods (name, slug, color) values
  ('Lorem Ipsum','lorem-ipsum','#775cbf'),
  ('Champs','champs','#fbae42'),
  ('4x4 Terrenator','4x4-terrenator','#00cc88'),
  ('Beta Tester','beta-tester','#de5a5f'),
  ('Neptunianos','neptunianos','#6d9eeb')
on conflict (slug) do nothing;

-- ── Controlled vocabularies (code = filename token, [A-Z0-9]+) ──
-- tamaño & duración are intentionally NOT vocab: sizes carry ':' (handled by the
-- validity matrix) and durations are free-form buckets. See migration 0001.
insert into produccion.vocab_terms (set, code, label_es, sort_order) values
  ('plataforma','TT','TikTok',1),
  ('plataforma','FB','Facebook',2),
  ('plataforma','GG','Google',3),
  ('tipo','REAL','Real Person',1),
  ('tipo','NORMAL','Normal Video',2),
  ('tipo','STATIC','Estático',3),
  ('tipo','COPY','Copies',4),
  ('formato','INHOUSE','In-house',1),
  ('formato','UGC','UGC',2),
  ('formato','ILLUS','Ilustración',3),
  ('formato','STOCK','Stock',4),
  ('formato','AI','AI',5),
  ('formato','TEXTO','Texto',6),
  ('formato','CREADOR','Creador',7),
  ('formato','3D','Ilustración 3D',8),
  ('genero','WOMAN','Mujer',1),
  ('genero','MAN','Hombre',2),
  ('genero','WOMANMAN','Mujer y hombre',3),
  ('genero','FAMILY','Familia',4),
  ('genero','NA','N/A (se omite)',5),
  ('origen_idea','BENCHMARK','Benchmark',1),
  ('origen_idea','RN','Rünna',2),
  ('origen_idea','CH','Channel Manager',3),
  ('origen_idea','BENCHCH','Benchmark + CH',4),
  ('origen_idea','RNCH','Rünna + CH',5)
on conflict (set, code) do nothing;

-- ── Size ↔ platform validity (Margaret's W2 rules) ──
insert into produccion.size_platform_validity (media, tamano, plataforma) values
  ('video','1:1','GG'),('video','1:1','FB'),('video','1:1','TT'),
  ('video','9:16','FB'),('video','9:16','TT'),('video','9:16','GG'),
  ('video','4:5','FB'),
  ('video','16:9','GG'),
  ('static','1:1','GG'),('static','1:1','FB'),('static','1:1','TT'),
  ('static','9:16','FB'),('static','9:16','TT'),
  ('static','4:5','GG'),('static','4:5','FB'),
  ('static','1.91:1','GG'),('static','1.91:1','TT')
on conflict do nothing;

-- ── Clients & marcas ──
insert into produccion.clients (id, name, slug, tagline, brand_color) values
  ('10000000-0000-0000-0000-000000000001','DiDi','didi','Card + Préstamos · cliente principal','#ff6b1a')
on conflict (slug) do nothing;
insert into produccion.marcas (client_id, name, slug) values
  ('10000000-0000-0000-0000-000000000001','Card','card'),
  ('10000000-0000-0000-0000-000000000001','Préstamos','prestamos')
on conflict (client_id, slug) do nothing;

-- ── Reuse-layer snippets (kills the 150×/117× copy-paste) ──
insert into produccion.snippets (kind, title, body, scope, client_id) values
  ('instruccion','Indicaciones para la producción',
   E'1. En los videos con personas reales, los primeros 3 segundos deben captar la atención del usuario. El primer valor añadido o el nombre del producto debe aparecer entre 3 y 5 segundos después.\n2. En ilustraciones, el ritmo debe ser rápido; cada valor añadido coordinado con la música.\n3. Duración 20–30s: al menos 4 beneficios; +30s: 5; +40s: 6.\n4. Combinar Real Person con efectos y transiciones dinámicas.\n5. Hacerlo ver orgánico.',
   'client','10000000-0000-0000-0000-000000000001'),
  ('legal','Legal CASHBACK (Regigold)',
   E'Regigold, S.A. de C.V., CAT promedio informativo. Tasa de interés promedio ponderada anual fija. *Aplican Términos y Condiciones.',
   'client','10000000-0000-0000-0000-000000000001'),
  ('consideracion','Regla estáticos CASHBACK/MSI',
   'Si menciona CASHBACK o MSI, poner un * antes de "Aplican" (*Aplican) en los TyC.',
   'client','10000000-0000-0000-0000-000000000001')
on conflict do nothing;

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
on conflict (idea_id, role) do nothing;

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
