/**
 * HÜE Prisma › Formatos — acomodo: dónde va cada pieza de un maestro en una medida nueva (puro: sólo cajas y
 * números, sin píxeles; corre igual en Node y en el navegador).
 *
 * Los acomodos son los que el equipo de diseño ya eligió en su script de Photoshop (DiDi_Adaptations_V3.jsx):
 * en horizontales el texto va de un lado y el HERO del otro, con el pie abajo; en las muy anchas son tres zonas;
 * en los banners, una sola fila. Lo que cambia es CÓMO se mide: aquel script fijaba el ancho de cada carpeta y
 * nunca miraba el alto (en 640×100 el HERO salía de 131 px de alto), y medía la carpeta con todo y sombras.
 * Aquí cada pieza se ajusta por ancho Y alto de su parte sólida, y lo que aun así no quede bien se AVISA: una
 * pieza sin lugar, fuera de la medida, encimada o con letra chica nunca sale callada.
 *
 * El pie (FOOTER) lleva su PROPIA escala: lo más grande que quepa sin mover lo demás (regla de Pedro para el
 * legal). Si aun así la letra queda chica, la medida se marca para revisión; nunca se entrega sin avisar.
 */
import type { Caja, Rol } from "./psd.ts";
import { etiquetaPieza } from "./roles.ts";
import { medidaValida, mismaForma } from "./geometria.ts";

/** Lo que el acomodo necesita de una pieza (PiezaPsd lo cumple). `caja`: todo lo que pinta, con sombras (frena lo
 *  grande que se deja a mano). */
export type PiezaCaja = {
  nombre: string;
  rol: Rol | null;
  solido: Caja;
  caja?: Caja;
  letraMinPx?: number | null;
  partes?: readonly ParteCaja[];
  /** Sus capas de texto (sólo se cuentan: `Edicion.sinTexto` las nombra por su lugar). */
  textos?: readonly unknown[];
  /** Le cambiaron las letras en el editor y la tinta nueva se sale de su parte sólida de antes (`cambiarTextos`). */
  textoFuera?: boolean;
  /** Con letras cambiadas y TODOS sus textos vacíos (`PiezaCambiada.sinLetras`). */
  sinLetras?: boolean;
  /** Un texto cambiado que no se pudo escribir en esta pieza: por qué (`PiezaCambiada.textoSinEscribir`). */
  textoSinEscribir?: string;
};
/** Lo que necesita de una parte de una pieza (`PartePsd`). Sin `tapadaPor` no se sabe quién le tapa: su relleno se
 *  avisa siempre que la pieza se abre. */
export type ParteCaja = { nombre: string; solido: Caja; caja?: Caja; letraMinPx?: number | null; rellenoPct?: number; tapadaPor?: readonly number[] };
export type MaestroCaja = { nombre: string; w: number; h: number; piezas: PiezaCaja[] };

export type Familia = "igual" | "display" | "horizontal" | "ancho" | "banner";
/** Una pieza colocada: índice en `maestro.piezas`, su escala y la caja de su parte sólida en la medida final. Con
 *  `partes`, la pieza se abrió en el editor: se pinta parte por parte (en ese orden, de abajo hacia arriba), cada una en
 *  su lugar; si no, entera. Su escala y su lugar siguen siendo los de la pieza (sus partes van pegadas a ella). */
export type Puesta = {
  pieza: number;
  k: number;
  x: number;
  y: number;
  w: number;
  h: number;
  partes?: readonly PuestaParte[];
  /** Los textos de la pieza (índices en `pieza.textos`) que se quitaron en ESTA medida (`Edicion.sinTexto`). */
  sinTexto?: readonly number[];
};
/** Una parte colocada: índice en `pieza.partes`, su escala y la caja de su parte sólida en la medida final. `movida`: la
 *  persona la movió o la cambió de tamaño dentro de su pieza. */
export type PuestaParte = { parte: number; k: number; x: number; y: number; w: number; h: number; movida: boolean };
/** `contraste`, `copia` y `retoque` los pone `revisar.ts` (miran píxeles); los demás, el acomodo. */
export type AvisoAcomodo = { tipo: "fuera" | "encima" | "letra" | "falta" | "zona" | "forma" | "quitada" | "contraste" | "copia" | "retoque" | "relleno" | "texto" | "copiada"; texto: string };
export type Acomodo = {
  familia: Familia;
  /** De abajo hacia arriba: en el orden del maestro, o en el que eligió la persona (`aplicarEdicion`). */
  puestas: Puesta[];
  /** El fondo limpio: su escala y dónde cae su esquina (siempre cubre toda la medida). */
  fondo: { k: number; x: number; y: number };
  /** Con qué tamaño de letra queda el texto más chico de cada pieza que trae texto. */
  letras: { pieza: number; px: number }[];
  /** Lo que alguien tiene que mirar antes de entregar. Vacío = pasó todas las comprobaciones. */
  avisos: AvisoAcomodo[];
  /** Piezas que se quitaron A PROPÓSITO para que el texto que queda se lea (índices en `maestro.piezas`). */
  quitadas: number[];
  /** Alguien movió o cambió de tamaño piezas a mano (`aplicarEdicion`). */
  editada?: boolean;
  /** Lo editado se copió de otra medida (B25, `matriz.ts`): de cuál. */
  copiadaDe?: { w: number; h: number };
  /** Piezas con una sombra suave detrás para que se lean (arreglo de contraste, `revisar.ts` + `halo.ts`). */
  sombras?: readonly number[];
};
/** Dónde dejó la persona una pieza: la esquina de su parte sólida y su escala, en px de la medida. */
export type PosicionPieza = { x: number; y: number; k: number };
/** Dónde dejó la persona una parte, RELATIVO a su pieza (así va pegada a ella: Pedro, 2026-10-19, "Yes, parts stay
 *  attached"): la esquina de su parte sólida desde la de la pieza, en px del maestro (antes de la escala de la pieza), y
 *  su escala respecto a la pieza. Sin tocar: su lugar en el maestro y 1. */
export type PosicionParte = { x: number; y: number; k: number };
/**
 * Lo que la persona cambió a mano en una medida (Pedro, 2026-10-15: "an edit button that allows us to move and or
 * resize the elements"; 2026-10-19: "re arrenge layers to move whats on top of what"). `piezas`: por pieza (índice en
 * `maestro.piezas`), dónde quedó. `orden`: qué va encima de qué, índices de abajo hacia arriba (sólo si cambió).
 */
export type Edicion = Readonly<{
  piezas: Readonly<Record<number, PosicionPieza>>;
  orden?: readonly number[];
  /** Por pieza, por parte (índice en `pieza.partes`): dónde quedó, relativo a su pieza. */
  partes?: Readonly<Record<number, Readonly<Record<number, PosicionParte>>>>;
  /** Por pieza: qué parte va encima de cuál (índices, de abajo hacia arriba), sólo dentro de su pieza ("Only inside its
   *  piece"), y sólo si cambió. */
  ordenPartes?: Readonly<Record<number, readonly number[]>>;
  /** Por pieza: qué textos (índices en `pieza.textos`) se quitan en ESTA medida («Quitar en esta medida»; paso 3). Lo
   *  que dicen los textos es del anuncio entero (`cambios-texto.ts`); si se ven, de cada medida. */
  sinTexto?: Readonly<Record<number, readonly number[]>>;
  /** Copiada de otra medida (B25, `copiarEdicion`): de cuál. Si tiene otra forma que ésta, se revisa (se calcula
   *  con las dos medidas, no se guarda: lo guardado no puede quitar el aviso). */
  copiaDe?: Readonly<{ w: number; h: number }>;
}>;
export type Lado = "derecha" | "izquierda";
/** px de la medida final que la plataforma tapa por cada borde. */
export type Zona = { top: number; right: number; bottom: number; left: number };
export type OpcionesAcomodo = {
  /** De qué lado va el HERO donde hay columnas (`sePuedeVoltear`); en lo demás no cambia nada. El equipo lo pone a la derecha. */
  heroLado?: Lado;
  /** Zona segura. Las piezas que acomoda la herramienta la evitan (también en otra forma con el acomodo del diseñador:
   *  `anclarAlFondo`); en la forma del maestro el diseñador manda y lo que caiga en ella se avisa. */
  zona?: Zona;
};

// Criterio, no física: se afinan viendo anuncios reales.
/** Letra más chica que se da por legible. PROVISIONAL: falta el número del equipo de diseño. */
export const LETRA_MIN_PX = 10;
/** Hasta dónde se parece una medida a su maestro (|ln| de la razón de proporciones) para conservar su acomodo. */
export const PARECIDO_MAX = 0.25;
/** Donde el acomodo es nuevo (no el del maestro), el pie nunca se agranda más que esto respecto al maestro. */
export const PIE_ESCALA_MAX = 1.15;
/** Una zona segura que se come más de esto de un lado de la medida no es una zona: es un dato mal puesto. */
const ZONA_MAX = 0.75;
/** Para salir de la zona del canal, las piezas se achican hasta esto de su tamaño; si ni así, se dejan y se avisa. */
const ZONA_ACHICA_MAX = 0.6;
/**
 * Con canal, el fondo se agranda hasta esto más de lo que necesita para cubrir, para que el HERO quede sobre su
 * punto fuera de la franja que tapa la app (Pedro, 2026-10-14: "yes build the background zoom"). Medido con s33 en
 * 1080×1920: TikTok pide ×1.30, Stories ×1.46, Reels ×1.95. A ×1.95 la tarjeta se ve chiquita sobre un colchón
 * enorme y las nubes se borran (el título de nubes se pierde): Reels se queda sin zoom y su HERO no queda en su punto.
 */
export const FONDO_ZOOM_MAX = 1.5;
/** En una columna, ninguna pieza (botón, marca) pasa de esto × la escala del título. */
const SOBRE_TITULO_MAX = 1.3;
/** En los banners, hasta qué parte del alto de la fila llegan la marca y el botón (el resto, hasta todo el alto). */
const BANNER_TECHO: Partial<Record<Rol, number>> = { BRAND: 0.4, CTA: 0.55 };
/** Donde hay columnas, ninguna pieza de texto se agranda más que esto respecto al HERO (para que no se coma el anuncio). */
const TEXTO_SOBRE_HERO_MAX = 1.8;
/**
 * Medidas chicas: si alguna letra del texto no llega a LETRA_MIN_PX, se quita el subtítulo y lo que queda se agranda.
 * Se CONSERVA quitado sólo si de verdad agrandó el texto que se queda (en el acomodo del diseñador quitar no libera
 * nada: ahí no se quita). Lo que siga chico se marca.
 * El legal NUNCA se quita (Pedro, 2026-10-15: "legales can never be removed so always find a way to add it as close to
 * legible as possible"): si su letra no llega, su franja crece (PIE_MAS) mientras el resto del texto siga legible.
 */
export const QUITAR_EN_ORDEN: readonly Rol[] = ["SUBTITULO"];
/** Cuánto más alto se le prueba dar a la franja del legal cuando su letra no llega (× la franja de siempre). */
const PIE_MAS = [1.5, 2, 2.5];
/** En columnas, lo más que el lado del texto le quita al HERO para que la letra llegue al mínimo (el HERO queda en ~28 %). */
const CORTE_MAX = 0.7;
/** Cuántos tamaños de "más lugar al texto" se prueban entre el acomodo del equipo (0) y el máximo (1). */
const PASOS_TEXTO = 10;

const razon = (W: number, H: number, ma: { w: number; h: number }) => Math.abs(Math.log(W / H / (ma.w / ma.h)));

/** De varios maestros (mesas), el de forma más parecida a la medida. −1 si la lista viene vacía. */
export function elegirMaestro(maestros: { w: number; h: number }[], W: number, H: number): number {
  let mejor = maestros.length ? 0 : -1;
  for (let i = 1; i < maestros.length; i++) if (razon(W, H, maestros[i]) < razon(W, H, maestros[mejor])) mejor = i;
  return mejor;
}

export function familiaDe(W: number, H: number, ma: { w: number; h: number }): Familia {
  if (razon(W, H, ma) < PARECIDO_MAX) return "igual";
  const a = W / H;
  // Más alta que ancha y lejos de su maestro: no hay acomodo propio todavía, se conserva el del maestro (cada pieza
  // sobre su mismo lugar del fondo: `anclarAlFondo`).
  return a >= 4 ? "banner" : a >= 2.2 ? "ancho" : a >= 1.5 ? "horizontal" : a >= 1 ? "display" : "igual";
}

/** ¿En esta familia tiene sentido voltear el HERO de lado? */
export const sePuedeVoltear = (f: Familia): boolean => f === "display" || f === "horizontal" || f === "ancho";

/**
 * El nombre de entrega del equipo: el de la mesa, cambiando su medida ("_4x5_") por la nueva ("_1200x627_"). Si el
 * nombre trae varios "NxN" (una promo "2x1"), se cambia el que tiene la forma de la mesa.
 */
export function nombreSalida(ma: { nombre: string; w: number; h: number }, W: number, H: number): string {
  const fichas = [...ma.nombre.matchAll(/(^|_)(\d+)x(\d+)(?=_|$)/gi)];
  if (!fichas.length) return `${ma.nombre.replace(/_+$/, "")}_${W}x${H}`;
  const lejos = (f: RegExpMatchArray) => Math.abs(Math.log(Number(f[2]) / Number(f[3]) / (ma.w / ma.h)));
  const f = fichas.reduce((a, b) => (lejos(b) < lejos(a) ? b : a));
  const desde = (f.index ?? 0) + f[1].length;
  return `${ma.nombre.slice(0, desde)}${W}x${H}${ma.nombre.slice((f.index ?? 0) + f[0].length)}`;
}

/** Las 12 medidas que el equipo entrega hoy (las de su script de Photoshop): con ellas arranca la pantalla. */
export const MEDIDAS_EQUIPO = "1080×1920 720×1280 720×1600 1200×1500 768×1024 1280×720 1200×627 876×324 600×500 320×250 640×100 320×50";

/**
 * Zona segura POR CANAL, como guía (Pedro, 2026-10-14: "select a Channel and then it shows you"). Cada app tapa
 * franjas distintas, así que la guía siempre dice de cuál es y nadie la ve si no elige un canal. Sólo en 9:16: en
 * feed (4:5, 1:1) la imagen no se tapa y para 16:9 no hay un número fiable. Todas son APROXIMADAS:
 *   · Meta: lo que repiten las guías públicas (no se encontró una página oficial de Meta con estas cifras).
 *   · TikTok: las que dio Pedro en px sobre 1080×1920 ("top 150–200, right ~120, bottom 250–300"), tomando el
 *     extremo más seguro de cada rango.
 * `pct` = % del alto (arriba, abajo) o del ancho (derecha, izquierda) que la app tapa.
 */
const HISTORIA_META: Zona = { top: 14, right: 0, bottom: 20, left: 0 };
const REEL_META: Zona = { top: 14, right: 6, bottom: 35, left: 6 };
/** `px`: la cifra la dio el equipo en px de 1080×1920 (se enseña así); si no, viene de guías en % (aprox.). */
export const CANALES = {
  "ig-stories": { nombre: "Instagram Stories", pct: HISTORIA_META, px: false },
  "ig-reels": { nombre: "Instagram Reels", pct: REEL_META, px: false },
  "fb-stories": { nombre: "Facebook Stories", pct: HISTORIA_META, px: false },
  "fb-reels": { nombre: "Facebook Reels", pct: REEL_META, px: false },
  tiktok: { nombre: "TikTok", pct: { top: (200 / 1920) * 100, right: (120 / 1080) * 100, bottom: (300 / 1920) * 100, left: 0 }, px: true },
} as const satisfies Record<string, { nombre: string; pct: Zona; px: boolean }>;
export type Canal = keyof typeof CANALES;
export const esCanal = (v: unknown): v is Canal => typeof v === "string" && Object.hasOwn(CANALES, v);
/** 9:16 o una escala directa (1 % de holgura por el redondeo de las medidas). */
export const es916 = (W: number, H: number): boolean => W > 0 && H > 0 && Math.abs(W / H / (9 / 16) - 1) <= 0.01;

/** Lo que el canal tapa en esta medida, en px de la medida; null sin canal o si la medida no es 9:16. */
export function zonaCanal(canal: Canal | null, W: number, H: number): Zona | null {
  if (!esCanal(canal) || !es916(W, H)) return null;
  const p = CANALES[canal].pct;
  return { top: (H * p.top) / 100, right: (W * p.right) / 100, bottom: (H * p.bottom) / 100, left: (W * p.left) / 100 };
}

/**
 * Una medida completa: de qué mesa sale y su acomodo. Con zona (la del canal), en otra forma las piezas la evitan;
 * en la forma del maestro no se mueve nada y lo que caiga en ella se avisa.
 */
export function acomodarMedida(maestros: MaestroCaja[], W: number, H: number, op: OpcionesAcomodo = {}): { maestro: number; acomodo: Acomodo } {
  const maestro = elegirMaestro(maestros, W, H);
  if (maestro < 0) throw new Error("acomodarMedida: sin maestros");
  return { maestro, acomodo: acomodar(maestros[maestro], W, H, op) };
}

type Suelta = { i: number; p: PiezaCaja };
type Rect = { x0: number; x1: number; y0: number; y1: number };

/**
 * Varias piezas en columna dentro de una caja, centradas, a una sola escala; salvo la que a esa escala no cabe a lo
 * ancho: ésa se ajusta sola al ancho y el alto que suelta se reparte entre las demás (Pedro, 2026-10-15: en 600×500
 * una fila de logos muy ancha achicaba el título y el botón: "the cta has no need to be that small"). Ninguna pasa
 * de SOBRE_TITULO_MAX × la escala del título: el título sigue siendo lo más grande del texto.
 */
function columna(piezas: (Suelta | undefined)[], r: Rect, hueco: number, kTope: number): Puesta[] {
  const ps = piezas.filter((s): s is Suelta => !!s);
  if (!ps.length || r.x1 <= r.x0 || r.y1 <= r.y0) return [];
  const ancho = r.x1 - r.x0;
  const libre = Math.max(1, r.y1 - r.y0 - hueco * (ps.length - 1));
  // Las que no caben a lo ancho, con su escala propia; las demás comparten `k` con el alto que queda.
  const propias = new Map<number, number>();
  let k = 0;
  for (let n = 0; n <= ps.length; n++) {
    const juntas = ps.filter((s) => !propias.has(s.i));
    const usado = ps.reduce((t, s) => t + s.p.solido.h * (propias.get(s.i) ?? 0), 0);
    k = juntas.length ? Math.min(Math.max(0, libre - usado) / juntas.reduce((t, s) => t + s.p.solido.h, 0), kTope) : 0;
    const anchas = juntas.filter((s) => s.p.solido.w * k > ancho);
    if (!anchas.length) break;
    for (const s of anchas) propias.set(s.i, ancho / s.p.solido.w);
  }
  const titulo = ps.find((s) => s.p.rol === "TITULO");
  const kTitulo = titulo ? (propias.get(titulo.i) ?? k) * SOBRE_TITULO_MAX : Infinity;
  const escala = (s: Suelta) => Math.min(propias.get(s.i) ?? k, s === titulo ? Infinity : kTitulo);
  const alto = ps.reduce((t, s) => t + s.p.solido.h * escala(s), 0);
  // Si ni encogiendo caben con sus huecos, los huecos se cierran: primero que no se encimen.
  const sep = ps.length > 1 ? Math.min(hueco, Math.max(0, (r.y1 - r.y0 - alto) / (ps.length - 1))) : 0;
  let y = r.y0 + (r.y1 - r.y0 - alto - sep * (ps.length - 1)) / 2;
  return ps.map((s) => {
    const ks = escala(s), w = s.p.solido.w * ks, h = s.p.solido.h * ks;
    const puesta = { pieza: s.i, k: ks, x: r.x0 + (r.x1 - r.x0 - w) / 2, y, w, h };
    y += h + sep;
    return puesta;
  });
}

/** Una pieza que llena su caja, parada sobre el borde de abajo. */
function parada(s: Suelta | undefined, r: Rect): Puesta[] {
  if (!s || r.x1 <= r.x0 || r.y1 <= r.y0) return [];
  const k = Math.min((r.x1 - r.x0) / s.p.solido.w, (r.y1 - r.y0) / s.p.solido.h);
  const w = s.p.solido.w * k, h = s.p.solido.h * k;
  return [{ pieza: s.i, k, x: r.x0 + (r.x1 - r.x0 - w) / 2, y: r.y1 - h, w, h }];
}

/**
 * El acomodo del diseñador en otra forma (un 9:16 desde un 4:5). Las piezas se achican para caber enteras y el fondo
 * se agranda para llenar la medida: si se movieran juntas, el escenario se correría debajo de ellas (Pedro,
 * 2026-10-14: la tarjeta flotando, el botón y el legal encima del colchón; "they should look like the 1200x1500").
 * Por eso cada pieza va con su pie (el centro de abajo) sobre el MISMO punto del fondo que en el maestro.
 * Si así no caben en `r` (la medida, o lo que deja libre la zona del canal), en este orden:
 *   1. se juntan hacia `ref` (el pie del HERO), que se queda sobre su punto, hasta como las dejó el diseñador;
 *   2. con `zoom` (hay canal): el fondo se agranda lo MENOS posible (hasta FONDO_ZOOM_MAX) para que el HERO quepa
 *      sobre su punto, con las piezas del tamaño más grande que quepa fuera de la zona (achicadas si hace falta);
 *   3. si el HERO no cabe en su punto, el grupo se corre (y se junta lo necesario);
 *   4. si ni juntas caben, se achican todas por igual hasta ZONA_ACHICA_MAX;
 *   5. si ni así, el acomodo del diseñador centrado, y lo que caiga en la zona se avisa.
 * El fondo se corre con `ref` lo que le sobra (siempre cubre la medida).
 */
function anclarAlFondo(ps: Suelta[], k0: number, kb: number, r: Rect, ref: { x: number; y: number }, ma: { w: number; h: number }, W: number, H: number, zoom: boolean): { puestas: Puesta[]; fondo: Acomodo["fondo"] } {
  const d = ps.map(({ p }) => ({ dx: p.solido.x + p.solido.w / 2 - ref.x, dy: p.solido.y + p.solido.h - ref.y, w: p.solido.w, h: p.solido.h }));
  const cruce = (a: Rect | null, b: Rect): Rect | null => {
    if (!a) return null;
    const c = { x0: Math.max(a.x0, b.x0), x1: Math.min(a.x1, b.x1), y0: Math.max(a.y0, b.y0), y1: Math.min(a.y1, b.y1) };
    return c.x0 <= c.x1 + 1e-6 && c.y0 <= c.y1 + 1e-6 ? c : null;
  };
  // Dónde puede caer `ref` en la medida para que todas quepan en `r` con esta separación (s) y escala (k); null si en ningún lado.
  const rango = (s: number, k: number) => cruce(
    d.reduce<Rect>((a, v) => ({
      x0: Math.max(a.x0, r.x0 - s * v.dx + (k * v.w) / 2),
      x1: Math.min(a.x1, r.x1 - s * v.dx - (k * v.w) / 2),
      y0: Math.max(a.y0, r.y0 - s * v.dy + k * v.h),
      y1: Math.min(a.y1, r.y1 - s * v.dy),
    }), { x0: -Infinity, x1: Infinity, y0: -Infinity, y1: Infinity }),
    { x0: -Infinity, x1: Infinity, y0: -Infinity, y1: Infinity },
  );
  // Donde `ref` sigue sobre su punto con el fondo a escala z: el fondo se corre lo que le sobra y sigue cubriendo.
  const enSuPunto = (z: number): Rect => ({ x0: W - ma.w * z + z * ref.x, x1: z * ref.x, y0: H - ma.h * z + z * ref.y, y1: z * ref.y });
  const fijo = (t: number, kk = k0, z = kb) => cruce(rango(t, kk), enSuPunto(z));
  // El valor más grande entre lo y hi que todavía cumple (lo cumple, hi no).
  const mayor = (cumple: (t: number) => boolean, lo: number, hi: number) => {
    for (let n = 0; n < 30; n++) {
      const t = (lo + hi) / 2;
      if (cumple(t)) lo = t;
      else hi = t;
    }
    return lo;
  };
  // El valor más chico entre lo y hi que todavía cumple (hi cumple, lo no).
  const menor = (cumple: (t: number) => boolean, lo: number, hi: number) => {
    for (let n = 0; n < 30; n++) {
      const t = (lo + hi) / 2;
      if (cumple(t)) hi = t;
      else lo = t;
    }
    return hi;
  };
  const kMin = k0 * ZONA_ACHICA_MAX;
  // Lo más grande que caben las piezas juntas (como las dejó el diseñador) fuera de la zona; null si ni a kMin.
  const kCabe = rango(k0, k0) ? k0 : rango(kMin, kMin) ? mayor((t) => !!rango(t, t), kMin, k0) : null;
  const zMax = kb * FONDO_ZOOM_MAX;
  let s = kb, k = k0, z = kb, g = fijo(kb);
  if (!g && fijo(k0)) g = fijo((s = mayor((t) => !!fijo(t), k0, kb)));
  else if (!g && zoom && kCabe !== null && fijo(kCabe, kCabe, zMax)) {
    k = kCabe;
    z = menor((t) => !!fijo(k, k, t), kb, zMax);
    g = fijo((s = mayor((t) => !!fijo(t, k, z), k, z)), k, z);
  } else if (!g && rango(k0, k0)) g = rango((s = mayor((t) => !!rango(t, k0), k0, kb)), k0);
  else if (!g && kCabe !== null) g = rango((s = k = kCabe), k);
  else if (!g) s = k0;
  // `ref` sobre el fondo centrado (o, sin lugar posible, donde lo deja el acomodo del diseñador centrado), lo más cerca que se pueda.
  const ax = g ? (W - ma.w * z) / 2 + z * ref.x : (W - ma.w * k0) / 2 + k0 * ref.x;
  const ay = g ? (H - ma.h * z) / 2 + z * ref.y : (H - ma.h * k0) / 2 + k0 * ref.y;
  const X = g ? Math.max(g.x0, Math.min(g.x1, ax)) : ax, Y = g ? Math.max(g.y0, Math.min(g.y1, ay)) : ay;
  const puestas = ps.map(({ i, p }, n) => {
    const w = p.solido.w * k, h = p.solido.h * k;
    return { pieza: i, k, x: X + s * d[n].dx - w / 2, y: Y + s * d[n].dy - h, w, h };
  });
  return { puestas, fondo: { k: z, x: Math.min(0, Math.max(W - ma.w * z, X - z * ref.x)), y: Math.min(0, Math.max(H - ma.h * z, Y - z * ref.y)) } };
}

/** Espejo horizontal de un rectángulo dentro de [a0, a1]. */
const espejo = (r: Rect, a0: number, a1: number): Rect => ({ ...r, x0: a0 + a1 - r.x1, x1: a0 + a1 - r.x0 });

/** La letra más chica de las piezas `de` que siguen puestas (Infinity si ninguna trae texto medible). */
const letraDe = (a: Acomodo, de: (i: number) => boolean) => Math.min(Infinity, ...a.letras.filter((l) => de(l.pieza)).map((l) => l.px));

export function acomodar(ma: MaestroCaja, W: number, H: number, op: OpcionesAcomodo = {}): Acomodo {
  // El legal va en su propia franja (no gana nada con ensanchar el texto ni con quitar el subtítulo): se mide aparte.
  const texto = (i: number) => ma.piezas[i]?.rol !== "FOOTER";
  const delPie = (x: Acomodo) => letraDe(x, (i) => !texto(i));
  // Con estas piezas fuera: el acomodo del equipo y, si la letra no llega, el lado del texto se ensancha (a costa
  // del HERO) sólo lo necesario. Si ni al máximo llega, el que deja la letra más grande.
  const ensanchar = (quitar: Set<number>, pie = 1): Acomodo => {
    let mejor = acomodarSin(ma, W, H, op, quitar, 0, pie);
    if (mejor.familia === "igual") return mejor;
    for (let n = 1; n <= PASOS_TEXTO && letraDe(mejor, texto) < LETRA_MIN_PX; n++) {
      const a = acomodarSin(ma, W, H, op, quitar, n / PASOS_TEXTO, pie);
      if (letraDe(a, texto) > letraDe(mejor, texto) + 0.05) mejor = a;
    }
    return mejor;
  };
  let a = ensanchar(new Set());
  for (const rol of QUITAR_EN_ORDEN) {
    if (!(letraDe(a, texto) < LETRA_MIN_PX)) break;
    const i = a.puestas.find((q) => ma.piezas[q.pieza].rol === rol)?.pieza;
    if (i === undefined) continue;
    if (a.familia === "igual") break; // el acomodo del diseñador no se toca: lo chico se marca, no se quita
    const quitar = new Set([...a.quitadas, i]);
    const prueba = ensanchar(quitar);
    // Se quita si ELLA no se lee, o si quitarla agranda lo que se queda. Nunca si lo que se queda acaba bajo el
    // mínimo por quitarla (que baje un poco sin pasar del mínimo está bien: se ensancha sólo lo necesario).
    const queda = (k: number) => !quitar.has(k) && texto(k);
    const suya = a.letras.find((l) => l.pieza === i)?.px ?? Infinity;
    const antes = letraDe(a, queda), despues = letraDe(prueba, queda);
    if (despues >= Math.min(antes, LETRA_MIN_PX) - 0.05 && (suya < LETRA_MIN_PX || despues > antes + 0.05)) a = prueba;
  }
  // El legal se queda siempre; si su letra no llega, se prueba una franja más alta, sin dejar el resto del texto
  // más chico que el mínimo (o que como ya estaba, si ya no llegaba).
  if (a.familia !== "igual" && delPie(a) < LETRA_MIN_PX) {
    const piso = Math.min(LETRA_MIN_PX, letraDe(a, texto)) - 0.05;
    let mejor = a;
    for (const pie of PIE_MAS) {
      const b = ensanchar(new Set(a.quitadas), pie);
      if (letraDe(b, texto) >= piso && delPie(b) > delPie(mejor) + 0.05) mejor = b;
    }
    a = mejor;
  }
  return a;
}

/** `texto` (0-1): cuánto lugar de más se le da al texto. 0 = el acomodo del equipo, tal cual. `pie`: × la franja del legal. */
function acomodarSin(ma: MaestroCaja, W: number, H: number, op: OpcionesAcomodo, quitar: Set<number>, texto: number, pie = 1): Acomodo {
  if (![ma.w, ma.h, W, H].every((v) => Number.isFinite(v) && v > 0)) throw new Error("acomodar: medidas inválidas");
  const familia = familiaDe(W, H, ma);
  const { zona, aviso } = zonaUsable(op.zona, W, H);
  const avisos: AvisoAcomodo[] = aviso ? [aviso] : [];
  const de = (rol: Rol): Suelta | undefined => {
    const i = ma.piezas.findIndex((p, k) => p.rol === rol && valida(p) && !quitar.has(k));
    return i < 0 ? undefined : { i, p: ma.piezas[i] };
  };
  const m = Math.round(Math.min(H * 0.07, W * 0.045));
  const hueco = Math.round(H * 0.035);
  // El área útil: la medida menos la zona segura y un margen.
  const area: Rect = { x0: zona.left + m, x1: W - zona.right - m, y0: zona.top + m, y1: H - zona.bottom - Math.round(m * 0.6) };
  const pieF = de("FOOTER");
  let puestas: Puesta[] = [];
  const kb = Math.max(W / ma.w, H / ma.h);
  /** En «igual» el fondo se decide antes que las piezas (ellas se anclan a él); en lo demás, después (sigue al HERO). */
  let fondoAntes: Acomodo["fondo"] | null = null;

  if (familia === "igual") {
    // El acomodo del diseñador a escala pareja, cada pieza sobre su lugar del fondo (`anclarAlFondo`).
    const k = Math.min(W / ma.w, H / ma.h);
    const sueltas = ma.piezas.flatMap((p, i) => (valida(p) && !quitar.has(i) ? [{ i, p }] : []));
    const heroS = de("HERO");
    const ref = heroS
      ? { x: heroS.p.solido.x + heroS.p.solido.w / 2, y: heroS.p.solido.y + heroS.p.solido.h }
      : { x: ma.w / 2, y: ma.h / 2 };
    // La zona del canal mueve piezas sólo en otra forma; en la del maestro el diseñador manda (se avisa abajo).
    const otraForma = razon(W, H, ma) >= PARECIDO_MAX;
    const lado = (z: number) => (otraForma && z > 0 ? z + m : 0);
    const libre: Rect = { x0: lado(zona.left), x1: W - lado(zona.right), y0: lado(zona.top), y1: H - lado(zona.bottom) };
    const conZona = otraForma && (zona.top > 0 || zona.right > 0 || zona.bottom > 0 || zona.left > 0);
    ({ puestas, fondo: fondoAntes } = anclarAlFondo(sueltas, k, kb, libre, ref, ma, W, H, conZona));
    // El pie recupera lo que la reducción le quitó: crece sobre su mismo borde de abajo y su mismo centro, hasta el
    // ancho útil, y nunca más grande de como lo dejó el diseñador (a la medida del maestro no se mueve nada: el
    // original es intocable). Tampoco se arrima a otra pieza: se prueba cada tamaño contra TODAS, no sólo la de arriba.
    const pf = pieF && puestas.find((q) => q.pieza === pieF.i);
    if (pf && pieF) {
      const abajo = pf.y + pf.h, centro = pf.x + pf.w / 2, aire = hueco * 0.5;
      const crecido = (kf: number) => {
        const w = pieF.p.solido.w * kf, h = pieF.p.solido.h * kf;
        return { k: kf, w, h, x: Math.max(area.x0, Math.min(centro - w / 2, area.x1 - w)), y: abajo - h };
      };
      const choca = (r: { x: number; y: number; w: number; h: number }) => puestas.some((q) => q !== pf && q.x < r.x + r.w + aire && q.x + q.w > r.x - aire && q.y < r.y + r.h && q.y + q.h > r.y - aire);
      let lo = k, hi = Math.min((area.x1 - area.x0) / pieF.p.solido.w, 1);
      // Si ya viene pegado a otra pieza (así lo quiso el diseñador), ningún tamaño mayor pasa la prueba y se queda igual.
      if (hi > lo) {
        if (!choca(crecido(hi))) lo = hi;
        else
          for (let n = 0; n < 20; n++) {
            const medio = (lo + hi) / 2;
            if (choca(crecido(medio))) hi = medio;
            else lo = medio;
          }
        if (lo > k) Object.assign(pf, crecido(lo));
      }
    }
  } else {
    // Pie: lo más grande que quepa a lo ancho, sin pasar de una franja del alto.
    const tope = (familia === "banner" ? 0.24 : familia === "ancho" ? 0.15 : 0.12) * pie;
    let franja: Puesta[] = [];
    let arriba = area.y1;
    if (pieF) {
      const k = Math.min((area.x1 - area.x0) / pieF.p.solido.w, (H * tope) / pieF.p.solido.h, PIE_ESCALA_MAX);
      const w = pieF.p.solido.w * k, h = pieF.p.solido.h * k;
      franja = [{ pieza: pieF.i, k, x: area.x0 + (area.x1 - area.x0 - w) / 2, y: area.y1 - h, w, h }];
      arriba = area.y1 - h - Math.round(familia === "banner" ? H * 0.05 : m * 0.7);
    }
    const cuerpo: Rect = { x0: area.x0, x1: area.x1, y0: familia === "banner" ? zona.top + Math.round(H * 0.06) : area.y0, y1: arriba };
    const ancho = cuerpo.x1 - cuerpo.x0;
    const voltear = op.heroLado === "izquierda";
    const zonaX = (a: number, b: number): Rect => {
      const r: Rect = { ...cuerpo, x0: cuerpo.x0 + ancho * a, x1: cuerpo.x0 + ancho * b };
      return voltear ? espejo(r, cuerpo.x0, cuerpo.x1) : r;
    };
    if (familia === "banner") {
      // Una sola fila: marca · título · beneficios · hero · botón. Las celdas se reparten entre las piezas que SÍ
      // están: una que falta (o que se quitó) no deja un hueco, le da su lugar a las demás.
      // Con `texto`, las celdas de texto (título, beneficios, botón) crecen con lo que les cede el HERO (hasta
      // quedarse con un tercio de su celda). La marca conserva exactamente la suya.
      const crudas = ([["BRAND", 0.13], ["TITULO", 0.27], ["SUBTITULO", 0.19], ["HERO", 0.21], ["CTA", 0.14]] as [Rol, number][]).flatMap(([rol, frac]) => {
        const s = de(rol);
        return s ? [{ s, rol, frac }] : [];
      });
      const deTexto = (r: Rol) => r === "TITULO" || r === "SUBTITULO" || r === "CTA";
      const textoF = crudas.reduce((t, c) => t + (deTexto(c.rol) ? c.frac : 0), 0);
      const heroF = crudas.find((c) => c.rol === "HERO")?.frac ?? 0;
      const cede = Math.min(textoF * texto, (heroF * 2) / 3);
      const celdas = crudas.map((c) => ({ s: c.s, frac: deTexto(c.rol) ? c.frac * (1 + cede / textoF) : c.rol === "HERO" ? c.frac - cede : c.frac }));
      const total = celdas.reduce((t, c) => t + c.frac, 0);
      const altoF = cuerpo.y1 - cuerpo.y0;
      const kDe = (s: Suelta, cw: number) => Math.min((cw * 0.9) / s.p.solido.w, (altoF * (BANNER_TECHO[s.p.rol as Rol] ?? 1)) / s.p.solido.h);
      // El ancho que una pieza no usa (llegó a su alto antes que al ancho de su celda) pasa a las que se quedan cortas
      // de ancho (Pedro, 2026-10-15: en 640×100 la fila de logos salía de 12 px de alto junto a celdas medio vacías).
      let cws = celdas.map((c) => (ancho * c.frac) / total);
      for (let n = 0; n < celdas.length; n++) {
        const pide = celdas.map((c, i) => (c.s.p.solido.w * kDe(c.s, cws[i])) / 0.9);
        const sobra = cws.reduce((t, cw, i) => t + Math.max(0, cw - pide[i]), 0);
        const cortas = new Set(celdas.flatMap((_, i) => (pide[i] >= cws[i] - 0.5 ? [i] : [])));
        if (sobra < 1 || !cortas.size) break;
        const fr = celdas.reduce((t, c, i) => t + (cortas.has(i) ? c.frac : 0), 0);
        cws = cws.map((cw, i) => (cortas.has(i) ? cw + (sobra * celdas[i].frac) / fr : Math.min(cw, pide[i])));
      }
      let x = cuerpo.x0;
      celdas.forEach(({ s }, i) => {
        const cw = cws[i];
        if (altoF > 0) {
          const k = kDe(s, cw);
          const w = s.p.solido.w * k, h = s.p.solido.h * k;
          puestas.push({ pieza: s.i, k, x: x + (cw - w) / 2, y: cuerpo.y0 + (altoF - h) / 2, w, h });
        }
        x += cw;
      });
    } else if (familia === "ancho") {
      // Tres zonas: texto · beneficios · hero.
      // Con `texto`, el HERO arranca más a la derecha y las dos zonas de texto se estiran en la misma proporción.
      const h0 = 0.66 + texto * (0.8 - 0.66), e = h0 / 0.66;
      const hero = parada(de("HERO"), zonaX(h0, 1));
      // El tope "texto ≤ 1.8 × HERO" cuida la proporción del equipo; cuando la letra no llega, manda la letra.
      const kTope = texto > 0 ? Infinity : (hero[0]?.k ?? 1) * TEXTO_SOBRE_HERO_MAX;
      puestas = [...hero, ...columna([de("BRAND"), de("TITULO"), de("CTA")], zonaX(0, 0.4 * e), hueco, kTope), ...columna([de("SUBTITULO")], zonaX(0.43 * e, 0.63 * e), hueco, kTope)];
    } else {
      // horizontal / display: dos columnas, texto de un lado y hero del otro.
      const base = familia === "display" ? 0.53 : 0.51, corte = base + texto * (CORTE_MAX - base);
      const hero = parada(de("HERO"), zonaX(corte + 0.02, 1));
      puestas = [...hero, ...columna([de("BRAND"), de("TITULO"), de("SUBTITULO"), de("CTA")], zonaX(0, corte - 0.02), hueco, texto > 0 ? Infinity : (hero[0]?.k ?? 1) * TEXTO_SOBRE_HERO_MAX)];
    }
    puestas.push(...franja);
    puestas.sort((a, b) => a.pieza - b.pieza);
  }

  // Fondo: llena la medida; el punto del piso bajo el HERO se queda bajo el HERO.
  const heroS = de("HERO"), heroP = heroS && puestas.find((q) => q.pieza === heroS.i);
  let fx = (W - ma.w * kb) / 2, fy = (H - ma.h * kb) / 2;
  if (heroS && heroP) {
    fx = heroP.x + heroP.w / 2 - (heroS.p.solido.x + heroS.p.solido.w / 2) * kb;
    fy = heroP.y + heroP.h - (heroS.p.solido.y + heroS.p.solido.h) * kb;
  }
  const fondo = fondoAntes ?? { k: kb, x: Math.min(0, Math.max(W - ma.w * kb, fx)), y: Math.min(0, Math.max(H - ma.h * kb, fy)) };

  const revision = comprobar(ma, W, H, familia, puestas, quitar, zona);
  return { familia, puestas, fondo, letras: revision.letras, avisos: [...avisos, ...revision.avisos], quitadas: [...quitar].sort((x, y) => x - y) };
}

const valida = (p: PiezaCaja) => [p.solido.x, p.solido.y, p.solido.w, p.solido.h].every(Number.isFinite) && p.solido.w > 0 && p.solido.h > 0;

/** La zona del canal con números de verdad; si se come más de ZONA_MAX de un lado, no se usa y se avisa. */
function zonaUsable(z: Partial<Zona> | undefined, W: number, H: number): { zona: Zona; aviso: AvisoAcomodo | null } {
  const borde = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
  const zona = { top: borde(z?.top), right: borde(z?.right), bottom: borde(z?.bottom), left: borde(z?.left) };
  if (zona.left + zona.right > W * ZONA_MAX || zona.top + zona.bottom > H * ZONA_MAX)
    return { zona: { top: 0, right: 0, bottom: 0, left: 0 }, aviso: { tipo: "zona", texto: "La zona segura no deja espacio en esta medida: se acomodó sin ella. Revisar." } };
  return { zona, aviso: null };
}

/**
 * Lo que revisa la guía de diseño (sección 4), lo que se puede medir, sobre unas piezas ya puestas. `aMano`: las que
 * puso una persona (`aplicarEdicion`). Si encimó una de ésas, lo decidió a la vista y no se avisa; dos que no tocó se
 * revisan igual. Tampoco se avisa de la forma: alguien ya revisó esta medida. `vistas(a, b)`: si la persona vio esas
 * dos piezas juntas así (por omisión, si movió una de ellas AQUÍ; en una copia, ver `aplicarEdicion`).
 */
function comprobar(ma: MaestroCaja, W: number, H: number, familia: Familia, puestas: Puesta[], quitar: ReadonlySet<number>, zona: Zona, aMano: ReadonlySet<number> = new Set(), vistas: (a: number, b: number) => boolean = (a, b) => aMano.has(a) || aMano.has(b)): { avisos: AvisoAcomodo[]; letras: Acomodo["letras"] } {
  const avisos: AvisoAcomodo[] = [];
  const nom = (q: Puesta) => etiquetaPieza(ma.piezas[q.pieza]);
  if (!aMano.size && familia === "igual" && razon(W, H, ma) >= PARECIDO_MAX) avisos.push({ tipo: "forma", texto: "Esta proporción todavía no tiene acomodo propio: se usó el del maestro, más chico, con cada pieza sobre su mismo lugar del fondo. Revisar." });
  ma.piezas.forEach((p, i) => {
    if (puestas.some((q) => q.pieza === i)) return;
    const n = etiquetaPieza(p);
    if (quitar.has(i))
      return void avisos.push({ tipo: "quitada", texto: `Se quitó ${n} para que el resto se lea.` });
    const duplicada = p.rol !== null && puestas.some((q) => ma.piezas[q.pieza].rol === p.rol);
    avisos.push({ tipo: "falta", texto: !valida(p) ? `${n} trae una caja vacía o inválida: no se colocó.` : duplicada ? `Hay más de una carpeta ${n}: sólo se colocó una. Revisar.` : `${n} no entra en este acomodo: revisar.` });
  });
  // Una pieza abierta en partes se revisa parte por parte (cada una está donde la dejó la persona).
  const cajas = (q: Puesta) => {
    const p = ma.piezas[q.pieza];
    const partes = q.partes;
    if (!partes?.length || !p.partes) return [{ c: q, n: nom(q), l: p.letraMinPx, relleno: 0 }];
    // Lo rellenado de una parte sólo se ve si ella o una de las que le tapaban se movió, o si una de ésas quedó debajo.
    const seVe = (pos: number, d: ParteCaja) =>
      partes[pos].movida ||
      d.tapadaPor === undefined ||
      d.tapadaPor.some((t) => {
        const o = partes.findIndex((x) => x.parte === t);
        return o >= 0 && (partes[o].movida || o < pos);
      });
    return partes.flatMap((pp, pos) => {
      const d = p.partes?.[pp.parte];
      return d ? [{ c: pp, n: `${nom(q)} › «${d.nombre}»`, l: d.letraMinPx, relleno: seVe(pos, d) ? (d.rellenoPct ?? 0) : 0 }] : [];
    });
  };
  for (const q of puestas) {
    const p = ma.piezas[q.pieza], nT = p.textos?.length ?? 0, quitados = new Set(q.sinTexto ?? []).size;
    // Sin ninguno de sus textos en esta medida, lo que pase con sus letras nuevas aquí no se ve.
    const todosQuitados = nT > 0 && quitados >= nT;
    if (p.textoSinEscribir && !todosQuitados) avisos.push({ tipo: "texto", texto: `${nom(q)}: el texto cambiado no se pudo escribir aquí (${p.textoSinEscribir}); va el del PSD.` });
    if (p.textoFuera && !todosQuitados) avisos.push({ tipo: "texto", texto: `${nom(q)}: el texto nuevo se sale de su pieza. Revisar que se vea bien.` });
    // El legal es obligatorio (la página nunca lo quita sola): si la persona le quitó su texto aquí, se dice.
    if (quitados && p.rol === "FOOTER") avisos.push({ tipo: "texto", texto: `${nom(q)}: se quitó ${todosQuitados ? "su texto" : "uno de sus textos"} en esta medida. El legal es obligatorio: revisar.` });
    else if (p.sinLetras && p.rol === "FOOTER") avisos.push({ tipo: "texto", texto: `${nom(q)}: su texto quedó vacío en todas las medidas. El legal es obligatorio: revisar.` });
  }
  for (const q of puestas)
    for (const { c, n, relleno } of cajas(q)) {
      if (!(c.x >= -0.5 && c.y >= -0.5 && c.x + c.w <= W + 0.5 && c.y + c.h <= H + 0.5)) avisos.push({ tipo: "fuera", texto: `${n} se sale de la medida.` });
      else if (c.x < zona.left - 0.5 || c.y < zona.top - 0.5 || c.x + c.w > W - zona.right + 0.5 || c.y + c.h > H - zona.bottom + 0.5) avisos.push({ tipo: "zona", texto: `${n} entra en la zona que tapa la plataforma.` });
      // Lo que otra parte de la pieza le tapaba ahora se puede ver ("Fill and warn").
      if (relleno > RELLENO_AVISO_PCT) avisos.push({ tipo: "relleno", texto: `${n}: lo que otra parte le tapaba (${relleno.toFixed(1)} %) se rellenó con el color de alrededor. Revisar que se vea bien.` });
    }
  // En "igual" las cajas se enciman por diseño (los beneficios van junto a la persona): ahí no se revisa.
  if (familia !== "igual")
    for (let i = 0; i < puestas.length; i++)
      for (let j = i + 1; j < puestas.length; j++) {
        const a = puestas[i], b = puestas[j];
        if (vistas(a.pieza, b.pieza)) continue;
        if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 2 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 2) avisos.push({ tipo: "encima", texto: `${nom(a)} y ${nom(b)} se enciman.` });
      }
  const letras: Acomodo["letras"] = [];
  for (const q of puestas) {
    // Sin ninguno de sus textos en esta medida (quitados a mano), no hay letra que medir.
    const nT = ma.piezas[q.pieza].textos?.length ?? 0;
    if (nT > 0 && new Set(q.sinTexto ?? []).size >= nT) continue;
    const conLetra = cajas(q).filter((x) => typeof x.l === "number" && x.l > 0);
    if (!conLetra.length) {
      // El legal nunca sale chico sin avisar: si su letra no se puede medir (texto aplanado), se avisa al reducirlo.
      const k = Math.min(q.k, ...(q.partes ?? []).map((pp) => pp.k));
      if (ma.piezas[q.pieza].rol === "FOOTER" && k < 0.995) avisos.push({ tipo: "letra", texto: `${nom(q)}: no se pudo medir su letra (texto aplanado) y queda al ${Math.round(k * 100)} % de su tamaño. Revisar.` });
      continue;
    }
    for (const { c, n, l } of conLetra) {
      const px = (l as number) * c.k;
      letras.push({ pieza: q.pieza, px });
      if (px < LETRA_MIN_PX) avisos.push({ tipo: "letra", texto: `${n}: la letra queda de ${px.toFixed(1)} px (mínimo ${LETRA_MIN_PX}).` });
    }
  }
  return { avisos, letras };
}

/** Lo más chica que se deja una pieza a mano (px de su lado corto): más chica ya no se ve ni se agarra. */
export const PIEZA_MIN_PX = 6;
/** Una parte abierta con más de esto (%) de relleno donde otra parte le tapaba se avisa (como una pieza tapada). */
export const RELLENO_AVISO_PCT = 2;

/** La escala más chica y más grande que se deja a mano: ni invisible (su parte sólida, `s`) ni mucho más grande que la
 *  medida (tampoco su `caja` con sombras: cada capa del PSD de la medida mide lo que ella). */
export function topesPieza(s: { w: number; h: number }, W: number, H: number, caja?: { w: number; h: number }): { min: number; max: number } {
  return { min: PIEZA_MIN_PX / Math.min(s.w, s.h), max: (2 * Math.max(W, H)) / Math.max(s.w, s.h, caja?.w ?? 0, caja?.h ?? 0) };
}

/**
 * Una edición guardada (lo que se leyó del navegador, sin confiar en nada) para un maestro de `nPiezas` piezas; null si
 * no queda nada que sirva. Lee también lo guardado antes del orden de capas (2026-10-19: sólo los lugares, sin
 * `piezas`). Un lugar con números que no sirven se salta; un orden con algo raro (índice fuera o repetido) no se
 * adivina: se descarta entero, con un aviso en la consola.
 */
export function leerEdicion(v: unknown, piezasDe: number | readonly { partes?: readonly unknown[]; textos?: readonly unknown[] }[]): Edicion | null {
  if (!v || typeof v !== "object") return null;
  const nPiezas = typeof piezasDe === "number" ? piezasDe : piezasDe.length;
  const nPartes = (i: number) => (typeof piezasDe === "number" ? 0 : (piezasDe[i]?.partes?.length ?? 0));
  const nTextos = (i: number) => (typeof piezasDe === "number" ? 0 : (piezasDe[i]?.textos?.length ?? 0));
  const guardada = v as { piezas?: unknown; orden?: unknown; partes?: unknown; ordenPartes?: unknown; sinTexto?: unknown; copiaDe?: unknown };
  const lugares = (guardada.piezas && typeof guardada.piezas === "object" ? guardada.piezas : guardada) as Record<string, unknown>;
  const indice = (n: unknown, hasta: number): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < hasta;
  const valida = (n: unknown): n is number => indice(n, nPiezas);
  const lugar = (p: unknown): PosicionPieza | null => {
    if (!p || typeof p !== "object") return null;
    const { x, y, k } = p as Partial<PosicionPieza>;
    return typeof x === "number" && typeof y === "number" && typeof k === "number" && [x, y, k].every(Number.isFinite) && k > 0 ? { x, y, k } : null;
  };
  /** Un orden sin nada raro (índices de 0 a `hasta`, sin repetir); con algo raro no se adivina: se descarta, con aviso. */
  const ordenValido = (o: unknown, hasta: number, que: string): number[] | undefined => {
    if (!Array.isArray(o) || !o.length) return undefined;
    if (o.every((n) => indice(n, hasta)) && new Set(o).size === o.length) return o;
    console.warn(`[acomodo] ${que} guardado con índices que no sirven: se usa el automático`, o);
    return undefined;
  };
  const piezas: Record<number, PosicionPieza> = {};
  for (const [i, p] of Object.entries(lugares)) {
    const n = Number(i), l = lugar(p);
    if (valida(n) && l) piezas[n] = l;
  }
  const orden = ordenValido(guardada.orden, nPiezas, "orden de capas");
  const partes: Record<number, Record<number, PosicionParte>> = {};
  const ordenPartes: Record<number, number[]> = {};
  if (guardada.partes && typeof guardada.partes === "object")
    for (const [i, porParte] of Object.entries(guardada.partes as Record<string, unknown>)) {
      const n = Number(i);
      if (!valida(n) || !porParte || typeof porParte !== "object") continue;
      for (const [j, p] of Object.entries(porParte as Record<string, unknown>)) {
        const m = Number(j), l = lugar(p);
        if (indice(m, nPartes(n)) && l) (partes[n] ??= {})[m] = l;
      }
    }
  if (guardada.ordenPartes && typeof guardada.ordenPartes === "object")
    for (const [i, o] of Object.entries(guardada.ordenPartes as Record<string, unknown>)) {
      const n = Number(i), op = valida(n) ? ordenValido(o, nPartes(n), "orden de las partes") : undefined;
      if (op) ordenPartes[n] = op;
    }
  // Los textos quitados: índices de textos que existen, sin repetir (uno raro se salta; no hay orden que adivinar).
  const sinTexto: Record<number, number[]> = {};
  if (guardada.sinTexto && typeof guardada.sinTexto === "object")
    for (const [i, o] of Object.entries(guardada.sinTexto as Record<string, unknown>)) {
      const n = Number(i);
      if (!valida(n) || !Array.isArray(o)) continue;
      const t = [...new Set(o.filter((x) => indice(x, nTextos(n))))];
      if (t.length) sinTexto[n] = t;
    }
  const hay = (r: object) => Object.keys(r).length > 0;
  if (!hay(piezas) && !orden && !hay(partes) && !hay(ordenPartes) && !hay(sinTexto)) return null;
  // De qué medida se copió (B25): una medida de verdad (la que acepta la lista de medidas), o nada.
  const c = guardada.copiaDe as { w?: unknown; h?: unknown } | null | undefined;
  const copiaDe = c && typeof c === "object" && typeof c.w === "number" && typeof c.h === "number" && medidaValida(c.w, c.h) ? { w: c.w, h: c.h } : undefined;
  return { piezas, orden, ...(hay(partes) ? { partes } : {}), ...(hay(ordenPartes) ? { ordenPartes } : {}), ...(hay(sinTexto) ? { sinTexto } : {}), ...(copiaDe ? { copiaDe } : {}) };
}

/**
 * Las piezas puestas en el orden que eligió la persona (de abajo hacia arriba). Las que `orden` nombra se reparten en
 * los lugares que ya ocupaban ellas; las que no nombra (una que el automático puso después de guardar) se quedan en el
 * suyo. Un índice repetido cuenta una vez. Mismo arreglo si no cambia nada.
 */
export function ordenarPuestas(puestas: Puesta[], orden: readonly number[] | undefined): Puesta[] {
  return ordenarPor(puestas, (q) => q.pieza, orden);
}

/** `ordenarPuestas` para cualquier lista con índices (también las partes de una pieza). */
function ordenarPor<T>(lista: T[], indice: (x: T) => number, orden: readonly number[] | undefined): T[] {
  if (!orden?.length) return lista;
  const rango = new Map<number, number>();
  for (const p of orden) if (!rango.has(p)) rango.set(p, rango.size);
  const nombradas = lista.filter((q) => rango.has(indice(q))).sort((x, y) => rango.get(indice(x))! - rango.get(indice(y))!);
  let i = 0;
  const out = lista.map((q) => (rango.has(indice(q)) ? nombradas[i++] : q));
  return out.every((q, j) => q === lista[j]) ? lista : out;
}

/** Lo que se pinta de una puesta, de abajo hacia arriba, y dónde: la pieza entera o, si se abrió, cada parte en su
 *  lugar. Todo lo que pinta o mira píxeles (tarjeta, PNG, los dos PSD, contraste, texto reescrito) pasa por aquí. */
export type Dibujo<D> = { d: D; parte: number | null; k: number; x: number; y: number; w: number; h: number };
export function dibujosDe<D extends { solido: Caja }, E extends { solido: Caja }>(p: D & { partes?: readonly E[] }, q: Puesta): Dibujo<D | E>[] {
  if (!q.partes?.length || !p.partes) return [{ d: p, parte: null, k: q.k, x: q.x, y: q.y, w: q.w, h: q.h }];
  return q.partes.flatMap((pp) => {
    const d = p.partes?.[pp.parte];
    return d ? [{ d, ...pp }] : [];
  });
}

/** Dónde queda una parte sin tocar, relativo a su pieza: su lugar en el maestro, a la escala de la pieza. */
export const parteSinTocar = (p: PiezaCaja, parte: number): PosicionParte => {
  const s = p.partes?.[parte]?.solido;
  return s ? { x: s.x - p.solido.x, y: s.y - p.solido.y, k: 1 } : { x: 0, y: 0, k: 1 };
};

/** Las partes de una pieza en el orden que eligió la persona (sólo dentro de su pieza), de abajo hacia arriba. */
export const ordenDePartes = (p: PiezaCaja, orden: readonly number[] | undefined): number[] =>
  ordenarPor(Array.from({ length: p.partes?.length ?? 0 }, (_, j) => j), (j) => j, orden);

/**
 * Dónde queda cada parte de una pieza ya puesta (q), en el orden elegido (de abajo hacia arriba): donde la dejó la
 * persona relativo a la pieza, o en su lugar del maestro. Lo que la persona agrandó o achicó tiene los mismos topes que
 * una pieza. `tocada`: si algo es distinto del maestro (entonces la pieza se abre). null si la pieza no tiene partes.
 * El editor usa lo mismo para dibujar sus marcos.
 */
export function ponerPartes(p: PiezaCaja | undefined, q: Puesta, ed: Pick<Edicion, "partes" | "ordenPartes">, W: number, H: number): { puestas: PuestaParte[]; tocada: boolean } | null {
  const partes = p?.partes;
  if (!p || !partes || partes.length < 2) return null;
  const lugares = ed.partes?.[q.pieza];
  const base = Array.from({ length: partes.length }, (_, j) => j), orden = ordenarPor(base, (j) => j, ed.ordenPartes?.[q.pieza]);
  const lejos = 2 * Math.max(W, H);
  const entre = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  let tocada = orden !== base;
  const puestas = orden.map((j): PuestaParte => {
    const s = partes[j].solido, e = lugares?.[j];
    let r = parteSinTocar(p, j);
    const movida = !!e && [e.x, e.y, e.k].every(Number.isFinite) && e.k > 0;
    if (movida) {
      r = e;
      tocada = true;
    }
    // Los topes sólo frenan lo que la persona agrandó o achicó: una parte a la escala de su pieza va igual que ella
    // (en 320×50 los iconos del legal miden menos que el mínimo, y la pieza entera también).
    const t = topesParte(s, q.k, W, H, partes[j].caja), k = entre(q.k * r.k, t.min, t.max);
    return { parte: j, k, x: entre(q.x + r.x * q.k, -lejos, lejos), y: entre(q.y + r.y * q.k, -lejos, lejos), w: s.w * k, h: s.h * k, movida };
  });
  return { puestas, tocada };
}

/** Si un dibujo (la pieza, o una de sus partes) se quedó sin NINGUNO de sus textos en esta medida (`Puesta.sinTexto`,
 *  índices en `pieza.textos`): se pinta su base, y su sombra de contraste sale de ella. */
export function sinSusLetras(d: { base?: unknown; textos?: readonly unknown[] }, pieza: { textos?: readonly unknown[] }, sin: readonly number[] | undefined): boolean {
  if (!d.base || !sin?.length || !d.textos?.length) return false;
  return d.textos.every((t) => sin.includes(pieza.textos?.indexOf(t) ?? -1));
}

/** Los topes de escala de una parte (en la medida): los de una pieza, sin frenar la escala que ya trae su pieza (`k`). */
export function topesParte(s: { w: number; h: number }, k: number, W: number, H: number, caja?: { w: number; h: number }): { min: number; max: number } {
  const t = topesPieza(s, W, H, caja);
  return { min: Math.min(t.min, k), max: Math.max(t.max, k) };
}

/** La pieza ya puesta abierta en sus partes si la persona movió o reordenó alguna; si no, la misma puesta (la pieza se
 *  pinta entera, como siempre). */
function abrirEnPartes(p: PiezaCaja | undefined, q: Puesta, ed: Edicion, W: number, H: number): Puesta {
  const r = ponerPartes(p, q, ed, W, H);
  return r?.tocada ? { ...q, partes: r.puestas } : q;
}

/**
 * Qué piezas se movieron de capa: las menos posibles que, sacadas, dejan a las demás en el orden automático (las que
 * quedan fuera de la subsecuencia creciente más larga). Subir el CTA del fondo al frente marca sólo al CTA, aunque todas
 * las demás bajaron un lugar. Con un empate (dos de al lado que cambian de lugar: cualquiera de las dos), se marca la
 * que la persona movió (`movidas`), si se sabe.
 */
export function cambiadasDeCapa(orden: readonly number[], ordenAuto: readonly number[], movidas?: ReadonlySet<number>): Set<number> {
  const rango = new Map(ordenAuto.map((p, i) => [p, i]));
  const r = orden.map((p) => rango.get(p) ?? -1);
  // Subsecuencia creciente más larga, O(n²): son ≤ 40 piezas. A igual largo, la que deja más de las NO movidas.
  const quieta = orden.map((p): number => (movidas?.has(p) ? 0 : 1));
  const largo = r.map(() => 1), quietas = [...quieta], antes = r.map(() => -1);
  const mejor = (l: number, q: number, i: number) => l > largo[i] || (l === largo[i] && q > quietas[i]);
  for (let i = 0; i < r.length; i++)
    for (let j = 0; j < i; j++)
      if (r[j] < r[i] && mejor(largo[j] + 1, quietas[j] + quieta[i], i)) {
        largo[i] = largo[j] + 1;
        quietas[i] = quietas[j] + quieta[i];
        antes[i] = j;
      }
  let fin = -1;
  for (let i = 0; i < r.length; i++) if (fin < 0 || largo[i] > largo[fin] || (largo[i] === largo[fin] && quietas[i] > quietas[fin])) fin = i;
  const quedan = new Set<number>();
  for (let i = fin; i >= 0; i = antes[i]) quedan.add(i);
  return new Set(orden.filter((_, i) => !quedan.has(i)));
}

/**
 * El acomodo automático con lo que la persona cambió a mano: las piezas que movió van donde ella las dejó, en el orden
 * que eligió, y TODO se vuelve a revisar (letra, fuera de la medida, zona del canal, piezas sin tocar encimadas). El
 * fondo y las demás piezas no se tocan. Una edición con números que no sirven (NaN, escala ≤ 0) se ignora para esa
 * pieza; una escala o un lugar fuera de lo que deja el editor (dato viejo o cambiado a mano) se recorta a ese tope.
 */
export function aplicarEdicion(ma: MaestroCaja, a: Acomodo, ed: Edicion, W: number, H: number, zona?: Partial<Zona> | null): Acomodo {
  const aMano = new Set<number>();
  const lejos = 2 * Math.max(W, H);
  const entre = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  const movidas = a.puestas.map((q) => {
    const e = ed.piezas?.[q.pieza], s = ma.piezas[q.pieza]?.solido;
    let movida = q;
    if (e && s && [e.x, e.y, e.k].every(Number.isFinite) && e.k > 0) {
      aMano.add(q.pieza);
      const t = topesPieza(s, W, H, ma.piezas[q.pieza].caja), k = entre(e.k, t.min, t.max);
      movida = { pieza: q.pieza, k, x: entre(e.x, -lejos, lejos), y: entre(e.y, -lejos, lejos), w: s.w * k, h: s.h * k };
    }
    const abierta = abrirEnPartes(ma.piezas[q.pieza], movida, ed, W, H);
    if (abierta !== movida) aMano.add(q.pieza);
    const sin = ed.sinTexto?.[q.pieza]?.filter((t) => Number.isInteger(t) && t >= 0 && t < (ma.piezas[q.pieza].textos?.length ?? 0));
    if (!sin?.length) return abierta;
    aMano.add(q.pieza);
    return { ...abierta, sinTexto: sin };
  });
  const puestas = ordenarPuestas(movidas, ed.orden);
  if (!aMano.size && puestas === movidas) return a;
  const z = zonaUsable(zona ?? undefined, W, H);
  // Una copia (B25): de otra forma, nadie la vio así (se revisa todo); de la misma forma, la persona vio juntas las
  // piezas que movió, pero no junto a las del automático de AQUÍ (que puede no ser el de allá: el legal crece). En la
  // familia «igual» `comprobar` no busca piezas encimadas: ahí lo que pide revisar una copia es el aviso «copiada».
  const copia = ed.copiaDe, revisar = !!copia && !mismaForma(copia, { w: W, h: H });
  const vistas = !copia ? undefined : revisar ? () => false : (i: number, j: number) => aMano.has(i) && aMano.has(j);
  const r = comprobar(ma, W, H, a.familia, puestas, new Set(a.quitadas), z.zona, aMano, vistas);
  const avisoCopia: AvisoAcomodo[] = copia && revisar ? [{ tipo: "copiada", texto: `Copiada de ${copia.w}×${copia.h}, con otra forma que esta medida: revisar que todo quede bien.` }] : [];
  return { ...a, puestas, letras: r.letras, avisos: [...avisoCopia, ...(z.aviso ? [z.aviso] : []), ...r.avisos], editada: true, ...(copia ? { copiadaDe: { w: copia.w, h: copia.h } } : {}) };
}
