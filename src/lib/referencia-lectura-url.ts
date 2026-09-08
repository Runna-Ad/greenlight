// Lógica PURA de "H.Ü.E lee referencias" (0064): clasificar una liga, armar la URL de
// exportación, y parsear lo que devuelven YouTube/Google. Sin imports de servidor para
// poder probarse con el harness node (scripts/test-lib.mjs). Lo que hace red vive en
// `referencia-lectura.ts`.

export type TipoLectura = "doc" | "slides" | "sheet" | "drive" | "youtube" | "tiktok" | "otro";

/**
 * leida        → texto completo (documento exportado / transcripción del video)
 * parcial      → sólo lo EXACTO que da la plataforma SIN ver el video: título+autor de
 *                YouTube, o el caption que el autor escribió en TikTok (nunca lo que PASA
 *                en el video)
 * privada      → Google pidió login: el doc no está compartido "con la liga"
 * no_soportada → la liga es de una plataforma que aún no se lee (Instagram) o un
 *                archivo sin texto (video/imagen)
 * error        → falló la lectura (red, timeout…) — se reintenta después
 */
export type EstadoLectura = "leida" | "parcial" | "privada" | "no_soportada" | "error";

export type Lectura = {
  url: string;          // canónica
  tipo: TipoLectura;
  estado: EstadoLectura;
  titulo: string | null;
  texto: string | null; // ya recortado
  chars: number;
  error: string | null;
  leida_at: string;
};

/** Tope de texto POR referencia que entra al prompt (≈ 600-800 palabras). */
export const LECTURA_MAX_CHARS = 4000;
/** Cuántas referencias se leen por tarea (las primeras N ligas del Trend). */
export const MAX_REFS_LEIDAS = 3;

const ID_GOOGLE = /[A-Za-z0-9_-]{20,}/;
const ID_YT = /^[A-Za-z0-9_-]{11}$/;

export type Clasificacion = { tipo: TipoLectura; id: string | null; canonica: string };

/** Qué es la liga y su forma CANÓNICA (misma liga con/sin ?usp=… → una sola lectura). */
export function clasificarReferencia(url: string): Clasificacion {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return { tipo: "otro", id: null, canonica: url.trim() };
  }
  const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
  const path = u.pathname;

  if (host === "docs.google.com") {
    const m = path.match(/^\/(document|presentation|spreadsheets)\/d\/([A-Za-z0-9_-]{20,})/);
    if (m) {
      const tipo: TipoLectura = m[1] === "document" ? "doc" : m[1] === "presentation" ? "slides" : "sheet";
      return { tipo, id: m[2], canonica: `https://docs.google.com/${m[1]}/d/${m[2]}` };
    }
  }
  if (host === "drive.google.com") {
    const m = path.match(/^\/file\/d\/([A-Za-z0-9_-]{20,})/);
    const id = m?.[1] ?? u.searchParams.get("id");
    if (id && ID_GOOGLE.test(id)) return { tipo: "drive", id, canonica: `https://drive.google.com/file/d/${id}` };
  }
  const yt = youtubeId(u);
  if (yt) return { tipo: "youtube", id: yt, canonica: `https://www.youtube.com/watch?v=${yt}` };

  const tt = tiktokRef(u);
  if (tt) return { tipo: "tiktok", id: tt.id, canonica: tt.canonica };

  u.hash = "";
  return { tipo: "otro", id: null, canonica: u.toString().replace(/\/$/, "") };
}

/** El id de un video de YouTube en cualquiera de sus formas (watch / youtu.be / shorts / embed). */
export function youtubeId(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "music.youtube.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([^/]+)/);
      if (m) id = m[2];
    }
  }
  return id && ID_YT.test(id) ? id : null;
}

/**
 * TikTok: el id numérico del post y su forma canónica. Soporta la liga completa
 * (`/@usuario/video/<id>`, también `/photo/<id>`) y las ligas cortas (vm./vt./`/t/<code>`),
 * que NO traen id — se dejan tal cual y las resuelve el propio oEmbed de TikTok.
 * Sólo se acepta un host de tiktok.com, así la lectura (oEmbed) nunca sale de TikTok (SSRF).
 */
export function tiktokRef(u: URL): { id: string | null; canonica: string } | null {
  const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
  if (host !== "tiktok.com" && !host.endsWith(".tiktok.com")) return null;

  // Liga completa: /@usuario/video/<id> (o /photo/<id>), id numérico largo.
  const full = u.pathname.match(/^\/@([\w.-]+)\/(?:video|photo)\/(\d{6,25})/);
  if (full) return { id: full[2], canonica: `https://www.tiktok.com/@${full[1]}/video/${full[2]}` };

  // Sin usuario pero con id (/video/<id>): raro, pero clasificable.
  const soloId = u.pathname.match(/^\/(?:video|photo)\/(\d{6,25})/);
  if (soloId) return { id: soloId[1], canonica: `https://www.tiktok.com/video/${soloId[1]}` };

  // Liga corta (vm./vt./tiktok.com/t/<code>): sin id; la canónica es la liga normalizada.
  if (host.startsWith("vm.") || host.startsWith("vt.") || /^\/t\/[\w-]+/.test(u.pathname)) {
    return { id: null, canonica: `https://${u.hostname}${u.pathname}`.replace(/\/+$/, "") };
  }
  return null;
}

/** La URL que devuelve el TEXTO de un recurso de Google (funciona con "cualquiera con la liga"). */
export function urlExportGoogle(tipo: TipoLectura, id: string): string | null {
  switch (tipo) {
    case "doc":    return `https://docs.google.com/document/d/${id}/export?format=txt`;
    case "slides": return `https://docs.google.com/presentation/d/${id}/export/txt`;
    case "sheet":  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`;
    case "drive":  return `https://drive.google.com/uc?export=download&id=${id}`;
    default:       return null;
  }
}

/** Recorta al tope y avisa que sigue. Colapsa espacios raros del export. */
export function recortarLectura(texto: string, max = LECTURA_MAX_CHARS): string {
  const limpio = texto.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (limpio.length <= max) return limpio;
  return limpio.slice(0, max).trimEnd() + " […]";
}

export function palabras(texto: string | null | undefined): number {
  return (texto ?? "").split(/\s+/).filter(Boolean).length;
}

// ── YouTube: pistas de subtítulos embebidas en la página del video ─────────────
export type PistaCaption = { baseUrl: string; languageCode: string; kind?: string };

/** Saca `"captionTracks":[…]` del HTML de watch. Devuelve [] si no hay (o no se pudo). */
export function extraerCaptionTracks(html: string): PistaCaption[] {
  const key = '"captionTracks":';
  const i = html.indexOf(key);
  if (i < 0) return [];
  const start = html.indexOf("[", i + key.length);
  if (start < 0) return [];
  // bracket-match respetando strings JSON
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let j = start; j < html.length; j++) {
    const c = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "[") depth++;
    else if (c === "]") { depth--; if (depth === 0) { end = j; break; } }
  }
  if (end < 0) return [];
  try {
    const arr = JSON.parse(html.slice(start, end + 1)) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((t) => t as { baseUrl?: string; languageCode?: string; kind?: string })
      .filter((t) => typeof t.baseUrl === "string" && typeof t.languageCode === "string")
      .map((t) => ({ baseUrl: t.baseUrl as string, languageCode: t.languageCode as string, kind: t.kind }));
  } catch {
    return [];
  }
}

/** Preferencia: español humano > español auto > inglés > la primera. */
export function elegirPista(pistas: PistaCaption[]): PistaCaption | null {
  if (!pistas.length) return null;
  const es = pistas.filter((p) => p.languageCode.toLowerCase().startsWith("es"));
  return (
    es.find((p) => p.kind !== "asr") ??
    es[0] ??
    pistas.find((p) => p.languageCode.toLowerCase().startsWith("en")) ??
    pistas[0]
  );
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function decodificarEntidades(s: string): string {
  const paso = (t: string) =>
    t.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (m, e: string) => {
      if (e[0] === "#") {
        const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return ENTIDADES[e] ?? m;
    });
  // El timedtext suele venir DOBLEMENTE codificado (&amp;#39;) → dos pasadas.
  return paso(paso(s));
}

/** El XML de timedtext (`<text start=…>…</text>`) → texto corrido. */
export function parseTimedText(xml: string): string {
  const partes: string[] = [];
  const re = /<text\b[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const t = decodificarEntidades(m[1]).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (t) partes.push(t);
  }
  return partes.join(" ").replace(/\s+/g, " ").trim();
}

// ── Etiquetas para el badge de la tarea ─────────────────────────────────────
export const TIPO_LABEL: Record<TipoLectura, string> = {
  doc: "Google Doc",
  slides: "Google Slides",
  sheet: "Google Sheet",
  drive: "Archivo de Drive",
  youtube: "YouTube",
  tiktok: "TikTok",
  otro: "Liga",
};

/** Qué le decimos al equipo sobre cada referencia (badge bajo "Ver referencia"). */
export function etiquetaLectura(l: Lectura | null, tipo: TipoLectura): { texto: string; tono: "ok" | "aviso" | "neutro" } {
  const nombre = TIPO_LABEL[tipo];
  if (!l) {
    return tipo === "otro"
      ? { texto: `${nombre}: H.Ü.E aún no lee esta plataforma (sólo Google, YouTube y TikTok)`, tono: "neutro" }
      : { texto: `${nombre}: H.Ü.E la lee al generar el guión`, tono: "neutro" };
  }
  switch (l.estado) {
    case "leida":
      return { texto: `${nombre}: H.Ü.E la leyó (${palabras(l.texto).toLocaleString("es-MX")} palabras)`, tono: "ok" };
    case "parcial":
      return {
        texto:
          tipo === "tiktok"
            ? `${nombre}: H.Ü.E leyó el caption (no vio el video)`
            : `${nombre}: H.Ü.E sólo vio título y autor — sin transcripción`,
        tono: "aviso",
      };
    case "privada":
      return { texto: `${nombre}: es privada — compártela con "cualquiera con la liga" para que H.Ü.E la lea`, tono: "aviso" };
    case "no_soportada":
      return { texto: `${nombre}: ${l.error ?? "H.Ü.E aún no lee este tipo de contenido"}`, tono: "neutro" };
    default:
      return { texto: `${nombre}: no se pudo leer (${l.error ?? "error"}) — se reintenta`, tono: "aviso" };
  }
}
