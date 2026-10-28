import sharp from "sharp";
import { ErrorConCosto } from "@/lib/prisma/formatos/componer";
import { ErrorIA, lector } from "@/lib/prisma/formatos/proveedor";
import { LADO_LECTURA, limpiarLectura } from "@/lib/prisma/formatos/plano";
import { FRENO, gate, saturado } from "@/app/(app)/prisma/comun";
import { mismoOrigen } from "@/app/(app)/prisma/formatos-comun";
import { HUELLA, guardarLectura, lecturaGuardada } from "@/lib/prisma/formatos/lecturas-guardadas";

/**
 * HÜE Prisma › Formatos, imagen plana (B28) — la LECTURA con IA de un anuncio sin PSD: qué elementos tiene, dónde
 * están y, si son texto, sus letras. La pantalla manda la imagen (ya reducida); aquí se decodifica entera, se vuelve
 * a codificar como JPEG (a la IA sólo le llegan píxeles) y se devuelve la lectura limpia. Con `huella` (sha256 del
 * archivo original) la lectura se guarda y la misma imagen la reusa sin llamar a la IA (0087, `guardada: true`);
 * `nueva=1` («Leer otra vez») pide otra y la reemplaza.
 *
 * POST multipart { imagen: PNG | JPEG | WebP, huella?, nueva? } → { ok: true, elementos, w, h, costoUsd, guardada }
 *   | { ok: false, error }
 * Mismo gate que la copia con IA (copia/route.ts) y apagado salvo PRISMA_FORMATOS_IA=gemini + GEMINI_API_KEY.
 * PENDIENTE antes de producción (igual que la copia): un registro en la base por llamada con tope diario.
 */
export const dynamic = "force-dynamic";
/** La lectura tiene 60 s de tope (proveedor.ts). */
export const maxDuration = 90;

/** Lecturas por persona cada 10 min (cada una ≈ US$0.005-0.01). */
const LLAMADAS_MAX = 20;
/** Lo que se acepta del cuerpo: la pantalla manda la imagen ya reducida (≤ LADO_LECTURA), así que sobra. */
const CUERPO_MAX_BYTES = 4_000_000;
/** Lo más grande que se decodifica, por lado: la pantalla manda ≤ LADO_LECTURA. Un PNG liso de 8000 × 8000 pesa poco
 *  y pasa el tope de bytes, pero decodificado son 256 MB por llamada. */
const ENTRADA_MAX_PX = 2048;

const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function POST(req: Request) {
  if (!mismoOrigen(req)) return json({ ok: false, error: "Origen no permitido." }, 403);
  if (!(req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) return json({ ok: false, error: "Formato inválido." }, 415);
  const g = await gate();
  if ("ok" in g) return json(g, /sesión/i.test(g.error) ? 401 : 403);
  const ia = lector();
  if (!ia) return json({ ok: false, error: "La lectura con IA está apagada." }, 409);
  if (saturado(g.soyId)) return json(FRENO, 429);
  const largo = Number(req.headers.get("content-length"));
  if (!(largo > 0) || largo > CUERPO_MAX_BYTES) return json({ ok: false, error: "La imagen es demasiado grande." }, 413);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ ok: false, error: "Formato inválido." }, 400);
  }
  const f = form.get("imagen");
  if (!(f instanceof File) || f.size === 0) return json({ ok: false, error: "No llegó la imagen." }, 400);
  if (f.size > CUERPO_MAX_BYTES) return json({ ok: false, error: "La imagen es demasiado grande." }, 413);
  const h0 = form.get("huella");
  const huella = typeof h0 === "string" && HUELLA.test(h0) ? h0 : null;
  const nueva = form.get("nueva") === "1";
  let jpeg: Buffer, w: number, h: number;
  try {
    const abierta = sharp(Buffer.from(await f.arrayBuffer()), { limitInputPixels: ENTRADA_MAX_PX * ENTRADA_MAX_PX, failOn: "error" });
    const m = await abierta.metadata();
    if (!["png", "jpeg", "webp"].includes(m.format ?? "") || !m.width || !m.height || m.width > ENTRADA_MAX_PX || m.height > ENTRADA_MAX_PX) return json({ ok: false, error: "La imagen no es válida." }, 400);
    const { data, info } = await abierta
      .rotate()
      .resize({ width: LADO_LECTURA, height: LADO_LECTURA, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 90 })
      .toBuffer({ resolveWithObject: true });
    [jpeg, w, h] = [data, info.width, info.height];
  } catch {
    return json({ ok: false, error: "La imagen no es válida." }, 400);
  }

  // La misma imagen ya leída: su lectura, sin IA (no cuenta para el tope de lecturas).
  if (huella && !nueva) {
    const guardada = await lecturaGuardada(huella, ia.modelo, w, h);
    const elementos = guardada && limpiarLectura(guardada, w, h);
    if (elementos) return json({ ok: true, elementos, w, h, costoUsd: 0, guardada: true });
  }
  if (saturado(g.soyId, Date.now(), "formatos-leer-ia", LLAMADAS_MAX)) return json({ ok: false, error: "Muchas lecturas con IA en poco tiempo. Espera unos minutos." }, 429);

  try {
    // Si la persona cancela (o cierra la pestaña), la llamada a la IA también se corta.
    const r = await ia.leer(jpeg, req.signal);
    console.info(`[formatos] lectura con IA: ${r.modelo}, US$${r.costoUsd ?? "?"}`);
    const elementos = limpiarLectura(r.elementos, w, h);
    if (!elementos) return json({ ok: false, error: "La IA no encontró elementos en la imagen. Reintenta." }, 502);
    // Sólo una lectura que sirve se guarda (una vacía se reintenta).
    if (huella) await guardarLectura({ sha256: huella, modelo: r.modelo, w, h, elementos: r.elementos, created_by: g.soyId });
    return json({ ok: true, elementos, w, h, costoUsd: r.costoUsd, guardada: false });
  } catch (err) {
    const causa = err instanceof ErrorConCosto ? err.causa : err;
    if (err instanceof ErrorConCosto) console.info(`[formatos] lectura con IA sin respuesta válida, US$${err.costoUsd ?? "?"}`);
    if (causa instanceof ErrorIA) {
      console.error("[formatos] lectura con IA:", causa.message);
      return json({ ok: false, error: causa.mensaje }, 502);
    }
    console.error("[formatos] lectura con IA:", err);
    return json({ ok: false, error: "La IA no pudo leer la imagen. Reintenta." }, 500);
  }
}
