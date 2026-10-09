/**
 * HÜE Prisma › Formatos — la geometría (módulo PURO: lo usan el servidor, el navegador y los tests).
 *
 * La regla que manda: el anuncio original SÓLO se escala parejo (nunca se estira ni se redibuja), se centra,
 * y lo que sobra alrededor se rellena. v2 (Pedro, 2026-10-09): se puede RECORTAR fondo vacío — las franjas
 * lisas del borde del anuncio (ver `bordesDe`) — para que el contenido quede más grande; el contenido nunca se
 * corta. Todo en enteros: la parte visible del original mide exactamente `sw × sh`, la expansión por lado
 * suma exactamente la medida final, y nada se pasa ni se queda corto 1 px.
 */

export type Plataforma = "meta" | "google" | "linkedin" | "x" | "pinterest" | "youtube" | "otro";
/** extender = continuar los bordes lisos/degradados del anuncio (gratis); ia; blur; color. */
export type Modo = "extender" | "ia" | "blur" | "color";
export const MODOS: Modo[] = ["extender", "ia", "blur", "color"];
export const esModo = (m: unknown): m is Modo => typeof m === "string" && (MODOS as string[]).includes(m);

export type Preset = { id: string; plataforma: Plataforma; w: number; h: number };

/** Presets v1 (constante en el código, como pidió Pedro). El id es estable: se guarda en la base. */
export const PRESETS: Preset[] = [
  { id: "meta-1080x1080", plataforma: "meta", w: 1080, h: 1080 },
  { id: "meta-1080x1350", plataforma: "meta", w: 1080, h: 1350 },
  { id: "meta-1080x1920", plataforma: "meta", w: 1080, h: 1920 },
  { id: "google-300x250", plataforma: "google", w: 300, h: 250 },
  { id: "google-336x280", plataforma: "google", w: 336, h: 280 },
  { id: "google-728x90", plataforma: "google", w: 728, h: 90 },
  { id: "google-160x600", plataforma: "google", w: 160, h: 600 },
  { id: "google-300x600", plataforma: "google", w: 300, h: 600 },
  { id: "google-320x50", plataforma: "google", w: 320, h: 50 },
  { id: "google-970x250", plataforma: "google", w: 970, h: 250 },
  { id: "linkedin-1200x627", plataforma: "linkedin", w: 1200, h: 627 },
  { id: "x-1600x900", plataforma: "x", w: 1600, h: 900 },
  { id: "pinterest-1000x1500", plataforma: "pinterest", w: 1000, h: 1500 },
  { id: "youtube-1280x720", plataforma: "youtube", w: 1280, h: 720 },
];

export const PLATAFORMAS: Plataforma[] = ["meta", "google", "linkedin", "x", "pinterest", "youtube", "otro"];

/** Medida libre: límites sensatos (un banner de 1 px no existe; uno de 5000 px no es un anuncio). */
export const LADO_MIN = 32;
export const LADO_MAX = 4096;
/** Anuncio de entrada: tope de píxeles (anti bomba de descompresión) y de lado. */
export const FUENTE_MAX_PX = 40_000_000;
export const FUENTE_MAX_BYTES = 25_000_000; // = el tope del bucket ("25MB") se lea en base 1000 o 1024

export const idCustom = (w: number, h: number): string => `otro-${w}x${h}`;
const ID_CUSTOM = /^otro-(\d{2,4})x(\d{2,4})$/;

/** El preset de un id (o la medida libre `otro-WxH` dentro de límites). Nada más pasa. */
export function presetDe(id: string): Preset | null {
  const fijo = PRESETS.find((p) => p.id === id);
  if (fijo) return fijo;
  const m = ID_CUSTOM.exec(id);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  // Id CANÓNICO: "otro-0032x0100" y "otro-32x100" son la misma medida (una sola fila, un solo cobro).
  return medidaValida(w, h) ? { id: idCustom(w, h), plataforma: "otro", w, h } : null;
}

export const medidaValida = (w: number, h: number): boolean =>
  Number.isInteger(w) && Number.isInteger(h) && w >= LADO_MIN && h >= LADO_MIN && w <= LADO_MAX && h <= LADO_MAX;

/** Por lado, en px del ORIGINAL. */
export type Lados = { top: number; right: number; bottom: number; left: number };
export const SIN_RECORTE: Lados = { top: 0, right: 0, bottom: 0, left: 0 };

export type Encaje = {
  /** Factor de escala real (completo.w / w0). >1 = el original se agranda. */
  escala: number;
  /** La parte VISIBLE del original escalado, y dónde cae en la medida final (siempre adentro). */
  sw: number;
  sh: number;
  ox: number;
  oy: number;
  /** El original escalado completo y dónde empieza la parte visible dentro de él. Sin recorte: completo =
   *  {sw, sh} y corte = {0, 0}. */
  completo: { w: number; h: number };
  corte: { x: number; y: number };
  /** Píxeles nuevos por lado. left + sw + right === W; top + sh + bottom === H. */
  expansion: Lados;
  /** Fracción de la medida final que ocupa el original (0-1). */
  cobertura: number;
};

const sinRecorte = (r: Lados) => !(r.top > 0 || r.right > 0 || r.bottom > 0 || r.left > 0);

/**
 * Contain-fit: el lado que manda queda EXACTO (no por redondeo de un flotante), el otro se redondea y se
 * acota a [1, límite]. Centrado con floor: si sobra un píxel impar, va abajo/derecha.
 *
 * Con `recortable` (fondo liso por lado, px del original): la escala crece hasta que el CONTENIDO (el
 * original menos lo recortable) quepa, sin pasar de "cover" (pasado eso sólo se cortaría de más). Lo que se
 * sale de la medida final se corta sólo del fondo liso; si aun así sobra espacio, se rellena como siempre.
 */
export function encajar(w0: number, h0: number, W: number, H: number, recortable: Lados = SIN_RECORTE): Encaje {
  if (!(w0 > 0 && h0 > 0 && W > 0 && H > 0)) throw new Error("encajar: medidas inválidas");
  if (!sinRecorte(recortable)) {
    const r = acotarRecorte(w0, h0, recortable);
    const e = encajarRecortando(w0, h0, W, H, r);
    if (e) return e;
  }
  let sw: number;
  let sh: number;
  // Comparar en enteros (w0*H vs W*h0) evita que un flotante elija el lado equivocado en empates.
  if (W * h0 <= H * w0) {
    sw = W;
    sh = Math.min(H, Math.max(1, Math.round((h0 * W) / w0)));
  } else {
    sh = H;
    sw = Math.min(W, Math.max(1, Math.round((w0 * H) / h0)));
  }
  const ox = Math.floor((W - sw) / 2);
  const oy = Math.floor((H - sh) / 2);
  return {
    escala: sw / w0,
    sw,
    sh,
    ox,
    oy,
    completo: { w: sw, h: sh },
    corte: { x: 0, y: 0 },
    expansion: { top: oy, right: W - sw - ox, bottom: H - sh - oy, left: ox },
    cobertura: (sw * sh) / (W * H),
  };
}

/** Enteros ≥ 0 y nunca más de 45 % por lado: siempre queda contenido en medio (aunque el anuncio sea liso). */
function acotarRecorte(w0: number, h0: number, r: Lados): Lados {
  const c = (v: number, lado: number) => Math.max(0, Math.min(Math.floor(v), Math.floor(lado * 0.45)));
  return { top: c(r.top, h0), right: c(r.right, w0), bottom: c(r.bottom, h0), left: c(r.left, w0) };
}

/** Un eje: dónde va el original escalado (`full` px) en la medida final (`T` px) cortando, a lo sumo, `ma` px
 *  del principio y `mb` del final (ya escalados). Devuelve el offset (puede ser negativo) y la parte visible. */
function eje(full: number, T: number, ma: number, mb: number) {
  const centrado = Math.floor((T - full) / 2);
  const lo = -ma; // no cortar más que `ma` al principio
  const hi = T - full + mb; // ni más que `mb` al final
  // Si el redondeo deja 1-2 px de contradicción, se reparte (el 30 % de aire que nunca se recorta lo absorbe).
  const o = lo <= hi ? Math.min(hi, Math.max(lo, centrado)) : Math.round((lo + hi) / 2);
  const v0 = Math.max(0, o);
  const v1 = Math.min(T, o + full);
  return { o, v0, tam: v1 - v0, corte: v0 - o };
}

function encajarRecortando(w0: number, h0: number, W: number, H: number, r: Lados): Encaje | null {
  const pw = w0 - r.left - r.right;
  const ph = h0 - r.top - r.bottom;
  // ¿Gana algo? Si el contenido no deja crecer la escala más allá de contain, el contain exacto de siempre.
  const contain = Math.min(W / w0, H / h0);
  const cover = Math.max(W / w0, H / h0);
  const cabe = Math.min(W / pw, H / ph);
  // Recortar nunca AGRANDA el original más allá de su tamaño real (se vería borroso): techo = 1×, o contain si
  // el anuncio ya era más chico que la medida.
  const techo = Math.max(contain, 1);
  const s = Math.min(cabe, cover, techo);
  if (s <= contain * 1.001) return null;
  let fw: number;
  let fh: number;
  if (s === techo && techo < cabe && techo < cover) {
    fw = Math.round(w0 * s);
    fh = Math.round(h0 * s);
  } else if (cabe >= cover) {
    // Cover: un lado EXACTO a la medida final, el otro se pasa y se corta del fondo liso.
    if (W * h0 >= H * w0) {
      fw = W;
      fh = Math.max(H, Math.round((h0 * W) / w0));
    } else {
      fh = H;
      fw = Math.max(W, Math.round((w0 * H) / h0));
    }
  } else if (W * ph <= H * pw) {
    // Manda el ancho del contenido: el contenido escalado mide exactamente W.
    fw = Math.round((w0 * W) / pw);
    fh = Math.round((h0 * W) / pw);
  } else {
    fh = Math.round((h0 * H) / ph);
    fw = Math.round((w0 * H) / ph);
  }
  const k = fw / w0;
  const x = eje(fw, W, Math.floor(r.left * k), Math.floor(r.right * k));
  const y = eje(fh, H, Math.floor(r.top * k), Math.floor(r.bottom * k));
  if (x.tam < 1 || y.tam < 1) return null;
  return {
    escala: k,
    sw: x.tam,
    sh: y.tam,
    ox: x.v0,
    oy: y.v0,
    completo: { w: fw, h: fh },
    corte: { x: x.corte, y: y.corte },
    expansion: { top: y.v0, right: W - x.v0 - x.tam, bottom: H - y.v0 - y.tam, left: x.v0 },
    cobertura: (x.tam * y.tam) / (W * H),
  };
}

export const hayExpansion = (e: Pick<Encaje, "expansion">): boolean => !sinRecorte(e.expansion);

/** Umbrales del modo por omisión. Ajustables: son criterio, no física. */
export const COBERTURA_IA = 0.5;
export const COBERTURA_BLUR = 0.3;

export type Sugerencia = { modo: Modo; rediseno: boolean; encendido: boolean };

/**
 * Sin nada que rellenar, o con bordes lisos donde hay que rellenar → extender (gratis, se ve continuo).
 * Si no: cambio moderado → IA; grande → desenfoque; extremo (el original queda diminuto) → "Requiere
 * rediseño", apagado por omisión (se puede forzar).
 */
export function sugerir(e: Pick<Encaje, "cobertura" | "expansion">, liso: Record<keyof Lados, boolean> | null = null): Sugerencia {
  const extendible = !hayExpansion(e) || (!!liso && (Object.keys(e.expansion) as (keyof Lados)[]).every((k) => e.expansion[k] === 0 || liso[k]));
  if (e.cobertura < COBERTURA_BLUR) return { modo: extendible ? "extender" : "blur", rediseno: true, encendido: false };
  if (extendible) return { modo: "extender", rediseno: false, encendido: true };
  if (e.cobertura >= COBERTURA_IA) return { modo: "ia", rediseno: false, encendido: true };
  return { modo: "blur", rediseno: false, encendido: true };
}

/** Si el original se AGRANDA más de un 5 %, se avisa (se verá suave). Devuelve el % o null. */
export function agrandaPct(e: Encaje): number | null {
  return e.escala > 1.05 ? Math.round((e.escala - 1) * 100) : null;
}

// ── Lienzo de la IA (Nano Banana 2.1) ─────────────────────────────────────
// Proporciones y medidas EXACTAS de la tabla de ai.google.dev/gemini-api/docs/image-generation para Nano
// Banana 2 (leída 2026-10-02); la 2.1 es una actualización del mismo modelo y se asume igual hasta la prueba
// real (de todos modos lo que vuelve se reescala, nunca se confía su medida). Sólo 1K y 2K.
export type TamanoIA = "1K" | "2K";
export const RATIOS_IA: Record<string, Record<TamanoIA, [number, number]>> = {
  "1:1": { "1K": [1024, 1024], "2K": [2048, 2048] },
  "1:4": { "1K": [512, 2048], "2K": [1024, 4096] },
  "1:8": { "1K": [384, 3072], "2K": [768, 6144] },
  "2:3": { "1K": [848, 1264], "2K": [1696, 2528] },
  "3:2": { "1K": [1264, 848], "2K": [2528, 1696] },
  "3:4": { "1K": [896, 1200], "2K": [1792, 2400] },
  "4:1": { "1K": [2048, 512], "2K": [4096, 1024] },
  "4:3": { "1K": [1200, 896], "2K": [2400, 1792] },
  "4:5": { "1K": [928, 1152], "2K": [1856, 2304] },
  "5:4": { "1K": [1152, 928], "2K": [2304, 1856] },
  "8:1": { "1K": [3072, 384], "2K": [6144, 768] },
  "9:16": { "1K": [768, 1376], "2K": [1536, 2752] },
  "16:9": { "1K": [1376, 768], "2K": [2752, 1536] },
  "21:9": { "1K": [1584, 672], "2K": [3168, 1344] },
};
/** US$ por imagen de salida de Nano Banana 2.1 (1 120 / 1 680 tokens a US$30/M) + ~1 000 tokens de entrada a
 *  US$1.50/M. Antes (Nano Banana 2): 0.068 / 0.102. */
export const COSTO_IA_USD: Record<TamanoIA, number> = { "1K": 0.0336 + 0.0015, "2K": 0.0504 + 0.0015 };
/** Cuánto se tolera AGRANDAR lo que devuelve la IA antes de pedir el tamaño siguiente. */
const TOLERANCIA_AGRANDAR = 1.1;

export type LienzoIA = {
  aspect: string;
  tamano: TamanoIA;
  gw: number;
  gh: number;
  /** Dónde cae la medida final dentro del lienzo de la IA (contain). */
  zona: { x: number; y: number; w: number; h: number };
  /** Dónde va el original dentro del lienzo de la IA (sólo contexto: el pegado final usa el Encaje real). */
  original: { x: number; y: number; w: number; h: number };
  costoUsd: number;
};

/** La proporción de la IA más cercana a W:H (distancia en log, simétrica), el tamaño más barato que no
 *  agrande la zona final más de un 10 %, y dónde va todo dentro (la parte VISIBLE del original). */
export function lienzoIA(w0: number, h0: number, W: number, H: number, recortable: Lados = SIN_RECORTE): LienzoIA {
  const objetivo = Math.log(W / H);
  let aspect = "1:1";
  let mejor = Infinity;
  for (const [a, t] of Object.entries(RATIOS_IA)) {
    const [rw, rh] = t["1K"];
    const d = Math.abs(Math.log(rw / rh) - objetivo);
    if (d < mejor) {
      mejor = d;
      aspect = a;
    }
  }
  const zonaEn = (tamano: TamanoIA) => {
    const [gw, gh] = RATIOS_IA[aspect][tamano];
    return { gw, gh, e: encajar(W, H, gw, gh) };
  };
  let tamano: TamanoIA = "1K";
  let z = zonaEn("1K");
  if (W / z.e.sw > TOLERANCIA_AGRANDAR || H / z.e.sh > TOLERANCIA_AGRANDAR) {
    tamano = "2K";
    z = zonaEn("2K");
  }
  const k = z.e.sw / W;
  const final = encajar(w0, h0, W, H, recortable);
  const ow = Math.max(1, Math.min(z.e.sw, Math.round(final.sw * k)));
  const oh = Math.max(1, Math.min(z.e.sh, Math.round(final.sh * k)));
  // Mismo lugar relativo que en la medida final (con recorte ya no está necesariamente centrado).
  const ox = Math.min(z.e.sw - ow, Math.round(final.ox * k));
  const oy = Math.min(z.e.sh - oh, Math.round(final.oy * k));
  return {
    aspect,
    tamano,
    gw: z.gw,
    gh: z.gh,
    zona: { x: z.e.ox, y: z.e.oy, w: z.e.sw, h: z.e.sh },
    original: { x: z.e.ox + ox, y: z.e.oy + oy, w: ow, h: oh },
    costoUsd: COSTO_IA_USD[tamano],
  };
}

/** Costo estimado de un lote: sólo los tamaños con IA cuestan; desenfoque y color son locales ($0). */
export function costoEstimado(w0: number, h0: number, tamanos: { w: number; h: number; modo: Modo }[]): number {
  const total = tamanos.filter((t) => t.modo === "ia").reduce((s, t) => s + lienzoIA(w0, h0, t.w, t.h).costoUsd, 0);
  return Math.round(total * 1000) / 1000;
}

// ── Pegado duro y verificación (bytes RGBA crudos, sin dependencias) ───────
/**
 * Copia el original escalado (RGBA crudo, sw×sh) sobre el lienzo (RGBA crudo, W×?) en (ox, oy), fila por
 * fila. Es el ÚLTIMO paso de cada tamaño: lo que haya hecho el relleno en esa zona queda sobrescrito.
 * (No se usa un modo de mezcla de sharp: `blend: "source"` vacía todo lo de afuera — lección 2026-10-02.)
 */
export function pegarDuro(lienzo: Uint8Array, W: number, original: Uint8Array, e: Pick<Encaje, "sw" | "sh" | "ox" | "oy">): void {
  const fila = e.sw * 4;
  if (original.length !== fila * e.sh) throw new Error("pegarDuro: el original no mide sw×sh×4");
  for (let y = 0; y < e.sh; y++) {
    lienzo.set(original.subarray(y * fila, (y + 1) * fila), ((e.oy + y) * W + e.ox) * 4);
  }
}

/** ¿La zona (ox, oy, sw, sh) del lienzo es idéntica, byte por byte, al original escalado? */
export function zonaIdentica(lienzo: Uint8Array, W: number, original: Uint8Array, e: Pick<Encaje, "sw" | "sh" | "ox" | "oy">): boolean {
  const fila = e.sw * 4;
  if (original.length !== fila * e.sh) return false;
  for (let y = 0; y < e.sh; y++) {
    const a = ((e.oy + y) * W + e.ox) * 4;
    if (a + fila > lienzo.length || !filasIguales(lienzo.subarray(a, a + fila), original.subarray(y * fila, (y + 1) * fila))) return false;
  }
  return true;
}

/** Comparación de una fila: Buffer.compare en Node (nativo); bucle en cualquier otro lado. */
function filasIguales(a: Uint8Array, b: Uint8Array): boolean {
  if (typeof Buffer !== "undefined") return Buffer.compare(a, b) === 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Deriva de la IA: error medio (0-255, sólo RGB) entre lo que la IA dejó en la zona del original y el
 *  original. Alto = la IA movió o redibujó el centro → la unión del pegado puede notarse. */
export function deriva(lienzo: Uint8Array, W: number, original: Uint8Array, e: Pick<Encaje, "sw" | "sh" | "ox" | "oy">): number {
  let suma = 0;
  let n = 0;
  for (let y = 0; y < e.sh; y++) {
    const a = ((e.oy + y) * W + e.ox) * 4;
    const b = y * e.sw * 4;
    for (let x = 0; x < e.sw; x++) {
      for (let c = 0; c < 3; c++) suma += Math.abs(lienzo[a + x * 4 + c] - original[b + x * 4 + c]);
      n += 3;
    }
  }
  return n ? Math.round((suma / n) * 10) / 10 : 0;
}
/** Por encima de esto, la tarjeta se marca "revisar unión". Se calibra con la prueba real. */
export const DERIVA_REVISAR = 18;

/** Color promedio del borde (2 px) del anuncio, en hex: el relleno "color" por omisión. */
export function colorDeBorde(rgba: Uint8Array, w: number, h: number, grosor = 2): string {
  let r = 0, g = 0, b = 0, n = 0;
  const g2 = Math.max(1, Math.min(grosor, Math.floor(Math.min(w, h) / 2)));
  for (let y = 0; y < h; y++) {
    const esBordeY = y < g2 || y >= h - g2;
    // Sólo las columnas del borde (o la fila entera si es fila de borde): sin recorrer el centro.
    for (let x = 0; x < w; x = esBordeY || x >= w - g2 ? x + 1 : x === g2 - 1 ? w - g2 : x + 1) {
      const i = (y * w + x) * 4;
      r += rgba[i];
      g += rgba[i + 1];
      b += rgba[i + 2];
      n++;
    }
  }
  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, "0");
  return n ? `#${hex(r)}${hex(g)}${hex(b)}` : "#000000";
}

// ── Bordes lisos (para recortar fondo vacío y para "extender") ─────────────
/** Lo que se sabe de los bordes del anuncio. `recortable` en px del ORIGINAL; `liso` = ese lado se puede
 *  continuar hacia afuera sin que se note (color plano o degradado suave). */
export type Bordes = { recortable: Lados; liso: Record<keyof Lados, boolean> };
export const BORDES_NINGUNO: Bordes = { recortable: SIN_RECORTE, liso: { top: false, right: false, bottom: false, left: false } };

/** Diferencia (suma RGBA) entre dos píxeles vecinos que ya cuenta como "borde de algo" (letra, logo, foto).
 *  En la copia chica (≤ 256 px) el ruido de JPEG y los degradados quedan muy por debajo. */
const SALTO = 30;
/** Saltos que todavía se toleran en una línea lisa: 1 por cada 200 px (mínimo 1). Cualquier cosa que toque la
 *  línea — una barra, un logo — deja DOS saltos (entra y sale), así que no pasa. Mejor no recortar de más:
 *  si un fondo no se reconoce como liso, sólo se pierde el ahorro (cae a IA/desenfoque), nunca contenido. */
const saltosTolerados = (largo: number) => Math.max(1, Math.floor(largo / 200));
/** De la franja lisa sólo se recorta esta fracción: el resto queda como aire alrededor del contenido. */
export const RECORTE_DE_LA_FRANJA = 0.7;
/** Mínimo de líneas lisas (en la copia chica) para continuar ese lado hacia afuera. */
const LINEAS_PARA_EXTENDER = 2;

/**
 * Mide, por lado, cuántas líneas seguidas desde el borde son FONDO LISO: casi sin saltos a lo largo de la
 * línea ni contra la línea anterior (así un degradado cuenta como liso, una letra o una foto no). Trabaja
 * sobre una copia chica (RGBA crudo `w × h`) y devuelve el recortable en px del original (`w0 × h0`).
 */
export function bordesDe(rgba: Uint8Array, w: number, h: number, w0: number, h0: number): Bordes {
  const salto = (i: number, j: number) =>
    Math.abs(rgba[i] - rgba[j]) + Math.abs(rgba[i + 1] - rgba[j + 1]) + Math.abs(rgba[i + 2] - rgba[j + 2]) + Math.abs(rgba[i + 3] - rgba[j + 3]);
  const px = (x: number, y: number) => (y * w + x) * 4;
  /** Profundidad lisa desde un lado: `largo` = píxeles por línea, `pos(k, t)` = el píxel t de la línea k
   *  (k = 0 es la del borde). */
  const profundidad = (lineas: number, largo: number, pos: (k: number, t: number) => number): number => {
    const tope = Math.floor(lineas * 0.45);
    for (let k = 0; k < tope; k++) {
      let saltos = 0;
      for (let t = 0; t < largo; t++) {
        const i = pos(k, t);
        if ((t + 1 < largo && salto(i, pos(k, t + 1)) > SALTO) || (k > 0 && salto(i, pos(k - 1, t)) > SALTO)) saltos++;
      }
      if (saltos > saltosTolerados(largo)) return k;
    }
    return tope;
  };
  const d = {
    top: profundidad(h, w, (k, t) => px(t, k)),
    bottom: profundidad(h, w, (k, t) => px(t, h - 1 - k)),
    left: profundidad(w, h, (k, t) => px(k, t)),
    right: profundidad(w, h, (k, t) => px(w - 1 - k, t)),
  };
  // A px del original, conservador: se descuenta una línea (la que ya tocaba el contenido) y se deja aire.
  const aOriginal = (lineas: number, chico: number, grande: number) => Math.floor(Math.max(0, lineas - 1) * (grande / chico) * RECORTE_DE_LA_FRANJA);
  return {
    recortable: { top: aOriginal(d.top, h, h0), right: aOriginal(d.right, w, w0), bottom: aOriginal(d.bottom, h, h0), left: aOriginal(d.left, w, w0) },
    liso: { top: d.top >= LINEAS_PARA_EXTENDER, right: d.right >= LINEAS_PARA_EXTENDER, bottom: d.bottom >= LINEAS_PARA_EXTENDER, left: d.left >= LINEAS_PARA_EXTENDER },
  };
}

// ── Pegar una lista de medidas ───────────────────────────────────────────
/**
 * Saca las medidas de un texto pegado tal cual viene del cliente: "9:16 (1080*1920)  1200*627 320x250 …".
 * Acepta x, ×, X o * como separador; las proporciones sueltas ("9:16") se ignoran (no dicen medida).
 * Devuelve las válidas sin repetir (en el orden en que vienen) y las que se salen de los límites.
 */
export function leerMedidas(texto: string): { medidas: { w: number; h: number }[]; fuera: string[] } {
  const medidas: { w: number; h: number }[] = [];
  const fuera: string[] = [];
  const vistas = new Set<string>();
  for (const m of texto.matchAll(/(\d{1,5})\s*[x×X*]\s*(\d{1,5})/g)) {
    const w = Number(m[1]);
    const h = Number(m[2]);
    const k = `${w}x${h}`;
    if (vistas.has(k)) continue;
    vistas.add(k);
    if (medidaValida(w, h)) medidas.push({ w, h });
    else fuera.push(`${w}×${h}`);
  }
  return { medidas, fuera };
}

export const HEX = /^#[0-9a-f]{6}$/i;

/** Nombre de archivo en el ZIP: sin acentos raros ni espacios. */
export const limpiarNombre = (base: string): string =>
  base.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "anuncio";

export function nombreArchivo(base: string, p: Pick<Preset, "plataforma" | "w" | "h">, ext: "png" | "jpg"): string {
  return `${limpiarNombre(base)}_${p.plataforma}_${p.w}x${p.h}.${ext}`;
}
