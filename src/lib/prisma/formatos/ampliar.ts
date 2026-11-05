/**
 * HÜE Prisma › Formatos, PSD — «Ampliar fondo con IA», una medida a la vez (Pedro, 2026-11-04). Hoy el fondo se agranda
 * hasta cubrir la medida y las piezas se abren con él, hasta casi tocar las orillas ("with the zoom a lot of the times it
 * brings the other assets right to the edge"). Con la ampliación el lienzo del maestro crece hasta la forma de la medida:
 * el fondo no se agranda de más y las piezas conservan el aire que les dio el diseñador.
 *
 * El acomodo y la revisión siguen sin saber nada de esto: reciben un maestro más grande, con las cajas corridas lo que
 * creció a la izquierda y arriba (`maestroAmpliado`). Sólo la familia del acomodo se sigue decidiendo con la forma real
 * (`MaestroCaja.forma`): un banner sigue siendo banner. Puro: corre igual en Node y en el navegador.
 */
import type { MaestroCaja } from "./acomodo.ts";
import type { Caja } from "./psd.ts";

/** De aquí para abajo el fondo casi no se agranda: la IA no ganaría nada. */
export const ZOOM_PARA_AMPLIAR = 1.02;
/** Un lienzo de más píxeles no se ofrece: son 4 bytes por píxel en la memoria de la pestaña, por cada medida ampliada, y
 *  Safari deja en blanco un <canvas> de más de ~16.7 M de píxeles. */
export const LIENZO_MAX_PX = 16_000_000;
/** Por debajo de esta parte del lienzo, lo que se ve del fondo es casi todo inventado: se avisa, no se bloquea. */
export const ORIGINAL_POCO = 0.3;
/** Banda de la unión, dentro del fondo original: su parte del lado menor, y lo menos en px. */
const UNION_PARTE = 0.02;
const UNION_MIN_PX = 4;
/** Hasta dónde, dentro del fondo original, puede pasar el corte: su parte del lado menor. */
const CORTE_PARTE = 0.15;
/** Lo más que se corrige el color de lo que pintó la IA, por canal (0-255): más que eso ya no es un tono corrido. */
const COLOR_MAX = 24;
/** Lado mayor de la copia chica con la que se busca dónde quedó el fondo en lo que pintó la IA. */
const ALINEAR_LADO = 256;
/** Lo más que se busca que la IA haya corrido el fondo: su parte del lado menor. */
const ALINEAR_PARTE = 0.04;
/** Las escalas que se prueban: la IA a veces lo redibuja apenas más grande o más chico. */
const ALINEAR_ESCALAS = [0.97, 0.98, 0.99, 1, 1.01, 1.02, 1.03];
/** Lo que tiene que bajar el error para aceptar el corrimiento: si casi no mejora, la imagen de la IA no se toca. */
const ALINEAR_MEJORA = 0.9;
/** Aire de más al rellenar un hueco: su parte del lado menor de la medida. */
const AIRE_HUECO = 0.05;

export type GeometriaAmpliada = { w: number; h: number; ox: number; oy: number };
export type Ampliacion = GeometriaAmpliada & {
  /** RGBA opaco, w × h: lo que pintó la IA con el fondo original cosido en (ox, oy). */
  rgba: Uint8ClampedArray;
  /** El fondo del que salió: si ese fondo cambia («Quitar del fondo»), la ampliación ya no vale. */
  base: Uint8ClampedArray;
  costoUsd: number | null;
  /** Error medio (0-255) entre lo que la IA dejó en el centro y el original. */
  deriva: number;
  /** Por dónde pasa la unión con el original. Sin esto, o si es de otro fondo, la unión va pegada a la orilla. */
  cortes?: Cortes;
  /**
   * Sólo se rellenó el hueco que dejó el fondo movido a mano: las piezas se quedan como estaban. `forma`: la ampliación
   * sobre la que se acomodan, si la había; `previa`: a la que se vuelve al quitar ésta.
   */
  hueco?: { forma: Ampliacion | null; previa: Ampliacion | null };
};
/** ¿Esta ampliación cambia el acomodo? Sólo rellenar un hueco, sin ampliación de forma debajo, no lo cambia. */
export const cambiaAcomodo = (a: Ampliacion | null | undefined): boolean => !!a && (!a.hueco || !!a.hueco.forma);

/** ¿El fondo, puesto así, deja sin cubrir parte de la medida? */
export const hayHueco = (f: { k: number; x: number; y: number }, ma: { w: number; h: number }, W: number, H: number): boolean =>
  f.x > 0.5 || f.y > 0.5 || f.x + ma.w * f.k < W - 0.5 || f.y + ma.h * f.k < H - 0.5;

/**
 * El lienzo que cubre lo que se ve con el fondo movido a mano, más un poco de aire en los lados del hueco para poder
 * ajustarlo sin volver a pagar. `previa`: la ampliación que `ma` ya trae. Lo que `ma` ya tiene va en (x, y) del lienzo
 * nuevo; `g.ox`/`g.oy` siguen siendo dónde queda el fondo ORIGINAL.
 */
export function lienzoConHueco(ma: { w: number; h: number }, f: { k: number; x: number; y: number }, W: number, H: number, previa: GeometriaAmpliada | null): { g: GeometriaAmpliada; x: number; y: number } {
  const aire = Math.round((AIRE_HUECO * Math.min(W, H)) / f.k);
  // Con la misma tolerancia que `hayHueco`: un lado sin hueco de verdad no se paga.
  const lado = (falta: number) => (falta * f.k > 0.5 ? Math.ceil(falta) + aire : 0);
  const L = lado(f.x / f.k), T = lado(f.y / f.k);
  const R = lado((W - f.x) / f.k - ma.w), B = lado((H - f.y) / f.k - ma.h);
  return { g: { w: ma.w + L + R, h: ma.h + T + B, ox: (previa?.ox ?? 0) + L, oy: (previa?.oy ?? 0) + T }, x: L, y: T };
}

/** ¿Tiene sentido ampliar? Sólo si el fondo hoy se agranda para cubrir la medida y el lienzo no se sale de la memoria. */
export function valeAmpliar(w: number, h: number, W: number, H: number): boolean {
  if (Math.max(W / w, H / h) / Math.min(W / w, H / h) < ZOOM_PARA_AMPLIAR) return false;
  const g = lienzoAmpliado(w, h, W, H);
  return g.w * g.h <= LIENZO_MAX_PX;
}

/** El lienzo de la forma de la medida que contiene al fondo a su tamaño, con el fondo centrado. */
export function lienzoAmpliado(w: number, h: number, W: number, H: number): GeometriaAmpliada {
  const k = Math.min(W / w, H / h);
  const lw = Math.max(w, Math.round(W / k)), lh = Math.max(h, Math.round(H / k));
  return { w: lw, h: lh, ox: Math.floor((lw - w) / 2), oy: Math.floor((lh - h) / 2) };
}

/** Qué parte del lienzo es el fondo original. */
export const parteOriginal = (w: number, h: number, g: GeometriaAmpliada): number => (w * h) / (g.w * g.h);

/**
 * Por cada lado con unión, a cuántos px de esa orilla (hacia adentro del original) empieza a verse el original, a lo
 * largo de ese lado. null: ese lado toca la orilla del lienzo y no tiene unión.
 */
export type Cortes = { w: number; h: number; ox: number; oy: number; izq: Uint16Array | null; der: Uint16Array | null; arr: Uint16Array | null; aba: Uint16Array | null };

/** Cuánto pesa el fondo original (0-1) en (x, y) del lienzo: 0 fuera, sube dentro de la banda de la unión, 1 adentro.
 *  Un lado que toca la orilla del lienzo no tiene unión. Con `cortes`, la banda empieza donde dice el corte. */
function pesoOriginal(x: number, y: number, w: number, h: number, g: GeometriaAmpliada, banda: number, cortes?: Cortes): number {
  const X = x - g.ox, Y = y - g.oy;
  if (X < 0 || Y < 0 || X >= w || Y >= h) return 0;
  const izq = g.ox > 0 ? (X + 0.5 - (cortes?.izq?.[Y] ?? 0)) / banda : 1, der = g.ox + w < g.w ? (w - X - 0.5 - (cortes?.der?.[Y] ?? 0)) / banda : 1;
  const arr = g.oy > 0 ? (Y + 0.5 - (cortes?.arr?.[X] ?? 0)) / banda : 1, aba = g.oy + h < g.h ? (h - Y - 0.5 - (cortes?.aba?.[X] ?? 0)) / banda : 1;
  const t = Math.max(0, Math.min(1, izq, der, arr, aba));
  return t * t * (3 - 2 * t);
}
const bandaDe = (w: number, h: number) => Math.max(UNION_MIN_PX, Math.round(Math.min(w, h) * UNION_PARTE));

type Alineacion = { s: number; dx: number; dy: number };

/** El error medio entre el original y lo que la IA dejó en su lugar, con la IA corrida `a`. Salta `paso` px. */
function errorDe(ia: Uint8ClampedArray, fondo: Uint8ClampedArray, w: number, h: number, g: GeometriaAmpliada, a: Alineacion, paso: number): number {
  const cx = g.w / 2, cy = g.h / 2;
  let suma = 0, n = 0;
  for (let y = 0; y < h; y += paso)
    for (let x = 0; x < w; x += paso) {
      const ix = Math.round(cx + a.s * (x + g.ox - cx) + a.dx), iy = Math.round(cy + a.s * (y + g.oy - cy) + a.dy);
      if (ix < 0 || iy < 0 || ix >= g.w || iy >= g.h) continue;
      const s = (y * w + x) * 4, d = (iy * g.w + ix) * 4;
      suma += Math.abs(ia[d] - fondo[s]) + Math.abs(ia[d + 1] - fondo[s + 1]) + Math.abs(ia[d + 2] - fondo[s + 2]);
      n++;
    }
  return n ? suma / n : Infinity;
}

/** Dónde quedó el fondo en lo que pintó la IA: primero a lo grueso, luego px por px cerca de lo mejor. */
function alinear(ia: Uint8ClampedArray, fondo: Uint8ClampedArray, w: number, h: number, g: GeometriaAmpliada): Alineacion {
  const quieto: Alineacion = { s: 1, dx: 0, dy: 0 };
  const paso = Math.max(1, Math.round(Math.max(w, h) / ALINEAR_LADO));
  const R = Math.max(paso, Math.ceil(Math.min(w, h) * ALINEAR_PARTE));
  const base = errorDe(ia, fondo, w, h, g, quieto, paso * 2);
  let mejor = quieto, menor = base;
  for (const s of ALINEAR_ESCALAS)
    for (let dy = -R; dy <= R; dy += paso)
      for (let dx = -R; dx <= R; dx += paso) {
        const e = errorDe(ia, fondo, w, h, g, { s, dx, dy }, paso * 2);
        if (e < menor) { menor = e; mejor = { s, dx, dy }; }
      }
  const grueso = mejor;
  for (let dy = grueso.dy - paso; dy <= grueso.dy + paso; dy++)
    for (let dx = grueso.dx - paso; dx <= grueso.dx + paso; dx++) {
      const e = errorDe(ia, fondo, w, h, g, { s: grueso.s, dx, dy }, paso * 2);
      if (e < menor) { menor = e; mejor = { s: grueso.s, dx, dy }; }
    }
  return menor < base * ALINEAR_MEJORA ? mejor : quieto;
}

/** Lo que pintó la IA, corrido para que su fondo caiga sobre el original. Sin corrimiento, la misma imagen. */
function correrIA(ia: Uint8ClampedArray, g: GeometriaAmpliada, a: Alineacion): Uint8ClampedArray {
  if (a.s === 1 && a.dx === 0 && a.dy === 0) return ia;
  const out = new Uint8ClampedArray(ia.length);
  const cx = g.w / 2, cy = g.h / 2;
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const fx = Math.min(g.w - 1, Math.max(0, cx + a.s * (x - cx) + a.dx)), fy = Math.min(g.h - 1, Math.max(0, cy + a.s * (y - cy) + a.dy));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(g.w - 1, x0 + 1), y1 = Math.min(g.h - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
      const d = (y * g.w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const arriba = ia[(y0 * g.w + x0) * 4 + c] * (1 - tx) + ia[(y0 * g.w + x1) * 4 + c] * tx;
        const abajo = ia[(y1 * g.w + x0) * 4 + c] * (1 - tx) + ia[(y1 * g.w + x1) * 4 + c] * tx;
        out[d + c] = arriba * (1 - ty) + abajo * ty;
      }
      out[d + 3] = 255;
    }
  return out;
}

/** El camino de menor diferencia a lo largo de un lado: `costo(i, d)` es la diferencia a `d` px de la orilla, en el punto
 *  `i` del lado. De un punto al siguiente se mueve a lo más 1 px, para que el corte no brinque. */
function caminoBarato(largo: number, hondo: number, costo: (i: number, d: number) => number): Uint16Array {
  const camino = new Uint16Array(largo);
  if (hondo <= 1) return camino;
  const de = new Int8Array(largo * hondo);
  let antes = new Float64Array(hondo), ahora = new Float64Array(hondo);
  for (let d = 0; d < hondo; d++) antes[d] = costo(0, d);
  for (let i = 1; i < largo; i++) {
    for (let d = 0; d < hondo; d++) {
      let m = antes[d], paso = 0;
      if (d > 0 && antes[d - 1] < m) { m = antes[d - 1]; paso = -1; }
      if (d + 1 < hondo && antes[d + 1] < m) { m = antes[d + 1]; paso = 1; }
      ahora[d] = m + costo(i, d);
      de[i * hondo + d] = paso;
    }
    [antes, ahora] = [ahora, antes];
  }
  let d = 0;
  for (let j = 1; j < hondo; j++) if (antes[j] < antes[d]) d = j;
  for (let i = largo - 1; i >= 0; i--) {
    camino[i] = d;
    d += de[i * hondo + d];
  }
  return camino;
}

/** Por dónde cortar en cada lado: donde lo que pintó la IA y el original más se parecen, para que la unión no se note. */
function cortesDe(ia: Uint8ClampedArray, fondo: Uint8ClampedArray, w: number, h: number, g: GeometriaAmpliada, banda: number): Cortes {
  // Lo que se mezcla después del corte tiene que caber antes de llegar al lado de enfrente.
  const hondo = Math.max(1, Math.min(Math.round(Math.min(w, h) * CORTE_PARTE), Math.floor(Math.min(w, h) / 2) - banda));
  const dif = (x: number, y: number) => {
    const s = (y * w + x) * 4, d = ((y + g.oy) * g.w + x + g.ox) * 4;
    return Math.abs(ia[d] - fondo[s]) + Math.abs(ia[d + 1] - fondo[s + 1]) + Math.abs(ia[d + 2] - fondo[s + 2]);
  };
  return {
    w, h, ox: g.ox, oy: g.oy,
    izq: g.ox > 0 ? caminoBarato(h, hondo, (y, d) => dif(d, y)) : null,
    der: g.ox + w < g.w ? caminoBarato(h, hondo, (y, d) => dif(w - 1 - d, y)) : null,
    arr: g.oy > 0 ? caminoBarato(w, hondo, (x, d) => dif(x, d)) : null,
    aba: g.oy + h < g.h ? caminoBarato(w, hondo, (x, d) => dif(x, h - 1 - d)) : null,
  };
}

/**
 * Lo que devolvió la IA (RGBA, lienzo entero) con el fondo original encima. Gemini vuelve a dibujar TODA la imagen, también
 * el centro, y lo que pinta afuera sigue a SU centro: pegar el original sin más deja una línea (Pedro, 2026-11-05). Por
 * eso, en orden: se corre lo de la IA hasta que su fondo caiga sobre el original, se le corrige el tono, y la unión pasa
 * por donde las dos imágenes más se parecen. Del corte hacia adentro, los píxeles del original quedan intactos.
 */
export function coserAmpliacion(ia0: Uint8ClampedArray, fondo: Uint8ClampedArray, w: number, h: number, g: GeometriaAmpliada): { rgba: Uint8ClampedArray; deriva: number; cortes: Cortes } {
  const corrida = correrIA(ia0, g, alinear(ia0, fondo, w, h, g));
  const sumas = [0, 0, 0];
  let error = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4, d = ((y + g.oy) * g.w + x + g.ox) * 4;
      for (let c = 0; c < 3; c++) {
        sumas[c] += fondo[s + c] - corrida[d + c];
        error += Math.abs(corrida[d + c] - fondo[s + c]);
      }
    }
  const tono = sumas.map((v) => Math.max(-COLOR_MAX, Math.min(COLOR_MAX, Math.round(v / (w * h)))));
  const deriva = error / (w * h * 3);
  const rgba = new Uint8ClampedArray(corrida.length);
  for (let i = 0; i < rgba.length; i += 4) {
    for (let c = 0; c < 3; c++) rgba[i + c] = corrida[i + c] + tono[c];
    rgba[i + 3] = 255;
  }
  const banda = bandaDe(w, h);
  const cortes = cortesDe(rgba, fondo, w, h, g, banda);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4, d = ((y + g.oy) * g.w + x + g.ox) * 4;
      const p = pesoOriginal(x + g.ox, y + g.oy, w, h, g, banda, cortes);
      for (let c = 0; c < 3; c++) rgba[d + c] = rgba[d + c] + (fondo[s + c] - rgba[d + c]) * p;
    }
  return { rgba, deriva, cortes };
}

/** Sólo lo que pintó la IA, en RGBA del lienzo: transparente donde se ve el fondo original (el PSD editable lo pone
 *  sobre las capas del fondo, que siguen vivas). */
export function rellenoDeLienzo(a: Ampliacion, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(a.rgba);
  const banda = bandaDe(w, h);
  // Un relleno sobre otra ampliación se cosió sobre esa imagen, no sobre el fondo original: su corte no sirve aquí.
  const c = a.cortes && a.cortes.w === w && a.cortes.h === h && a.cortes.ox === a.ox && a.cortes.oy === a.oy ? a.cortes : undefined;
  for (let y = 0; y < a.h; y++)
    for (let x = 0; x < a.w; x++) out[(y * a.w + x) * 4 + 3] = Math.round(255 * (1 - pesoOriginal(x, y, w, h, a, banda, c)));
  return out;
}

/** El fondo del acomodo (en px del lienzo) como se pone el fondo ORIGINAL del PSD: misma escala, su esquina corrida. */
export const fondoEnOriginal = (f: { k: number; x: number; y: number }, a: GeometriaAmpliada) => ({ k: f.k, x: f.x + a.ox * f.k, y: f.y + a.oy * f.k });

type Ampliable = MaestroCaja & { fondo: Uint8ClampedArray };
const ampliados = new WeakMap<object, WeakMap<Ampliacion, object>>();
const origenDe = new WeakMap<object, { ma: object; a: Ampliacion }>();

/** El maestro con el lienzo ampliado. Siempre el MISMO objeto para el mismo maestro y ampliación (la revisión guarda lo
 *  hecho por maestro). Los textos y los píxeles de cada pieza son los mismos: sólo se corren las cajas. */
export function maestroAmpliado<M extends Ampliable>(ma: M, a: Ampliacion): M {
  let porA = ampliados.get(ma);
  if (!porA) ampliados.set(ma, (porA = new WeakMap()));
  const ya = porA.get(a);
  if (ya) return ya as M;
  const corre = <C extends Caja>(c: C): C => ({ ...c, x: c.x + a.ox, y: c.y + a.oy });
  const nuevo: M = {
    ...ma,
    w: a.w,
    h: a.h,
    forma: { w: ma.w, h: ma.h },
    // Lo movido a mano sigue midiéndose sobre el lienzo con el que se acomodó, no sobre el que trae el relleno.
    ...(a.hueco ? { lienzo: { w: a.hueco.forma?.w ?? ma.w, h: a.hueco.forma?.h ?? ma.h, dx: a.ox - (a.hueco.forma?.ox ?? 0), dy: a.oy - (a.hueco.forma?.oy ?? 0) } } : {}),
    fondo: a.rgba,
    piezas: ma.piezas.map((p) => ({
      ...p,
      solido: corre(p.solido),
      ...(p.caja ? { caja: corre(p.caja) } : {}),
      ...(p.partes ? { partes: p.partes.map((q) => ({ ...q, solido: corre(q.solido), ...(q.caja ? { caja: corre(q.caja) } : {}) })) } : {}),
    })),
    ...(ma.pegados ? { pegados: ma.pegados.map((q) => ({ ...q, caja: corre(q.caja) })) } : {}),
    ...(ma.resplandores ? { resplandores: ma.resplandores.map((q) => ({ ...q, caja: corre(q.caja) })) } : {}),
  };
  porA.set(a, nuevo);
  origenDe.set(nuevo, { ma, a });
  return nuevo;
}
/** El maestro de antes de ampliar (el mismo, si no se amplió). Lo que mira el PSD original y los textos va con éste. */
export const sinAmpliar = <M extends object>(ma: M): M => (origenDe.get(ma)?.ma as M | undefined) ?? ma;
/** La ampliación de un maestro ampliado; null si no lo es. */
export const ampliacionDe = (ma: object): Ampliacion | null => origenDe.get(ma)?.a ?? null;
