import sharp from "sharp";
import { ErrorConCosto } from "@/lib/prisma/formatos/componer";
import { ErrorIA, borrador } from "@/lib/prisma/formatos/proveedor";
import { RATIOS_IA } from "@/lib/prisma/formatos/geometria";
import { CUERPO_IA_MAX_BYTES, FONDO_IA_MAX_BYTES, PIEZA_IA_MAX, PIEZA_IA_MAX_BYTES, RECORTE_IA_MAX } from "@/lib/prisma/formatos/gemela";
import { FRENO, gate, saturado } from "@/app/(app)/prisma/comun";
import { mismoOrigen } from "@/app/(app)/prisma/formatos-comun";
import { pngDelForm as png } from "@/lib/prisma/formatos/png-form";

/**
 * HÜE Prisma › Formatos, puerta PSD — el respaldo con IA de «Quitar del fondo» (Pedro, 2026-10-14: "build it as a
 * second button"). La pantalla manda un recorte del fondo ORIGINAL alrededor de la copia y una imagen de la pieza;
 * aquí se le pide a Gemini que borre la pieza y se devuelve la imagen. Nada se guarda: el PSD se lee en el navegador
 * y lo que vuelve se pega allá (sólo en el hueco, `pegarRellenoIA`).
 *
 * POST multipart { fondo: PNG, pieza: PNG, aspect } → image/png (+ x-costo-usd) | { ok: false, error }
 * Mismo gate que HÜE Prisma (comun.ts) y apagado salvo PRISMA_FORMATOS_IA=gemini + GEMINI_API_KEY (proveedor.ts).
 * NO mira NEXT_PUBLIC_PRISMA_FORMATOS_ENABLED a propósito: la puerta PSD tampoco (psd/page.tsx). Para apagar el
 * gasto, se quita PRISMA_FORMATOS_IA. Freno: el suyo (10 / 10 min) y además el de todo lo que se cobra en Prisma.
 * PENDIENTE antes de producción: un registro en la base por llamada (persona, costo) con tope diario.
 */
export const dynamic = "force-dynamic";
/** La IA tiene 150 s de tope (proveedor.ts). */
export const maxDuration = 180;

/** Llamadas por persona cada 10 min: cada una cuesta (≈ US$0.041, `COSTO_COPIA_IA_USD`). */
const LLAMADAS_MAX = 10;
/** Lo que se tolera entre la proporción del recorte y la que se pide (el recorte se redondea a px enteros). */
const PROPORCION_TOLERANCIA = 0.03;

const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function POST(req: Request) {
  if (!mismoOrigen(req)) return json({ ok: false, error: "Origen no permitido." }, 403);
  if (!(req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) return json({ ok: false, error: "Formato inválido." }, 415);
  const g = await gate();
  if ("ok" in g) return json(g, /sesión/i.test(g.error) ? 401 : 403);
  const ia = borrador();
  if (!ia) return json({ ok: false, error: "El relleno con IA está apagado." }, 409);
  if (saturado(g.soyId, Date.now(), "formatos-copia-ia", LLAMADAS_MAX)) return json({ ok: false, error: "Muchos rellenos con IA en poco tiempo. Espera unos minutos." }, 429);
  // Y el freno de todo lo que se cobra en HÜE Prisma (comun.ts): este gasto cuenta dentro, no aparte.
  if (saturado(g.soyId)) return json(FRENO, 429);
  // Antes de leer el cuerpo: sin largo, o más grande de lo que cabe, no se lee.
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
  const [fondo, pieza] = await Promise.all([png(form, "fondo", FONDO_IA_MAX_BYTES, RECORTE_IA_MAX), png(form, "pieza", PIEZA_IA_MAX_BYTES, PIEZA_IA_MAX)]);
  if (typeof fondo === "string") return json({ ok: false, error: fondo }, 400);
  if (typeof pieza === "string") return json({ ok: false, error: pieza }, 400);
  const [rw, rh] = aspect.split(":").map(Number);
  if (Math.abs(fondo.w / fondo.h / (rw / rh) - 1) > PROPORCION_TOLERANCIA) return json({ ok: false, error: "El recorte no tiene la proporción pedida." }, 400);

  try {
    const r = await ia.borrar({ fondo: fondo.bytes, pieza: pieza.bytes, aspect, tamano: "1K" });
    // Lo que vuelve se re-codifica: siempre un PNG limpio (sin metadatos), aunque la IA mande otro formato.
    const salida = await sharp(r.png, { limitInputPixels: 2048 * 2048, failOn: "error" }).png().toBuffer();
    console.info(`[formatos] copia con IA: ${r.modelo}, US$${r.costoUsd ?? "?"}`);
    return new Response(new Uint8Array(salida), {
      headers: { "content-type": "image/png", "cache-control": "no-store", "x-costo-usd": r.costoUsd === null ? "" : String(r.costoUsd) },
    });
  } catch (err) {
    const causa = err instanceof ErrorConCosto ? err.causa : err;
    if (err instanceof ErrorConCosto) console.info(`[formatos] copia con IA sin imagen, US$${err.costoUsd ?? "?"}`);
    if (causa instanceof ErrorIA) {
      console.error("[formatos] copia con IA:", causa.message);
      return json({ ok: false, error: causa.mensaje }, 502);
    }
    console.error("[formatos] copia con IA:", err);
    return json({ ok: false, error: "La IA no pudo borrar la copia. Reintenta o quédate con el relleno que tienes." }, 500);
  }
}
