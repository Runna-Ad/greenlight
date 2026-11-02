-- ═══════════════════════════════════════════════════════════════
-- 0071 — HÜE Prisma v1 · F6a: los datos de CADA herramienta, editables (prisma_herramientas)
-- ═══════════════════════════════════════════════════════════════
-- Lo que Prisma sabe de cada herramienta vivía en constantes de TS (tools.ts / modelo.ts): un
-- modelo nuevo ("llegó ChatGPT 6"), una duración nueva o "ahora reconoce mejor las caras" exigía
-- un deploy. Aquí vive como datos, una fila por herramienta, editable en Hub › Prisma ›
-- Herramientas y leída en cada generación (caché 60 s):
--   limites   {duraciones, max_palabras, max_caracteres, aspects, refs_max, audio}
--             → compilers, validadores, diagnóstico y los chips del wizard.
--   fortalezas 0–5 — imagen {texto_exacto, identidad}; video {voz, movimiento, rapidez}
--             → routing.ts elige la mejor en lo que la idea pide.
--   modelos   [{id, etiqueta, rol: rapido|fino, como_llegar_es, como_llegar_en}]
--             → "Úsalo en…" (el código elige el ROL; la fila dice qué modelo es hoy).
-- La app valida estricto al guardar (catalogo.ts validarFicha) y lee TOLERANTE (un campo raro
-- se queda con la constante: la generación nunca se rompe por una fila). Aditivo; sólo
-- `produccion`; mismo patrón de seguridad que prisma_* (RLS master-only, la app escribe por
-- service_role). Aquí van topes de forma y tamaño como segunda red.
create table produccion.prisma_herramientas (
  tool          text primary key check (tool ~ '^[a-z0-9_]{2,30}$'),
  limites       jsonb not null default '{}'::jsonb check (jsonb_typeof(limites) = 'object' and octet_length(limites::text) <= 2000),
  fortalezas    jsonb not null default '{}'::jsonb check (jsonb_typeof(fortalezas) = 'object' and octet_length(fortalezas::text) <= 500),
  modelos       jsonb not null default '[]'::jsonb check (jsonb_typeof(modelos) = 'array' and jsonb_array_length(modelos) <= 4 and octet_length(modelos::text) <= 16000),
  fuente_url    text check (fuente_url is null or (fuente_url ~ '^https?://' and char_length(fuente_url) <= 300)),
  fuente_fecha  date,
  updated_by    uuid references produccion.track_members(id) on delete set null,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

alter table produccion.prisma_herramientas enable row level security;
create policy prisma_herramientas_master on produccion.prisma_herramientas for all using (produccion.auth_role() = 'master') with check (produccion.auth_role() = 'master');
grant select, insert, update, delete on produccion.prisma_herramientas to service_role;

-- ── Seed: EXACTAMENTE las constantes del código (CATALOGO_BASE de catalogo.ts, generado con
--    fichaAFila). test-db lo comprueba: leer estas filas da el mismo catálogo que las constantes,
--    así que el día que se aplica nada cambia en el routing ni en "Úsalo en…". ──
insert into produccion.prisma_herramientas (tool, limites, fortalezas, modelos) values
  ('nanobanana', '{"duraciones":[],"max_palabras":null,"max_caracteres":null,"aspects":["1:1","16:9","9:16","4:5","4:3","3:4"],"refs_max":14,"audio":false}'::jsonb,
   '{"texto_exacto":3,"identidad":5}'::jsonb,
   '[{"id":"gemini-3.1-flash-image","etiqueta":"Nano Banana 2","rol":"rapido","como_llegar_es":"En Gemini es el modelo de imagen por default; en AI Studio, gemini-3.1-flash-image.","como_llegar_en":"In Gemini it is the default image model; in AI Studio, gemini-3.1-flash-image."},{"id":"gemini-3-pro-image","etiqueta":"Nano Banana Pro","rol":"fino","como_llegar_es":"En Gemini elige el modo Thinking (Nano Banana Pro) antes de pegar; en AI Studio, el modelo gemini-3-pro-image.","como_llegar_en":"In Gemini pick Thinking mode (Nano Banana Pro) before pasting; in AI Studio, the gemini-3-pro-image model."}]'::jsonb),
  ('chatgpt', '{"duraciones":[],"max_palabras":null,"max_caracteres":null,"aspects":["1:1","16:9","9:16","4:5","4:3","3:4"],"refs_max":16,"audio":false}'::jsonb,
   '{"texto_exacto":5,"identidad":3}'::jsonb,
   '[{"id":"gpt-image-2.5-flare","etiqueta":"ChatGPT Images · flare","rol":"rapido","como_llegar_es":"En ChatGPT pega el prompt tal cual; por API, gpt-image-2.5-flare.","como_llegar_en":"In ChatGPT paste the prompt as is; via API, gpt-image-2.5-flare."},{"id":"gpt-image-2.5-sunburst","etiqueta":"ChatGPT Images · sunburst","rol":"fino","como_llegar_es":"En ChatGPT pega el prompt con la imagen adjunta; por API usa el modelo gpt-image-2.5-sunburst.","como_llegar_en":"In ChatGPT paste the prompt with the image attached; via API use the gpt-image-2.5-sunburst model."}]'::jsonb),
  ('veo', '{"duraciones":[8,6,4],"max_palabras":null,"max_caracteres":null,"aspects":["16:9","9:16"],"refs_max":3,"audio":true}'::jsonb,
   '{"voz":5,"movimiento":3,"rapidez":2}'::jsonb,
   '[{"id":"veo-3.1-fast-generate-preview","etiqueta":"Veo 3.1 Fast","rol":"rapido","como_llegar_es":"En Flow elige la calidad Fast antes de generar.","como_llegar_en":"In Flow choose Fast quality before generating."},{"id":"veo-3.1-generate-preview","etiqueta":"Veo 3.1","rol":"fino","como_llegar_es":"En Flow deja la calidad estándar (Quality).","como_llegar_en":"In Flow keep the standard quality (Quality)."}]'::jsonb),
  ('kling', '{"duraciones":[5,10],"max_palabras":60,"max_caracteres":null,"aspects":["16:9","9:16","1:1"],"refs_max":3,"audio":true}'::jsonb,
   '{"voz":3,"movimiento":4,"rapidez":5}'::jsonb,
   '[{"id":"kling-3.0-turbo","etiqueta":"Kling 3.0 Turbo","rol":"rapido","como_llegar_es":"En Kling elige el modelo 3.0 y el modo Turbo (o Standard).","como_llegar_en":"In Kling pick model 3.0 and Turbo mode (or Standard)."},{"id":"kling-3.0","etiqueta":"Kling 3.0","rol":"fino","como_llegar_es":"En Kling elige el modelo 3.0 en modo Professional.","como_llegar_en":"In Kling pick model 3.0 in Professional mode."}]'::jsonb),
  ('higgsfield', '{"duraciones":[5],"max_palabras":60,"max_caracteres":null,"aspects":["16:9","9:16","1:1","4:5"],"refs_max":1,"audio":false}'::jsonb,
   '{"voz":0,"movimiento":5,"rapidez":3}'::jsonb,
   '[{"id":"higgsfield","etiqueta":"Higgsfield","rol":"fino","como_llegar_es":"En Higgsfield: Create → elige ese preset de cámara → pega el texto.","como_llegar_en":"In Higgsfield: Create → pick that camera preset → paste the text."}]'::jsonb)
;
