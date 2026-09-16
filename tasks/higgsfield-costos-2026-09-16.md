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
| Nano Banana 2 (gemini-3.1-flash-image) | cobra, sin dato | no está en la lista de ilimitados |
| Image Auto | ilimitado | historial ("Ilimitado") |
| GPT Image 2.5 Flare / Sunburst | 3 (1.5–26.5) | **Pedro, 2026-09-16: 3 créditos cada uno** (NO ilimitados); rango del blog por calidad/resolución. GPT Image 2 = 6.5 (no está en el catálogo). El "GPT Image" ilimitado del plan no es ninguno de estos. |
| Veo 3.1 | 58 (29–88) | **Pedro, 2026-09-16**: 8 s = 58 (720p y 1080p) / 88 (4K) · 6 s = 44 / 66 · 4 s = 29 / 44. 720p = 1080p; 4K ≈ ×1.5 (la nota de costo de Veo lo dice, en vez de la general "1080p ≈ ×2"). |
| Veo 3.1 Fast | cobra, sin dato | — |
| Kling 3.0 Turbo | 6 (6–8) | historial (14 filas) |
| Kling 3.0 | 6 (3.75–12) | historial (12 filas) |
| Kling 3.0 Motion Control | 8 (8–14) | historial |
| Higgsfield DoP | sin dato | — |
| Seedream 4.5 / 5.0 Lite | ilimitado | plan |
| Seedance 2.0 Mini | 12.5 (10–17.5) | historial (6 filas) |
| Seedance 2.0 | 54 (36–110) | historial (16 filas) |
| Seedance 2.5 | 72 (hasta 195) | blog (8 s 1080p = 72; 30 s 720p = 195) |
| Gemini Omni Flash | 24 (12–30) | blog (~US$0.15/s) ÷ US$0.05/crédito del blog, 4–10 s — estimado |
Por intento → por pieza: × 3–5 (blog ai-video-credits-explained). USD: × 0.04 (resumen de uso de Pedro).
