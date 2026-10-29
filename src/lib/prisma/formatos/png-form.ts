import "server-only";
import sharp from "sharp";

/**
 * HÜE Prisma › Formatos — lo que comparten las rutas que reciben imágenes del navegador para la IA
 * (`/api/prisma/formatos/copia` y `/api/prisma/formatos/fondo-plano`).
 */

/** Un PNG del form, decodificado entero y vuelto a codificar (sin metadatos ni bytes de más: a la IA sólo le llegan
 *  píxeles), con sus medidas; o el error para el diseñador. */
export async function pngDelForm(form: FormData, campo: string, maxBytes: number, maxPx: number): Promise<{ bytes: Buffer; w: number; h: number } | string> {
  const f = form.get(campo);
  if (!(f instanceof File) || f.size === 0) return "No llegó la imagen.";
  if (f.size > maxBytes) return "La imagen es demasiado grande.";
  try {
    const abierta = sharp(Buffer.from(await f.arrayBuffer()), { limitInputPixels: maxPx * maxPx, failOn: "error" });
    const m = await abierta.metadata();
    if (m.format !== "png" || !m.width || !m.height || m.width > maxPx || m.height > maxPx) return "La imagen no es válida.";
    return { bytes: await abierta.png().toBuffer(), w: m.width, h: m.height };
  } catch {
    return "La imagen no es válida.";
  }
}
