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

export type GeometriaAmpliada = { w: number; h: number; ox: number; oy: number };
export type Ampliacion = GeometriaAmpliada & {
  /** RGBA opaco, w × h: lo que pintó la IA con el fondo original cosido en (ox, oy). */
  rgba: Uint8ClampedArray;
  /** El fondo del que salió: si ese fondo cambia («Quitar del fondo»), la ampliación ya no vale. */
  base: Uint8ClampedArray;
  costoUsd: number | null;
  /** Error medio (0-255) entre lo que la IA dejó en el centro y el original. */
  deriva: number;
};

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

/** Cuánto pesa el fondo original (0-1) en (x, y) del lienzo: 0 fuera, sube dentro de la banda de la unión, 1 adentro.
 *  Un lado que toca la orilla del lienzo no tiene unión. */
function pesoOriginal(x: number, y: number, w: number, h: number, g: GeometriaAmpliada, banda: number): number {
  const X = x - g.ox, Y = y - g.oy;
  if (X < 0 || Y < 0 || X >= w || Y >= h) return 0;
  const izq = g.ox > 0 ? (X + 0.5) / banda : 1, der = g.ox + w < g.w ? (w - X - 0.5) / banda : 1;
  const arr = g.oy > 0 ? (Y + 0.5) / banda : 1, aba = g.oy + h < g.h ? (h - Y - 0.5) / banda : 1;
  const t = Math.min(1, izq, der, arr, aba);
  return t * t * (3 - 2 * t);
}
const bandaDe = (w: number, h: number) => Math.max(UNION_MIN_PX, Math.round(Math.min(w, h) * UNION_PARTE));

/**
 * Lo que devolvió la IA (RGBA, lienzo entero) con el fondo original encima: los píxeles del original quedan intactos
 * salvo en la banda de la unión, para que no se note una línea si la IA cambió un poco el color.
 */
export function coserAmpliacion(ia: Uint8ClampedArray, fondo: Uint8ClampedArray, w: number, h: number, g: GeometriaAmpliada): { rgba: Uint8ClampedArray; deriva: number } {
  const rgba = new Uint8ClampedArray(ia);
  const banda = bandaDe(w, h);
  let suma = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4, d = ((y + g.oy) * g.w + x + g.ox) * 4;
      const p = pesoOriginal(x + g.ox, y + g.oy, w, h, g, banda);
      for (let c = 0; c < 3; c++) {
        suma += Math.abs(ia[d + c] - fondo[s + c]);
        rgba[d + c] = ia[d + c] + (fondo[s + c] - ia[d + c]) * p;
      }
    }
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  return { rgba, deriva: suma / (w * h * 3) };
}

/** Sólo lo que pintó la IA, en RGBA del lienzo: transparente donde se ve el fondo original (el PSD editable lo pone
 *  sobre las capas del fondo, que siguen vivas). */
export function rellenoDeLienzo(a: Ampliacion, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(a.rgba);
  const banda = bandaDe(w, h);
  for (let y = 0; y < a.h; y++)
    for (let x = 0; x < a.w; x++) out[(y * a.w + x) * 4 + 3] = Math.round(255 * (1 - pesoOriginal(x, y, w, h, a, banda)));
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
