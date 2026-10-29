/**
 * HÜE Prisma › Formatos — lo que se revisa en cada medida mirando los PÍXELES, además del acomodo (que sólo ve cajas).
 * Puro: sólo arreglos; corre igual en Node y en el navegador.
 *
 * 1. Contraste (Pedro, 2026-10-14): una pieza de texto que en el original se lee puede caer, en otra medida, sobre un
 *    fondo de su mismo tono (s33, 876×324: letras de nube blancas sobre nubes blancas). Se mide qué parte de la pieza
 *    queda casi igual que lo que tiene atrás, y se avisa sólo si es mucho Y bastante peor que en el original: lo que el
 *    diseñador ya dejó así en su maestro no se marca.
 * 2. La copia del HERO pintada en el fondo (`gemela.ts`): se avisa en las medidas donde se ve (la pieza ya no la tapa)
 *    y, si se quitó, en las que se ve el relleno.
 *
 * Una sola entrada, `revisarMedida`, para la tarjeta de cada medida y para el resumen de la pantalla: los dos cuentan
 * los mismos avisos.
 */
import { acomodar, aplicarEdicion, dibujosDe, elegirMaestro, pegadoFuera, RENGLONES_MAS, RENGLONES_MAX, sinSusLetras, type Acomodo, type AvisoAcomodo, type Edicion, type Lado, type MaestroCaja, type OpcionesAcomodo, type ParteCaja, type Zona } from "./acomodo.ts";
import { haloDe } from "./halo.ts";
import type { Caja, Rol } from "./psd.ts";
import { etiquetaPieza } from "./roles.ts";

type Pixeles = { caja: Caja; rgba: Uint8ClampedArray; base?: Uint8ClampedArray | null; textos?: readonly unknown[] };
type PiezaRevisable = MaestroCaja["piezas"][number] & Pixeles & { partes?: readonly (ParteCaja & Pixeles)[] };
/** La copia del HERO en el fondo de un maestro: de qué pieza, y si ya se quitó. */
export type CopiaEnFondo = { pieza: number; quitada: boolean };
export type MaestroRevisable = MaestroCaja & { fondo: Uint8ClampedArray; piezas: PiezaRevisable[]; copia?: CopiaEnFondo | null };

/** Las piezas cuyo contraste se mide: las de texto y la marca. */
const SE_MIDE = new Set<Rol | null>(["TITULO", "SUBTITULO", "CTA", "FOOTER", "BRAND"]);
// Criterio, no física: calibrado con los dos PSD reales (s33 y APGIANTCARDUGC, 2026-10-14) y se afina con más.
/** Un punto de la pieza "se pierde" si su brillo y su color quedan así de cerca de lo que tiene atrás. */
const CONTRASTE_MIN = 1.4;
const DISTANCIA_MIN = 60;
/** Se avisa desde esta parte perdida... */
export const PERDIDA_AVISO = 0.3;
/** ...si además es al menos esto peor que en el original. */
export const PERDIDA_PEOR = 0.15;
/** Puntos que se miran por pieza (en rejilla) y los mínimos para opinar. */
const PUNTOS = 6000;
const PUNTOS_MIN = 50;
/** Desde dónde un punto es de la pieza (su parte casi opaca). */
const ALFA_PIEZA = 0.6;
/** La copia "queda debajo" de la pieza si las dos caen a menos de esto (px de la medida, o esta parte de su lado). */
const COPIA_TOLERANCIA_PX = 2;
const COPIA_TOLERANCIA = 0.01;

/** sRGB (0-255) → luz lineal, de tabla: se pide miles de veces por medida. */
const LINEAL = Float64Array.from({ length: 256 }, (_, c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
});
const lineal = (c: number) => LINEAL[Math.min(255, Math.max(0, Math.round(c)))];
const brillo = (r: number, g: number, b: number) => 0.2126 * lineal(r) + 0.7152 * lineal(g) + 0.0722 * lineal(b);

/** Índice (RGBA) del píxel de `w × h` que cae bajo el punto (X, Y) de la medida, puesto a escala k con su esquina en
 *  (ox, oy). Fuera: −1, o la orilla si `orilla` (el fondo, que siempre cubre). */
function pixel(w: number, h: number, k: number, ox: number, oy: number, X: number, Y: number, orilla: boolean): number {
  let u = Math.floor((X + 0.5 - ox) / k), v = Math.floor((Y + 0.5 - oy) / k);
  if (orilla) {
    u = Math.min(w - 1, Math.max(0, u));
    v = Math.min(h - 1, Math.max(0, v));
  } else if (u < 0 || v < 0 || u >= w || v >= h) return -1;
  return (v * w + u) * 4;
}

/** Esquina de la caja completa de una pieza puesta (la parte sólida queda donde dijo el acomodo), como en nitido.ts. */
const esquina = (p: { solido: Caja; caja: Caja }, q: { x: number; y: number; k: number }) => [q.x - (p.solido.x - p.caja.x) * q.k, q.y - (p.solido.y - p.caja.y) * q.k] as const;

/**
 * Por cada pieza medible que quedó puesta: qué parte de ella (0-1) se pierde contra lo que tiene atrás (fondo, piezas
 * de abajo y las sombras de contraste de `a.sombras`). `solo`: medir sólo esas piezas (la búsqueda del arreglo).
 */
export function perdidas(ma: MaestroRevisable, a: Acomodo, W: number, H: number, solo?: ReadonlySet<number>): Map<number, number> {
  // Lo que se pinta, de abajo hacia arriba (una pieza abierta, parte por parte), de qué pieza es, su esquina y su sombra
  // de contraste, una vez (no por punto). Una pieza abierta se mide como si fuera una (como en el original, con el que
  // se compara): sus puntos se suman, salen de la rejilla de la pieza entera, y lo de atrás de una parte es lo de atrás
  // de la pieza (sus otras partes no cuentan).
  const sombras = new Set(a.sombras ?? []);
  const todos = a.puestas.flatMap((q) => dibujosDe(ma.piezas[q.pieza], q).map((d) => ({ pieza: q.pieza, puesta: q, d })));
  const esquinas = todos.map(({ d }) => esquina(d.d, d));
  // Un dibujo sin ninguno de sus textos en esta medida (quitados a mano) se pinta con su base: se mide igual.
  const sinLetras = todos.map(({ pieza, puesta, d }) => !!d.d.base && sinSusLetras(d.d, ma.piezas[pieza], puesta.sinTexto));
  const pxDe = todos.map(({ d }, n) => (sinLetras[n] && d.d.base ? d.d.base : d.d.rgba));
  const halos = todos.map(({ pieza, d }, n) => (sombras.has(pieza) ? haloDe(ma, d.d, sinLetras[n]) : null));
  /** El primer dibujo de la pieza de cada dibujo, y los de cada pieza. */
  const primero = todos.map(({ pieza }) => todos.findIndex((t) => t.pieza === pieza));
  const dePieza = new Map<number, number[]>();
  todos.forEach(({ pieza }, n) => dePieza.set(pieza, [...(dePieza.get(pieza) ?? []), n]));
  const cuenta = new Map<number, { puntos: number; perdidos: number }>();
  const completa = (p: Pixeles) => p.rgba.length >= p.caja.w * p.caja.h * 4;
  /** Cuánto deja pasar (0-1, por canal) la sombra de contraste de la puesta m en el punto (X, Y). */
  const bajoHalo = (m: number, X: number, Y: number): [number, number, number] | null => {
    const h = halos[m];
    if (!h) return null;
    const q = todos[m].d, [px, py] = esquinas[m];
    const j = pixel(h.w, h.h, q.k, px - h.pad * q.k, py - h.pad * q.k, X, Y, false);
    return j < 0 ? null : [h.mapa[j] / 255, h.mapa[j + 1] / 255, h.mapa[j + 2] / 255];
  };
  /** Lo mismo con las de TODA la pieza del dibujo m (van juntas, debajo de su primera parte, como en nitido.ts). */
  const bajoHalos = (m: number, X: number, Y: number): [number, number, number] | null => {
    let t: [number, number, number] | null = null;
    for (const o of dePieza.get(todos[m].pieza) ?? []) {
      const u = bajoHalo(o, X, Y);
      if (u) t = t ? [t[0] * u[0], t[1] * u[1], t[2] * u[2]] : u;
    }
    return t;
  };
  todos.forEach(({ pieza, puesta, d: q }, n) => {
    const p = q.d;
    if (!SE_MIDE.has(ma.piezas[pieza].rol) || !completa(p) || (solo && !solo.has(pieza))) return;
    const [ox, oy] = esquinas[n];
    const paso = Math.max(1, Math.sqrt((puesta.w * puesta.h) / PUNTOS));
    let puntos = 0, perdidos = 0;
    for (let y = Math.max(0, q.y); y < Math.min(H, q.y + q.h); y += paso)
      for (let x = Math.max(0, q.x); x < Math.min(W, q.x + q.w); x += paso) {
        const X = Math.floor(x), Y = Math.floor(y);
        const i = pixel(p.caja.w, p.caja.h, q.k, ox, oy, X, Y, false);
        const prgba = pxDe[n];
        if (i < 0 || prgba[i + 3] / 255 < ALFA_PIEZA) continue;
        // Lo de atrás: el fondo y, encima, las piezas que van debajo de ésta.
        const f = pixel(ma.w, ma.h, a.fondo.k, a.fondo.x, a.fondo.y, X, Y, true);
        let r = ma.fondo[f], g = ma.fondo[f + 1], b = ma.fondo[f + 2];
        for (let m = 0; m < primero[n]; m++) {
          const qq = todos[m].d, pp = qq.d, [px, py] = esquinas[m];
          // Su sombra de contraste (sale de su caja) oscurece antes de que se pinte la pieza, como en nitido.ts.
          const t = primero[m] === m ? bajoHalos(m, X, Y) : null;
          if (t) {
            r *= t[0];
            g *= t[1];
            b *= t[2];
          }
          // Fuera de su caja completa no tapa nada: ni se busca el píxel.
          if (X < px - 1 || Y < py - 1 || X > px + pp.caja.w * qq.k + 1 || Y > py + pp.caja.h * qq.k + 1 || !completa(pp)) continue;
          const j = pixel(pp.caja.w, pp.caja.h, qq.k, px, py, X, Y, false);
          if (j < 0) continue;
          const rgba = pxDe[m], al = rgba[j + 3] / 255;
          r = rgba[j] * al + r * (1 - al);
          g = rgba[j + 1] * al + g * (1 - al);
          b = rgba[j + 2] * al + b * (1 - al);
        }
        // Y la suya, justo debajo de ella.
        const t = bajoHalos(n, X, Y);
        if (t) {
          r *= t[0];
          g *= t[1];
          b *= t[2];
        }
        const al = prgba[i + 3] / 255;
        const R = prgba[i] * al + r * (1 - al), G = prgba[i + 1] * al + g * (1 - al), B = prgba[i + 2] * al + b * (1 - al);
        const y1 = brillo(R, G, B), y2 = brillo(r, g, b);
        puntos++;
        if ((Math.max(y1, y2) + 0.05) / (Math.min(y1, y2) + 0.05) < CONTRASTE_MIN && Math.hypot(R - r, G - g, B - b) < DISTANCIA_MIN) perdidos++;
      }
    const c = cuenta.get(pieza) ?? { puntos: 0, perdidos: 0 };
    cuenta.set(pieza, { puntos: c.puntos + puntos, perdidos: c.perdidos + perdidos });
  });
  const out = new Map<number, number>();
  for (const [i, c] of cuenta) if (c.puntos >= PUNTOS_MIN) out.set(i, c.perdidos / c.puntos);
  return out;
}

/** Lo perdido en el ORIGINAL (el maestro a su medida), una vez por maestro. */
const enOriginal = new WeakMap<MaestroRevisable, Map<number, number>>();
function perdidasDelOriginal(ma: MaestroRevisable): Map<number, number> {
  // Una versión con el legal en otros renglones (B27) se compara con el PSD: lo que aprobó el diseñador es el suyo.
  const del = delPsdDe.get(ma) ?? ma;
  let v = enOriginal.get(del);
  if (!v) enOriginal.set(del, (v = perdidas(del, acomodar(del, del.w, del.h), del.w, del.h)));
  return v;
}
/** De qué maestro del PSD es cada versión con el legal en otros renglones (`revisarMedida` lo anota). */
const delPsdDe = new WeakMap<MaestroRevisable, MaestroRevisable>();

/** ¿En esta medida se ve la parte del fondo donde está (o estaba) la copia? Se ve si cae dentro de la medida y la
 *  pieza ya no está justo encima de ella, del mismo tamaño. */
export function seVeLaCopia(ma: MaestroRevisable, a: Acomodo, W: number, H: number): boolean {
  const c = ma.copia;
  if (!c) return false;
  const p = ma.piezas[c.pieza];
  const k = a.fondo.k;
  // Dónde cae, en esta medida, el lugar de la pieza en el fondo (en el maestro, la copia está justo ahí).
  const fx = a.fondo.x + p.caja.x * k, fy = a.fondo.y + p.caja.y * k;
  if (fx + p.caja.w * k <= 0 || fy + p.caja.h * k <= 0 || fx >= W || fy >= H) return false;
  const q = a.puestas.find((x) => x.pieza === c.pieza);
  if (!q) return true;
  const [ox, oy] = esquina(p, q);
  const tol = Math.max(COPIA_TOLERANCIA_PX, COPIA_TOLERANCIA * Math.max(W, H));
  return Math.abs(ox - fx) > tol || Math.abs(oy - fy) > tol || Math.abs(q.k - k) * Math.max(p.caja.w, p.caja.h) > tol;
}

/** Lo que una pieza puede tapar de algo pegado al fondo (parte del más chico de los dos) sin que se avise. */
const PEGADO_ENCIMA_MAX = 0.08;
/** Lo que una pieza puede correrse respecto a lo pegado sobre lo que ya iba en el original (parte de su tamaño). */
const PEGADO_MISMO_LUGAR = 0.12;

/**
 * Lo pegado al fondo de una imagen plana (`MaestroCaja.pegados`) en esta medida: lo que queda cortado y las piezas
 * que caen encima. Antes no se veía (batería 2026-10-29): una medida con el logo sobre la tarjeta pegada contaba como
 * limpia. Una pieza que ya iba sobre eso en el original, y sigue igual sobre ello (el texto de una tarjeta pegada), no
 * se avisa.
 */
export function avisosDePegados(ma: MaestroCaja, a: Acomodo, W: number, H: number): AvisoAcomodo[] {
  const avisos: AvisoAcomodo[] = [];
  const f = a.fondo;
  for (const pg of ma.pegados ?? []) {
    const c = pg.caja, area = c.w * c.h * f.k * f.k;
    if (!(area > 0)) continue;
    const ve = 1 - pegadoFuera([pg], f, W, H) / area;
    if (ve < 0.98)
      avisos.push({ tipo: "fuera", texto: ve <= 0.02 ? `${pg.nombre} va pintado en el fondo y en esta medida no se ve.` : `${pg.nombre} va pintado en el fondo y aquí queda cortado (se ve el ${Math.round(ve * 100)} %).` });
    const P = { x: f.x + c.x * f.k, y: f.y + c.y * f.k, w: c.w * f.k, h: c.h * f.k };
    for (const q of a.puestas) {
      const p = ma.piezas[q.pieza];
      const cruce = (A: { x: number; y: number; w: number; h: number }, B: typeof A) => Math.max(0, Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x)) * Math.max(0, Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y));
      const aqui = cruce(q, P) / Math.min(q.w * q.h, P.w * P.h);
      if (!(aqui > PEGADO_ENCIMA_MAX)) continue;
      // En el original: dónde iba la pieza respecto a lo pegado (en tamaños de lo pegado) y a qué escala.
      const s = p.solido, antes = cruce(s, c) / Math.min(s.w * s.h, c.w * c.h);
      const igual = antes > PEGADO_ENCIMA_MAX
        && Math.abs((q.x - P.x) / P.w - (s.x - c.x) / c.w) <= PEGADO_MISMO_LUGAR
        && Math.abs((q.y - P.y) / P.h - (s.y - c.y) / c.h) <= PEGADO_MISMO_LUGAR
        && Math.abs(q.w / P.w - s.w / c.w) <= PEGADO_MISMO_LUGAR * Math.max(1, s.w / c.w);
      if (!igual) avisos.push({ tipo: "encima", texto: `${etiquetaPieza(p)} cae encima de ${pg.nombre}, que va pintado en el fondo. Revisar.` });
    }
  }
  return avisos;
}

/** Los avisos de píxeles de una medida ya acomodada. */
export function avisosDePixeles(ma: MaestroRevisable, a: Acomodo, W: number, H: number): AvisoAcomodo[] {
  const avisos: AvisoAcomodo[] = [];
  const nom = (i: number) => etiquetaPieza(ma.piezas[i]);
  if (ma.copia && seVeLaCopia(ma, a, W, H)) {
    const n = nom(ma.copia.pieza);
    avisos.push(
      ma.copia.quitada
        ? { tipo: "retoque", texto: `Fondo retocado: donde estaba pintado ${n} ahora hay un relleno. Revisa que se vea bien; si no, «Deshacer» en «Pieza repetida en el fondo».` }
        : { tipo: "copia", texto: `Se ve dos veces ${n}: el fondo ya lo trae pintado y aquí la carpeta no queda encima. Se puede quitar en «Pieza repetida en el fondo».` },
    );
  }
  avisos.push(...avisosDePegados(ma, a, W, H));
  for (const { pieza: i, v, ref } of pierden(ma, a, W, H))
    avisos.push({ tipo: "contraste", texto: `${nom(i)} se pierde en el fondo: el ${Math.round(v * 100)} % queda casi del mismo tono que lo de atrás (en el original, ${Math.round(ref * 100)} %). Revisar que se lea.` });
  return avisos;
}

/** Las piezas que se pierden en esta medida: mucho, y bastante peor que en el original (las que se avisan). */
function pierden(ma: MaestroRevisable, a: Acomodo, W: number, H: number): { pieza: number; v: number; ref: number }[] {
  const antes = perdidasDelOriginal(ma), out: { pieza: number; v: number; ref: number }[] = [];
  for (const [i, v] of perdidas(ma, a, W, H)) {
    const ref = antes.get(i) ?? 0;
    if (v >= PERDIDA_AVISO && v - ref >= PERDIDA_PEOR) out.push({ pieza: i, v, ref });
  }
  return out;
}

// ── Arreglos de contraste (Pedro, 2026-10-15: "can we do both and let the user decide?") ────────────────────────
// «Mover fondo»: el fondo se corre, dentro de lo que le sobra, hasta que detrás del texto quede otra cosa (cielo en
// vez de nubes). «Sombra»: una sombra suave detrás de las letras (halo.ts). La plataforma elige el que mejor se lee
// y lo dice; la persona puede cambiarlo o dejar el original.

export type ArregloContraste = "original" | "fondo" | "sombra";
export type EleccionContraste = ArregloContraste | "auto";
/** Lo que se sabe del contraste de una medida que, sin arreglo, tiene texto que se pierde. */
export type InfoContraste = {
  /** El arreglo que lleva la medida. */
  usado: ArregloContraste;
  /** El que elige la plataforma: el que deja todo legible y se pierde menos; "original" si ninguno alcanza. */
  auto: ArregloContraste;
  /** Las piezas que se pierden sin arreglo (índices en `maestro.piezas`). */
  piezas: number[];
  /** Parte perdida (promedio de esas piezas, 0-1) con cada arreglo; null = aquí no se puede o no ayuda. */
  perdida: Record<ArregloContraste, number | null>;
  /** Con «Mover fondo» la tarjeta (HERO) deja su lugar del fondo y queda flotando: por eso no se elige sola. */
  fondoSacaHero: boolean;
};

/** Cuánto puede correrse el piso bajo el HERO (parte de su alto en la medida) para que «Mover fondo» se elija solo. */
export const DERIVA_HERO_MAX = 0.05;
/** Lo mínimo que tiene que bajar la parte perdida para ofrecer «Mover fondo» (menos no se nota). */
const MEJORA_MIN = 0.05;
/** La búsqueda del lugar del fondo: puntos por eje donde hay holgura, y luego un afinado alrededor del mejor. */
const REJILLA = 9;
const AFINA = 5;

export type Opciones = { info: Omit<InfoContraste, "usado">; fondo: Acomodo | null; sombra: Acomodo | null };

const reparto = (de: number, a: number, n: number) => Array.from({ length: n }, (_, i) => de + ((a - de) * i) / (n - 1));

/** Los dos arreglos de una medida ya acomodada (sin edición) y cuál elige la plataforma; null si nada se pierde. */
export function opcionesDeContraste(ma: MaestroRevisable, a: Acomodo, W: number, H: number): Opciones | null {
  const malas = pierden(ma, a, W, H);
  if (!malas.length) return null;
  const piezas = malas.map((m) => m.pieza), cuales = new Set(piezas);
  const media = (b: Acomodo) => {
    const L = perdidas(ma, b, W, H, cuales);
    return piezas.reduce((s, i) => s + (L.get(i) ?? 0), 0) / piezas.length;
  };
  const original = media(a);

  // «Mover fondo»: rejilla dentro de la holgura (el fondo siempre cubre la medida) y afinado alrededor del mejor.
  const { k } = a.fondo;
  const rx = [W - ma.w * k, 0], ry = [H - ma.h * k, 0];
  const conHolgura = (r: number[]) => r[1] - r[0] > 1;
  let mejor = { L: original, x: a.fondo.x, y: a.fondo.y };
  const probar = (x: number, y: number) => {
    const L = media({ ...a, fondo: { k, x, y } });
    if (L < mejor.L - 1e-3) mejor = { L, x, y };
  };
  if (conHolgura(rx) || conHolgura(ry)) {
    const px = conHolgura(rx) ? (rx[1] - rx[0]) / (REJILLA - 1) : 0, py = conHolgura(ry) ? (ry[1] - ry[0]) / (REJILLA - 1) : 0;
    for (const x of px ? reparto(rx[0], rx[1], REJILLA) : [a.fondo.x]) for (const y of py ? reparto(ry[0], ry[1], REJILLA) : [a.fondo.y]) probar(x, y);
    const c = mejor;
    for (const x of px ? reparto(Math.max(rx[0], c.x - px), Math.min(rx[1], c.x + px), AFINA) : [c.x])
      for (const y of py ? reparto(Math.max(ry[0], c.y - py), Math.min(ry[1], c.y + py), AFINA) : [c.y]) probar(x, y);
  }
  const fondo = mejor.L <= original - MEJORA_MIN ? { ...a, fondo: { k, x: mejor.x, y: mejor.y } } : null;
  const hero = a.puestas.find((q) => ma.piezas[q.pieza].rol === "HERO");
  const fondoSacaHero = !!fondo && !!hero && Math.hypot(mejor.x - a.fondo.x, mejor.y - a.fondo.y) > DERIVA_HERO_MAX * hero.h;

  // «Sombra»: detrás de las piezas que se pierden. Si no ayuda (texto más oscuro que su fondo), no se ofrece.
  const conSombra: Acomodo = { ...a, sombras: [...new Set([...(a.sombras ?? []), ...piezas])] };
  const Ls = media(conSombra);
  const sombra = Ls < original - 1e-3 ? conSombra : null;

  // La plataforma elige sólo lo que deja TODO legible (también las piezas que antes se leían) sin sumar otros avisos
  // (la copia del HERO que asoma al correr el fondo), y nunca un fondo que deja la tarjeta flotando.
  const otros = (b: Acomodo) => avisosDePixeles(ma, b, W, H).filter((v) => v.tipo !== "contraste").length;
  const candidatos: { arreglo: ArregloContraste; L: number }[] = [];
  if (fondo && !fondoSacaHero && !pierden(ma, fondo, W, H).length && otros(fondo) <= otros(a)) candidatos.push({ arreglo: "fondo", L: mejor.L });
  if (sombra && !pierden(ma, sombra, W, H).length) candidatos.push({ arreglo: "sombra", L: Ls });
  const auto = candidatos.sort((x, y) => x.L - y.L)[0]?.arreglo ?? "original";
  return {
    info: { auto, piezas, perdida: { original, fondo: fondo ? mejor.L : null, sombra: sombra ? Ls : null }, fondoSacaHero },
    fondo,
    sombra,
  };
}

/** Los renglones del legal de un maestro (B27, `renglones.ts`): su pieza, en cuántos viene del PSD y la versión del
 *  maestro con `n` (null = no sale). */
export type Renglonero<M extends MaestroRevisable = MaestroRevisable> = { pieza: number; psd: number; de: (n: number) => M | null };
/** Lo que se hizo con el legal en una medida: en cuántos renglones viene del PSD, cuántos daría el automático, cuántos
 *  se usaron y cuáles se pueden elegir. */
export type InfoRenglones = { pieza: number; psd: number; auto: number; usados: number; opciones: number[] };
/** Cuánto más grande tiene que salir la letra del legal para dejar los renglones del PSD (menos no se nota). */
export const RENGLONES_GANA = 1.03;
/** Lo que se acepta que se achique la letra de lo demás al cambiar los renglones del legal (nada que se note). */
const RENGLONES_RESTO = 0.98;
/** Por la versión con menos renglones (otra con otras tipografías: el automático también puede ser otro). */
const autos = new WeakMap<MaestroRevisable, Map<string, number>>();

/**
 * En una medida más ancha que alta (B27, "every wide size"): los renglones con que la letra del legal sale más grande,
 * sin achicar lo demás ni dejar fuera otra pieza; si nada gana por `RENGLONES_GANA`, los del PSD. En las demás, los del
 * PSD (ahí menos renglones nunca agrandan el legal: el pie se hace más ancho). El automático quita como mucho la mitad
 * de los renglones (con más, los iconos de las tiendas se achican demasiado); a mano, los que sean.
 */
function renglonesAuto<M extends MaestroRevisable>(base: M, rg: Renglonero<M>, opciones: number[], W: number, H: number, op: OpcionesAcomodo, clave: string): number {
  if (W <= H) return rg.psd;
  const candidatos = opciones.filter((x) => x !== rg.psd && x >= Math.ceil(rg.psd / 2));
  const llave = (candidatos.length && rg.de(candidatos[0])) || base;
  let porMedida = autos.get(llave);
  if (!porMedida) autos.set(llave, (porMedida = new Map()));
  const ya = porMedida.get(clave);
  if (ya !== undefined) return ya;
  const medir = (m: MaestroRevisable) => {
    const a = acomodar(m, W, H, op);
    const resto = a.letras.filter((l) => l.pieza !== rg.pieza).map((l) => l.px);
    return { legal: a.letras.find((l) => l.pieza === rg.pieza)?.px ?? 0, resto: resto.length ? Math.min(...resto) : Infinity, quitadas: a.quitadas.length };
  };
  const ref = medir(base);
  let mejor = rg.psd, px = ref.legal;
  for (const n of [...candidatos].sort((x, y) => y - x)) {
    const m = rg.de(n);
    if (!m) continue;
    const r = medir(m);
    if (r.legal > px * RENGLONES_GANA && r.resto >= ref.resto * RENGLONES_RESTO && r.quitadas <= ref.quitadas) {
      mejor = n;
      px = r.legal;
    }
  }
  porMedida.set(clave, mejor);
  return mejor;
}

/** Hechas, por maestro (el objeto): la tarjeta y el resumen piden la misma medida y no se calcula dos veces; y si sólo
 *  cambia OTRO maestro, ésta devuelve lo mismo y su tarjeta no se vuelve a pintar. `ma`: el maestro que se usó (con el
 *  legal en otros renglones, otra versión del de `maestro`). */
export type Revisada<M extends MaestroRevisable = MaestroRevisable> = { maestro: number; ma: M; acomodo: Acomodo; contraste: InfoContraste | null; renglones: InfoRenglones | null };
const hechas = new WeakMap<MaestroRevisable, Map<string, Revisada>>();
/** Los arreglos de contraste, por maestro y acomodo automático (sin elección ni edición): se buscan una vez. */
const opcionesHechas = new WeakMap<MaestroRevisable, Map<string, Opciones | null>>();

/** La edición sin lo de la pieza `i` (sus lugares, sus partes y el orden de sus partes). */
export function edicionSinPieza(ed: Edicion, i: number): Edicion {
  const sin = <T,>(r: Readonly<Record<number, T>> | undefined) => (r ? Object.fromEntries(Object.entries(r).filter(([k]) => +k !== i)) : r);
  return { ...ed, piezas: sin(ed.piezas) ?? {}, partes: sin(ed.partes), ordenPartes: sin(ed.ordenPartes) };
}

/** B27: si la edición movió a mano la pieza `i` (ella, sus partes o el orden de sus partes): eso se midió con la forma
 *  que tenía la pieza al editar. */
export const edicionMuevePieza = (ed: Edicion | null | undefined, i: number): boolean => !!(ed?.piezas?.[i] || ed?.partes?.[i] || ed?.ordenPartes?.[i]);

/** Para la clave de la caché: la misma edición da la misma firma (números redondeados, piezas en orden, y el orden de
 *  las capas si cambió, y de qué medida se copió). */
const firma = (ed: Edicion | null | undefined) => {
  if (!ed) return "-";
  const enOrden = <T,>(r: Readonly<Record<number, T>>, f: (i: number, v: T) => string) => Object.keys(r).map(Number).sort((a, b) => a - b).map((i) => f(i, r[i])).join(";");
  const lugar = (i: number, v: { x: number; y: number; k: number }) => `${i}@${v.x.toFixed(2)},${v.y.toFixed(2)},${v.k.toFixed(4)}`;
  const lugares = enOrden(ed.piezas ?? {}, lugar);
  const partes = ed.partes ? enOrden(ed.partes, (i, r) => `${i}{${enOrden(r, lugar)}}`) : "";
  const ordenPartes = ed.ordenPartes ? enOrden(ed.ordenPartes, (i, o) => `${i}:${o.join(",")}`) : "";
  const sinTexto = ed.sinTexto ? enOrden(ed.sinTexto, (i, t) => `${i}:${[...t].sort((a, b) => a - b).join(",")}`) : "";
  // La copia de otra medida (B25) cambia los avisos (la de otra forma se revisa entera): entra en la firma.
  const copia = ed.copiaDe ? `c${ed.copiaDe.w}x${ed.copiaDe.h}` : "";
  const renglones = ed.renglones ? `r${ed.renglones}` : "";
  const fondo = ed.fondo ? `f${ed.fondo.z.toFixed(4)},${ed.fondo.cx.toFixed(4)},${ed.fondo.cy.toFixed(4)}` : "";
  return [lugares, ed.orden?.length ? ed.orden.join(",") : "", partes, ordenPartes, sinTexto, copia, renglones, fondo].join("|").replace(/\|+$/, "");
};

/**
 * Una medida completa: de qué maestro sale, su acomodo y TODOS sus avisos (los del acomodo y los de píxeles).
 * Orden: acomodo automático → arreglo de contraste (`contraste`: el que elija la plataforma, por omisión, u otro) →
 * `edicion` (lo que la persona movió a mano en ESTA medida, sobre lo anterior; se revisa todo igual).
 */
export function revisarMedida<M extends MaestroRevisable>(
  maestros: readonly M[],
  W: number,
  H: number,
  op: {
    heroLado?: Lado;
    zona?: Zona | null;
    edicion?: Edicion | null;
    contraste?: EleccionContraste;
    /** B27: los renglones del legal de cada maestro (por su índice), y los que pide el editor sin edición guardada. */
    renglones?: { de: (maestro: number) => Renglonero<M> | null; elegidos?: number | null; legal?: (maestro: number) => number | null };
  } = {},
): Revisada<M> {
  const maestro = elegirMaestro([...maestros], W, H);
  if (maestro < 0) throw new Error("revisarMedida: sin maestros");
  // Sin lado es "derecha" (acomodo.ts): la misma clave para los dos, o la medida se calcula dos veces.
  const lado: Lado = op.heroLado === "izquierda" ? "izquierda" : "derecha";
  // La zona del canal mueve piezas (acomodo.ts): entra en la clave, o al cambiar de canal se queda el acomodo viejo.
  const z = op.zona ?? undefined;
  const base = `${maestro}:${W}x${H}:${lado}:${z ? `${z.top},${z.right},${z.bottom},${z.left}` : "-"}`;
  // El legal en otros renglones (B27): lo pedido en el editor, si se puede; si no, el automático. Con otros renglones,
  // todo lo de abajo sale de esa versión del maestro.
  const delPsd = maestros[maestro];
  let pedidos = op.edicion?.renglones ?? op.renglones?.elegidos ?? null;
  let ma = delPsd, renglones: InfoRenglones | null = null, aMano = false, piezaLegal: number | null = null;
  // Como los avisos de píxeles: si algo raro del PSD rompe los renglones, la medida sale con el legal del PSD.
  try {
    const rg = op.renglones?.de(maestro) ?? null;
    if (rg) {
      piezaLegal = rg.pieza;
      // Lo movido a mano del legal sin renglones guardados se movió con la forma del PSD (lo guardado antes de B27, o
      // con los del PSD: el editor no los escribe): con ésa se queda, o quedaría puesto sobre otra forma.
      if (pedidos === null && edicionMuevePieza(op.edicion, rg.pieza)) pedidos = rg.psd;
      // Las versiones se hacen al pedirlas: en una medida alta sólo si alguien las pide (el editor, o lo guardado).
      const todas = W > H || (pedidos !== null && pedidos !== rg.psd) || (!!op.renglones && "elegidos" in op.renglones);
      // Los `RENGLONES_MAX` de justo abajo de los del PSD (de 8, del 2 al 7; de 3, el 1 y el 2).
      const desde = Math.max(1, rg.psd - RENGLONES_MAX);
      const menos = todas ? Array.from({ length: rg.psd - desde }, (_, i) => desde + i).filter((n) => !!rg.de(n)) : [];
      // Y hasta RENGLONES_MAS más (B29): bajo una columna de texto el legal va más angosto.
      const mas = todas ? Array.from({ length: RENGLONES_MAS }, (_, i) => rg.psd + 1 + i).filter((n) => !!rg.de(n)) : [];
      const opciones = [...menos, rg.psd, ...mas];
      const auto = renglonesAuto(delPsd, rg, opciones, W, H, { heroLado: lado, zona: z }, base);
      aMano = !!pedidos && opciones.includes(pedidos);
      const usados = aMano && pedidos ? pedidos : auto;
      ma = usados === rg.psd ? delPsd : (rg.de(usados) ?? delPsd);
      if (ma !== delPsd) delPsdDe.set(ma, delPsd);
      renglones = { pieza: rg.pieza, psd: rg.psd, auto, usados: ma === delPsd ? rg.psd : usados, opciones };
    }
  } catch (err) {
    console.error("[formatos] renglones del legal", err);
    ma = delPsd;
    renglones = null;
    aMano = false;
  }
  // Lo guardado pedía otros renglones y ahora no se pueden (las tipografías todavía no llegan, o falta la del legal): lo
  // movido a mano del legal se midió con aquella forma del pie, así que se deja de lado (no queda mal puesto) y se dice.
  const noSePudo = !!op.edicion?.renglones && !aMano;
  if (noSePudo && piezaLegal === null) {
    // Sin las versiones (sin tipografías) el legal lo dice la página (`legalDelPsd`, sin letras); sin ella, el pie con
    // texto.
    const i = op.renglones?.legal ? op.renglones.legal(maestro) : delPsd.piezas.findIndex((p) => p.rol === "FOOTER" && (p.textos?.length ?? 0) > 0);
    piezaLegal = i !== null && i >= 0 ? i : null;
  }
  const soltada = noSePudo && piezaLegal !== null && edicionMuevePieza(op.edicion, piezaLegal);
  const edicion = op.edicion && soltada && piezaLegal !== null ? edicionSinPieza(op.edicion, piezaLegal) : op.edicion;
  let porMedida = hechas.get(ma);
  if (!porMedida) hechas.set(ma, (porMedida = new Map()));
  const eleccion = op.contraste ?? "auto";
  // Las opciones también: la tarjeta de una medida alta no las hace y el editor sí (con la misma medida y lo mismo usado).
  // Y qué pieza se soltó: la misma edición con otro legal es otro resultado.
  const clave = `${base}:${eleccion}:${firma(op.edicion)}:${renglones ? `${renglones.usados}/${renglones.auto}/${renglones.opciones.join(",")}${aMano ? "m" : ""}` : "-"}${soltada ? `:s${piezaLegal}` : ""}`;
  const ya = porMedida.get(clave);
  if (ya) return ya as Revisada<M>;
  const auto = acomodar(ma, W, H, { heroLado: lado, zona: z });
  let porOpciones = opcionesHechas.get(ma);
  if (!porOpciones) opcionesHechas.set(ma, (porOpciones = new Map()));
  let opc = porOpciones.get(base);
  if (opc === undefined) {
    // Como los avisos de píxeles: si algo raro del PSD la rompe, la medida sale sin arreglo, no sin medida.
    try {
      opc = opcionesDeContraste(ma, auto, W, H);
    } catch (err) {
      console.error("[formatos] arreglos de contraste", err);
      opc = null;
    }
    porOpciones.set(base, opc);
  }
  const quiere = !opc ? "original" : eleccion === "auto" ? opc.info.auto : eleccion;
  const usado: ArregloContraste = quiere === "fondo" && opc?.fondo ? "fondo" : quiere === "sombra" && opc?.sombra ? "sombra" : "original";
  const arreglada = usado === "fondo" && opc?.fondo ? opc.fondo : usado === "sombra" && opc?.sombra ? opc.sombra : auto;
  const acomodo = edicion ? aplicarEdicion(ma, arreglada, edicion, W, H, z) : arreglada;
  // Los avisos de píxeles son una ayuda: si algo raro del PSD los rompe, la medida sale igual, sin ellos.
  let extra: AvisoAcomodo[] = [];
  try {
    extra = avisosDePixeles(ma, acomodo, W, H);
  } catch (err) {
    console.error("[formatos] avisos de píxeles", err);
  }
  // Menos renglones que en el PSD por el automático: se dice en gris (no hay nada que revisar). Elegidos a mano, no.
  const nota: AvisoAcomodo[] = noSePudo
    ? [{ tipo: "renglones", texto: `Los renglones del legal elegidos a mano (${op.edicion?.renglones}) no se pueden usar ahora: va ${renglones && renglones.usados < renglones.psd ? `en ${renglones.usados}` : "como en el PSD"}${soltada ? ", y lo movido a mano del legal se deja de lado" : ""}.` }]
    : renglones && !aMano && renglones.usados < renglones.psd
      ? [{ tipo: "renglones", texto: `El legal va en ${renglones.usados === 1 ? "1 renglón" : `${renglones.usados} renglones`} (en el PSD, ${renglones.psd}), para que se lea más grande.` }]
      : [];
  const r: Revisada<M> = { maestro, ma, acomodo: { ...acomodo, avisos: [...acomodo.avisos, ...extra, ...nota] }, contraste: opc ? { ...opc.info, usado } : null, renglones };
  porMedida.set(clave, r);
  return r;
}
