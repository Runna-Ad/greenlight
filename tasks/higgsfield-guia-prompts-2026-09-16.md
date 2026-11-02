# Higgsfield — guía de prompts para HÜE Prisma (lo que aprendimos, 2026-09-16)

Fuentes (todas leídas completas, con sus URLs dentro):
- `tasks/higgsfield-helpcenter-2026-09-16.md` — 43 páginas del Help Center de Higgsfield.
- `tasks/higgsfield-blog-guias-2026-09-16.md` — ~40 guías del blog (incl. `case4k` y `full-ad-campaign-inside-claude`).
- El skill `higgsfield-seedance-prompt` que Pedro pasó (Desktop) — el mismo que usa el tutorial `case4k`.
- Links verificados por Prisma en el sitio: `tasks/research.md` (2026-09-16).

## 1. Reglas que valen para TODOS los modelos
1. **Escribe lo visible.** Todo lo que no se escribe lo decide el modelo (distinto cada vez). Emoción = gesto visible
   ("los ojos bajan, la mandíbula se aprieta"), nunca la etiqueta ("triste").
2. **Movimiento = posición inicial y final**, no un adjetivo ("se mueve dinámico").
3. **Manos**: decir dónde está cada mano y qué toca — el punto de contacto no escrito es de donde salen los dedos extra.
4. **Cantidades y lugar exactos** ("exactamente 3 botellas, tercio izquierdo"); izquierda/derecha desde la cámara.
5. **Luz**: una fuente con nombre, dirección y temperatura (K). Nunca dos soles.
6. **Cámara como setup físico**: el movimiento con su nombre exacto (dolly in, truck left, arc, crane up, orbit), su
   velocidad y dónde termina. Un zoom NO es un dolly; decir cuál y descartar el otro.
7. **Video**: un beat = una acción + un movimiento de cámara. Si la foto ya existe, NO describir cómo se ve: sólo
   qué pasa, la cámara, el tiempo y el sonido.
8. **Positivo** ("se queda de pie") mejor que listas de "no". Algunos "no" puntuales ayudan en tomas detalladas.
9. **En inglés** (Seedance/Kling a veces entienden mejor el movimiento en chino — no lo usamos).
10. **Iterar cambiando UNA cosa** (el prompt o una referencia, no las dos). Probar barato (720p / 1K) y pagar alto sólo
    en la toma buena, con el MISMO prompt. Una toma usable cuesta 3–5 intentos en promedio.
11. **Nombres propios bloqueados**: franquicias, personajes, famosos, artistas, equipos, marcas ajenas → describir
    visualmente ("un héroe con traje rojo y azul"). Referencias con logos ajenos también se bloquean.
12. **NSFW falsos**: trajes de baño, fitness, imágenes médicas, o imagen SIN texto → siempre imagen + prompt
    descriptivo; si falla, reformular neutro o cambiar de modelo. Fallidos y NSFW devuelven créditos.

## 2. Referencias: cada modelo las nombra distinto (el error más fácil)
| Dónde | Cómo se nombran | Prisma hoy |
|---|---|---|
| Seedance (video) | `@image1`, `@image2`… por orden de carga (`@video1`, `@audio1`); rol dicho en el prompt | ✅ `@imageN` + rol + "100% matches the reference" |
| Gemini Omni | etiqueta en la frase (`@image1 standing at…`) | ✅ |
| Kling 3.0 | la imagen es **Start/End frame**; un personaje/producto recurrente = **Element** llamado `@nombre` | ✅ en el Paso a paso |
| Nano Banana / GPT / Seedream | adjuntas en orden; describir el papel de cada una | ✅ ([Imagen N] / "the first attached image" / Image N) |
| DoP (Higgsfield Standard) | una foto como keyframe + un preset | ✅ |
| Popcorn | por número en prosa ("the man from image one") | — (no lo usamos) |
- `@character` en Seedance sólo sostiene la identidad DENTRO de un clip; entre clips → **Element** (Assets → ⋯ →
  Create Element; los Soul ID aparecen solos). Para una persona real: Soul ID (20+ fotos, 25 créditos una vez).

## 3. Por modelo
- **Seedance 2.0 / 2.5** — bloques con etiqueta, en orden: GLOBAL STYLE → SCENE → REFERENCES → LOCATION → FIRST
  FRAME → planos → OPTICS/CAMERA → PHYSICS → LIGHTING → AUDIO → POSITIVE LOCKS ("una regla visual arriba, una de
  sonido abajo"). FOV en grados (tabla del skill), temperatura en K, sin nombres de cámaras ni directores. Un plano
  continuo = "the camera does not cut on its own"; con cortes: "0.0s to 3.0s — …" + "HARD CUT". 2.0: 4–15 s, hasta
  9 imágenes + 3 videos + 3 audios, hasta 4K; Mini/Fast ≤720p; 2.5: hasta 30 s, 50 referencias, 1080p. Probar a
  720p y revisar el clip completo (los fallos salen entre el s 5 y el 8). Es lo más caro del equipo.
- **Kling 3.0** — 3–15 s, 720p/1080p/4K, audio nativo (apagarlo si no se usa), multi-shot hasta 5–6 tomas (Auto o
  Custom). Errores con nombre: cargar una toma con 3 eventos; pelear con el End frame; demasiadas tomas para la
  duración; esperar copiar movimiento (eso es Motion Control); iterar en 4K. Turbo = 1080p para probar.
- **Kling 3.0 Motion Control** — foto del personaje (brazos y manos visibles, espacio alrededor, fondo limpio) +
  video de movimiento (sujeto claro, SIN cortes, mismo encuadre). El prompt sólo cambia escenario/luz. 3–30 s.
- **Veo 3.1** — 4/6/8 s, 16:9 o 9:16, 1080p; Standard (hasta 3 refs de identidad, diálogo con lip-sync) vs Fast
  (primer/último cuadro). El más caro por segundo; para la entrega final.
- **Gemini Omni Flash** — hasta 7 imágenes + video, 10 s, 720p. Su fuerte: **editar por turnos** ("cambia sólo el
  fondo") en vez de regenerar. Flujo recomendado: afinar en Omni (barato) → render final en Veo/Seedance.
- **Nano Banana Pro / 2** — hasta 14 refs; describir el papel de cada una; cantidades exactas; texto entre comillas
  + fuente; iterar en 1K, final en 2K/4K. Pro razona antes de pintar: los prompts largos y estructurados le sirven.
- **GPT Image 2.5** — Flare (rápido, redes) vs Sunburst (precisión, final); hasta 16 refs; ediciones que sólo mueven
  lo pedido. 1K/Low 1.5 cr · 2K/High 5.5 cr · 4K/Max 26.5 cr.
- **Seedream 4.5 / 5.0 Lite** — lenguaje natural corto funciona (5.0 infiere intención); para producto, fondo/luz/
  posición explícitos. 4.5 = obediencia a palabras clave; 5.0 Lite = razonamiento + tipografía bilingüe.
- **DoP** — 3 o 5 s, un preset (60+ nombres en /camera-controls; "Mix" combina), Enhance si la escena casi no cambia.

## 4. Flujos que Higgsfield recomienda (ideas para Prisma, NO construidas)
- **Hoja de personaje** (case4k): una imagen con frente, espalda y close-up, fondo gris medio, luz pareja → Element.
- **Campaña completa** (full-ad-campaign): una referencia de producto fija al inicio; hook primero en UGC; aprobar el
  cuadro fijo antes del movimiento; una versión de cada formato antes de multiplicar variantes.
- **UGC**: 9:16, "shot on phone", selfie fija, micro-movimientos (parpadeo cada 2–4 s), extras que no miran a cámara;
  cambiar sólo el hook entre variantes. Marketing Studio tiene 8 estilos UGC y 1,500 presets.
- **Edición de un clip existente (Omni V2V)**: bloques SOURCE LOCK / MECHANIC / LIGHT-MATCH / ANTI-SLOP / FORBIDDEN.
- **Storyboard antes que video** (Popcorn, 4–8 cuadros) para escenas de varias tomas.

## 5. Qué cambió en Prisma con esto (2026-09-16)
- Seedance: prompt en bloques con `@imageN`, FOV en grados, cortes con tiempo, POSITIVE LOCKS.
- Omni: `@imageN` en la frase; orden sujeto/acción → lugar/candados → cámara.
- Writer: sección CRAFT con las reglas 1–7 y 11 (PROMPT_VERSION 2026-09-16.2).
- Resultado: "Paso a paso en Higgsfield" (qué modelo, qué casilla y en qué orden, ajustes, sonido, un consejo del
  modelo, cambiar una cosa por intento, subir lo que salió).
- Pendiente de decidir (Hub, sin deploy): Kling ya acepta 3–15 s (hoy la lista dice 5 y 10).
