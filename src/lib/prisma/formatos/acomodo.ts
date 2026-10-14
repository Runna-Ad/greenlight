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

/** Lo que el acomodo necesita de una pieza (PiezaPsd lo cumple). */
export type PiezaCaja = { nombre: string; rol: Rol | null; solido: Caja; letraMinPx?: number | null };
export type MaestroCaja = { nombre: string; w: number; h: number; piezas: PiezaCaja[] };

export type Familia = "igual" | "display" | "horizontal" | "ancho" | "banner";
/** Una pieza colocada: índice en `maestro.piezas`, su escala y la caja de su parte sólida en la medida final. */
export type Puesta = { pieza: number; k: number; x: number; y: number; w: number; h: number };
export type AvisoAcomodo = { tipo: "fuera" | "encima" | "letra" | "falta" | "zona" | "forma" | "quitada"; texto: string };
export type Acomodo = {
  familia: Familia;
  /** De abajo hacia arriba, en el orden del maestro. */
  puestas: Puesta[];
  /** El fondo limpio: su escala y dónde cae su esquina (siempre cubre toda la medida). */
  fondo: { k: number; x: number; y: number };
  /** Con qué tamaño de letra queda el texto más chico de cada pieza que trae texto. */
  letras: { pieza: number; px: number }[];
  /** Lo que alguien tiene que mirar antes de entregar. Vacío = pasó todas las comprobaciones. */
  avisos: AvisoAcomodo[];
  /** Piezas que se quitaron A PROPÓSITO para que el texto que queda se lea (índices en `maestro.piezas`). */
  quitadas: number[];
};
export type Lado = "derecha" | "izquierda";
/** px de la medida final que la plataforma tapa por cada borde. */
export type Zona = { top: number; right: number; bottom: number; left: number };
export type OpcionesAcomodo = {
  /** De qué lado va el HERO donde hay columnas (`sePuedeVoltear`); en lo demás no cambia nada. El equipo lo pone a la derecha. */
  heroLado?: Lado;
  /** Zona segura. Las piezas que acomoda la herramienta la evitan; las que dejó el diseñador, si caen en ella, se avisan. */
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
/** Donde hay columnas, ninguna pieza de texto se agranda más que esto respecto al HERO (para que no se coma el anuncio). */
const TEXTO_SOBRE_HERO_MAX = 1.8;
/**
 * Medidas chicas (regla de arranque de Pedro, 2026-10-14): si alguna letra no llega a LETRA_MIN_PX, se quita primero
 * el legal y luego el subtítulo, y lo que queda se agranda. Cada quitada se CONSERVA sólo si de verdad agrandó el
 * texto que se queda (en el acomodo del diseñador quitar no libera nada: ahí no se quita). Lo que siga chico se marca.
 */
export const QUITAR_EN_ORDEN: readonly Rol[] = ["FOOTER", "SUBTITULO"];
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
  // Más alta que ancha y lejos de su maestro: no hay acomodo propio todavía, se conserva el del maestro.
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
export const CANALES = {
  "ig-stories": { nombre: "Instagram Stories", pct: { top: 14, right: 0, bottom: 20, left: 0 } },
  "ig-reels": { nombre: "Instagram Reels", pct: { top: 14, right: 6, bottom: 35, left: 6 } },
  "fb-stories": { nombre: "Facebook Stories", pct: { top: 14, right: 0, bottom: 20, left: 0 } },
  "fb-reels": { nombre: "Facebook Reels", pct: { top: 14, right: 6, bottom: 35, left: 6 } },
  tiktok: { nombre: "TikTok", pct: { top: (200 / 1920) * 100, right: (120 / 1080) * 100, bottom: (300 / 1920) * 100, left: 0 } },
} as const satisfies Record<string, { nombre: string; pct: Zona }>;
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
 * Una medida completa: de qué mesa sale y su acomodo. La zona del canal NO entra al acomodo: un 9:16 siempre
 * conserva el acomodo del diseñador (no hay familia vertical propia), y lo que él colocó no se marca. El día que
 * la herramienta acomode verticales por su cuenta, ahí es donde la zona debe mandar.
 */
export function acomodarMedida(maestros: MaestroCaja[], W: number, H: number, op: { heroLado?: Lado } = {}): { maestro: number; acomodo: Acomodo } {
  const maestro = elegirMaestro(maestros, W, H);
  if (maestro < 0) throw new Error("acomodarMedida: sin maestros");
  return { maestro, acomodo: acomodar(maestros[maestro], W, H, op) };
}

type Suelta = { i: number; p: PiezaCaja };
type Rect = { x0: number; x1: number; y0: number; y1: number };

/** Varias piezas en columna dentro de una caja: una sola escala para todas, centradas. */
function columna(piezas: (Suelta | undefined)[], r: Rect, hueco: number, kTope: number): Puesta[] {
  const ps = piezas.filter((s): s is Suelta => !!s);
  if (!ps.length || r.x1 <= r.x0 || r.y1 <= r.y0) return [];
  const libre = Math.max(1, r.y1 - r.y0 - hueco * (ps.length - 1));
  const k = Math.min((r.x1 - r.x0) / Math.max(...ps.map((s) => s.p.solido.w)), libre / ps.reduce((t, s) => t + s.p.solido.h, 0), kTope);
  const alto = ps.reduce((t, s) => t + s.p.solido.h * k, 0);
  // Si ni encogiendo caben con sus huecos, los huecos se cierran: primero que no se encimen.
  const sep = ps.length > 1 ? Math.min(hueco, Math.max(0, (r.y1 - r.y0 - alto) / (ps.length - 1))) : 0;
  let y = r.y0 + (r.y1 - r.y0 - alto - sep * (ps.length - 1)) / 2;
  return ps.map((s) => {
    const w = s.p.solido.w * k, h = s.p.solido.h * k;
    const puesta = { pieza: s.i, k, x: r.x0 + (r.x1 - r.x0 - w) / 2, y, w, h };
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

/** Espejo horizontal de un rectángulo dentro de [a0, a1]. */
const espejo = (r: Rect, a0: number, a1: number): Rect => ({ ...r, x0: a0 + a1 - r.x1, x1: a0 + a1 - r.x0 });

/** La letra más chica de las piezas `de` que siguen puestas (Infinity si ninguna trae texto medible). */
const letraDe = (a: Acomodo, de: (i: number) => boolean) => Math.min(Infinity, ...a.letras.filter((l) => de(l.pieza)).map((l) => l.px));

export function acomodar(ma: MaestroCaja, W: number, H: number, op: OpcionesAcomodo = {}): Acomodo {
  const todas = () => true;
  // Con estas piezas fuera: el acomodo del equipo y, si la letra no llega, el lado del texto se ensancha (a costa
  // del HERO) sólo lo necesario. Si ni al máximo llega, el que deja la letra más grande.
  const ensanchar = (quitar: Set<number>): Acomodo => {
    let mejor = acomodarSin(ma, W, H, op, quitar, 0);
    if (mejor.familia === "igual") return mejor;
    for (let n = 1; n <= PASOS_TEXTO && letraDe(mejor, todas) < LETRA_MIN_PX; n++) {
      const a = acomodarSin(ma, W, H, op, quitar, n / PASOS_TEXTO);
      if (letraDe(a, todas) > letraDe(mejor, todas) + 0.05) mejor = a;
    }
    return mejor;
  };
  let a = ensanchar(new Set());
  for (const rol of QUITAR_EN_ORDEN) {
    if (!(letraDe(a, todas) < LETRA_MIN_PX)) break;
    const i = a.puestas.find((q) => ma.piezas[q.pieza].rol === rol)?.pieza;
    if (i === undefined) continue;
    if (a.familia === "igual") break; // el acomodo del diseñador no se toca: lo chico se marca, no se quita
    const quitar = new Set([...a.quitadas, i]);
    const prueba = ensanchar(quitar);
    // Se quita si ELLA no se lee, o si quitarla agranda lo que se queda. Nunca si lo que se queda acaba bajo el
    // mínimo por quitarla (que baje un poco sin pasar del mínimo está bien: se ensancha sólo lo necesario).
    const queda = (k: number) => !quitar.has(k);
    const suya = a.letras.find((l) => l.pieza === i)?.px ?? Infinity;
    const antes = letraDe(a, queda), despues = letraDe(prueba, queda);
    if (despues >= Math.min(antes, LETRA_MIN_PX) - 0.05 && (suya < LETRA_MIN_PX || despues > antes + 0.05)) a = prueba;
  }
  return a;
}

/** `texto` (0-1): cuánto lugar de más se le da al texto. 0 = el acomodo del equipo, tal cual. */
function acomodarSin(ma: MaestroCaja, W: number, H: number, op: OpcionesAcomodo, quitar: Set<number>, texto: number): Acomodo {
  if (![ma.w, ma.h, W, H].every((v) => Number.isFinite(v) && v > 0)) throw new Error("acomodar: medidas inválidas");
  const familia = familiaDe(W, H, ma);
  const avisos: AvisoAcomodo[] = [];
  const borde = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
  let zona = { top: borde(op.zona?.top), right: borde(op.zona?.right), bottom: borde(op.zona?.bottom), left: borde(op.zona?.left) };
  if (zona.left + zona.right > W * ZONA_MAX || zona.top + zona.bottom > H * ZONA_MAX) {
    avisos.push({ tipo: "zona", texto: "La zona segura no deja espacio en esta medida: se acomodó sin ella. Revisar." });
    zona = { top: 0, right: 0, bottom: 0, left: 0 };
  }
  const valida = (p: PiezaCaja) => [p.solido.x, p.solido.y, p.solido.w, p.solido.h].every(Number.isFinite) && p.solido.w > 0 && p.solido.h > 0;
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

  if (familia === "igual") {
    // El acomodo del diseñador, a escala pareja y centrado.
    const k = Math.min(W / ma.w, H / ma.h), ox = (W - ma.w * k) / 2, oy = (H - ma.h * k) / 2;
    puestas = ma.piezas.flatMap((p, i) => (valida(p) && !quitar.has(i) ? [{ pieza: i, k, x: ox + p.solido.x * k, y: oy + p.solido.y * k, w: p.solido.w * k, h: p.solido.h * k }] : []));
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
    const tope = familia === "banner" ? 0.24 : familia === "ancho" ? 0.15 : 0.12;
    let pie: Puesta[] = [];
    let arriba = area.y1;
    if (pieF) {
      const k = Math.min((area.x1 - area.x0) / pieF.p.solido.w, (H * tope) / pieF.p.solido.h, PIE_ESCALA_MAX);
      const w = pieF.p.solido.w * k, h = pieF.p.solido.h * k;
      pie = [{ pieza: pieF.i, k, x: area.x0 + (area.x1 - area.x0 - w) / 2, y: area.y1 - h, w, h }];
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
      let x = cuerpo.x0;
      for (const { s, frac } of celdas) {
        const cw = (ancho * frac) / total;
        if (cuerpo.y1 > cuerpo.y0) {
          const k = Math.min((cw * 0.9) / s.p.solido.w, (cuerpo.y1 - cuerpo.y0) / s.p.solido.h);
          const w = s.p.solido.w * k, h = s.p.solido.h * k;
          puestas.push({ pieza: s.i, k, x: x + (cw - w) / 2, y: cuerpo.y0 + (cuerpo.y1 - cuerpo.y0 - h) / 2, w, h });
        }
        x += cw;
      }
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
    puestas.push(...pie);
    puestas.sort((a, b) => a.pieza - b.pieza);
  }

  // Fondo: llena la medida; el punto del piso bajo el HERO se queda bajo el HERO.
  const kb = Math.max(W / ma.w, H / ma.h);
  const heroS = de("HERO"), heroP = heroS && puestas.find((q) => q.pieza === heroS.i);
  let fx = (W - ma.w * kb) / 2, fy = (H - ma.h * kb) / 2;
  if (heroS && heroP) {
    fx = heroP.x + heroP.w / 2 - (heroS.p.solido.x + heroS.p.solido.w / 2) * kb;
    fy = heroP.y + heroP.h - (heroS.p.solido.y + heroS.p.solido.h) * kb;
  }
  const fondo = { k: kb, x: Math.min(0, Math.max(W - ma.w * kb, fx)), y: Math.min(0, Math.max(H - ma.h * kb, fy)) };

  // ── Lo que revisa la guía de diseño (sección 4), lo que se puede medir ──
  const nom = (q: Puesta) => ma.piezas[q.pieza].rol ?? ma.piezas[q.pieza].nombre;
  if (familia === "igual" && razon(W, H, ma) >= PARECIDO_MAX) avisos.push({ tipo: "forma", texto: "Esta proporción todavía no tiene acomodo propio: se usó el del maestro, más chico. Revisar." });
  ma.piezas.forEach((p, i) => {
    if (puestas.some((q) => q.pieza === i)) return;
    const n = p.rol ?? p.nombre;
    if (quitar.has(i))
      return void avisos.push({
        tipo: "quitada",
        texto: p.rol === "FOOTER" ? `Se quitó el legal (FOOTER) para que el resto se lea: revisar con el cliente si esta medida puede ir sin legal.` : `Se quitó «${n}» para que el resto se lea.`,
      });
    const gemela = p.rol !== null && puestas.some((q) => ma.piezas[q.pieza].rol === p.rol);
    avisos.push({ tipo: "falta", texto: !valida(p) ? `«${n}» trae una caja vacía o inválida: no se colocó.` : gemela ? `Hay más de una carpeta «${n}»: sólo se colocó una. Revisar.` : `«${n}» no entra en este acomodo: revisar.` });
  });
  for (const q of puestas) {
    if (!(q.x >= -0.5 && q.y >= -0.5 && q.x + q.w <= W + 0.5 && q.y + q.h <= H + 0.5)) avisos.push({ tipo: "fuera", texto: `${nom(q)} se sale de la medida.` });
    else if (q.x < zona.left - 0.5 || q.y < zona.top - 0.5 || q.x + q.w > W - zona.right + 0.5 || q.y + q.h > H - zona.bottom + 0.5) avisos.push({ tipo: "zona", texto: `${nom(q)} entra en la zona que tapa la plataforma.` });
  }
  // En "igual" las cajas se enciman por diseño (los beneficios van junto a la persona): ahí no se revisa.
  if (familia !== "igual")
    for (let i = 0; i < puestas.length; i++)
      for (let j = i + 1; j < puestas.length; j++) {
        const a = puestas[i], b = puestas[j];
        if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 2 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 2) avisos.push({ tipo: "encima", texto: `${nom(a)} y ${nom(b)} se enciman.` });
      }
  const letras: Acomodo["letras"] = [];
  for (const q of puestas) {
    const l = ma.piezas[q.pieza].letraMinPx;
    if (!(typeof l === "number" && l > 0)) {
      // El legal nunca sale chico sin avisar: si su letra no se puede medir (texto aplanado), se avisa al reducirlo.
      if (ma.piezas[q.pieza].rol === "FOOTER" && q.k < 0.995) avisos.push({ tipo: "letra", texto: `${nom(q)}: no se pudo medir su letra (texto aplanado) y queda al ${Math.round(q.k * 100)} % de su tamaño. Revisar.` });
      continue;
    }
    const px = l * q.k;
    letras.push({ pieza: q.pieza, px });
    if (px < LETRA_MIN_PX) avisos.push({ tipo: "letra", texto: `${nom(q)}: la letra queda de ${px.toFixed(1)} px (mínimo ${LETRA_MIN_PX}).` });
  }
  return { familia, puestas, fondo, letras, avisos, quitadas: [...quitar].sort((x, y) => x - y) };
}
