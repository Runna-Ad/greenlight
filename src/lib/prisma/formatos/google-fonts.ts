/**
 * HÜE Prisma › Formatos — las tipografías GRATUITAS que le faltan a un PSD, traídas del catálogo de Google Fonts.
 *
 * El catálogo vive en github.com/google/fonts: una carpeta por familia (ofl/montserrat, apache/roboto, …) con un
 * METADATA.pb que lista sus archivos y el nombre PostScript de cada uno. El PSD trae ese nombre ("Montserrat-Bold"):
 * de ahí sale la carpeta ("montserrat"). Se bajan sólo los archivos que sirven (las variables, que traen todos los
 * estilos; o los estáticos pedidos) y se quedan los que de verdad traen un nombre pedido (se leen sus bytes).
 * Sin "server-only" para que Node lo pruebe; quien lo llama es el servidor (tipografias-actions.ts).
 *
 * Topes (lo llama cualquiera del equipo): un archivo a la vez, 40 MB por pedido, 2 búsquedas a la vez por servidor,
 * un plazo total que pone quien llama, y lo que Google no tiene se recuerda 1 h (la familia o el estilo).
 */
import { TIPOGRAFIA_GOOGLE_MAX_BYTES, leerTipografia, type TipografiaLeida } from "./tipografias.ts";

/** Dirección fija: lo que manda el navegador sólo elige la carpeta y el archivo, nunca el sitio (y sin redirecciones). */
const RAIZ = "https://raw.githubusercontent.com/google/fonts/main";
const LICENCIAS = ["ofl", "apache", "ufl"] as const;
/** Familias por PSD, y archivos por familia (una estática con cursivas pide 4-8). */
export const FAMILIAS_GOOGLE_MAX = 6;
export const ARCHIVOS_POR_FAMILIA_MAX = 8;
/** Lo que se baja en un pedido, sumado: más que esto no es lo que pide un anuncio. */
export const GOOGLE_BYTES_POR_PEDIDO = 40_000_000;
/** Un METADATA.pb real pesa 1-20 KB. */
const METADATA_MAX_BYTES = 256_000;
/** Lo que se espera a cada pedido a GitHub. */
const PEDIDO_MS = 8_000;
/** Búsquedas a la vez en este servidor: más se saltan (el PSD lo cuenta como faltante y otra lectura lo repite). */
const A_LA_VEZ_MAX = 2;
let enCurso = 0;
/** Lo que Google no tiene ("didisans", o el estilo "Roboto-Zzz") no se vuelve a buscar en un rato. */
const NO_ESTA_MS = 60 * 60_000;
const NO_ESTA_MAX = 500;
const noEsta = new Map<string, number>();
const anotarNoEsta = (k: string, ahora: number) => {
  if (noEsta.size >= NO_ESTA_MAX) noEsta.clear();
  noEsta.set(k, ahora + NO_ESTA_MS);
};

/** La carpeta de la familia: lo de antes del primer guion, en minúsculas y sin símbolos ("OpenSans-Bold" → "opensans"). */
export function carpetaGoogle(ps: string): string | null {
  const c = ps.split("-")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
  return /^[a-z0-9]{2,60}$/.test(c) ? c : null;
}

/** Sólo nombres de archivo de tipografía, sin rutas ("Montserrat[wght].ttf", "Lato-BoldItalic.ttf"); caben en la
 *  columna `archivo` (120). */
const ARCHIVO = /^[A-Za-z0-9_.,\-[\]]{1,116}\.(ttf|otf)$/;

/** Los archivos que lista un METADATA.pb: su nombre y el nombre PostScript de su estilo por omisión. */
export function archivosDeMetadata(texto: string): { archivo: string; ps: string }[] {
  const out: { archivo: string; ps: string }[] = [];
  // Cada `fonts { … }` trae filename y post_script_name; se leen en orden (el copyright puede traer llaves).
  const re = /filename:\s*"([^"]*)"[\s\S]*?post_script_name:\s*"([^"]*)"/g;
  for (const m of texto.matchAll(re)) if (ARCHIVO.test(m[1]) && !out.some((o) => o.archivo === m[1])) out.push({ archivo: m[1], ps: m[2] });
  return out;
}

/** Qué archivos de la familia bajar: las variables (traen todos los estilos) si las hay; si no, los estáticos pedidos. */
export function archivosQueSirven(lista: { archivo: string; ps: string }[], pedidos: string[]): string[] {
  const variables = lista.filter((l) => l.archivo.includes("["));
  const elegidos = variables.length ? variables : lista.filter((l) => pedidos.includes(l.ps));
  return elegidos.map((l) => l.archivo).slice(0, ARCHIVOS_POR_FAMILIA_MAX);
}

export type DeGoogle = { archivo: string; datos: ArrayBuffer; leida: TipografiaLeida };
type Pedir = (url: string, init: { signal: AbortSignal; redirect: "error" }) => Promise<Response>;

/** Lee la respuesta hasta `max` bytes y corta ahí (no se fía del content-length). null = no ok o se pasó. */
async function leerHasta(res: Response, max: number): Promise<Uint8Array | null> {
  if (!res.ok || !res.body || Number(res.headers.get("content-length") ?? 0) > max) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  const lector = res.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await lector.cancel().catch(() => {});
      return null;
    }
    partes.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of partes) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}

/**
 * Busca en Google Fonts los `nombres` (PostScript) y devuelve los archivos que traen alguno. Lo que no está, o lo
 * que falla (red, GitHub, el plazo), simplemente no vuelve: el PSD lo sigue contando como faltante. `limite` = el
 * plazo total de quien llama; `pedir` = fetch (las pruebas pasan uno falso).
 */
export async function buscarEnGoogle(nombres: string[], limite: AbortSignal, pedir: Pedir = fetch): Promise<DeGoogle[]> {
  const ahora = Date.now();
  const porCarpeta = new Map<string, string[]>();
  for (const n of nombres) {
    const c = carpetaGoogle(n);
    if (!c || (noEsta.get(c) ?? 0) > ahora || (noEsta.get(`estilo:${n}`) ?? 0) > ahora) continue;
    porCarpeta.set(c, [...(porCarpeta.get(c) ?? []), n]);
  }
  if (!porCarpeta.size || enCurso >= A_LA_VEZ_MAX) return [];
  enCurso++;
  const out: DeGoogle[] = [];
  let bytes = 0;
  const senal = () => AbortSignal.any([limite, AbortSignal.timeout(PEDIDO_MS)]);
  const traer = async (url: string, max: number) => leerHasta(await pedir(url, { signal: senal(), redirect: "error" }), max);
  try {
    // Una familia y un archivo a la vez: en memoria nunca hay más que lo que cabe en el pedido.
    for (const [carpeta, pedidos] of [...porCarpeta].slice(0, FAMILIAS_GOOGLE_MAX)) {
      if (limite.aborted || bytes >= GOOGLE_BYTES_POR_PEDIDO) break;
      try {
        let md: { lic: string; texto: string } | null = null;
        let soloNoEsta = true;
        for (const lic of LICENCIAS) {
          const res = await pedir(`${RAIZ}/${lic}/${carpeta}/METADATA.pb`, { signal: senal(), redirect: "error" });
          if (res.status === 404) {
            await res.body?.cancel().catch(() => {});
            continue;
          }
          soloNoEsta = false; // GitHub caído o con límite: no se anota como "no está"
          const b = await leerHasta(res, METADATA_MAX_BYTES);
          if (b) md = { lic, texto: new TextDecoder().decode(b) };
          break;
        }
        if (!md) {
          if (soloNoEsta) anotarNoEsta(carpeta, ahora);
          continue;
        }
        const encontrados = new Set<string>();
        let completo = true;
        for (const archivo of archivosQueSirven(archivosDeMetadata(md.texto), pedidos)) {
          const cabe = Math.min(TIPOGRAFIA_GOOGLE_MAX_BYTES, GOOGLE_BYTES_POR_PEDIDO - bytes);
          const datos = cabe > 0 && !limite.aborted ? await traer(`${RAIZ}/${md.lic}/${carpeta}/${encodeURIComponent(archivo)}`, cabe).catch(() => null) : null;
          if (!datos) {
            completo = false;
            continue;
          }
          bytes += datos.byteLength;
          const buf = datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength) as ArrayBuffer;
          const leida = leerTipografia(buf, TIPOGRAFIA_GOOGLE_MAX_BYTES);
          // Sólo si de verdad trae lo pedido (leído de sus bytes, no del METADATA).
          const trae = leida ? pedidos.filter((n) => leida.nombres.includes(n)) : [];
          if (!leida || !trae.length) continue;
          for (const n of trae) encontrados.add(n);
          out.push({ archivo, datos: buf, leida });
        }
        // La familia está pero ese estilo no ("Roboto-Zzz"): se recuerda, si se pudo revisar todo.
        if (completo) for (const n of pedidos) if (!encontrados.has(n)) anotarNoEsta(`estilo:${n}`, ahora);
      } catch (err) {
        console.error("[prisma] Google Fonts", carpeta, err instanceof Error ? err.message : err);
      }
    }
  } finally {
    enCurso--;
  }
  return out;
}
