-- ═══════════════════════════════════════════════════════════════
-- 0067 — HÜE Prisma v1: conocimiento VIVO por herramienta + entrevista + avisos + modelo sugerido
-- ═══════════════════════════════════════════════════════════════
-- Lo que cada herramienta puede y no puede hacer cambia cada pocas semanas (Sora 2 se
-- apaga el 24-sep-2026, a las 3 semanas de nacer este módulo). Hardcodearlo en TS obliga a un
-- deploy por cada cambio; aquí vive en una tabla editable desde el H.Ü.E Hub, con FUENTE y
-- FECHA, y el writer/diagnóstico la leen en cada generación. Aditivo; sólo `produccion`;
-- mismo patrón de seguridad que prisma_* (RLS master-only, la app escribe por service_role).
--
-- Dos clases de fila:
--   clase='nota'  → texto en inglés que entra al bloque cacheado del writer ("TOOL NOTES").
--   clase='regla' → aviso determinista (F2): `campo` dice qué se mira (idea | texto | refs |
--                   duracion | aspect | dialogo.idioma | accion | camara | destino | salida),
--                   `patron` es una regex (case-insensitive, unicode) contra ese campo, o
--                   `umbral` un tope numérico (palabras / cantidad / segundos). `accion` es el
--                   arreglo de UN click ({"tipo":"tool","tool":"veo"}, {"tipo":"recortar_texto",
--                   "palabras":8}, {"tipo":"modelo","modelo":"gemini-3-pro-image"}…).
create table produccion.prisma_reglas (
  id           uuid primary key default gen_random_uuid(),
  codigo       text not null check (codigo ~ '^[a-z0-9_]{3,60}$'),
  clase        text not null check (clase in ('regla','nota')),
  tool         text,                                     -- null = todas las herramientas
  kind         text check (kind in ('imagen','video','edicion')),
  nivel        text not null default 'advierte' check (nivel in ('bloquea','advierte','sugiere')),
  campo        text,
  patron       text check (char_length(patron) <= 200),
  umbral       numeric,
  que_es       text, que_en text,
  porque_es    text, porque_en text,
  arreglo_es   text, arreglo_en text,
  accion       jsonb,
  nota_en      text check (char_length(nota_en) <= 700),
  fuente_url   text check (fuente_url is null or (fuente_url ~ '^https?://' and char_length(fuente_url) <= 300)),
  fuente_fecha date,
  fuente_tipo  text not null default 'oficial' check (fuente_tipo in ('oficial','comunidad')),
  activa       boolean not null default true,
  orden        smallint not null default 0,
  updated_by   uuid references produccion.track_members(id) on delete set null,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  -- Invariantes de clase TAMBIÉN en la BD: la app los valida, pero el seed y cualquier script
  -- futuro entran por aquí sin pasar por la app.
  constraint prisma_reglas_nota_check  check (clase <> 'nota'  or (nota_en is not null and fuente_url is not null and fuente_fecha is not null)),
  constraint prisma_reglas_regla_check check (clase <> 'regla' or (campo is not null and (patron is not null or umbral is not null) and que_es is not null and que_en is not null)),
  constraint prisma_reglas_campo_check check (campo is null or campo in ('idea','texto','refs','duracion','aspect','dialogo.idioma','accion','camara','destino','salida')),
  constraint prisma_reglas_textos_check check (
    coalesce(char_length(que_es),0) <= 300 and coalesce(char_length(que_en),0) <= 300 and
    coalesce(char_length(porque_es),0) <= 300 and coalesce(char_length(porque_en),0) <= 300 and
    coalesce(char_length(arreglo_es),0) <= 300 and coalesce(char_length(arreglo_en),0) <= 300
  )
);
create unique index prisma_reglas_codigo_idx  on produccion.prisma_reglas (codigo);
create index        prisma_reglas_activas_idx on produccion.prisma_reglas (clase, activa, tool, orden);

alter table produccion.prisma_reglas enable row level security;
create policy prisma_reglas_master on produccion.prisma_reglas for all using (produccion.auth_role() = 'master') with check (produccion.auth_role() = 'master');
grant select, insert, update, delete on produccion.prisma_reglas to service_role;

-- ── Entrevista (F3), avisos (F2) y modelo sugerido (F1): las casillas se abren de una vez ──
alter table produccion.prisma_specs   add column respuestas jsonb not null default '[]'::jsonb;
alter table produccion.prisma_prompts add column avisos     jsonb not null default '[]'::jsonb;
alter table produccion.prisma_prompts add column modelo_sug text;

-- ── Eventos: los tipos de v1 (y los reservados de v2) entran en UNA sola ampliación del CHECK ──
alter table produccion.prisma_eventos drop constraint prisma_eventos_tipo_check;
alter table produccion.prisma_eventos add constraint prisma_eventos_tipo_check
  check (tipo in ('copiado','abierto','variante','refinado',
                  'respondido','aviso_aplicado','resultado_subido','resultado_aceptado','correccion_generada',
                  'generado','adjuntado','regenerado'));
-- El índice único de 0066 impediría un segundo 'aviso_aplicado' o 'resultado_subido' del mismo
-- prompt por la misma persona: se acota a lo que sí debe contar una sola vez.
drop index produccion.prisma_eventos_unico_idx;
create unique index prisma_eventos_unico_idx on produccion.prisma_eventos (prompt_id, user_id, tipo)
  where tipo in ('copiado','abierto');
create index prisma_eventos_tipo_idx on produccion.prisma_eventos (client_id, tipo, created_at desc);

-- ── Seed: lo verificado el 2026-09-11 (fuentes oficiales salvo donde se indica "community") ──
insert into produccion.prisma_reglas (codigo, clase, tool, kind, nivel, campo, patron, umbral, que_es, que_en, porque_es, porque_en, arreglo_es, arreglo_en, accion, nota_en, fuente_url, fuente_fecha, orden) values
-- notas por herramienta (entran al bloque cacheado del writer)
('nota_nanobanana', 'nota', 'nanobanana', null, 'sugiere', null, null, null, null, null, null, null, null, null, null,
 'Nano Banana 2 (gemini-3.1-flash-image) accepts up to 14 reference images; Nano Banana Pro (gemini-3-pro-image) keeps up to 6 identity + 3 style references. Sizes 0.5K to 4K; ratios 1:1, 3:2, 2:3, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9. There is NO negative-prompt field: describe what you want ("a clean seamless background"), never "no busy background". Text: put the exact words in quotes and name the type style; 1 to 8 words render reliably, long text drifts. Hex codes are not read as colors: describe colors in words.',
 'https://ai.google.dev/gemini-api/docs/image-generation', '2026-09-04', 10),
('nota_chatgpt', 'nota', 'chatgpt', null, 'sugiere', null, null, null, null, null, null, null, null, null, null,
 'ChatGPT Images = gpt-image-2.5 (flare for everyday work, sunburst for precise edits). Up to 16 input images. Recommended sizes 1024x1024, 1536x1024, 1024x1536; custom sizes must be multiples of 16, ratio at most 3:1, longest edge 3840 px; above 2K the quality is experimental. Text: quotes or ALL CAPS, spell unusual words letter by letter. Edits: ONE change per request and restate what must stay. Real people and third-party logos are blocked. The model rewrites prompts internally and does not return the rewrite.',
 'https://developers.openai.com/api/docs/guides/image-generation', '2026-09-08', 20),
('nota_veo', 'nota', 'veo', null, 'sugiere', null, null, null, null, null, null, null, null, null, null,
 'Veo 3.1: clips of 4, 6 or 8 s; 8 s is mandatory with reference images, first/last frame or 1080p/4K. Max 3 reference images. Aspect 16:9 or 9:16 only. Negatives are noun phrases ("subtitles, hard cuts"), never "no X". Native audio: only English is fully supported; Spanish dialogue is best-effort. A prompt rewriter always runs and cannot be disabled, so write what you want, not what you do not want. Blocks celebrities, minors (region-dependent) and third-party brands.',
 'https://ai.google.dev/gemini-api/docs/veo', '2026-09-09', 30),
('nota_kling', 'nota', 'kling', null, 'sugiere', null, null, null, null, null, null, null, null, null, null,
 'Kling 3.0 / 3.0 Turbo / 2.6: 3 to 15 s (5 or 10 typical), 16:9 / 9:16 / 1:1, up to 3 reference elements. ONE sentence, ONE camera move, 50 to 60 words. Version 3.x has no negative_prompt field: fold exclusions into the prompt as positives. Weak spots: exact counts of items and complex physics. Strict content moderation.',
 'https://www.klingai.com/document-api/api/video/3-0-omni', '2026-09-11', 40),
('nota_higgsfield', 'nota', 'higgsfield', null, 'sugiere', null, null, null, null, null, null, null, null, null, null,
 'Higgsfield: pick ONE camera preset per clip and name it in the text too ("crash zoom in"). Two moves in one clip warp. Without a trained Soul ID (20+ photos) faces are not preserved: use Veo or Kling when identity matters. Duration and aspect options vary per product surface.',
 'https://higgsfield.ai/camera-controls', '2026-09-11', 50),
('nota_sora_retirada', 'nota', null, 'video', 'sugiere', null, null, null, null, null, null, null, null, null, null,
 'Sora 2 is being retired by OpenAI: its Videos API shuts down on 2026-09-24 with no replacement. Never route a job to Sora. For timed-beat scenes use Veo 3.1 (voice, sound) or Kling 3 (short clips).',
 'https://developers.openai.com/api/docs/deprecations', '2026-09-11', 60),
('nota_fallos_comunes', 'nota', null, null, 'sugiere', null, null, null, null, null, null, null, null, null, null,
 'Across all tools the most common failures are: hands and finger close-ups, two people in physical contact, mirrors and reflections, mirrored text, and more than 2 named characters. Keep one motion source at a time (camera OR subject). Product fidelity holds only for what the reference shows; anchor with "keep the product exactly as in the reference".',
 'https://sora2prompt.co/guides/sora-2-limitations', '2026-09-11', 70),
-- reglas (avisos deterministas; el motor llega en F2, la forma queda fijada aquí)
('texto_largo', 'regla', null, 'imagen', 'advierte', 'texto', null, 8,
 'El texto en la pieza tiene más de 8 palabras.', 'The on-piece text is longer than 8 words.',
 'Las herramientas de imagen escriben bien de 1 a 8 palabras; con más, se traban letras y espacios.', 'Image tools render 1 to 8 words reliably; longer text drops or merges letters.',
 'Déjalo en un titular corto y agrega el resto en diseño.', 'Keep a short headline and add the rest in your design tool.',
 '{"tipo":"recortar_texto","palabras":8}', null, 'https://blog.google/products-and-platforms/products/gemini/prompting-tips-nano-banana-pro/', '2025-11-20', 100),
('texto_no_latino', 'regla', null, null, 'advierte', 'texto', '[Ѐ-ӿ֐-׿؀-ۿ぀-ヿ一-鿿가-힯]', null,
 'El texto trae caracteres no latinos.', 'The text has non-Latin characters.',
 'Fuera del alfabeto latino los modelos garabatean o se comen letras.', 'Outside the Latin alphabet models garble or drop glyphs.',
 'Genera la pieza sin ese texto y agrégalo en diseño; o revisa el resultado letra por letra.', 'Generate without that text and add it in design; or check the output letter by letter.',
 null, null, 'https://blog.google/products-and-platforms/products/gemini/prompting-tips-nano-banana-pro/', '2025-11-20', 110),
('hex_en_idea', 'regla', null, null, 'sugiere', 'idea', '#[0-9a-f]{3}(?:[0-9a-f]{3})?\b', null,
 'La idea trae un color en hex (#…).', 'The idea includes a hex color (#…).',
 'Los modelos leen lenguaje, no códigos: un hex se ignora o se interpreta mal.', 'Models read language, not codes: a hex value gets ignored or misread.',
 'Descríbelo con palabras (naranja brillante, rojo cereza). La paleta de la marca ya viaja en el preset.', 'Describe it in words (bright orange, cherry red). The brand palette already travels in the preset.',
 null, null, 'https://promptplaza.store/blogs/creator-guides/brand-colors-ai-image-prompts', '2026-09-11', 120),
('contacto_fisico', 'regla', null, null, 'advierte', 'idea', '\b(abraz|se abrazan|hug(s|ging)?|handshake|apret[oó]n de manos|high[- ]?five|chocan (las|los)|se besan|kiss(es|ing)?|tomad[oa]s de la mano|holding hands|cargando a|carrying (her|him|them))', null,
 'Dos personas en contacto físico.', 'Two people in physical contact.',
 'Manos y brazos que se tocan son lo que más falla: dedos fundidos, contactos imposibles.', 'Touching hands and arms fail the most: merged fingers, impossible contact.',
 'Simplifica a una acción clara sin contacto estrecho, o usa una foto real de la pose como referencia.', 'Simplify to one clear action without close contact, or use a real photo of the pose as reference.',
 null, null, 'https://sora2prompt.co/guides/sora-2-limitations', '2026-09-11', 130),
('manos_primer_plano', 'regla', null, null, 'advierte', 'idea', '\b(manos?|dedos?|hands?|fingers?)\b[^.]*\b(primer plano|close[- ]?up|detalle|macro)\b|\b(primer plano|close[- ]?up|macro)\b[^.]*\b(manos?|dedos?|hands?|fingers?)\b', null,
 'Manos en primer plano.', 'Hands in close-up.',
 'Las manos son el punto de fallo más constante de todos los modelos.', 'Hands are the single most consistent failure point across models.',
 'Saca las manos del encuadre o déjalas parcialmente ocultas.', 'Keep hands out of frame or partially hidden.',
 null, null, 'https://sora2prompt.co/guides/sora-2-limitations', '2026-09-11', 140),
('espejo_reflejo', 'regla', null, null, 'sugiere', 'idea', '\b(espejos?|reflej\w*|mirrors?|reflections?|vitrina|escaparate|glass wall)\b', null,
 'Hay espejos, vidrio o reflejos.', 'There are mirrors, glass or reflections.',
 'Los reflejos salen imposibles o duplicados.', 'Reflections come out impossible or duplicated.',
 'Evita que el reflejo tenga que ser exacto: recórtalo o angúlalo.', 'Avoid needing an exact reflection: crop it or angle it away.',
 null, null, 'https://www.notebookcheck.net/Sora-2-is-OpenAI-s-consistently-inconsistent-AI-video-creator.1161467.0.html', '2026-09-11', 150),
('texto_espejeado', 'regla', null, null, 'advierte', 'idea', '\b(espejead\w*|texto invertido|mirrored text|reversed text|al rev[eé]s)\b', null,
 'Texto espejeado o invertido.', 'Mirrored or reversed text.',
 'Se renderiza al derecho o se garabatea.', 'It renders forward or garbles.',
 'Agrégalo en postproducción.', 'Add it in post-production.',
 null, null, 'https://blog.google/products-and-platforms/products/gemini/prompting-tips-nano-banana-pro/', '2025-11-20', 160),
('persona_real', 'regla', null, null, 'advierte', 'idea', '\b(celebridad|famos[oa]s?|actor|actriz|cantante|influencer|presidente|futbolista|celebrity|famous|singer|footballer|the real)\b', null,
 'Parece pedir a una persona real o famosa.', 'This seems to ask for a real or famous person.',
 'Veo, ChatGPT Images y Kling bloquean caras de personas reales; además exige derechos.', 'Veo, ChatGPT Images and Kling block real people; it also needs rights.',
 'Usa un personaje guardado o una modelo genérica; si tienes derechos, súbela como referencia (Nano Banana la acepta).', 'Use a saved character or a generic model; if you have rights, upload her as a reference (Nano Banana accepts it).',
 '{"tipo":"usar_personaje"}', null, 'https://ai.google.dev/gemini-api/docs/veo', '2026-09-09', 170),
('menor_edad', 'regla', null, null, 'advierte', 'idea', '\b(niñ[oa]s?|beb[eé]s?|infantil|kids?|child(ren)?|baby|toddler|menor(es)? de edad)\b', null,
 'Aparecen menores.', 'Minors appear.',
 'Las políticas restringen menores (Veo exige allow_adult en varias regiones).', 'Policies restrict minors (Veo enforces allow_adult in several regions).',
 'Si es imprescindible, evita rasgos identificables y revisa la política de la herramienta.', 'If unavoidable, avoid identifiable features and check the tool policy.',
 null, null, 'https://ai.google.dev/gemini-api/docs/veo', '2026-09-09', 180),
('marca_tercero', 'regla', null, null, 'advierte', 'idea', '\b(nike|adidas|apple|iphone|coca[- ]?cola|pepsi|starbucks|mcdonald\w*|disney|marvel|netflix|samsung|tesla|amazon|google|microsoft|spotify|uber|rappi|oxxo|bimbo|corona)\b', null,
 'Menciona una marca de terceros.', 'It mentions a third-party brand.',
 'ChatGPT Images y Veo bloquean o alteran logos ajenos; además es riesgo legal.', 'ChatGPT Images and Veo block or alter third-party logos; it is also a legal risk.',
 'Quita la marca ajena o usa un producto genérico; la marca del cliente va por el preset.', 'Remove the third-party brand or use a generic product; the client brand travels in the preset.',
 null, null, 'https://developers.openai.com/api/docs/guides/image-generation', '2026-09-08', 190),
('personaje_copyright', 'regla', null, null, 'advierte', 'idea', '\b(mickey|mario bros|pikachu|pok[eé]mon|batman|superman|spider[- ]?man|hello kitty|barbie|goku|naruto|minions?|shrek|elsa de frozen|harry potter)\b', null,
 'Personaje con derechos de autor.', 'Copyrighted character.',
 'La política cambia por proveedor: Veo bloquea; otros lo permiten hasta que el dueño reclama.', 'Policy differs per vendor: Veo blocks; others allow until the owner objects.',
 'Evítalo en piezas comerciales.', 'Avoid it in commercial pieces.',
 null, null, 'https://ai.google.dev/gemini-api/docs/veo', '2026-09-09', 200),
('camara_y_sujeto_rapidos', 'regla', null, 'video', 'advierte', 'camara', '\b(whip|crash zoom|r[aá]pid\w*|fast|veloz|giro|spin|barrido)\b', null,
 'Movimiento rápido de cámara.', 'Fast camera move.',
 'Cámara rápida + sujeto en movimiento deforma la imagen.', 'Fast camera plus a moving subject warps the image.',
 'Una sola fuente de movimiento: o la cámara o el sujeto.', 'One motion source: either the camera or the subject.',
 null, null, 'https://higgsfield.ai/camera-controls', '2026-09-11', 210),
('mas_de_dos_personajes', 'regla', null, 'video', 'advierte', 'idea', '\b(tres|cuatro|cinco|seis|three|four|five|six)\s+(personas|people|amigos|friends|personajes|characters|chic[oa]s)\b|\b(grupo de|group of|multitud|crowd)\b', null,
 'Más de dos personas con identidad.', 'More than two people with identity.',
 'La identidad se pierde con más de 2 personajes definidos.', 'Identity drifts with more than 2 defined characters.',
 'Máximo 2 personajes con nombre; el resto como figuras de fondo.', 'At most 2 named characters; the rest as background figures.',
 null, null, 'https://developers.openai.com/cookbook/examples/sora/sora2_prompting_guide', '2026-09-11', 220),
('dialogo_no_ingles', 'regla', 'veo', null, 'advierte', 'dialogo.idioma', '^(?!en)', null,
 'Diálogo en un idioma que no es inglés.', 'Dialogue in a language other than English.',
 'Veo sólo garantiza el audio en inglés; en español es "best-effort" (fuente oficial).', 'Veo only guarantees English audio; Spanish is best-effort (official source).',
 'Revisa el resultado con cuidado, o graba la voz aparte y móntala en edición.', 'Check the result carefully, or record the voice separately and add it in editing.',
 null, null, 'https://ai.google.dev/gemini-api/docs/veo', '2026-09-09', 230),
('prompt_largo', 'regla', null, 'imagen', 'sugiere', 'salida', null, 120,
 'El prompt pasa de 120 palabras.', 'The prompt is over 120 words.',
 'Con prompts largos los modelos priorizan mal (ChatGPT Images interpreta la cámara "loosely").', 'With long prompts models prioritize badly (ChatGPT Images reads camera specs loosely).',
 'Recórtalo a lo esencial y pide el resto en una edición.', 'Trim to the essentials and ask for the rest in an edit.',
 null, null, 'https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide', '2026-04-21', 240),
('resolucion_experimental', 'regla', 'chatgpt', null, 'sugiere', 'destino', '^print$', null,
 'Impresión con ChatGPT Images.', 'Print with ChatGPT Images.',
 'Por encima de 2K la calidad es "experimental" (OpenAI).', 'Above 2K the quality is "experimental" (OpenAI).',
 'Para impresión usa Nano Banana Pro a 4K.', 'For print use Nano Banana Pro at 4K.',
 '{"tipo":"modelo","modelo":"gemini-3-pro-image"}', null, 'https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide', '2026-04-21', 250),
('higgsfield_identidad', 'regla', 'higgsfield', null, 'advierte', 'refs', '\bsujeto\b', null,
 'Una persona como referencia en Higgsfield.', 'A person as reference in Higgsfield.',
 'Sin Soul ID (20+ fotos) Higgsfield no conserva la cara.', 'Without a Soul ID (20+ photos) Higgsfield does not keep the face.',
 'Para conservar la identidad usa Veo o Kling.', 'To keep identity use Veo or Kling.',
 '{"tipo":"tool","tool":"veo"}', null, 'https://higgsfield.ai/blog/SOUL-ID-Superior-Level-of-AI-Character-Consistency', '2026-09-11', 260),
('claim_prohibido', 'regla', null, null, 'advierte', 'idea', '\b(cura\w*|garantiz\w*|100 ?%|sin riesgo|el mejor del mundo|milagro\w*|adelgaza\w*|pierde \d+ kilos|gana dinero|ganancias garantizadas|guaranteed|risk[- ]free|miracle)\b', null,
 'Un claim que las políticas o la marca suelen prohibir.', 'A claim that policies or the brand usually forbid.',
 'Los claims médicos o financieros absolutos se bloquean y comprometen a la marca.', 'Absolute medical or financial claims get blocked and expose the brand.',
 'Quita el claim del prompt; los textos legales van en diseño, no en la imagen.', 'Remove the claim from the prompt; legal text belongs in design, not in the image.',
 null, null, 'https://developers.openai.com/api/docs/guides/image-generation', '2026-09-08', 270),
('muchos_cambios', 'regla', null, 'edicion', 'advierte', 'accion', '(,|\by\b|\band\b)[^,]*(,|\by\b|\band\b)[^,]*(,|\by\b|\band\b)', null,
 'Pides varios cambios en una sola edición.', 'Several changes in a single edit.',
 'ChatGPT Images y Nano Banana aciertan más con UN cambio a la vez.', 'ChatGPT Images and Nano Banana hit more often with ONE change at a time.',
 'Haz el cambio principal ahora y los demás en una segunda edición.', 'Do the main change now and the rest in a second edit.',
 null, null, 'https://developers.openai.com/api/docs/guides/image-prompting', '2026-09-08', 280)
on conflict (codigo) do nothing;

-- Lo que NO viene de la doc del proveedor se marca: en el Hub se ve como "comunidad".
update produccion.prisma_reglas set fuente_tipo = 'comunidad'
  where codigo in ('nota_fallos_comunes','hex_en_idea','contacto_fisico','manos_primer_plano','espejo_reflejo');
