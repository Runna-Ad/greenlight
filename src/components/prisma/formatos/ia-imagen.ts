/**
 * HÜE Prisma › Formatos — lo que comparten las pantallas que le mandan imágenes a la IA desde el navegador
 * («Quitar del fondo» de un PSD y «Rehacer el fondo con IA» de una imagen plana): un RGBA a PNG que quepa en lo que
 * acepta la ruta, y lo que vuelve a RGBA del tamaño pedido.
 */

/** Lo más que la pantalla espera a la IA (la ruta le da 150 s, más subir y bajar). */
export const IA_ESPERA_MS = 170_000;

export const aPng = (lienzo: HTMLCanvasElement): Promise<Blob> =>
  new Promise((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error("toBlob"))), "image/png"));

/** Un RGBA como PNG de a lo más `bytes`: se achica (lado mayor desde `max`, ×0.75 cada vez) hasta que quepa. Si ni a
 *  256 px cabe, va así y la ruta dice que es demasiado grande. */
export async function pngQueQuepa(rgba: Uint8ClampedArray<ArrayBuffer>, w: number, h: number, max: number, bytes: number): Promise<Blob> {
  for (let lado = max; ; lado = Math.round(lado * 0.75)) {
    const b = await aPng(lienzoDe(rgba, w, h, lado));
    if (b.size <= bytes || lado <= 256) return b;
  }
}
/** Un RGBA en un lienzo; si su lado mayor pasa de `max`, reducido (con el suavizado del navegador). */
export function lienzoDe(rgba: Uint8ClampedArray<ArrayBuffer>, w: number, h: number, max = Infinity): HTMLCanvasElement {
  // Sin contexto (el navegador se quedó sin memoria de lienzos) se corta aquí: nunca se manda una imagen en blanco.
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const origen = c.getContext("2d");
  if (!origen) throw new Error("sin 2d");
  origen.putImageData(new ImageData(rgba, w, h), 0, 0);
  const k = Math.min(1, max / Math.max(w, h));
  if (k === 1) return c;
  const r = document.createElement("canvas");
  r.width = Math.max(1, Math.round(w * k));
  r.height = Math.max(1, Math.round(h * k));
  const ctx = r.getContext("2d");
  if (!ctx) throw new Error("sin 2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(c, 0, 0, r.width, r.height);
  c.width = c.height = 0; // suelta la memoria del lienzo grande ya
  return r;
}
/** Una imagen (lo que devolvió la IA) en RGBA de exactamente w × h. */
export async function aRgba(imagen: Blob, w: number, h: number): Promise<Uint8ClampedArray> {
  const bmp = await createImageBitmap(imagen);
  try {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("sin 2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  } finally {
    bmp.close();
  }
}
/** Un error que ya trae el mensaje para el diseñador (el de la ruta). */
export class ErrorDeRuta extends Error {}
