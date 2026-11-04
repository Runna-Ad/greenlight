import sharp from "sharp";
import { ErrorConCosto } from "@/lib/prisma/formatos/componer";
import { ErrorIA, ampliadorFondo } from "@/lib/prisma/formatos/proveedor";
import { RATIOS_IA, type TamanoIA } from "@/lib/prisma/formatos/geometria";
import { CUERPO_IA_MAX_BYTES, FONDO_IA_MAX_BYTES, RECORTE_IA_MAX } from "@/lib/prisma/formatos/gemela";
import { pngDelForm } from "@/lib/prisma/formatos/png-form";
import { anotarGastoGemini, revisarTopeGemini } from "@/lib/prisma/formatos/gasto-gemini";
import { FRENO, gate, saturado } from "@/app/(app)/prisma/comun";
import { mismoOrigen } from "@/app/(app)/prisma/formatos-comun";

/**
 * HÜE Prisma › Formatos, PSD — «Ampliar fondo con IA» de UNA medida (`ampliar.ts`). La pantalla manda el fondo limpio,
 * sin piezas, al centro de un lienzo de la forma de la medida; Gemini pinta lo de alrededor y se devuelve la imagen. Nada
 * se guarda: el fondo original se cose encima en el navegador.
 *
 * POST multipart { imagen: PNG, aspect, tamano } → image/jpeg (+ x-costo-usd) | { ok: false, error }
 * Mismo gate, interruptor (PRISMA_FORMATOS_IA=gemini + GEMINI_API_KEY), frenos y tope diario que «Rehacer el fondo con
 * IA» (fondo-plano/route.ts). El gasto se anota como "tamano": es la misma operación que Formatos con imagen plana.
 */
export const dynamic = "force-dynamic";
/** La IA tiene 150 s de tope (proveedor.ts). */
export const maxDuration = 180;

/** Llamadas por persona cada 10 min: cada una cuesta (≈ US$0.04-0.05, `COSTO_IA_USD`). */
const LLAMADAS_MAX = 15;
/** Lo que se tolera entre la proporción de la imagen y la que se pide (se redondea a px enteros). */
const PROPORCION_TOLERANCIA = 0.03;
/** Lo que se tolera de más sobre los píxeles que corresponden a lo pedido (`RATIOS_IA`). */
const SALIDA_HOLGURA = 1.1;

const json = (body: unknown, status = 200) => Response.json(body, { status });
const esTamano = (v: unknown): v is TamanoIA => v === "1K" || v === "2K";

export async function POST(req: Request) {
  if (!mismoOrigen(req)) return json({ ok: false, error: "Origen no permitido." }, 403);
  if (!(req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) return json({ ok: false, error: "Formato inválido." }, 415);
  const g = await gate();
  if ("ok" in g) return json(g, /sesión/i.test(g.error) ? 401 : 403);
  const ia = ampliadorFondo();
  if (!ia) return json({ ok: false, error: "La ampliación con IA está apagada." }, 409);
  // Antes de los frenos de la IA, para que un intento rechazado no los gaste.
  const sinTope = await revisarTopeGemini();
  if (sinTope) return json({ ok: false, error: sinTope }, 429);
  if (saturado(g.soyId, Date.now(), "formatos-ampliar-ia", LLAMADAS_MAX)) return json({ ok: false, error: "Muchas ampliaciones con IA en poco tiempo. Espera unos minutos." }, 429);
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
  const aspect = form.get("aspect"), tamano = form.get("tamano");
  if (typeof aspect !== "string" || !Object.hasOwn(RATIOS_IA, aspect)) return json({ ok: false, error: "Proporción no válida." }, 400);
  if (!esTamano(tamano)) return json({ ok: false, error: "Tamaño no válido." }, 400);
  const imagen = await pngDelForm(form, "imagen", FONDO_IA_MAX_BYTES, RECORTE_IA_MAX);
  if (typeof imagen === "string") return json({ ok: false, error: imagen }, 400);
  const [rw, rh] = RATIOS_IA[aspect]["1K"];
  if (Math.abs(imagen.w / imagen.h / (rw / rh) - 1) > PROPORCION_TOLERANCIA) return json({ ok: false, error: "La imagen no tiene la proporción pedida." }, 400);

  try {
    const r = await ia.ampliar({ png: imagen.bytes, aspect, tamano });
    await anotarGastoGemini({ ruta: "tamano", modelo: r.modelo, usd: r.costoUsd, member_id: g.soyId });
    // Lo que vuelve se re-codifica sin metadatos. En JPEG: un fondo de foto de 2K en PNG pasaría los 4.5 MB que deja Vercel,
    // ya cobrado. Es sólo lo de alrededor: el fondo original se cose encima en el navegador.
    const [sw, sh] = RATIOS_IA[aspect][tamano];
    const abierta = sharp(r.png, { limitInputPixels: Math.ceil(sw * sh * SALIDA_HOLGURA), failOn: "error" });
    const m = await abierta.metadata();
    if (!m.width || !m.height || Math.abs(m.width / m.height / (rw / rh) - 1) > PROPORCION_TOLERANCIA) throw new ErrorIA("La IA devolvió otra proporción. Reintenta o sigue sin ampliarlo.", `salida ${m.width}×${m.height} para ${aspect}`);
    const salida = await abierta.flatten({ background: "#000000" }).jpeg({ quality: 92 }).toBuffer();
    console.info(`[formatos] fondo ampliado con IA: ${r.modelo}, US$${r.costoUsd ?? "?"}, ${salida.length} bytes`);
    return new Response(new Uint8Array(salida), {
      headers: { "content-type": "image/jpeg", "cache-control": "no-store", "x-costo-usd": r.costoUsd === null ? "" : String(r.costoUsd) },
    });
  } catch (err) {
    const causa = err instanceof ErrorConCosto ? err.causa : err;
    if (err instanceof ErrorConCosto) {
      console.info(`[formatos] fondo ampliado con IA sin imagen, US$${err.costoUsd ?? "?"}`);
      await anotarGastoGemini({ ruta: "tamano", modelo: ia.modelo, usd: err.costoUsd, member_id: g.soyId });
    }
    if (causa instanceof ErrorIA) {
      console.error("[formatos] fondo ampliado con IA:", causa.message);
      return json({ ok: false, error: causa.mensaje }, 502);
    }
    console.error("[formatos] fondo ampliado con IA:", err);
    return json({ ok: false, error: "La IA no pudo ampliar el fondo. Reintenta o sigue sin ampliarlo." }, 500);
  }
}
