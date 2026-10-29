import sharp from "sharp";
import { ErrorConCosto } from "@/lib/prisma/formatos/componer";
import { ErrorIA, rehacedorFondo } from "@/lib/prisma/formatos/proveedor";
import { RATIOS_IA } from "@/lib/prisma/formatos/geometria";
import { CUERPO_IA_MAX_BYTES, FONDO_IA_MAX_BYTES, PIEZA_IA_MAX_BYTES, RECORTE_IA_MAX } from "@/lib/prisma/formatos/gemela";
import { pngDelForm } from "@/lib/prisma/formatos/png-form";
import { FRENO, gate, saturado } from "@/app/(app)/prisma/comun";
import { mismoOrigen } from "@/app/(app)/prisma/formatos-comun";

/**
 * HÜE Prisma › Formatos, imagen plana — «Rehacer el fondo con IA» (Pedro, 2026-10-29: "Build AI background"). La
 * revisión manda el fondo limpio entero (lo que se pudo sacar gratis ya no está) y una máscara de lo que se quedó
 * pegado; aquí Gemini lo borra y se devuelve la imagen. Nada se guarda: lo que vuelve se pega en el navegador SÓLO
 * dentro de la máscara (plano.ts › `pegarFondoIA`). UNA llamada por anuncio.
 *
 * POST multipart { fondo: PNG, mascara: PNG (mismo tamaño), aspect } → image/png (+ x-costo-usd) | { ok: false, error }
 * Mismo gate, interruptor (PRISMA_FORMATOS_IA=gemini + GEMINI_API_KEY) y frenos que «Quitar del fondo» (copia/route.ts).
 * PENDIENTE antes de producción, igual que allá: un registro en la base por llamada (persona, costo) con tope diario.
 */
export const dynamic = "force-dynamic";
/** La IA tiene 150 s de tope (proveedor.ts). */
export const maxDuration = 180;

/** Llamadas por persona cada 10 min: cada una cuesta (≈ US$0.04, `COSTO_COPIA_IA_USD`). */
const LLAMADAS_MAX = 10;
/** Lo que se tolera entre la proporción del fondo y la que se pide (se redondea a px enteros). */
const PROPORCION_TOLERANCIA = 0.03;

const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function POST(req: Request) {
  if (!mismoOrigen(req)) return json({ ok: false, error: "Origen no permitido." }, 403);
  if (!(req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) return json({ ok: false, error: "Formato inválido." }, 415);
  const g = await gate();
  if ("ok" in g) return json(g, /sesión/i.test(g.error) ? 401 : 403);
  const ia = rehacedorFondo();
  if (!ia) return json({ ok: false, error: "El relleno con IA está apagado." }, 409);
  if (saturado(g.soyId, Date.now(), "formatos-copia-ia", LLAMADAS_MAX)) return json({ ok: false, error: "Muchos rellenos con IA en poco tiempo. Espera unos minutos." }, 429);
  // Y el freno de todo lo que se cobra en HÜE Prisma (comun.ts): este gasto cuenta dentro, no aparte.
  if (saturado(g.soyId)) return json(FRENO, 429);
  const largo = Number(req.headers.get("content-length"));
  if (!(largo > 0) || largo > CUERPO_IA_MAX_BYTES) return json({ ok: false, error: "La imagen es demasiado grande." }, 413);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ ok: false, error: "Formato inválido." }, 400);
  }
  const aspect = form.get("aspect");
  if (typeof aspect !== "string" || !Object.hasOwn(RATIOS_IA, aspect)) return json({ ok: false, error: "Proporción no válida." }, 400);
  const [fondo, mascara] = await Promise.all([pngDelForm(form, "fondo", FONDO_IA_MAX_BYTES, RECORTE_IA_MAX), pngDelForm(form, "mascara", PIEZA_IA_MAX_BYTES, RECORTE_IA_MAX)]);
  if (typeof fondo === "string") return json({ ok: false, error: fondo }, 400);
  if (typeof mascara === "string") return json({ ok: false, error: mascara }, 400);
  const [rw, rh] = aspect.split(":").map(Number);
  if (Math.abs(fondo.w / fondo.h / (rw / rh) - 1) > PROPORCION_TOLERANCIA) return json({ ok: false, error: "El fondo no tiene la proporción pedida." }, 400);
  if (mascara.w !== fondo.w || mascara.h !== fondo.h) return json({ ok: false, error: "La máscara no mide lo mismo que el fondo." }, 400);

  try {
    const r = await ia.rehacer({ fondo: fondo.bytes, mascara: mascara.bytes, aspect, tamano: "1K" });
    // Lo que vuelve se re-codifica: siempre un PNG limpio (sin metadatos), aunque la IA mande otro formato.
    const salida = await sharp(r.png, { limitInputPixels: 2048 * 2048, failOn: "error" }).png().toBuffer();
    console.info(`[formatos] fondo plano con IA: ${r.modelo}, US$${r.costoUsd ?? "?"}`);
    return new Response(new Uint8Array(salida), {
      headers: { "content-type": "image/png", "cache-control": "no-store", "x-costo-usd": r.costoUsd === null ? "" : String(r.costoUsd) },
    });
  } catch (err) {
    const causa = err instanceof ErrorConCosto ? err.causa : err;
    if (err instanceof ErrorConCosto) console.info(`[formatos] fondo plano con IA sin imagen, US$${err.costoUsd ?? "?"}`);
    if (causa instanceof ErrorIA) {
      console.error("[formatos] fondo plano con IA:", causa.message);
      return json({ ok: false, error: causa.mensaje }, 502);
    }
    console.error("[formatos] fondo plano con IA:", err);
    return json({ ok: false, error: "La IA no pudo rehacer el fondo. Reintenta o sigue con lo pegado al fondo." }, 500);
  }
}
