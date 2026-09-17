# Higgsfield — costos reales del equipo (fuente: capturas de Pedro, 2026-09-16)

Fuente única: 9 capturas del "Historial de uso" y del "Resumen de gastos" de la cuenta Ultimate de Rünna en higgsfield.ai
(Manage Account → Usage), del 4 ago al 10 sept 2026. Sólo se anotan las filas VISIBLES en las capturas; el historial
completo tiene 155 filas. El historial NO muestra duración/resolución por fila → los costos son RANGOS por modelo.

## Resumen de la cuenta (tal cual la captura; el periodo del resumen no se ve)
- USD 223.379 · 5,584.48 créditos gastados · 35 funciones · 1,138 generaciones.
- → **1 crédito ≈ USD 0.04** (223.379 / 5,584.48 = 0.0400).
- Reparto del gasto: Seedance 2.0 **59 %** · Wan 2.7 Video 10 % · Kling v3.0 5 % · Cinematic Studio 3.5 Video 3 % ·
  Seedance 1.5 Pro 3 % · Sora 2 3 % · Mixed Media 3 % · Kling 3.0 Motion Control 3 % · Otros 11 %.
  (Seedance 2.0 ≈ 3,300 créditos ≈ USD 130 — aproximado, sale del porcentaje.)
- Suscripción: **+1,200 créditos** "Concedido" el 18 ago 2026 (renovación mensual); ese día se descontaron 15.36 créditos
  sin usar ("Subscription Credits Reset") → los créditos de la suscripción no se acumulan de un mes a otro.
- Los fallidos aparecen como "Reembolsado" con el mismo monto (+8, +6, y uno "Ilimitado").

## Costo por generación (filas visibles)
| Modelo (nombre en Higgsfield) | Filas | Valores vistos (créditos) | Mediana | Nota |
|---|---|---|---|---|
| Seedance 2.0 | 16 | 36 ×4, 45 ×2, 54 ×4, 63 ×4, 81, 110 ×2 | **54** | prom. ≈ 60; el más caro |
| Seedance 2.0 Mini | 6 | 10 ×3, 15 ×2, 17.5 | 12.5 | |
| Kling v3.0 | 12 | 3.75, 4.5 ×3, 6 ×3, 9, 10.5 ×2, 12 ×2 | **6** | todos múltiplos de 0.75 |
| Kling 3.0 Turbo | 14 | 6 ×9, 8 ×5 | 6 | 1 reembolsado |
| Kling 3.0 Motion Control | 4 | 8 ×3, 14 | 8 | 2 reembolsados |
| "Motion Control" (sin versión) | 5 | 10 ×2, 13 ×2, 14 | 13 | ¿otra versión de Kling? sin confirmar |
| Topaz Image (upscale) | 2 | 2, 5 | — | |
| FLUX.2 Pro Outpaint | 2 | 1.32 ×2 | — | |
| Seedream 4.5 · Nano Banana Pro · Image Auto | muchas | "Ilimitado" | 0 | ver lista de abajo |

→ Seedance 2.0 cuesta ~**9×** Kling v3.0 (mediana 54 vs 6).

## Modelos ILIMITADOS del plan (captura del plan, "365 Ilimitado", renovación automática)
FLUX.2 Pro (calidad 2K) · **Nano Banana Pro (calidad 2K, "exclusivo")** · Higgsfield Soul · GPT Image · Z Image ·
**Seedream 4.5** · Kling O1 Image · Flux Kontext · Higgsfield Popcorn · Nano Banana · Seedream 4.0 · Higgsfield Face Swap ·
Seedream 5.0 Lite. Además, "Image Auto" aparece como "Ilimitado" en el historial.
Sin confirmar: si Nano Banana Pro / FLUX.2 Pro en 4K cobran (la etiqueta dice "calidad 2K").
Recordatorio (verificado 2026-09-15): lo ilimitado aplica SÓLO en higgsfield.ai; por API/CLI/MCP siempre cobra.

## Cómo llegar
- Kling 3.0 Motion Control: https://higgsfield.ai/es/ai/video/motion?model=kling-3-motion-control (link de Pedro).

## Huecos (no bloquean)
- Costo por AJUSTE (duración × resolución) — el historial no lo muestra. Opciones: el tooltip del monto (subrayado
  punteado) o anotar lo que marca el botón Generar para 2–3 ajustes comunes de Seedance 2.0 y Kling 3.0.
- Wan 2.7 (10 % del gasto), Cinematic Studio 3.5, Seedance 1.5 Pro y Sora 2 se usan pero el head de diseño no los nombró.

## Costos base en el catálogo (paso 2, `catalogo.ts` BASE_MODELOS — editables en Hub › Herramientas)
Regla de Pedro (2026-09-16): ahorrar sin sacrificar calidad — la calidad/capacidad decide; el costo sólo desempata
o elige entre modelos que ya cumplen. "típico" = créditos por intento con los ajustes de siempre.
| Modelo (id) | Costo base | De dónde sale |
|---|---|---|
| Nano Banana Pro (gemini-3-pro-image) | ilimitado | plan "365 Ilimitado" (calidad 2K) |
| Nano Banana 2 (gemini-3.1-flash-image) | 2 (1.5–3) | **Pedro, 2026-09-16**: 1K = 1.5 · 2K = 2 · 4K = 3 (típico = 2K). |
| Image Auto | ilimitado | historial ("Ilimitado") |
| GPT Image 2.5 Flare / Sunburst | 3 (1.5–26.5) | **Pedro, 2026-09-16: 3 créditos cada uno** (NO ilimitados); rango del blog por calidad/resolución. GPT Image 2 = 6.5 (no está en el catálogo). El "GPT Image" ilimitado del plan no es ninguno de estos. |
| Veo 3.1 | 58 (29–88) + tabla | **Pedro, 2026-09-16**: 8 s = 58 (720p y 1080p) / 88 (4K) · 6 s = 44 / 66 · 4 s = 29 / 44. 720p = 1080p; 4K ≈ ×1.5 (la nota de costo de Veo lo dice, en vez de la general "1080p ≈ ×2"). |
| Veo 3.1 Fast | 22 (11–48) + tabla | **Pedro, 2026-09-16**: 4 s = 11 (720p/1080p) / 24 (4K) · 6 s = 17 / 36 · 8 s = 22 / 48. |
| Kling 3.0 Turbo | 6 (6–8) | historial (14 filas) |
| Kling 3.0 | 6 (3.75–12) | historial (12 filas) |
| Kling 3.0 Motion Control | 8 (8–14) | historial |
| Higgsfield DoP | sin dato | — |
| Seedream 4.5 / 5.0 Lite | ilimitado | plan |
| Seedance 2.0 Mini | 12.5 (10–37.5) + tabla | típico = historial (6 filas). **Pedro, 2026-09-16**: 4–15 s, sólo 480p y 720p; 720p = 2.5 por segundo (4 s = 10; 15 s = 37.5 → Higgsfield muestra 38). 480p sin dato. |
| Seedance 2.0 | 54 (12–330) + tabla | típico = mediana del historial (16 filas). **Pedro, 2026-09-16**: mismos precios por segundo que 2.5 (480p 3 · 720p 6.5 · 1080p 9), 4–15 s, y 4K a 22 por segundo (4 s = 88; 15 s = 330). |
| Seedance 2.5 | 72 (12–270) + tabla | **Pedro, 2026-09-16**: 4–30 s, parejo por segundo: 480p 3 · 720p 6.5 · 1080p 9 (4 s = 12/26/36; 30 s = 90/195/270). Sin 4K. Ojo: la herramienta Seedance en Prisma ofrece hasta 15 s (2.0 no pasa de ahí); de 16 a 30 s falta decidir. |
| Gemini Omni Flash 1.1 | 34 (9–90) + tabla | **Pedro, 2026-09-16**: 3–10 s (cualquier segundo). 720p 9→30 (+3/s) · 1080p 14→45 (+4/s; ojo: +4 daría 42 a 10 s, Pedro dijo 45 — se guardó 45, confirmar) · 4K 27→90 (+9/s). Típico = 8 s 1080p. |
Por intento → por pieza: × 3–5 (blog ai-video-credits-explained). USD: × 0.04 (resumen de uso de Pedro).

## Tabla por duración (2026-09-16)
Cuando hay tabla (`porDuracion`: segundos → 720p/1080p/4K), el estimado del Studio y del resultado dice el precio EXACTO
a la duración elegida en 1080p (y las otras resoluciones al lado); sin fila para esa duración, usa el típico.
Editable en Hub › Herramientas: `4=29/29/44, 6=44/44/66` (segundos=720p/1080p/4K; "-" = sin 4K), o con 480p al frente: `4=12/26/36/-`.
Faltan tablas de: Kling 3.0 / Turbo / Motion Control.

## Lectura directa del botón Generate (2026-09-16, sin sesión — Veo 8 s = 58 coincide con la cuenta de Pedro)
Se leyó en el navegador de la app cambiando duración/resolución (NUNCA se pulsó Generate). Por segundo:
| Modelo | 360p | 480p | 720p | 1080p | 4K | Duraciones |
|---|---|---|---|---|---|---|
| Kling 3.0 | — | — | 2 | 2.5 | 6 | 3–15 s (el sonido no cambia el precio) |
| Kling 3.0 Motion Control | — | — | 1.5 | 2.5 | — | según el video de movimiento, 3–30 s |
| Seedance 2.0 | — | 3 | **4.5** (no 6.5) | 9 | 22 | 4–15 s — precio tachado más alto: descuento vigente (lista: 6 / 6 / 12 / 26) |
| Seedance 2.0 Mini | — | 1 | 2.5 | — | — | 4–15 s |
| Seedance 2.0 Fast (no está en Prisma) | — | 1.5 | 3.5 | — | — | 4–15 s |
| Seedance 2.5 | — | 3 | 6.5 | 9 | — | 4–30 s — descuento vigente en 720p (lista 7) y 1080p (lista 16) |
| Gemini Omni Flash 1.1 | 1 | — | 3 | **4.5** | 9 | 3–10 s (1080p a 10 s = 45 ✓; el botón redondea: 3 s muestra 14 por 13.5) |
- El botón redondea medios créditos hacia ARRIBA (Mini 5 s = 13); el historial cobra el exacto (12.5).
- **Kling 3.0 Turbo** y **Higgsfield DoP** ya NO aparecen en el selector de modelos (sólo Kling 3.0, Motion Control y ediciones; Higgsfield = Genjutsu y Reframe).
- "Seedance 2.0 Fast / Mini is not available in US" (aviso por región del navegador; el equipo está en México).
- Sin sesión no se ve qué es ilimitado del plan (Nano Banana Pro 4K) — necesita la cuenta de Pedro.

## Con la sesión de Pedro (2026-09-17, navegador de la app, sólo lectura — nunca se pulsó Generar ni se compró nada)
- **Kling 3.0 cuesta menos en la cuenta** que sin sesión: 720p 1.75 · 1080p 2 · 4K 6 por segundo (5 s = 8.75 / 10 / 30).
  Explica el historial (10.5 = 6 s 720p; 12 = 6 s 1080p). **Kling 3.0 Turbo**: 720p 1.5 · 1080p 2, 3–15 s, sin 4K
  (existe: está en "Todos los modelos"). El resto (Seedance, Omni, Veo, Motion Control) = igual que sin sesión.
- **"Modo ilimitado" de Kling 3.0 NO es del plan**: es un pase que se compra (1 día US$35 · 3 días US$82 · 7 días US$158).
- **Nano Banana Pro**: ilimitado SÓLO con el interruptor «Ilimitado» encendido y en 1K/2K. Apagado: 1K/2K = 2 créditos; 4K = 4 siempre.
- **Seedance 2.0 Fast**: 480p 1.5/s, 720p 3.5/s; tiene "Generar gratis · 4" (4 generaciones gratis a 8 s 720p) y su
  propio «Modo ilimitado» (no se probó). "No disponible en EE. UU." es aviso por región.
- **Higgsfield DoP** ahora son 3 modelos (720p, 3–5 s): Lite 5 · Turbo 7 · Standard 10 créditos. En Prisma sigue como
  "Higgsfield DoP" (el nombre vive en la BD: se cambia en Hub › Herramientas).
- **Veo**: 3.1 (58 / 88 a 8 s) y 3.1 Fast (22 / 48) confirmados. Nuevo: **Veo 3.1 Lite** (8 s: 720p 12 · 1080p 16).
  Veo 3 y Veo 3 Fast "se van a retirar".
- **Imágenes ILIMITADAS hoy**: Seedream 5.0 lite · Seedream 4.5 · Seedream 4.0 · Nano Banana Pro · Nano Banana · Auto ·
  Higgsfield Soul · Face Swap · Z-Image · Kling O1 · FLUX.2 Pro · **GPT Image (el viejo, no 2 ni 2.5)** · Multi Reference.
  Cobran: GPT Image 2.5 Sunburst/Flare, GPT Image 2 (6.5, lista 8.5), Seedream 5.0 Pro (nuevo), Nano Banana 2,
  Nano Banana 2 Lite (nuevo), Recraft, Grok, FLUX.2 Flex/Max, etc.
- Aviso en la cuenta: "¡Se están agotando los créditos! Ya usaste más del 90%".
