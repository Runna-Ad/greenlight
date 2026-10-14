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
