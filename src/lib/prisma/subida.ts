/**
 * "¿Cómo salió?" — lo que el diseñador suelta, pega o busca se prepara EN EL NAVEGADOR para que el
 * servidor nunca lo rechace por peso: una imagen de más de 3.5 MB se achica (lado largo ≤ 2048,
 * JPEG) y un video se vuelve su cuadro del medio (sólo sube ese cuadro). La visión de H.Ü.E reduce
 * a ~1568 px de todos modos, así que achicar no le quita nada a la comparación.
 * `medidaDestino` es pura (se prueba en node); lo demás usa canvas/video y sólo corre en el
 * navegador (ningún acceso al DOM al importar: el servidor importa las constantes de aquí).
 */

/** Lo que la API de visión acepta por imagen es 5 MB y el archivo viaja en base64 (×1.33): con 3.5 MB
 *  de archivo se queda debajo en cualquiera de las dos lecturas del límite. Una sola cifra para el
 *  navegador (achica hasta aquí) y el servidor (rechaza por encima). */
export const MAX_BYTES_VISION = 3.5 * 1024 * 1024;
export const MAX_MB_VISION_TEXTO = "3.5 MB";
export const LADO_MAX = 2048;

const TIPOS_DIRECTOS = ["image/jpeg", "image/png", "image/webp", "image/gif"];
/** Lo que el selector de archivos ofrece; en trabajos de video también el video. */
export const ACCEPT_IMAGEN = TIPOS_DIRECTOS.join(",");
export const ACCEPT_VIDEO = `${ACCEPT_IMAGEN},video/mp4,video/quicktime,video/webm`;

/** El tamaño que cabe en `max` por el lado largo, sin agrandar nunca. */
export function medidaDestino(w: number, h: number, max = LADO_MAX): { w: number; h: number } {
  if (!(w > 0 && h > 0 && max > 0)) return { w: 0, h: 0 };
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

export type ErrorSubida = "video_ilegible" | "imagen_ilegible" | "tipo";
export type Preparado = { ok: true; file: File } | { ok: false; error: ErrorSubida };

/** Lo que llega → un archivo que el servidor acepta. Lo que ya cabe viaja tal cual. */
export async function prepararParaComparar(file: File, maxBytes = MAX_BYTES_VISION): Promise<Preparado> {
  if (file.type.startsWith("video/")) return cuadroDelMedio(file, maxBytes);
  if (!file.type.startsWith("image/")) return { ok: false, error: "tipo" };
  if (TIPOS_DIRECTOS.includes(file.type) && file.size <= maxBytes) return { ok: true, file };
  // Pesada o en otro formato (AVIF, BMP…): se decodifica y se vuelve JPEG. Un GIF animado queda en su
  // primer cuadro, que es lo mismo que vería la visión.
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    return { ok: false, error: "imagen_ilegible" };
  }
  try {
    return await aJpeg(bmp, bmp.width, bmp.height, nombreBase(file.name), maxBytes, "imagen_ilegible");
  } finally {
    bmp.close();
  }
}

/** Primero baja la calidad y luego el tamaño, hasta que quepa (casi siempre a la primera). */
const INTENTOS: [lado: number, calidad: number][] = [
  [LADO_MAX, 0.9],
  [LADO_MAX, 0.8],
  [1568, 0.8],
  [1200, 0.75],
];

async function aJpeg(fuente: CanvasImageSource, w0: number, h0: number, nombre: string, maxBytes: number, error: ErrorSubida): Promise<Preparado> {
  for (const [lado, calidad] of INTENTOS) {
    const { w, h } = medidaDestino(w0, h0, lado);
    if (!w) return { ok: false, error };
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, error };
    // JPEG no tiene transparencia: un PNG con fondo transparente se vería negro.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(fuente, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", calidad));
    if (blob && blob.size <= maxBytes) return { ok: true, file: new File([blob], `${nombre}.jpg`, { type: "image/jpeg" }) };
  }
  return { ok: false, error };
}

/** El cuadro del medio del video: el más representativo del clip (el primero suele ser la foto de arranque). */
async function cuadroDelMedio(file: File, maxBytes: number): Promise<Preparado> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    const cargado = esperar(video, "loadeddata");
    video.src = url;
    await cargado;
    const dur = Number.isFinite(video.duration) ? video.duration : 0;
    if (dur > 0) {
      const buscado = esperar(video, "seeked");
      video.currentTime = dur / 2;
      await buscado;
    }
    if (!video.videoWidth || !video.videoHeight) return { ok: false, error: "video_ilegible" };
    return await aJpeg(video, video.videoWidth, video.videoHeight, `${nombreBase(file.name)}-cuadro`, maxBytes, "video_ilegible");
  } catch {
    return { ok: false, error: "video_ilegible" };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** Espera un evento del video; un error o 15 s sin respuesta (códec que el navegador no lee) = falla. */
function esperar(el: HTMLVideoElement, evento: "loadeddata" | "seeked", ms = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => fin();
    const ko = () => fin(new Error(`video: ${evento}`));
    const reloj = setTimeout(ko, ms);
    function fin(e?: Error) {
      clearTimeout(reloj);
      el.removeEventListener(evento, ok);
      el.removeEventListener("error", ko);
      if (e) reject(e);
      else resolve();
    }
    el.addEventListener(evento, ok, { once: true });
    el.addEventListener("error", ko, { once: true });
  });
}

const nombreBase = (nombre: string): string => nombre.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 60) || "resultado";
