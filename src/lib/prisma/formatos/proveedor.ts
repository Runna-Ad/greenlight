import "server-only";
import { ErrorConCosto, type Expandir, type PeticionIA, type RespuestaIA } from "./componer";

/**
 * HÜE Prisma › Formatos — el relleno con IA. UNA interfaz (`Expandir`, en componer.ts) y un proveedor
 * detrás; cambiar de proveedor = otra función con la misma forma, sin tocar el resto.
 *
 * Hoy: Gemini Nano Banana 2.1 (`gemini-nano-banana-2.1`, 2026-10-06) por la API REST de Gemini
 * (generateContent), la misma que usa scripts/looks-thumbs.mjs. Reemplaza a Nano Banana 2
 * (`gemini-3.1-flash-image`), que Google apaga el 2026-10-29; la imagen de salida cuesta la mitad. Gemini no recibe máscara: redibuja TODO el lienzo, centro incluido. No importa:
 * el último paso de componer() pega encima NUESTRA copia del original, y la deriva mide cuánto se movió.
 *
 * APAGADO salvo `PRISMA_FORMATOS_IA=gemini` + `GEMINI_API_KEY` (cuesta dinero; Pedro lo enciende tras probarlo).
 */

export const MODELO_GEMINI = "gemini-nano-banana-2.1";
/** Precios de Nano Banana 2.1, US$ por token (reportados al lanzamiento, 2026-10-09; la página de precios de
 *  Google no se pudo abrir desde la sesión → la primera llamada real los confirma con usageMetadata).
 *  Entrada ×3 vs Nano Banana 2 (0.50 → 1.50), imagen de salida a la mitad (60 → 30): aquí la entrada es una
 *  sola imagen, así que sale ~mitad de precio. */
const USD_ENTRADA = 1.5 / 1e6;
const USD_SALIDA_TEXTO = 7.5 / 1e6;
const USD_SALIDA_IMAGEN = 30 / 1e6;
const TIEMPO_MAX_MS = 150_000;

const PROMPT =
  "This image is a finished advertisement placed in the middle of a larger canvas. The blurry area around it is only a temporary placeholder. " +
  "Replace the placeholder by extending the advertisement's own background outward so the whole canvas reads as one seamless image: continue its colors, textures, scenery, perspective and lighting. " +
  "Do not add any text, letters, numbers, logos, people or new objects in the extended area. " +
  "Do not change, move, resize or redraw anything inside the advertisement in the middle.";

/** Un error del proveedor con un mensaje para el diseñador (español, sin detalles técnicos). */
export class ErrorIA extends Error {
  mensaje: string;
  constructor(mensaje: string, detalle: string) {
    super(detalle);
    this.mensaje = mensaje;
  }
}

export const iaActiva = (): boolean => process.env.PRISMA_FORMATOS_IA === "gemini" && !!process.env.GEMINI_API_KEY;

/** El proveedor activo, o null si la IA está apagada. */
export function expandidor(): { expandir: Expandir; modelo: string } | null {
  return iaActiva() ? { expandir: expandirGemini, modelo: MODELO_GEMINI } : null;
}

type UsoGemini = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  candidatesTokensDetails?: { modality?: string; tokenCount?: number }[];
};

/** Costo real = tokens que reporta Google × precio publicado. null si no vino el uso (no se inventa). */
export function costoGemini(uso: UsoGemini | undefined): number | null {
  if (!uso || typeof uso.candidatesTokenCount !== "number") return null;
  const imagen = (uso.candidatesTokensDetails ?? []).filter((d) => d.modality === "IMAGE").reduce((s, d) => s + (d.tokenCount ?? 0), 0);
  const texto = Math.max(0, uso.candidatesTokenCount - imagen) + (uso.thoughtsTokenCount ?? 0);
  const total = (uso.promptTokenCount ?? 0) * USD_ENTRADA + imagen * USD_SALIDA_IMAGEN + texto * USD_SALIDA_TEXTO;
  return Math.round(total * 10_000) / 10_000;
}

type Parte = { text: string } | { inlineData: { mimeType: "image/png"; data: string } };

/** Una llamada a Gemini que devuelve UNA imagen: la usan expandir y borrar (mismos errores, mismo costo). */
/** `mensajes`: lo que lee el diseñador si falla o si la IA no devuelve imagen (cada uso dice qué hacer). */
async function llamarGemini(partes: Parte[], aspect: string, tamano: PeticionIA["tamano"], mensajes: { fallo: string; sinImagen: string }): Promise<RespuestaIA> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ErrorIA("La IA de Formatos no está configurada.", "sin GEMINI_API_KEY");
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO_GEMINI}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: partes }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: aspect, imageSize: tamano } },
      }),
      signal: AbortSignal.timeout(TIEMPO_MAX_MS),
    });
  } catch (e) {
    throw new ErrorIA("La IA tardó demasiado o no respondió. Reintenta.", e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) {
    const cuerpo = (await res.text()).slice(0, 300);
    if (res.status === 402) throw new ErrorIA("La cuenta de la IA se quedó sin saldo. Avísale a Pedro.", `402 ${cuerpo}`);
    if (res.status === 429 || res.status === 503) throw new ErrorIA("La IA está saturada. Reintenta en un minuto.", `${res.status} ${cuerpo}`);
    throw new ErrorIA(mensajes.fallo, `${res.status} ${cuerpo}`);
  }
  type Respuesta = { candidates?: { finishReason?: string; content?: { parts?: { inlineData?: { data?: string } }[] } }[]; usageMetadata?: UsoGemini };
  const json = (await res.json()) as Respuesta;
  const costoUsd = costoGemini(json.usageMetadata);
  const data = json.candidates?.[0]?.content?.parts?.find((x) => x.inlineData?.data)?.inlineData?.data;
  if (!data) {
    // Sin imagen (filtro de seguridad, etc.) Google igual cobra la entrada: el costo viaja con el error.
    const motivo = json.candidates?.[0]?.finishReason ?? "sin candidatos";
    throw new ErrorConCosto(new ErrorIA(mensajes.sinImagen, `sin imagen (${motivo})`), costoUsd);
  }
  return { png: Buffer.from(data, "base64"), costoUsd, modelo: MODELO_GEMINI };
}

const imagen = (png: Buffer): Parte => ({ inlineData: { mimeType: "image/png", data: png.toString("base64") } });

async function expandirGemini(p: PeticionIA): Promise<RespuestaIA> {
  return llamarGemini([{ text: PROMPT }, imagen(p.png)], p.aspect, p.tamano, {
    fallo: "La IA no pudo rellenar este tamaño. Reintenta o usa desenfoque.",
    sinImagen: "La IA no quiso rellenar esta imagen. Usa desenfoque o color.",
  });
}

// ── Borrar del fondo la copia de una pieza (respaldo del relleno gratis de gemela.ts) ──
const PROMPT_BORRAR =
  "The first image is a crop of an advertisement background. It contains a painted copy of the object shown in the second image. " +
  "Remove that object completely from the first image, including its shadow, its reflection and any colored glow it casts on nearby surfaces, " +
  "and fill the area with the surrounding background so it looks like the object was never there: continue the textures, perspective and lighting. " +
  "Do not add any new objects, text, letters, numbers or logos. Keep everything else in the first image exactly the same, with the same framing.";

export type PeticionBorrar = { fondo: Buffer; pieza: Buffer; aspect: string; tamano: PeticionIA["tamano"] };

/** El borrador activo, o null si la IA está apagada (mismo interruptor que el relleno de Formatos). */
export function borrador(): { borrar: (p: PeticionBorrar) => Promise<RespuestaIA>; modelo: string } | null {
  const mensajes = { fallo: "La IA no pudo borrar la copia. Reintenta o quédate con el relleno gratis.", sinImagen: "La IA no quiso borrar la copia. Quédate con el relleno gratis o pide el fondo sin el producto." };
  return iaActiva() ? { borrar: (p) => llamarGemini([{ text: PROMPT_BORRAR }, imagen(p.fondo), imagen(p.pieza)], p.aspect, p.tamano, mensajes), modelo: MODELO_GEMINI } : null;
}

// ── Leer una imagen plana (B28): qué elementos tiene, dónde y con qué letras (sólo texto de salida) ──
/** Probado el 2026-10-27 con el anuncio DiDi Card: 15 elementos, cajas a 0-4 px de la tinta, letras exactas. */
export const MODELO_LECTURA = "gemini-3.8-flash";
/** Precio de gemini-3.8-flash, US$ por token: US$0.75 / 3.75 por millón, de listas de precios de terceros al
 *  2026-10-27 (la página de Google no se abrió). Es precio de lanzamiento: esas listas dicen que sube en enero 2027.
 *  Una lectura real: ~1,500 tokens de entrada y ~1,000-2,500 de salida (con lo que "piensa") ≈ US$0.005-0.01. */
const USD_LECTURA_ENTRADA = 0.75 / 1e6;
const USD_LECTURA_SALIDA = 3.75 / 1e6;
const LECTURA_TIEMPO_MAX_MS = 60_000;

const PROMPT_LEER =
  "You are preparing a flat advertisement image so a designer can move, delete and retype each element. " +
  "List EVERY separate visual element of the ad (everything except the plain background). For each: " +
  '"label": a short unique English name; ' +
  '"rol": "BRAND" (brand or partner logos at the top), "TITULO" (main headline), "SUBTITULO" (secondary text), "CTA" (price, offer, button), "HERO" (product images, cards, people), "FOOTER" (legal text, app and store badges) or "OTRO"; ' +
  '"tipo": "texto" for typography that could be retyped, "imagen" for photos, products, logos and icons, "forma" for plain shapes such as pills, bars or separators; ' +
  '"box_2d": [ymin, xmin, ymax, xmax] normalized 0-1000, tight around the element\'s visible pixels, including its own drop shadow or reflection; ' +
  '"texto": REQUIRED for every item of tipo "texto": the exact characters as printed, letter by letter (keep accents, symbols, punctuation and case; use \\n between lines); "" for other items; ' +
  '"sobre": the label of the element it sits on top of (for example text on a pill), or null. ' +
  "Text with a different size, color or weight is a separate element (one headline made of several sizes = several items). " +
  'Text inside a logo is part of the logo (tipo "imagen"). Text on a pill or button: the pill is one "forma" item and its text another "texto" item with "sobre" set. ' +
  "Do not skip small items: separators, icons, app and store badges, and the legal text.";

/** Sin esquema, el modelo se salta los campos "opcionales" (en la prueba no mandó las letras). `maxItems` y
 *  `LECTURA_TOKENS_MAX`: el texto de la imagen no puede hacer que la respuesta (y lo que cobra) crezca sin fin. */
const ESQUEMA_LEER = {
  type: "ARRAY",
  maxItems: 60,
  items: {
    type: "OBJECT",
    properties: {
      label: { type: "STRING" },
      rol: { type: "STRING", enum: ["BRAND", "TITULO", "SUBTITULO", "CTA", "HERO", "FOOTER", "OTRO"] },
      tipo: { type: "STRING", enum: ["texto", "imagen", "forma"] },
      box_2d: { type: "ARRAY", items: { type: "INTEGER" } },
      texto: { type: "STRING" },
      sobre: { type: "STRING", nullable: true },
    },
    required: ["label", "rol", "tipo", "box_2d", "texto"],
  },
};

export type RespuestaLectura = { elementos: unknown; costoUsd: number | null; modelo: string };

/** Lo más que puede escribir la IA en una lectura (con lo que piensa): 15 elementos fueron ~2,500; 60 caben de sobra.
 *  ≈ US$0.05 en el peor caso a los precios de arriba. */
const LECTURA_TOKENS_MAX = 12_000;

async function leerGemini(jpeg: Buffer, senal?: AbortSignal): Promise<RespuestaLectura> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ErrorIA("La IA de Formatos no está configurada.", "sin GEMINI_API_KEY");
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO_LECTURA}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ inlineData: { mimeType: "image/jpeg", data: jpeg.toString("base64") } }, { text: PROMPT_LEER }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: ESQUEMA_LEER, temperature: 0, maxOutputTokens: LECTURA_TOKENS_MAX },
      }),
      signal: senal ? AbortSignal.any([senal, AbortSignal.timeout(LECTURA_TIEMPO_MAX_MS)]) : AbortSignal.timeout(LECTURA_TIEMPO_MAX_MS),
    });
  } catch (e) {
    throw new ErrorIA("La IA tardó demasiado o no respondió. Reintenta.", e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) {
    const cuerpo = (await res.text().catch(() => "")).slice(0, 300);
    if (res.status === 402) throw new ErrorIA("La cuenta de la IA se quedó sin saldo. Avísale a Pedro.", `402 ${cuerpo}`);
    if (res.status === 429 || res.status === 503) throw new ErrorIA("La IA está saturada. Reintenta en un minuto.", `${res.status} ${cuerpo}`);
    throw new ErrorIA("La IA no pudo leer la imagen. Reintenta.", `${res.status} ${cuerpo}`);
  }
  type Respuesta = { candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[]; usageMetadata?: UsoGemini };
  let json: Respuesta;
  try {
    json = (await res.json()) as Respuesta;
  } catch (e) {
    throw new ErrorIA("La IA tardó demasiado o no respondió. Reintenta.", `cuerpo ilegible: ${e instanceof Error ? e.message : String(e)}`);
  }
  const uso = json.usageMetadata;
  const costoUsd = uso && typeof uso.candidatesTokenCount === "number"
    ? Math.round(((uso.promptTokenCount ?? 0) * USD_LECTURA_ENTRADA + (uso.candidatesTokenCount + (uso.thoughtsTokenCount ?? 0)) * USD_LECTURA_SALIDA) * 10_000) / 10_000
    : null;
  const texto = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (json.candidates?.[0]?.finishReason === "MAX_TOKENS") throw new ErrorConCosto(new ErrorIA("La IA no devolvió una lectura válida. Reintenta.", "llegó al tope de tokens"), costoUsd);
  let elementos: unknown;
  try {
    elementos = JSON.parse(texto);
  } catch {
    throw new ErrorConCosto(new ErrorIA("La IA no devolvió una lectura válida. Reintenta.", `sin JSON (${json.candidates?.[0]?.finishReason ?? "sin candidatos"})`), costoUsd);
  }
  return { elementos, costoUsd, modelo: MODELO_LECTURA };
}

/** El lector activo, o null si la IA está apagada (mismo interruptor que el relleno de Formatos). */
export function lector(): { leer: (jpeg: Buffer, senal?: AbortSignal) => Promise<RespuestaLectura>; modelo: string } | null {
  return iaActiva() ? { leer: leerGemini, modelo: MODELO_LECTURA } : null;
}
