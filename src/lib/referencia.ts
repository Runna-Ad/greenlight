// Lógica pura de referencias: qué tipo de imagen es (por magic bytes, NO por
// nombre) y de qué plataforma es un link. Sin imports de servidor para poder
// probarse con el harness node.

export const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/** MIME → extensión, para los tipos que aceptamos subir. */
export const EXT_POR_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

/**
 * Detecta el tipo de imagen por los primeros bytes, NUNCA por el nombre ni por
 * el Content-Type que manda el cliente (un .exe renombrado a .png mentiría).
 * Devuelve null si no es una imagen que aceptamos.
 */
export function sniffImageMime(bytes: Uint8Array): string | null {
  const b = bytes;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  // GIF: "GIF8"
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
  // WEBP: "RIFF" .... "WEBP"
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return "image/webp";
  // AVIF: bytes 4..11 = "ftypavif"
  if (
    b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 &&
    b[8] === 0x61 && b[9] === 0x76 && b[10] === 0x69 && b[11] === 0x66
  ) return "image/avif";
  return null;
}

/** La plataforma de un link de video/referencia, para etiqueta y thumbnail. */
export function plataformaDeUrl(url: string): string {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "otro";
  }
  if (host.includes("tiktok")) return "tiktok";
  if (host.includes("instagram")) return "instagram";
  if (host.includes("youtube") || host.includes("youtu.be")) return "youtube";
  if (host.includes("pinterest")) return "pinterest";
  if (host.includes("drive.google") || host.includes("docs.google")) return "drive";
  if (host.includes("dropbox")) return "dropbox";
  if (host.includes("facebook") || host.includes("fb.watch")) return "facebook";
  return "otro";
}

/**
 * Un segmento del Trend: o es una REFERENCIA abrible (URL real → pastilla
 * "Referencia N" clicable), o es TEXTO suelto (un nombre de asset a recrear,
 * una nota) que se muestra tal cual, sin pastilla.
 */
export type TrendSegmento =
  | { tipo: "ref"; label: string; url: string }
  | { tipo: "texto"; texto: string };

/** Valores centinela del sheet para "sin valor" — no son contenido. */
const SENTINELA = new Set(["-", "–", "—", "n/a", "na", "."]);

/**
 * ¿Esta línea es un link abrible? Acepta http(s):// y también "www." o un
 * dominio pelón ("drive.google.com/…") — le antepone https:// al href. Un
 * nombre de archivo ("VIDEO_IDEA 1.mp4", con espacio) NO cuenta.
 */
export function urlDeLinea(linea: string): string | null {
  const t = linea.trim();
  if (/^https?:\/\/\S+$/i.test(t)) return t;
  if (/^www\.\S+$/i.test(t)) return `https://${t}`;
  // dominio pelón: exige un PATH con "/" para no confundir un nombre de archivo
  // ("asset.mp4") con un dominio. "drive.google.com/file/…" sí; "video.mp4" no.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+\/\S*$/i.test(t)) return `https://${t}`;
  return null;
}

/**
 * Parte el Trend (columna Referencias del sheet) en segmentos. SÓLO una URL
 * real se numera como "Referencia 1", "Referencia 2"… (y se puede abrir); el
 * texto que no es link se deja tal cual, sin inventar una pastilla de
 * referencia. Un "-" (o cualquier centinela de "sin valor" del sheet) no genera
 * NADA — antes producía un falso "Referencia 1".
 *
 * Se parte por SALTO DE LÍNEA — no por espacios — porque un nombre de archivo
 * de referencia puede llevar espacios ("...IDEA 1_TT...").
 */
export function parseReferencias(texto: string | null | undefined): TrendSegmento[] {
  const t = (texto ?? "").trim();
  if (!t) return [];
  const lineas = t
    .split(/[\n\r]+/)
    .map((s) => s.trim())
    .filter((l) => l && !SENTINELA.has(l.toLowerCase()));

  let n = 0;
  const out: TrendSegmento[] = [];
  for (const linea of lineas) {
    const url = urlDeLinea(linea);
    if (url) out.push({ tipo: "ref", label: `Referencia ${++n}`, url });
    else out.push({ tipo: "texto", texto: linea });
  }
  return out;
}
