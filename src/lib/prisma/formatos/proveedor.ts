import "server-only";
import { ErrorConCosto, type Expandir, type PeticionIA, type RespuestaIA } from "./componer";

/**
 * HÜE Prisma › Formatos — el relleno con IA. UNA interfaz (`Expandir`, en componer.ts) y un proveedor
 * detrás; cambiar de proveedor = otra función con la misma forma, sin tocar el resto.
 *
 * Hoy: Gemini Nano Banana 2 (`gemini-3.1-flash-image`) por la API REST de Gemini, la misma que usa
 * scripts/looks-thumbs.mjs. Gemini no recibe máscara: redibuja TODO el lienzo, centro incluido. No importa:
 * el último paso de componer() pega encima NUESTRA copia del original, y la deriva mide cuánto se movió.
 *
 * APAGADO salvo `PRISMA_FORMATOS_IA=gemini` + `GEMINI_API_KEY` (cuesta dinero; Pedro lo enciende tras probarlo).
 */

export const MODELO_GEMINI = "gemini-3.1-flash-image";
/** Precios publicados de Gemini 3.1 Flash Image (ai.google.dev/gemini-api/docs/pricing, 2026-10-02), US$ por token. */
const USD_ENTRADA = 0.5 / 1e6;
const USD_SALIDA_TEXTO = 3 / 1e6;
const USD_SALIDA_IMAGEN = 60 / 1e6;
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

async function expandirGemini(p: PeticionIA): Promise<RespuestaIA> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ErrorIA("La IA de Formatos no está configurada.", "sin GEMINI_API_KEY");
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO_GEMINI}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }, { inlineData: { mimeType: "image/png", data: p.png.toString("base64") } }] }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: p.aspect, imageSize: p.tamano } },
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
    throw new ErrorIA("La IA no pudo rellenar este tamaño. Reintenta o usa desenfoque.", `${res.status} ${cuerpo}`);
  }
  type Respuesta = { candidates?: { finishReason?: string; content?: { parts?: { inlineData?: { data?: string } }[] } }[]; usageMetadata?: UsoGemini };
  const json = (await res.json()) as Respuesta;
  const costoUsd = costoGemini(json.usageMetadata);
  const data = json.candidates?.[0]?.content?.parts?.find((x) => x.inlineData?.data)?.inlineData?.data;
  if (!data) {
    // Sin imagen (filtro de seguridad, etc.) Google igual cobra la entrada: el costo viaja con el error.
    const motivo = json.candidates?.[0]?.finishReason ?? "sin candidatos";
    throw new ErrorConCosto(new ErrorIA("La IA no quiso rellenar esta imagen. Usa desenfoque o color.", `sin imagen (${motivo})`), costoUsd);
  }
  return { png: Buffer.from(data, "base64"), costoUsd, modelo: MODELO_GEMINI };
}
