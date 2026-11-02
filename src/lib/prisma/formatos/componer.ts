/**
 * HÜE Prisma › Formatos — armar UN tamaño (servidor, sharp).
 *
 *   1. escalar el original parejo → NUESTRA copia escalada de la parte VISIBLE (RGBA crudo). Si el anuncio
 *      tiene franjas de fondo liso, se recorta de ahí (nunca del contenido) para que el anuncio quede más grande.
 *   2. fondo (sólo si sobra espacio): extender los bordes lisos | IA (outpaint) | desenfoque (el mismo
 *      anuncio, cubriendo y oscurecido) | color sólido
 *   3. ÚLTIMO paso: pegar duro nuestra copia en el offset exacto (copia de bytes; lo que haya hecho el
 *      relleno ahí queda sobrescrito)
 *   4. codificar PNG, RELEERLO y comparar la zona contra nuestra copia → `pixelLockOk`
 *
 * Memoria: la fuente se guarda COMPRIMIDA (los bytes del archivo) y cada paso la abre con sharp, que decodifica
 * por partes. Un anuncio de 40 MP decodificado entero son 160 MB; con 4 tamaños a la vez en la misma instancia
 * eso la tumbaba (reap 2026-10-02).
 *
 * Sin "server-only" a propósito: el test de pixel-lock (node scripts/test-formatos.mjs) lo importa. Igual nunca
 * llega al navegador: depende de sharp, que no se puede empaquetar para el cliente.
 */
import sharp from "sharp";
import {
  FUENTE_MAX_PX, bordesDe, colorDeBorde, encajar, hayExpansion, lienzoIA, pegarDuro, zonaIdentica, deriva as derivaDe,
  type Bordes, type Encaje, type Lados, type Modo, type TamanoIA,
} from "./geometria.ts";

/** El anuncio: sus bytes tal cual (PNG/JPG/WebP) y su medida ya orientada (EXIF). */
export type Fuente = { bytes: Buffer; w: number; h: number };

/** Lo que el proveedor de IA recibe y devuelve. `costoUsd` = tokens reales × precio publicado (null si no vino el uso). */
export type PeticionIA = { png: Buffer; aspect: string; tamano: TamanoIA };
export type RespuestaIA = { png: Buffer; costoUsd: number | null; modelo: string };
export type Expandir = (p: PeticionIA) => Promise<RespuestaIA>;

const OPCIONES = { limitInputPixels: FUENTE_MAX_PX, failOn: "error" } as const;
/** La fuente abierta, orientada y en sRGB (cada paso la abre de nuevo: sharp no se reusa). */
const abrir = (f: Fuente) => sharp(f.bytes, OPCIONES).rotate().toColourspace("srgb");
const crudo = (buf: Buffer, w: number, h: number, canales: 3 | 4 = 4) => sharp(buf, { raw: { width: w, height: h, channels: canales } });

/** Valida y mide el anuncio subido SIN quedarse con los píxeles. Falla con imágenes corruptas, truncadas o
 *  gigantes (tope de píxeles = defensa contra bombas de descompresión). */
export async function leerFuente(bytes: Uint8Array): Promise<Fuente> {
  const buf = Buffer.from(bytes);
  const m = await sharp(buf, OPCIONES).metadata();
  const w = m.autoOrient?.width ?? m.width;
  const h = m.autoOrient?.height ?? m.height;
  if (!w || !h) throw new Error("leerFuente: sin medidas");
  if (w * h > FUENTE_MAX_PX) throw new Error(`leerFuente: ${w}×${h} pasa del tope`);
  // Decodificar TODO una vez (en chico) para cazar archivos truncados antes de aceptarlos.
  await sharp(buf, OPCIONES).rotate().resize(64, 64, { fit: "inside" }).raw().toBuffer();
  return { bytes: buf, w, h };
}

/** Color promedio del borde (relleno "color" por omisión), medido sobre una copia chica. */
export async function colorBorde(f: Fuente): Promise<string> {
  const { data, info } = await abrir(f).resize(256, 256, { fit: "inside" }).ensureAlpha().raw({ depth: "uchar" }).toBuffer({ resolveWithObject: true });
  return colorDeBorde(data, info.width, info.height);
}

/** Bordes lisos del anuncio (recortable + qué lados se pueden extender), medidos sobre una copia chica.
 *  Determinista: el servidor lo calcula igual al mostrar el lote y al armar cada tamaño. */
export async function analizarBordes(f: Fuente): Promise<Bordes> {
  const { data, info } = await abrir(f).resize(256, 256, { fit: "inside" }).ensureAlpha().raw({ depth: "uchar" }).toBuffer({ resolveWithObject: true });
  return bordesDe(data, info.width, info.height, f.w, f.h);
}

/** NUESTRA copia escalada del original (sw×sh, RGBA crudo). Determinista: misma entrada, mismos bytes. */
export async function escalar(f: Fuente, sw: number, sh: number): Promise<Buffer> {
  return abrir(f).ensureAlpha().resize(sw, sh, { fit: "fill", kernel: "lanczos3" }).raw({ depth: "uchar" }).toBuffer();
}

/** La parte VISIBLE del original escalado (sw×sh, RGBA crudo): escalar completo y, si hubo recorte, cortar. */
export async function escalarVisible(f: Fuente, e: Pick<Encaje, "sw" | "sh" | "completo" | "corte">): Promise<Buffer> {
  const todo = e.sw === e.completo.w && e.sh === e.completo.h;
  if (todo) return escalar(f, e.sw, e.sh);
  return abrir(f)
    .ensureAlpha()
    .resize(e.completo.w, e.completo.h, { fit: "fill", kernel: "lanczos3" })
    .extract({ left: e.corte.x, top: e.corte.y, width: e.sw, height: e.sh })
    .raw({ depth: "uchar" })
    .toBuffer();
}

/** Extender: cada lado repite su última línea hacia afuera (en un fondo liso o degradado eso ES el fondo) y
 *  se suaviza un poco para que el ruido de compresión no deje rayas. RGBA crudo W×H, opaco. */
export async function fondoExtender(visible: Buffer, e: Pick<Encaje, "sw" | "sh" | "expansion">, W: number, H: number): Promise<Buffer> {
  const sigma = Math.max(1, Math.round(Math.min(W, H) / 200));
  // Dos pasos: sharp aplica sus operaciones en un orden fijo, y el desenfoque tiene que ir DESPUÉS de extender.
  const extendido = await crudo(visible, e.sw, e.sh).extend({ ...e.expansion, extendWith: "copy" }).raw({ depth: "uchar" }).toBuffer();
  return crudo(extendido, W, H).flatten({ background: "#000000" }).blur(sigma).ensureAlpha(1).raw({ depth: "uchar" }).toBuffer();
}

/** Desenfoque: el mismo anuncio cubriendo todo, muy desenfocado y oscurecido (RGBA crudo W×H, opaco). Se
 *  desenfoca a 1/8 y se agranda: idéntico a la vista (ya está borroso) y ~60× menos CPU que a tamaño completo. */
export async function fondoBlur(f: Fuente, W: number, H: number): Promise<Buffer> {
  const k = 8;
  const cw = Math.max(8, Math.ceil(W / k));
  const ch = Math.max(8, Math.ceil(H / k));
  const chico = await abrir(f)
    .resize(cw, ch, { fit: "cover", position: "centre" })
    .flatten({ background: "#000000" })
    .blur(Math.max(1, Math.round(Math.max(cw, ch) / 30)))
    .modulate({ brightness: 0.8 })
    .raw({ depth: "uchar" })
    .toBuffer();
  return crudo(chico, cw, ch, 3).resize(W, H, { fit: "fill", kernel: "cubic" }).ensureAlpha(1).raw({ depth: "uchar" }).toBuffer();
}

/** Color sólido opaco (RGBA crudo W×H). `hex` ya validado (#rrggbb). */
export function fondoColor(W: number, H: number, hex: string): Buffer {
  const buf = Buffer.alloc(W * H * 4);
  for (let i = 0; i < 4; i++) buf[i] = i === 3 ? 255 : parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  // Duplicar el primer píxel por bloques (copyWithin): sin un bucle por píxel.
  for (let lleno = 4; lleno < buf.length; lleno *= 2) buf.copyWithin(lleno, 0, Math.min(lleno, buf.length - lleno));
  return buf;
}

/**
 * IA: el lienzo va en la proporción de la IA más cercana (desenfoque como "relleno provisional" + el original al
 * centro, para darle contexto); de lo que vuelva se recorta la zona de la medida final y se lleva a W×H. Las
 * medidas de vuelta NO se confían: siempre se reescala.
 */
export async function fondoIA(
  f: Fuente,
  W: number,
  H: number,
  expandir: Expandir,
  recortable?: Lados,
  visible?: { rgba: Buffer; w: number; h: number },
): Promise<{ rgba: Buffer; costoUsd: number | null; modelo: string }> {
  const L = lienzoIA(f.w, f.h, W, H, recortable);
  const lienzo = await fondoBlur(f, L.gw, L.gh);
  // Contexto para la IA: la parte visible (con recorte, no el anuncio entero), a la escala del lienzo.
  const contexto = visible
    ? await crudo(visible.rgba, visible.w, visible.h).resize(L.original.w, L.original.h, { fit: "fill", kernel: "lanczos3" }).raw({ depth: "uchar" }).toBuffer()
    : await escalar(f, L.original.w, L.original.h);
  pegarDuro(lienzo, L.gw, contexto, { sw: L.original.w, sh: L.original.h, ox: L.original.x, oy: L.original.y });
  // Sólo viaja por la red: compresión mínima.
  const png = await crudo(lienzo, L.gw, L.gh).png({ compressionLevel: 1 }).toBuffer();
  const r = await expandir({ png, aspect: L.aspect, tamano: L.tamano });
  // De aquí en adelante la IA YA cobró: cualquier falla viaja con su costo.
  try {
    const zona = await sharp(r.png, OPCIONES)
      .resize(L.gw, L.gh, { fit: "fill" })
      .extract({ left: L.zona.x, top: L.zona.y, width: L.zona.w, height: L.zona.h })
      .flatten({ background: "#000000" })
      .raw({ depth: "uchar" })
      .toBuffer();
    const rgba = await crudo(zona, L.zona.w, L.zona.h, 3).resize(W, H, { fit: "fill", kernel: "lanczos3" }).ensureAlpha(1).raw({ depth: "uchar" }).toBuffer();
    return { rgba, costoUsd: r.costoUsd, modelo: r.modelo };
  } catch (err) {
    throw new ErrorConCosto(err, r.costoUsd);
  }
}

export type Compuesto = {
  png: Buffer;
  jpg: Buffer;
  encaje: Encaje;
  /** La zona del original, releída del PNG ya codificado, es idéntica byte por byte a nuestra copia escalada. */
  pixelLockOk: boolean;
  /** Sólo IA: cuánto movió/redibujó la IA el centro antes del pegado (0-255). */
  deriva: number | null;
  costoUsd: number | null;
  modelo: string | null;
};

/** Error de componer que ya trae lo gastado en la IA (para no perder el costo si algo falla DESPUÉS). */
// (Campos declarados a mano, sin "parameter properties": Node quita tipos pero no transforma esa sintaxis.)
export class ErrorConCosto extends Error {
  causa: unknown;
  costoUsd: number | null;
  constructor(causa: unknown, costoUsd: number | null) {
    super(causa instanceof Error ? causa.message : String(causa));
    this.causa = causa;
    this.costoUsd = costoUsd;
  }
}

export async function componer(f: Fuente, W: number, H: number, modo: Modo, opts: { color?: string; expandir?: Expandir; bordes?: Bordes } = {}): Promise<Compuesto> {
  const bordes = opts.bordes ?? (await analizarBordes(f));
  const e = encajar(f.w, f.h, W, H, bordes.recortable);
  const original = await escalarVisible(f, e);
  let base: Buffer;
  let deriva: number | null = null;
  let costoUsd: number | null = null;
  let modelo: string | null = null;
  if (modo === "ia" && !opts.expandir) throw new Error("componer: modo ia sin proveedor");
  if (modo === "color" && !opts.color) throw new Error("componer: modo color sin color");
  if (!hayExpansion(e)) {
    // El anuncio (recortado) llena la medida: no hay nada que rellenar, ni que cobrar.
    base = Buffer.from(original);
  } else if (modo === "extender") {
    base = await fondoExtender(original, e, W, H);
  } else if (modo === "ia" && opts.expandir) {
    const ia = await fondoIA(f, W, H, opts.expandir, bordes.recortable, { rgba: original, w: e.sw, h: e.sh });
    base = ia.rgba;
    costoUsd = ia.costoUsd;
    modelo = ia.modelo;
    deriva = derivaDe(base, W, original, e);
  } else if (modo === "color" && opts.color) {
    base = fondoColor(W, H, opts.color);
  } else {
    base = await fondoBlur(f, W, H);
  }
  try {
    pegarDuro(base, W, original, e);
    // JPG ligero para redes con tope de peso (Google Display: 150 KB). La compresión toca todos los píxeles,
    // también los del original: el pixel-lock se garantiza en el PNG.
    const [png, jpg] = await Promise.all([
      crudo(base, W, H).png({ compressionLevel: 6, palette: false }).toBuffer(),
      crudo(base, W, H).flatten({ background: "#ffffff" }).jpeg({ quality: 90, mozjpeg: true }).toBuffer(),
    ]);
    // La prueba se hace sobre el ARCHIVO que se entrega, no sobre la memoria.
    const relei = await sharp(png).ensureAlpha().raw({ depth: "uchar" }).toBuffer({ resolveWithObject: true });
    const pixelLockOk = relei.info.width === W && relei.info.height === H && zonaIdentica(relei.data, W, original, e);
    return { png, jpg, encaje: e, pixelLockOk, deriva, costoUsd, modelo };
  } catch (err) {
    throw err instanceof ErrorConCosto ? err : new ErrorConCosto(err, costoUsd);
  }
}
