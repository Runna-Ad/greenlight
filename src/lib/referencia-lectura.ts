import "server-only";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { extraerTextoKb } from "@/lib/hue-kb-extract";
import { parseReferencias } from "@/lib/referencia";
import {
  clasificarReferencia,
  urlExportGoogle,
  recortarLectura,
  extraerCaptionTracks,
  elegirPista,
  parseTimedText,
  MAX_REFS_LEIDAS,
  type Lectura,
  type TipoLectura,
  type EstadoLectura,
} from "@/lib/referencia-lectura-url";

/**
 * H.Ü.E lee las REFERENCIAS de la tarea: Google Docs / Slides / Sheets / archivos de Drive
 * (pdf, docx, txt) + YouTube (título, autor y transcripción si la hay) [0064, Tier 1] +
 * TikTok (el caption que escribió el autor, por oEmbed) [Tier 2]. Instagram sigue `no_soportada`.
 *
 * Principios (Pedro: "sólo si lo puede usar con precisión"):
 * - Sólo TEXTO exacto. Un video del que no vimos el contenido (sin transcripción, o del que
 *   sólo tenemos el caption) queda `parcial` y el prompt se lo dice a H.Ü.E para que NO
 *   invente lo que pasa en él.
 * - Nada bloquea al equipo: la lectura corre en `after()` al guardar la liga, y al generar
 *   con tope de tiempo. Si falla, el guión se escribe igual (sin esa referencia).
 * - Lo leído es material de TERCEROS: se trata como datos (nunca como instrucciones), se
 *   recorta al tope y no se toma como verdad de marca (eso lo dice el prompt).
 * - Caché por URL canónica en `referencia_lecturas`; se re-lee cuando envejece.
 */

/** Por petición HTTP. */
const TIMEOUT_MS = 6_000;
/** Por REFERENCIA (YouTube hace hasta 3 peticiones): tope total, gane quien gane. */
const TOTAL_MS = 9_000;
const MAX_BYTES = 10 * 1024 * 1024;
/** Una lectura buena se refresca a la semana (el doc pudo cambiar). */
const FRESCA_OK_MS = 7 * 24 * 60 * 60 * 1000;
/** Un fallo (privada / error) se reintenta pasada una hora (pudieron compartirla). */
const FRESCA_FALLO_MS = 60 * 60 * 1000;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

type Borrador = Omit<Lectura, "url" | "tipo" | "leida_at" | "chars"> & { chars?: number };

const fallo = (estado: EstadoLectura, error: string, titulo: string | null = null): Borrador => ({
  estado, error, titulo, texto: null,
});

/** GET con timeout y tope de bytes. Devuelve null si no responde a tiempo. */
async function traer(url: string, extra?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, {
      ...extra,
      headers: { "user-agent": UA, "accept-language": "es-MX,es;q=0.9,en;q=0.8", ...(extra?.headers ?? {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
      cache: "no-store",
    });
  } catch {
    return null;
  }
}

/** Lee el cuerpo EN STREAMING y aborta al pasar el tope (Content-Length puede faltar o mentir). */
async function cuerpo(res: Response): Promise<Uint8Array | null> {
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) return null;
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    partes.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of partes) { out.set(p, off); off += p.byteLength; }
  return out;
}

const HOSTS_PISTA = /(^|\.)(youtube\.com|googlevideo\.com)$/i;
/** La pista sale de JSON raspado de la página: sólo se sigue si apunta a YouTube (defensa en profundidad). */
function pistaConfiable(baseUrl: string): boolean {
  try {
    const u = new URL(baseUrl);
    return u.protocol === "https:" && HOSTS_PISTA.test(u.hostname);
  } catch {
    return false;
  }
}

/** Google devolvió la pantalla de login (o un HTML en vez del export) → no está compartida. */
function pideLogin(res: Response): boolean {
  const ct = res.headers.get("content-type") ?? "";
  return res.url.includes("accounts.google.com") || res.status === 401 || res.status === 403 || ct.includes("text/html");
}

async function leerGoogle(tipo: TipoLectura, id: string): Promise<Borrador> {
  const url = urlExportGoogle(tipo, id);
  if (!url) return fallo("no_soportada", "tipo de liga sin export");
  const res = await traer(url);
  if (!res) return fallo("error", "Google no respondió a tiempo");
  if (res.status === 404) return fallo("error", "Google dice que no existe (404)");
  if (pideLogin(res)) return fallo("privada", "Google pidió iniciar sesión");
  if (!res.ok) return fallo("error", `Google respondió ${res.status}`);

  const ct = (res.headers.get("content-type") ?? "").toLowerCase();
  // Un archivo de Drive puede ser lo que sea: se decide por el TIPO antes de bajar nada
  // (un video de 300 MB no se descarga para luego descartarlo).
  if (tipo === "drive" && (ct.startsWith("video/") || ct.startsWith("image/") || ct.startsWith("audio/"))) {
    return fallo("no_soportada", "es un video/imagen — H.Ü.E aún no ve video (sólo texto)");
  }
  const bytes = await cuerpo(res);
  if (!bytes) return fallo("no_soportada", "el archivo pasa de 10 MB");

  if (tipo === "drive") {
    const esPdf = ct.includes("pdf") || (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46);
    const esDocx = ct.includes("wordprocessingml") || (bytes[0] === 0x50 && bytes[1] === 0x4b);
    if (esPdf || esDocx) {
      try {
        const texto = await extraerTextoKb(bytes, esPdf ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document", esPdf ? "ref.pdf" : "ref.docx");
        return texto.trim() ? { estado: "leida", titulo: null, texto: recortarLectura(texto), error: null } : fallo("no_soportada", "el archivo no tiene texto extraíble");
      } catch (e) {
        return fallo("error", e instanceof Error ? e.message : "no se pudo extraer el texto");
      }
    }
    if (!ct.startsWith("text/") && !ct.includes("json") && !ct.includes("csv")) {
      return fallo("no_soportada", `archivo ${ct.split(";")[0] || "sin tipo"} — sólo se leen pdf, docx y texto`);
    }
  }

  const texto = new TextDecoder("utf-8").decode(bytes);
  if (!texto.trim()) return fallo("no_soportada", "el documento está vacío");
  return { estado: "leida", titulo: null, texto: recortarLectura(texto), error: null };
}

async function leerYoutube(id: string, canonica: string): Promise<Borrador> {
  // 1) Metadatos EXACTOS por oEmbed (público y estable): título + autor.
  const oe = await traer(`https://www.youtube.com/oembed?url=${encodeURIComponent(canonica)}&format=json`);
  if (!oe) return fallo("error", "YouTube no respondió a tiempo");
  if (oe.status === 401 || oe.status === 403) return fallo("privada", "el video es privado");
  if (oe.status === 404) return fallo("error", "YouTube dice que el video no existe");
  if (!oe.ok) return fallo("error", `YouTube respondió ${oe.status}`);
  let titulo: string | null = null, autor: string | null = null;
  try {
    const j = (await oe.json()) as { title?: string; author_name?: string };
    titulo = j.title ?? null;
    autor = j.author_name ?? null;
  } catch { /* sin metadatos: se sigue */ }
  const cabecera = [titulo && `Título: ${titulo}`, autor && `Autor: ${autor}`].filter(Boolean).join("\n");

  // 2) Transcripción (best-effort): las pistas de subtítulos vienen en la página del video.
  //    REALIDAD 2026-09: YouTube responde 200 con cuerpo VACÍO al timedtext si no va el
  //    token de origen del navegador ("pot") — verificado con un video público con 6
  //    pistas. Así que hoy esto casi siempre termina en `parcial` (título + autor, exactos)
  //    y el prompt le dice a H.Ü.E que NO vio el video. Se deja el camino por si YouTube
  //    vuelve a servirlo; la transcripción real es Tier 3 (API de pago).
  const pagina = await traer(`https://www.youtube.com/watch?v=${id}&hl=es`);
  if (pagina?.ok) {
    const html = await pagina.text().catch(() => "");
    const pista = elegirPista(extraerCaptionTracks(html));
    if (pista && pistaConfiable(pista.baseUrl)) {
      const tt = await traer(pista.baseUrl);
      if (tt?.ok) {
        const transcripcion = parseTimedText(await tt.text().catch(() => ""));
        if (transcripcion) {
          const idioma = pista.languageCode + (pista.kind === "asr" ? " · automáticos" : "");
          return { estado: "leida", titulo, texto: recortarLectura(`${cabecera}\nTranscripción (subtítulos ${idioma}):\n${transcripcion}`), error: null };
        }
      }
    }
  }
  return { estado: "parcial", titulo, texto: cabecera || null, error: "sin transcripción disponible" };
}

async function leerTiktok(canonica: string): Promise<Borrador> {
  // oEmbed PÚBLICO de TikTok: `title` = el caption que escribió el autor, `author_name` = el
  // handle. Sin llave y sin bajar el video. La petición SIEMPRE va a www.tiktok.com/oembed
  // (host fijo) con la liga canónica de TikTok como parámetro → la lectura nunca sale de
  // TikTok (SSRF-safe, igual que el oEmbed de YouTube).
  const oe = await traer(`https://www.tiktok.com/oembed?url=${encodeURIComponent(canonica)}`);
  if (!oe) return fallo("error", "TikTok no respondió a tiempo");
  if (oe.status === 401 || oe.status === 403) return fallo("privada", "el video es privado");
  if (oe.status === 404) return fallo("error", "TikTok dice que el video no existe");
  if (!oe.ok) return fallo("error", `TikTok respondió ${oe.status}`);
  let caption: string | null = null, autor: string | null = null;
  try {
    const j = (await oe.json()) as { title?: string; author_name?: string };
    caption = j.title?.trim() || null;
    autor = j.author_name?.trim() || null;
  } catch { /* cuerpo no-JSON: sin datos utilizables */ }
  if (!caption && !autor) return fallo("error", "TikTok no devolvió datos del video");
  const texto = [autor && `Autor: ${autor}`, caption && `Caption: ${caption}`].filter(Boolean).join("\n");
  // `titulo` es SÓLO una etiqueta corta (una línea, acotada): el caption completo va en `texto`
  // (recortado). `parcial` a propósito: leímos lo que el autor ESCRIBIÓ, no lo que PASA en el video.
  const titulo = caption ? caption.replace(/\s+/g, " ").trim().slice(0, 120) : null;
  return { estado: "parcial", titulo, texto: recortarLectura(texto), error: null };
}

/** Lee UNA liga (sin caché). Nunca lanza: todo fallo es un estado. */
export async function leerReferencia(url: string): Promise<Lectura> {
  const c = clasificarReferencia(url);
  let b: Borrador;
  try {
    const lectura =
      c.tipo === "youtube" && c.id ? leerYoutube(c.id, c.canonica)
      : c.tipo === "tiktok" ? leerTiktok(c.canonica)
      : c.id && c.tipo !== "otro" ? leerGoogle(c.tipo, c.id)
      : Promise.resolve(fallo("no_soportada", "plataforma que H.Ü.E aún no lee (sólo Google, YouTube y TikTok)"));
    // Tope TOTAL: una referencia nunca retrasa "Crear guión" más de TOTAL_MS (reap 2026-09-03).
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tope = new Promise<Borrador>((res) => { timer = setTimeout(() => res(fallo("error", "se agotó el tiempo de lectura")), TOTAL_MS); });
    b = await Promise.race([lectura, tope]).finally(() => clearTimeout(timer));
  } catch (e) {
    b = fallo("error", e instanceof Error ? e.message : "fallo desconocido");
  }
  return {
    url: c.canonica,
    tipo: c.tipo,
    estado: b.estado,
    titulo: b.titulo,
    texto: b.texto,
    chars: b.texto?.length ?? 0,
    error: b.error,
    leida_at: new Date().toISOString(),
  };
}

function fresca(l: Lectura): boolean {
  const edad = Date.now() - new Date(l.leida_at).getTime();
  return edad < (l.estado === "leida" || l.estado === "parcial" || l.estado === "no_soportada" ? FRESCA_OK_MS : FRESCA_FALLO_MS);
}

/** Sólo la caché (sin red) — para el badge de la tarea. */
export async function lecturasCacheadas(urls: string[]): Promise<Lectura[]> {
  if (!hasSupabase() || !urls.length) return [];
  const canonicas = [...new Set(urls.map((u) => clasificarReferencia(u).canonica))];
  const { data } = await supabaseAdmin().from("referencia_lecturas").select("*").in("url", canonicas);
  return (data ?? []) as Lectura[];
}

/**
 * Las lecturas de estas ligas: de caché si están frescas; si no, se leen (en paralelo,
 * con timeout) y se guardan. Para el writer: NUNCA lanza — lo que falle simplemente no
 * entra al prompt (se devuelve con su estado para que el prompt lo diga).
 */
export async function lecturasPara(urls: string[]): Promise<Lectura[]> {
  const objetivo = urls.slice(0, MAX_REFS_LEIDAS);
  if (!objetivo.length) return [];
  let cache: Lectura[] = [];
  try { cache = await lecturasCacheadas(objetivo); } catch { /* sin caché: se lee */ }

  const out = await Promise.all(
    objetivo.map(async (u) => {
      const canonica = clasificarReferencia(u).canonica;
      const previa = cache.find((l) => l.url === canonica);
      if (previa && fresca(previa)) return previa;
      const nueva = await leerReferencia(u);
      if (hasSupabase()) {
        try { await supabaseAdmin().from("referencia_lecturas").upsert(nueva as never, { onConflict: "url" }); } catch { /* no crítico */ }
      }
      return nueva;
    }),
  );
  return out;
}

/** Al guardar el Trend: leer sus ligas en background (after()). No crítico. */
export async function programarLecturas(trend: string | null): Promise<void> {
  try {
    const urls = parseReferencias(trend).filter((s) => s.tipo === "ref").map((s) => s.url);
    if (urls.length) await lecturasPara(urls);
  } catch (e) {
    console.error("[referencias] no se pudieron leer", e);
  }
}
