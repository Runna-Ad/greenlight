/**
 * HÜE Prisma › Formatos — puerta PSD: leer un Photoshop y despiezarlo (puro: sin sharp ni DOM; corre igual en
 * Node, en el navegador y en un Web Worker).
 *
 * Los anuncios del equipo llegan en PSD con las carpetas de la guía de diseño: BRAND / TITULO / SUBTITULO / CTA /
 * HERO / FOOTER / BACKGROUND, una mesa de trabajo por medida. De ahí sale un MAESTRO por mesa: un fondo limpio y
 * cada carpeta como una pieza suelta que se puede mover y escalar.
 *
 * Por qué NO se pintan las capas una por una: en un PSD real (ajustes con recorte, modos de fusión, color overlay,
 * objetos inteligentes) eso difiere de Photoshop en ~30 % de los píxeles. Las siluetas y posiciones sí coinciden;
 * el color no. Entonces:
 *   1. silueta de cada pieza = el alfa de sus capas en modo normal (con su máscara), más el contorno si lo trae
 *   2. color de cada pieza   = la copia aplanada que Photoshop guarda en el archivo, "des-mezclada" de lo que
 *      tiene detrás en los bordes suavizados:  F = (C − D·(1−α)) / α
 *   3. fondo limpio          = nuestro pintado de BACKGROUND (con sus modos de fusión) + la diferencia contra
 *      Photoshop donde ninguna pieza lo tapa, extendida con suavidad por debajo de las piezas
 *   4. sombras (capas que oscurecen, sombras paralelas) = cuánto oscurecen lo de atrás (C/D), y viajan con su pieza
 * Las piezas se resuelven de ABAJO hacia ARRIBA y "lo de atrás" (D) es lo ya armado: así rearmarlas en su lugar
 * devuelve el anuncio de Photoshop aunque una pieza toque a otra.
 *
 * Archivos ajenos: primero se lee sólo la ESTRUCTURA, se revisan los límites, y los píxeles se decodifican capa
 * por capa cuando se piden (un PSD puede declarar medidas enormes sin traer datos).
 */
import { readPsd, getLayerImageData, getLayerMaskImageData, getCompositeImageData, initializeCanvas, type Layer } from "ag-psd";

/** Sólo se LEEN por índice. (La librería tipa también 16 y 32 bits; aquí siempre son 8: `leerPsd` rechaza lo demás.) */
type Pixeles = { data: ArrayLike<number>; width: number; height: number };

// Fuera del hilo principal del navegador (Node, Web Worker) no hay <canvas>: la librería sólo necesita de dónde
// sacar un búfer de píxeles. Con `useRawData` nunca dibuja en un canvas.
if (typeof document === "undefined") {
  initializeCanvas(
    () => {
      throw new Error("psd: sin canvas (se lee con useRawData)");
    },
    (width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }) as unknown as ImageData,
  );
}

/** Los reales rondan 70 MB. */
export const PSD_BYTES_MAX = 250_000_000;
/** El tope del formato PSD. Un archivo con una docena de mesas en fila pasa fácil de 12 000 px de ancho. */
export const PSD_LADO_MAX = 30_000;
/** La copia aplanada se decodifica entera (4 bytes por píxel): 60 MP = 240 MB. */
export const PSD_LIENZO_MAX_PX = 60_000_000;
/** Una capa (o su máscara) se decodifica entera aunque sólo un pedazo caiga en la mesa. */
export const PSD_CAPA_MAX_PX = 48_000_000;
export const PSD_CAPAS_MAX = 600;
/** Una mesa más grande que esto no se despieza (varios búferes de 12 bytes por píxel). */
export const MESA_MAX_PX = 12_000_000;
/** Cada carpeta de primer nivel es una pieza y cuesta un búfer del tamaño de la mesa: la guía pide 6. */
export const PIEZAS_MAX = 40;
/** Tope de memoria de un despiece: ≈ 60 bytes por píxel de la mesa + 15 por pieza (8 de trabajo y, si su caja
 *  abarca toda la mesa, 7 del resultado). */
export const DESPIECE_MAX_BYTES = 2_000_000_000;
const NOMBRE_MAX = 120;
/** Lo más lejos que se busca una sombra paralela, resplandor o contorno alrededor de su capa. */
export const HALO_MAX_PX = 200;
/** Diferencia de canal (0-255) que ya se nota a simple vista. */
export const TOLERANCIA = 12;
// Umbrales de "¿puedo confiar en este despiece?". Son criterio, no física.
export const FONDO_FIEL_MAX_PCT = 10;
export const REARMADO_MAX_PCT = 2;
export const TAPADA_MAX_PCT = 2;

export const ROLES = ["BACKGROUND", "HERO", "TITULO", "SUBTITULO", "CTA", "BRAND", "FOOTER"] as const;
export type Rol = (typeof ROLES)[number];

/** Nombre COMPLETO de la carpeta, sin mayúsculas ni acentos ("Subtitulo" → SUBTITULO). Nunca "contiene":
 *  "SUBTITULO" contiene "TITULO". */
export function rolDe(nombre: string): Rol | null {
  const n = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
  return (ROLES as readonly string[]).includes(n) ? (n as Rol) : null;
}

export type MotivoPsd = "no-soportado" | "demasiado-grande" | "sin-aplanado" | "sin-fondo";
export class ErrorPsd extends Error {
  motivo: MotivoPsd;
  constructor(motivo: MotivoPsd, mensaje: string) {
    super(mensaje);
    this.motivo = motivo;
  }
}

export type Caja = { x: number; y: number; w: number; h: number };
export type MesaPsd = { nombre: string } & Caja;
export type TipoCapa = "texto" | "objeto inteligente" | "ajuste" | "forma" | "píxeles";
export type MascaraPsd = { left: number; top: number; right: number; bottom: number; defecto: number; pixeles: () => Pixeles | undefined };
/** Un efecto de capa que pinta FUERA de sus píxeles: sombra paralela, resplandor exterior o contorno. */
export type Halo = { tipo: "sombra" | "luz" | "contorno"; radio: number; fuerza: number };
export type CapaPsd = {
  nombre: string;
  tipo: TipoCapa;
  left: number;
  top: number;
  w: number;
  h: number;
  opacidad: number;
  /** "Relleno" de Photoshop (0-1): baja los píxeles de la capa pero no sus efectos. */
  relleno: number;
  mezcla: string;
  halos: Halo[];
  /** Tiene algún efecto de capa encendido (también los que pintan por dentro: contorno interior, degradado…). */
  conEfectos: boolean;
  recorte: boolean;
  mesa: number;
  /** La carpeta de primer nivel dentro de la mesa (o la capa misma si está suelta). */
  pieza: string;
  mascara: MascaraPsd | null;
  pixeles: () => Pixeles | undefined;
};
export type DocPsd = {
  w: number;
  h: number;
  mesas: MesaPsd[];
  /** Sólo las visibles, de abajo hacia arriba. */
  capas: CapaPsd[];
  avisos: string[];
  /** false = guardado sin "Maximizar compatibilidad": la copia aplanada es un relleno, no el anuncio. */
  aplanadoReal: boolean | undefined;
  aplanado: () => Pixeles | undefined;
};

const tipoDe = (l: Layer): TipoCapa => (l.text ? "texto" : l.placedLayer ? "objeto inteligente" : l.adjustment ? "ajuste" : l.vectorFill || l.vectorMask ? "forma" : "píxeles");

const hayEfectos = (l: Layer): boolean =>
  !!l.effects && !l.effects.disabled &&
  Object.entries(l.effects).some(([k, v]) => k !== "scale" && k !== "disabled" && !!v && (Array.isArray(v) ? v.some((e) => e?.enabled !== false) : (v as { enabled?: boolean }).enabled !== false));

/** Un resplandor aclara: no se mide como sombra. Su zona sólo se aparta del fondo limpio. */
const FUERZA_LUZ = 0.03;

/** A lo más un halo por tipo (el de mayor alcance). `fuerza` = cuánto oscurece como mucho (la opacidad del efecto). */
function halosDe(l: Layer): Halo[] {
  const fx = l.effects;
  if (!fx || fx.disabled) return [];
  const escala = fx.scale ?? 1;
  const px = (u: { value: number } | undefined) => Math.max(0, (u?.value ?? 0) * escala) || 0;
  const cero = (v: number | undefined) => Math.min(1, Math.max(FUERZA_LUZ, v ?? 0.75)) || FUERZA_LUZ;
  const crudos: Halo[] = [];
  for (const s of fx.dropShadow ?? []) if (s.enabled !== false) crudos.push({ tipo: "sombra", radio: px(s.distance) + px(s.size), fuerza: cero(s.opacity) });
  if (fx.outerGlow && fx.outerGlow.enabled !== false) crudos.push({ tipo: "luz", radio: px(fx.outerGlow.size), fuerza: FUERZA_LUZ });
  for (const s of fx.stroke ?? []) if (s.enabled !== false && s.position !== "inside") crudos.push({ tipo: "contorno", radio: s.position === "center" ? px(s.size) / 2 : px(s.size), fuerza: 1 });
  const out: Halo[] = [];
  for (const h of crudos) {
    const radio = Math.min(HALO_MAX_PX, Math.ceil(h.radio) + 1); // +1: el suavizado del borde
    const ya = out.find((o) => o.tipo === h.tipo);
    if (ya) { ya.radio = Math.max(ya.radio, radio); ya.fuerza = Math.max(ya.fuerza, h.fuerza); }
    else out.push({ ...h, radio });
  }
  return out;
}

/** Los nombres vienen del archivo y acaban en pantalla: sin caracteres de control ni de dirección de texto, y
 *  con tope de largo. (Quien los pinte: siempre como texto, nunca como HTML.) */
const limpio = (s: string | undefined): string => (s ?? "").replace(/[\p{Cc}\p{Cf}]/gu, "").slice(0, NOMBRE_MAX);

/**
 * Lee la estructura (sin decodificar píxeles) y revisa los límites.
 *
 * Un PSD hecho con mala intención todavía puede colgar a la librería DENTRO de esta llamada (bloques de patrones,
 * tablas RLE): quien la use tiene que correrla en un Web Worker y matarlo si se pasa de tiempo. Nunca en el hilo
 * principal ni en el servidor.
 */
export function leerPsd(entrada: ArrayBuffer | Uint8Array): DocPsd {
  // Una vista que no abarca todo su ArrayBuffer (un Buffer chico de Node sale de un pozo compartido) se copia:
  // la librería acota sus lecturas por el búfer de abajo, no por la vista.
  if (entrada.byteLength > PSD_BYTES_MAX) throw new ErrorPsd("demasiado-grande", `El archivo pesa ${Math.round(entrada.byteLength / 1e6)} MB`);
  const buf = ArrayBuffer.isView(entrada) && (entrada.byteOffset !== 0 || entrada.byteLength !== entrada.buffer.byteLength) ? new Uint8Array(entrada) : entrada;
  const cab = ArrayBuffer.isView(buf) ? buf : new Uint8Array(buf, 0, Math.min(6, buf.byteLength));
  if (cab.length < 6 || cab[0] !== 0x38 || cab[1] !== 0x42 || cab[2] !== 0x50 || cab[3] !== 0x53) throw new ErrorPsd("no-soportado", "El archivo no es un PSD");
  if (cab[4] !== 0 || cab[5] !== 1) throw new ErrorPsd("no-soportado", "Es un PSB (documento grande), no un PSD");
  let psd;
  try {
    // totalMemoryLimit: con useRawData lo único que se decodifica al leer son los patrones del documento.
    psd = readPsd(buf, { useRawData: true, useRawThumbnail: true, skipLinkedFilesData: true, totalMemoryLimit: 64 * 1024 * 1024 });
  } catch (err) {
    throw new ErrorPsd("no-soportado", `No se pudo leer el PSD: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!(psd.width > 0 && psd.height > 0)) throw new ErrorPsd("no-soportado", "El PSD no declara medidas");
  if (psd.width > PSD_LADO_MAX || psd.height > PSD_LADO_MAX || psd.width * psd.height > PSD_LIENZO_MAX_PX) throw new ErrorPsd("demasiado-grande", `Lienzo de ${psd.width}×${psd.height}`);
  if ((psd.bitsPerChannel ?? 8) !== 8) throw new ErrorPsd("no-soportado", `${psd.bitsPerChannel} bits por canal (sólo 8)`);

  const avisos: string[] = [];
  const mesas: MesaPsd[] = [];
  const capas: CapaPsd[] = [];
  let vistas = 0;
  type Ctx = { mesa: number; pieza: string | null };
  const andar = (nodos: Layer[] | undefined, opPadre: number, ctx: Ctx) => {
    for (const l of nodos ?? []) {
      if (l.hidden) continue;
      if (++vistas > PSD_CAPAS_MAX) throw new ErrorPsd("demasiado-grande", `Más de ${PSD_CAPAS_MAX} capas`);
      const nombre = limpio(l.name);
      const opacidad = opPadre * (l.opacity ?? 1);
      if (l.children) {
        let hijo = ctx;
        if (l.artboard?.rect) {
          const r = l.artboard.rect;
          const x = Math.round(r.left), y = Math.round(r.top);
          mesas.push({ nombre, x, y, w: Math.round(r.right) - x, h: Math.round(r.bottom) - y });
          hijo = { mesa: mesas.length - 1, pieza: null };
        } else {
          if (ctx.pieza === null) hijo = { ...ctx, pieza: nombre };
          const raro = [
            ...((l.opacity ?? 1) < 1 ? ["opacidad"] : []),
            ...(l.blendMode && l.blendMode !== "pass through" && l.blendMode !== "normal" ? [`fusión ${l.blendMode}`] : []),
            ...(l.mask && !l.mask.disabled ? ["máscara"] : []),
          ];
          if (raro.length) avisos.push(`La carpeta «${nombre}» usa ${raro.join(", ")} propia: no se aplica igual que en Photoshop.`);
        }
        andar(l.children, opacidad, hijo);
        continue;
      }
      const w = (l.right ?? 0) - (l.left ?? 0);
      const h = (l.bottom ?? 0) - (l.top ?? 0);
      if (!(w >= 0 && h >= 0) || w > PSD_LADO_MAX || h > PSD_LADO_MAX || w * h > PSD_CAPA_MAX_PX) throw new ErrorPsd("demasiado-grande", `La capa «${nombre}» mide ${w}×${h}`);
      const k = l.mask && !l.mask.disabled ? l.mask : null;
      const mw = (k?.right ?? 0) - (k?.left ?? 0), mh = (k?.bottom ?? 0) - (k?.top ?? 0);
      if (!(mw >= 0 && mh >= 0) || mw > PSD_LADO_MAX || mh > PSD_LADO_MAX || mw * mh > PSD_CAPA_MAX_PX) throw new ErrorPsd("demasiado-grande", `La máscara de «${nombre}» mide ${mw}×${mh}`);
      // Máscara "ocultar todo" sin pintar: Photoshop no dibuja nada de esa capa.
      if (k && !(mw > 0 && mh > 0) && (k.defaultColor ?? 255) === 0) continue;
      // Canales en ZIP: se inflan enteros antes de mirar la medida (bomba de descompresión). Photoshop guarda
      // los de 8 bits en crudo o RLE.
      if (l.rawData?.channels.some((ch) => Number(ch.compression) >= 2)) throw new ErrorPsd("no-soportado", `La capa «${nombre}» viene comprimida en ZIP`);
      capas.push({
        nombre, tipo: tipoDe(l), left: l.left ?? 0, top: l.top ?? 0, w, h, opacidad, relleno: l.fillOpacity ?? 1,
        mezcla: l.blendMode ?? "normal", halos: halosDe(l), conEfectos: hayEfectos(l), recorte: !!l.clipping, mesa: ctx.mesa, pieza: ctx.pieza ?? nombre,
        mascara: k && mw > 0 && mh > 0 ? { left: k.left ?? 0, top: k.top ?? 0, right: k.right ?? 0, bottom: k.bottom ?? 0, defecto: k.defaultColor ?? 255, pixeles: () => getLayerMaskImageData(l) } : null,
        pixeles: () => (w > 0 && h > 0 ? getLayerImageData(l) : undefined),
      });
    }
  };
  andar(psd.children, 1, { mesa: -1, pieza: null });

  if (!mesas.length) {
    // Sin mesas de trabajo: el lienzo entero es el anuncio.
    mesas.push({ nombre: "", x: 0, y: 0, w: psd.width, h: psd.height });
    for (const c of capas) c.mesa = 0;
  } else {
    const sueltas = capas.filter((c) => c.mesa < 0).length;
    if (sueltas) avisos.push(`${sueltas} capa(s) fuera de las mesas de trabajo: se ignoran.`);
  }
  let copia: Pixeles | undefined | null = null; // la librería la decodifica entera en cada llamada
  return {
    w: psd.width, h: psd.height, mesas, capas: capas.filter((c) => c.mesa >= 0), avisos,
    aplanadoReal: psd.imageResources?.versionInfo?.hasRealMergedData,
    aplanado: () => (copia === null ? (copia = getCompositeImageData(psd)) : copia),
  };
}

// ── Despiece ──────────────────────────────────────────────────────────────

export type PiezaPsd = {
  nombre: string;
  rol: Rol | null;
  /** Todo lo que la pieza pinta u oscurece, en px de la mesa. `rgba` y `oscurece` miden caja.w × caja.h. */
  caja: Caja;
  /** Sólo lo sólido (alfa > 50 %): la caja que manda para acomodar. */
  solido: Caja;
  rgba: Uint8ClampedArray;
  /** RGB: cuánto oscurece lo que tenga debajo (255 = nada). null si la pieza no trae sombras. */
  oscurece: Uint8ClampedArray | null;
  /** % de sus píxeles que otra pieza de más arriba tapa u oscurece (ahí su color no es confiable). */
  tapadaPct: number;
};
export type MaestroPsd = {
  nombre: string;
  w: number;
  h: number;
  /** Fondo limpio: RGB, w × h. */
  fondo: Uint8ClampedArray;
  /** De abajo hacia arriba. */
  piezas: PiezaPsd[];
  /** % del fondo visible donde nuestro pintado no coincide con Photoshop NI con una corrección suave de color
   *  (0-100). Alto = la textura no coincide y, bajo las piezas, el fondo es una estimación. */
  fondoDistintoPct: number;
  /** Rearmar todo en su lugar vs la copia aplanada (0-100). */
  rearmadoDistintoPct: number;
  avisos: string[];
};

const OSCURECE = new Set(["multiply", "darken", "linear burn", "color burn", "darker color"]);
const lum = (r: number, g: number, b: number) => 0.3 * r + 0.59 * g + 0.11 * b;

/** Modos de fusión por canal (B = lo de abajo, S = la capa; 0-1). Los que no están aquí se pintan como normal. */
const FUSION: Record<string, (B: number, S: number) => number> = {
  multiply: (B, S) => B * S,
  screen: (B, S) => 1 - (1 - B) * (1 - S),
  darken: (B, S) => Math.min(B, S),
  lighten: (B, S) => Math.max(B, S),
  overlay: (B, S) => (B <= 0.5 ? 2 * B * S : 1 - 2 * (1 - B) * (1 - S)),
  "hard light": (B, S) => (S <= 0.5 ? 2 * B * S : 1 - 2 * (1 - B) * (1 - S)),
  "soft light": (B, S) => (S <= 0.5 ? B - (1 - 2 * S) * B * (1 - B) : B + (2 * S - 1) * ((B <= 0.25 ? ((16 * B - 12) * B + 4) * B : Math.sqrt(B)) - B)),
  "color dodge": (B, S) => (S >= 1 ? 1 : Math.min(1, B / (1 - S))),
  "color burn": (B, S) => (S <= 0 ? 0 : Math.max(0, 1 - (1 - B) / S)),
  "linear dodge": (B, S) => Math.min(1, B + S),
  "linear burn": (B, S) => Math.max(0, B + S - 1),
  "linear light": (B, S) => Math.min(1, Math.max(0, B + 2 * S - 1)),
  "vivid light": (B, S) => (S <= 0.5 ? (S <= 0 ? 0 : Math.max(0, 1 - (1 - B) / (2 * S))) : S >= 1 ? 1 : Math.min(1, B / (2 * (1 - S)))),
  "pin light": (B, S) => (S <= 0.5 ? Math.min(B, 2 * S) : Math.max(B, 2 * S - 1)),
  difference: (B, S) => Math.abs(B - S),
  exclusion: (B, S) => B + S - 2 * B * S,
};
const FUSION_ENTERA = new Set(["normal", "lighter color", "darker color"]);

/** Recorre los píxeles de una capa que caen en la mesa: índice en la mesa, alfa efectiva (opacidad, máscara y,
 *  si se pide, relleno) y dónde está su color en `data`. No decodifica nada si la capa no toca la mesa. */
function porPixel(c: CapaPsd, m: MesaPsd, conRelleno: boolean, fn: (i: number, alfa: number, data: Pixeles["data"], s: number) => void): void {
  const y0 = Math.max(0, m.y - c.top), y1 = Math.min(c.h, m.y + m.h - c.top);
  const x0 = Math.max(0, m.x - c.left), x1 = Math.min(c.w, m.x + m.w - c.left);
  const peso = c.opacidad * (conRelleno ? c.relleno : 1);
  if (y0 >= y1 || x0 >= x1 || !(peso > 0)) return;
  const img = c.pixeles();
  if (!img || img.width !== c.w || img.height !== c.h) return;
  const mk = c.mascara;
  const mkW = mk ? mk.right - mk.left : 0;
  const mkPx = mk?.pixeles();
  const mkImg = mk && mkPx && mkPx.width === mkW && mkPx.height === mk.bottom - mk.top ? mkPx : undefined;
  for (let y = y0; y < y1; y++) {
    const Y = y + c.top;
    for (let x = x0; x < x1; x++) {
      const s = (y * c.w + x) * 4;
      let a = (img.data[s + 3] / 255) * peso;
      if (!(a > 0)) continue;
      if (mk) {
        const X = x + c.left;
        const dentro = mkImg && X >= mk.left && X < mk.right && Y >= mk.top && Y < mk.bottom;
        a *= (dentro ? mkImg.data[((Y - mk.top) * mkW + (X - mk.left)) * 4] : mk.defecto) / 255;
        if (!(a > 0)) continue;
      }
      fn((Y - m.y) * m.w + (x + c.left - m.x), a, img.data, s);
    }
  }
}

/** La misma capa, decodificando sus píxeles (y su máscara) una sola vez. */
function conCache(c: CapaPsd): CapaPsd {
  const una = <T,>(fn: () => T): (() => T) => {
    let hecho = false;
    let valor: T | undefined;
    return () => {
      if (!hecho) { valor = fn(); hecho = true; }
      return valor as T;
    };
  };
  return { ...c, pixeles: una(c.pixeles), mascara: c.mascara && { ...c.mascara, pixeles: una(c.mascara.pixeles) } };
}

/** La silueta de una capa engordada `r` px (cuadrado). Para lo que sus efectos pintan fuera de ella. La caja
 *  sale en px de la mesa y puede asomarse fuera: una capa estacionada junto a la mesa todavía le echa sombra. */
function engordar(c: CapaPsd, m: MesaPsd, r: number): (Caja & { on: Uint8Array }) | null {
  const v: MesaPsd = { nombre: m.nombre, x: m.x - r, y: m.y - r, w: m.w + 2 * r, h: m.h + 2 * r }; // la mesa, con margen r
  const x = Math.max(0, c.left - v.x - r), y = Math.max(0, c.top - v.y - r);
  const w = Math.min(v.w, c.left - v.x + c.w + r) - x, h = Math.min(v.h, c.top - v.y + c.h + r) - y;
  if (w <= 0 || h <= 0) return null;
  const on = new Uint8Array(w * h);
  let alguno = false;
  porPixel(c, v, false, (i, a) => {
    if (a > 0.02) { on[(((i / v.w) | 0) - y) * w + ((i % v.w) - x)] = 1; alguno = true; }
  });
  if (!alguno) return null;
  // Separable: por filas y luego por columnas. Cada línea, dos barridas con "distancia al último encendido".
  const lejos = r + 1;
  const ida = new Uint16Array(Math.max(w, h));
  const barrer = (n: number, lineas: number, paso: number, salto: number) => {
    for (let l = 0; l < lineas; l++) {
      const base = l * salto;
      let d = lejos;
      for (let k = 0; k < n; k++) { d = on[base + k * paso] ? 0 : Math.min(lejos, d + 1); ida[k] = d; }
      d = lejos;
      for (let k = n - 1; k >= 0; k--) {
        const j = base + k * paso;
        d = on[j] ? 0 : Math.min(lejos, d + 1); // se lee antes de escribir: las de la derecha ya no se vuelven a leer
        if (d <= r || ida[k] <= r) on[j] = 1;
      }
    }
  };
  barrer(w, h, 1, w);
  barrer(h, w, w, 1);
  return { x: x - r, y: y - r, w, h, on };
}

/** Rellena los huecos (peso 0) de un campo RGB suave a partir de lo conocido: pirámide "push-pull". */
function rellenar(val: Float32Array, peso: Uint8Array, w: number, h: number): void {
  if (w <= 2 && h <= 2) {
    // Arriba de la pirámide: lo que siga hueco toma el promedio de lo conocido (no cero).
    const n = w * h;
    const med = [0, 0, 0];
    let sabidos = 0;
    for (let i = 0; i < n; i++) if (peso[i]) { sabidos++; for (let k = 0; k < 3; k++) med[k] += val[i * 3 + k]; }
    if (sabidos) for (let i = 0; i < n; i++) if (!peso[i]) for (let k = 0; k < 3; k++) val[i * 3 + k] = med[k] / sabidos;
    return;
  }
  const w2 = Math.ceil(w / 2), h2 = Math.ceil(h / 2);
  const v2 = new Float32Array(w2 * h2 * 3);
  const n2 = new Uint32Array(w2 * h2);
  let huecos = false;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!peso[i]) { huecos = true; continue; }
      const j = (y >> 1) * w2 + (x >> 1);
      v2[j * 3] += val[i * 3]; v2[j * 3 + 1] += val[i * 3 + 1]; v2[j * 3 + 2] += val[i * 3 + 2];
      n2[j]++;
    }
  if (!huecos) return;
  const p2 = new Uint8Array(w2 * h2);
  for (let j = 0; j < w2 * h2; j++)
    if (n2[j]) { v2[j * 3] /= n2[j]; v2[j * 3 + 1] /= n2[j]; v2[j * 3 + 2] /= n2[j]; p2[j] = 1; }
  rellenar(v2, p2, w2, h2);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (peso[i]) continue;
      const fx = Math.min(w2 - 1, Math.max(0, (x - 0.5) / 2)), fy = Math.min(h2 - 1, Math.max(0, (y - 0.5) / 2));
      const xa = Math.floor(fx), ya = Math.floor(fy), xb = Math.min(w2 - 1, xa + 1), yb = Math.min(h2 - 1, ya + 1), tx = fx - xa, ty = fy - ya;
      for (let k = 0; k < 3; k++) {
        const a = v2[(ya * w2 + xa) * 3 + k], b = v2[(ya * w2 + xb) * 3 + k], c = v2[(yb * w2 + xa) * 3 + k], d = v2[(yb * w2 + xb) * 3 + k];
        val[i * 3 + k] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
      }
    }
}

const a8 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
/** Debajo de esto, "cuánto oscurece" no se puede medir (dividir entre casi cero): se deja sin oscurecer. */
const NEGRO = 8 / 255;

/**
 * Una mesa → fondo limpio + piezas. Lanza SIEMPRE ErrorPsd (nunca otro error) cuando el anuncio tiene que ir por
 * la vía plana: sin copia aplanada, sin carpeta BACKGROUND, demasiado grande o datos que no se pueden leer.
 */
export function despiezar(doc: DocPsd, mesa: number): MaestroPsd {
  try {
    return despiezarMesa(doc, mesa);
  } catch (err) {
    if (err instanceof ErrorPsd) throw err;
    throw new ErrorPsd("no-soportado", `No se pudieron leer las capas del PSD: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function despiezarMesa(doc: DocPsd, mesa: number): MaestroPsd {
  const m = doc.mesas[mesa];
  if (!m) throw new ErrorPsd("no-soportado", `No existe la mesa ${mesa}`);
  if (![m.x, m.y, m.w, m.h].every(Number.isInteger) || !(m.w > 0 && m.h > 0) || m.x < 0 || m.y < 0 || m.x + m.w > doc.w || m.y + m.h > doc.h) throw new ErrorPsd("no-soportado", `La mesa «${m.nombre}» se sale del lienzo`);
  const N = m.w * m.h;
  if (N > MESA_MAX_PX) throw new ErrorPsd("demasiado-grande", `La mesa «${m.nombre}» mide ${m.w}×${m.h}`);
  const capas = doc.capas.filter((c) => c.mesa === mesa);
  const delFondo = capas.filter((c) => rolDe(c.pieza) === "BACKGROUND");
  if (!delFondo.length) throw new ErrorPsd("sin-fondo", `La mesa «${m.nombre}» no tiene carpeta BACKGROUND`);
  // Cada carpeta de primer nivel cuesta un búfer del tamaño de la mesa: se cuenta ANTES de reservar nada.
  const nPiezas = new Set(capas.filter((c) => rolDe(c.pieza) !== "BACKGROUND").map((c) => c.pieza)).size;
  if (nPiezas > PIEZAS_MAX || N * (60 + 15 * nPiezas) > DESPIECE_MAX_BYTES) throw new ErrorPsd("demasiado-grande", `La mesa «${m.nombre}» tiene ${nPiezas} carpetas o capas sueltas de primer nivel`);
  const ap = doc.aplanadoReal === false ? undefined : doc.aplanado();
  if (!ap || ap.width !== doc.w || ap.height !== doc.h) throw new ErrorPsd("sin-aplanado", "El PSD no trae copia aplanada: guardarlo con «Maximizar compatibilidad».");
  const avisos: string[] = [];

  // La copia aplanada de Photoshop, recortada a la mesa (RGB 0-1). Su cuarto canal se ignora: Photoshop ya
  // guarda el color sobre blanco, y ese canal puede ser una selección guardada en vez de transparencia.
  const C = new Float32Array(N * 3);
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      const q = ((y + m.y) * doc.w + (x + m.x)) * 4, i = (y * m.w + x) * 3;
      C[i] = ap.data[q] / 255; C[i + 1] = ap.data[q + 1] / 255; C[i + 2] = ap.data[q + 2] / 255;
    }

  // Siluetas: por pieza, alfa de lo sólido y zona de lo que oscurece.
  type Trabajo = { nombre: string; alfa: Float32Array; sombra: Float32Array | null };
  const trabajos: Trabajo[] = [];
  for (let c of capas) {
    if (rolDe(c.pieza) === "BACKGROUND" || c.recorte || c.tipo === "ajuste") continue; // recortadas y ajustes sólo cambian color
    let t = trabajos.find((x) => x.nombre === c.pieza);
    if (!t) trabajos.push((t = { nombre: c.pieza, alfa: new Float32Array(N), sombra: null }));
    const { alfa } = t;
    const etiqueta = `«${c.pieza} / ${c.nombre}»`;
    // El Relleno baja los píxeles de la capa pero NO sus efectos: una capa al 0 % con contorno interior o
    // degradado sigue viéndose entera. Con efectos, la silueta es la forma completa.
    const conRelleno = !c.conEfectos;
    if (c.halos.length) c = conCache(c); // sus píxeles se leen una vez por halo
    if (c.mezcla === "normal") {
      porPixel(c, m, conRelleno, (i, a) => { alfa[i] = a + alfa[i] * (1 - a); });
    } else if (OSCURECE.has(c.mezcla)) {
      // En todos estos modos el BLANCO no hace nada: una capa de sombra suele ser un rectángulo opaco, blanco
      // salvo donde oscurece. Lo que cuenta es cuánto se aleja del blanco, no su alfa.
      const sombra = (t.sombra ??= new Float32Array(N));
      porPixel(c, m, conRelleno, (i, a, data, s) => {
        const fuerza = a * (1 - Math.min(data[s], data[s + 1], data[s + 2]) / 255);
        if (fuerza > sombra[i]) sombra[i] = fuerza;
      });
    } else {
      avisos.push(`${etiqueta} usa fusión ${c.mezcla}: ese efecto no viaja con la pieza.`);
    }
    // Lo que sus efectos pintan FUERA de la capa: el contorno es parte de la silueta; la sombra paralela y el
    // resplandor son zona "tocada" (si no, se quedarían pintados en el fondo limpio).
    for (const hl of c.halos) {
      const g = engordar(c, m, hl.radio);
      if (!g) continue;
      const destino = hl.tipo === "contorno" ? alfa : (t.sombra ??= new Float32Array(N));
      for (let yy = Math.max(0, -g.y); yy < Math.min(g.h, m.h - g.y); yy++)
        for (let xx = Math.max(0, -g.x); xx < Math.min(g.w, m.w - g.x); xx++) {
          const i = (yy + g.y) * m.w + (xx + g.x);
          if (g.on[yy * g.w + xx] && hl.fuerza > destino[i]) destino[i] = hl.fuerza;
        }
      if (hl.tipo === "luz") avisos.push(`${etiqueta} tiene resplandor exterior: no viaja con la pieza.`);
    }
    if (c.relleno < 1 && c.conEfectos) avisos.push(`${etiqueta} usa Relleno al ${Math.round(c.relleno * 100)} % con efectos: revisar esa pieza.`);
  }

  // Fondo: nuestro pintado de BACKGROUND, con sus modos de fusión.
  const guia = new Float32Array(N * 3).fill(1);
  for (const c of delFondo) {
    if (c.tipo === "ajuste") continue;
    const f = FUSION[c.mezcla];
    if (!f && !FUSION_ENTERA.has(c.mezcla)) avisos.push(`Fondo: fusión ${c.mezcla} pintada como normal.`);
    const modo = c.mezcla;
    porPixel(c, m, true, (i, a, data, s) => {
      const d = i * 3;
      const br = guia[d], bg = guia[d + 1], bb = guia[d + 2];
      let r = data[s] / 255, g = data[s + 1] / 255, b = data[s + 2] / 255;
      if (f) { r = f(br, r); g = f(bg, g); b = f(bb, b); }
      else if (modo === "lighter color") { if (lum(br, bg, bb) > lum(r, g, b)) { r = br; g = bg; b = bb; } }
      else if (modo === "darker color") { if (lum(br, bg, bb) < lum(r, g, b)) { r = br; g = bg; b = bb; } }
      guia[d] = br + (r - br) * a; guia[d + 1] = bg + (g - bg) * a; guia[d + 2] = bb + (b - bb) * a;
    });
  }

  // Dónde se VE el fondo: fuera de toda pieza y de sus sombras, con 3 px de holgura para los bordes suavizados.
  const visible = new Uint8Array(N).fill(1);
  for (const t of trabajos) for (let i = 0; i < N; i++) if (t.alfa[i] > 0.02 || (t.sombra && t.sombra[i] > 0.02)) visible[i] = 0;
  for (let paso = 0; paso < 3; paso++) {
    const prev = visible.slice();
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        const i = y * m.w + x;
        if (prev[i] && ((x > 0 && !prev[i - 1]) || (x < m.w - 1 && !prev[i + 1]) || (y > 0 && !prev[i - m.w]) || (y < m.h - 1 && !prev[i + m.w]))) visible[i] = 0;
      }
  }
  // La diferencia contra Photoshop donde el fondo se ve. Su parte SUAVE (un tinte, un ajuste de color que no
  // pintamos) se extiende bien por debajo de las piezas; su parte FINA (textura que no coincide) no. Se mide
  // sólo la fina: lo que queda al quitarle el promedio de su bloque de 16 px.
  const resto = new Float32Array(N * 3);
  const BLOQUE = 16;
  const bw = Math.ceil(m.w / BLOQUE), bh = Math.ceil(m.h / BLOQUE);
  const suma = new Float32Array(bw * bh * 3);
  const cuenta = new Uint32Array(bw * bh);
  let nVisible = 0;
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      const i = y * m.w + x;
      if (!visible[i]) continue;
      nVisible++;
      const j = ((y / BLOQUE) | 0) * bw + ((x / BLOQUE) | 0);
      for (let k = 0; k < 3; k++) { resto[i * 3 + k] = C[i * 3 + k] - guia[i * 3 + k]; suma[j * 3 + k] += resto[i * 3 + k]; }
      cuenta[j]++;
    }
  if (!nVisible) throw new ErrorPsd("sin-fondo", `En la mesa «${m.nombre}» las piezas tapan todo el fondo`);
  let guiaMal = 0;
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      const i = y * m.w + x;
      if (!visible[i]) continue;
      const j = ((y / BLOQUE) | 0) * bw + ((x / BLOQUE) | 0);
      for (let k = 0; k < 3; k++)
        if (!(Math.abs(resto[i * 3 + k] - suma[j * 3 + k] / cuenta[j]) * 255 <= TOLERANCIA)) { guiaMal++; break; }
    }
  rellenar(resto, visible, m.w, m.h);
  // Desde aquí `D` es "lo de atrás": empieza siendo el fondo limpio y cada pieza se le va sumando.
  const D = guia;
  const fondo = new Uint8ClampedArray(N * 3);
  for (let i = 0; i < N * 3; i++) { D[i] = Math.min(1, Math.max(0, guia[i] + resto[i])); fondo[i] = Math.round(D[i] * 255); }

  // tope[i] = la pieza de MÁS ARRIBA que pinta sólido ahí (−1 = ninguna): para saber qué le tapan a cada una.
  const K = trabajos.length;
  const tope = new Int8Array(N).fill(-1);
  for (let k = K - 1; k >= 0; k--) { const al = trabajos[k].alfa; for (let i = 0; i < N; i++) if (tope[i] < 0 && al[i] > 0.05) tope[i] = k; }
  const ultima = new Int8Array(N).fill(-1); // la última pieza sólida ya armada ahí
  const propios = new Uint32Array(K), ajenos = new Uint32Array(K);
  const contado = new Uint8Array(N); // un píxel de una pieza cuenta como "oscurecido por otra" una sola vez
  const armadas: (PiezaPsd | null)[] = [];
  for (let k = 0; k < K; k++) {
    const t = trabajos[k];
    const osc = t.sombra ? new Uint8ClampedArray(N * 3).fill(255) : null;
    let x0 = m.w, y0 = m.h, x1 = -1, y1 = -1, sx0 = m.w, sy0 = m.h, sx1 = -1, sy1 = -1;
    for (let i = 0; i < N; i++) {
      const a = t.alfa[i];
      let toca = a > 0.02;
      if (toca) {
        propios[k]++;
        if (tope[i] > k) ajenos[k]++;
      } else {
        t.alfa[i] = 0;
        // Lo que oscurece, sólo donde ninguna pieza de más arriba lo tapa.
        if (osc && t.sombra && t.sombra[i] > 0.02 && tope[i] <= k) {
          // Cae sobre una pieza de abajo: esa sombra se queda pintada en ella. Sólo cuenta si se nota.
          if (ultima[i] >= 0 && !contado[i] && t.sombra[i] * 255 > TOLERANCIA) { contado[i] = 1; ajenos[ultima[i]]++; }
          for (let c = 0; c < 3; c++) {
            const d = D[i * 3 + c];
            const v = d < NEGRO ? 1 : Math.min(1, C[i * 3 + c] / d);
            osc[i * 3 + c] = Math.round(v * 255);
            if (v < 0.985) toca = true;
            D[i * 3 + c] = d * v;
          }
        }
      }
      if (!toca) continue;
      const x = i % m.w, y = (i / m.w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (a > 0.5) { if (x < sx0) sx0 = x; if (x > sx1) sx1 = x; if (y < sy0) sy0 = y; if (y > sy1) sy1 = y; }
    }
    if (x1 < 0) { armadas.push(null); continue; } // carpeta sin nada pintado en esta mesa
    const caja = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    const rgba = new Uint8ClampedArray(caja.w * caja.h * 4);
    const oscurece = osc ? new Uint8ClampedArray(caja.w * caja.h * 3) : null;
    for (let yy = 0; yy < caja.h; yy++)
      for (let xx = 0; xx < caja.w; xx++) {
        const i = (yy + caja.y) * m.w + (xx + caja.x), j = yy * caja.w + xx, a = t.alfa[i];
        if (oscurece && osc) { oscurece[j * 3] = osc[i * 3]; oscurece[j * 3 + 1] = osc[i * 3 + 1]; oscurece[j * 3 + 2] = osc[i * 3 + 2]; }
        if (!(a > 0)) continue;
        for (let c = 0; c < 3; c++) {
          const f = Math.min(1, Math.max(0, (C[i * 3 + c] - D[i * 3 + c] * (1 - a)) / a));
          rgba[j * 4 + c] = Math.round(f * 255);
          D[i * 3 + c] = f * a + D[i * 3 + c] * (1 - a);
        }
        rgba[j * 4 + 3] = a8(a);
        if (a > 0.05) ultima[i] = k;
      }
    armadas.push({
      nombre: t.nombre, rol: rolDe(t.nombre), caja, solido: sx1 < 0 ? caja : { x: sx0, y: sy0, w: sx1 - sx0 + 1, h: sy1 - sy0 + 1 },
      rgba, oscurece, tapadaPct: 0,
    });
  }
  const piezas: PiezaPsd[] = [];
  armadas.forEach((p, k) => {
    if (!p) return;
    p.tapadaPct = propios[k] ? Math.min(100, (ajenos[k] / propios[k]) * 100) : 0;
    if (p.tapadaPct > TAPADA_MAX_PCT) avisos.push(`«${p.nombre}» queda ${p.tapadaPct.toFixed(1)} % tapada u oscurecida por otra pieza: ahí su color no es confiable.`);
    if (!p.rol) avisos.push(`La carpeta «${p.nombre}» no es una de las de la guía (${ROLES.join(" / ")}).`);
    piezas.push(p);
  });

  const maestro: MaestroPsd = { nombre: m.nombre, w: m.w, h: m.h, fondo, piezas, fondoDistintoPct: (guiaMal / nVisible) * 100, rearmadoDistintoPct: 0, avisos };
  const otra = rearmar(maestro);
  let mal = 0;
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < 3; k++)
      if (!(Math.abs(otra[i * 3 + k] - C[i * 3 + k] * 255) <= TOLERANCIA)) { mal++; break; }
  }
  maestro.rearmadoDistintoPct = (mal / N) * 100;
  return maestro;
}

/** Arma el anuncio con cada pieza en su lugar (RGB, w × h). Es la prueba del despiece: tiene que salir el de
 *  Photoshop. */
export function rearmar(ma: Pick<MaestroPsd, "w" | "h" | "fondo" | "piezas">): Uint8ClampedArray {
  const out = new Uint8ClampedArray(ma.fondo);
  for (const p of ma.piezas) {
    for (let yy = 0; yy < p.caja.h; yy++)
      for (let xx = 0; xx < p.caja.w; xx++) {
        const d = ((yy + p.caja.y) * ma.w + (xx + p.caja.x)) * 3, j = yy * p.caja.w + xx, a = p.rgba[j * 4 + 3] / 255;
        for (let k = 0; k < 3; k++) {
          const base = p.oscurece ? (out[d + k] * p.oscurece[j * 3 + k]) / 255 : out[d + k];
          out[d + k] = Math.round(base + (p.rgba[j * 4 + k] - base) * a);
        }
      }
  }
  return out;
}

/** ¿Se puede usar este despiece, o el anuncio va por la vía plana? Con los motivos, para mostrarlos. */
export function despieceUsable(ma: MaestroPsd): { ok: boolean; motivos: string[] } {
  const motivos = [
    ...(ma.rearmadoDistintoPct > REARMADO_MAX_PCT ? [`al rearmarlo difiere de Photoshop en ${ma.rearmadoDistintoPct.toFixed(1)} % de los píxeles`] : []),
    ...(ma.fondoDistintoPct > FONDO_FIEL_MAX_PCT ? [`el fondo no se pudo reconstruir con certeza (${ma.fondoDistintoPct.toFixed(1)} % distinto)`] : []),
    ...ma.piezas.filter((p) => p.tapadaPct > TAPADA_MAX_PCT).map((p) => `«${p.nombre}» está tapada u oscurecida por otra pieza`),
    ...(ma.piezas.length ? [] : ["no hay piezas fuera del fondo"]),
  ];
  return { ok: motivos.length === 0, motivos };
}
