/**
 * HÜE Prisma › Formatos, imagen plana (B28) — abrir una imagen en la puerta PSD: decodificarla aquí, mandar una copia
 * reducida a leer (`/api/prisma/formatos/leer`), llevar lo leído a los píxeles de la imagen entera y medirlo
 * (`medirPlano`). Lo que sigue (revisar y armar el maestro) es `revision-plano.tsx`.
 */
import { FP_ERROR } from "@/lib/prisma/formatos/copy";
import { LADO_LECTURA, medirPlanoFijo, type ElementoLeido, type Imagen } from "@/lib/prisma/formatos/plano";

type Medido = ReturnType<typeof medirPlanoFijo>;

/** Lo mismo que acepta la puerta de imagen plana (vista.ts). */
export const PLANO_BYTES_MAX = 25_000_000;
/** Lo más grande que se decodifica: el maestro vive en memoria varias veces (la imagen, el fondo limpio, cada pieza
 *  con su base) y se mide en el hilo de la página. 16 MP ≈ un 4K vertical con margen (el anuncio DiDi Card: 1.8 MP). */
const PLANO_LADO_MAX = 6000;
const PLANO_PX_MAX = 16_000_000;
/** La lectura tiene 60 s en el servidor; aquí se espera un poco más (subida + respuesta). */
const LEER_MS = 90_000;

export type Plano = {
  archivo: string;
  img: Imagen;
  /** Para enseñar la imagen en la revisión (se suelta con `URL.revokeObjectURL`). */
  url: string;
  /** Lo que leyó la IA, en px de la imagen entera. */
  leidos: ElementoLeido[];
  /** La medida de `leidos` tal cual (la revisión la reusa mientras no se quite ni cambie nada). */
  medido: Medido;
  costoUsd: number | null;
  /** Esta imagen ya se había leído: se usó la misma lectura (0087), sin IA. */
  guardada: boolean;
  /** El archivo, para «Leer otra vez». */
  file: File;
};
export type FallaPlano = { clave: "planoPesado" | "planoGrande" | "planoIlegible" | "planoLectura" | "planoTarde"; detalle?: string };

/** ¿Los primeros bytes son de PNG, JPEG o WebP? */
export function esImagenPlana(c: Uint8Array): boolean {
  const png = c[0] === 0x89 && c[1] === 0x50 && c[2] === 0x4e && c[3] === 0x47;
  const jpg = c[0] === 0xff && c[1] === 0xd8 && c[2] === 0xff;
  const webp = c.length >= 12 && String.fromCharCode(...c.slice(0, 4)) === "RIFF" && String.fromCharCode(...c.slice(8, 12)) === "WEBP";
  return png || jpg || webp;
}

/**
 * Abre la imagen, la manda a leer y la mide. `etapa` avisa cuándo pasa de leer a separar. Lanza `AbortError` si se
 * cancela; cualquier otra falla vuelve como `FallaPlano` (lo que dice la pantalla).
 */
export async function leerPlano(file: File, senal: AbortSignal, etapa: (e: "separar") => void, nueva = false): Promise<Plano | FallaPlano> {
  if (file.size > PLANO_BYTES_MAX) return { clave: "planoPesado" };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { clave: "planoIlegible" };
  }
  const { width: W, height: H } = bitmap;
  if (W > PLANO_LADO_MAX || H > PLANO_LADO_MAX || W * H > PLANO_PX_MAX) {
    bitmap.close();
    return { clave: "planoGrande" };
  }
  let rgba: Uint8ClampedArray, reducida: Blob | null;
  try {
    const lienzo = document.createElement("canvas");
    [lienzo.width, lienzo.height] = [W, H];
    const x = lienzo.getContext("2d", { willReadFrequently: true });
    const chica = document.createElement("canvas");
    const k = Math.min(1, LADO_LECTURA / Math.max(W, H));
    [chica.width, chica.height] = [Math.round(W * k), Math.round(H * k)];
    const xc = chica.getContext("2d");
    // Sin lienzo no se manda nada: una copia en blanco iría a la IA (y se cobraría).
    if (!x || !xc) return { clave: "planoIlegible" };
    // Sobre blanco: una imagen con transparencia se ve (y se lee) como en un anuncio.
    x.fillStyle = "#fff";
    x.fillRect(0, 0, W, H);
    x.drawImage(bitmap, 0, 0);
    rgba = x.getImageData(0, 0, W, H).data;
    // La reducción buena: la letra chica llega legible a la IA.
    xc.imageSmoothingQuality = "high";
    xc.drawImage(lienzo, 0, 0, chica.width, chica.height);
    reducida = await new Promise<Blob | null>((ok) => chica.toBlob(ok, "image/jpeg", 0.9));
    lienzo.width = lienzo.height = chica.width = chica.height = 0;
  } catch (err) {
    // Sin memoria para el lienzo de la imagen entera: es muy grande para este navegador.
    console.error("[formatos-psd] abrir imagen plana", err);
    return { clave: "planoGrande" };
  } finally {
    bitmap.close();
  }
  if (!reducida) return { clave: "planoIlegible" };

  const form = new FormData();
  form.append("imagen", reducida, "anuncio.jpg");
  // La huella del archivo original: la misma imagen reusa su lectura guardada (`nueva`: «Leer otra vez»). Sin ella
  // (un navegador sin crypto.subtle) se lee igual, sólo que no se guarda.
  const huella = await crypto.subtle
    ?.digest("SHA-256", await file.arrayBuffer())
    .then((d) => Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join(""))
    .catch(() => null);
  if (huella) form.append("huella", huella);
  if (nueva) form.append("nueva", "1");
  const res = await fetch("/api/prisma/formatos/leer", { method: "POST", body: form, signal: AbortSignal.any([senal, AbortSignal.timeout(LEER_MS)]) }).catch((e: unknown) => {
    if (senal.aborted) throw e;
    return null;
  });
  if (!res) return { clave: "planoTarde" };
  type Respuesta = { ok: true; elementos: ElementoLeido[]; w: number; h: number; costoUsd: number | null; guardada?: boolean } | { ok: false; error: string };
  const r = (await res.json().catch(() => null)) as Respuesta | null;
  if (!r || !r.ok) {
    // El servidor a veces repite la frase de esta falla («La IA no pudo leer la imagen. Reintenta.»): se muestra una vez,
    // y debajo sólo lo que agrega.
    const base = FP_ERROR.planoLectura.es;
    const detalle = r && !r.ok ? (r.error.startsWith(base) ? r.error.slice(base.length).trim() : r.error) : "";
    return { clave: "planoLectura", detalle: detalle || undefined };
  }

  // De los px de la copia leída a los de la imagen entera (hacia afuera: mejor una caja de más que cortar un borde).
  const sx = W / r.w, sy = H / r.h;
  const leidos = r.elementos.map((e) => ({
    ...e,
    caja: { x0: Math.max(0, Math.floor(e.caja.x0 * sx)), y0: Math.max(0, Math.floor(e.caja.y0 * sy)), x1: Math.min(W, Math.ceil(e.caja.x1 * sx)), y1: Math.min(H, Math.ceil(e.caja.y1 * sy)) },
  }));
  etapa("separar");
  // Un cuadro para que se vea «Separando…» antes del trabajo pesado. En una pestaña de fondo no se pinta nada (y
  // requestAnimationFrame no llega): ahí no se espera (como `armarPsdMedida`).
  if (!document.hidden)
    await new Promise<void>((ok) => {
      const cuadro = requestAnimationFrame(() => {
        clearTimeout(reloj);
        setTimeout(ok, 0);
      });
      const reloj = setTimeout(() => {
        cancelAnimationFrame(cuadro);
        ok();
      }, 100);
    });
  if (senal.aborted) throw new DOMException("cancelado", "AbortError");
  const img = { w: W, h: H, rgba };
  let medido: Medido;
  try {
    medido = medirPlanoFijo(img, leidos);
  } catch (err) {
    console.error("[formatos-psd] separar imagen plana", err);
    return { clave: "planoGrande" };
  }
  return { archivo: file.name, img, url: URL.createObjectURL(file), leidos, medido, costoUsd: r.costoUsd, guardada: r.guardada === true, file };
}
