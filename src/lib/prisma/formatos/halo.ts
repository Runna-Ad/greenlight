/**
 * HÜE Prisma › Formatos — la sombra suave detrás del texto: el arreglo «Sombra» de contraste (Pedro, 2026-10-15:
 * "some might look better with option B and some with option A"). Es un mapa de "multiplicar" del tamaño de la caja
 * de la pieza más un margen: oscurece lo que tiene atrás, más junto a las letras, con un tono oscuro del mismo fondo
 * (no un negro ajeno al anuncio). Viaja con la pieza y se escala con ella, como sus sombras del PSD.
 * Puro: sólo arreglos; corre igual en Node y en el navegador.
 */
import type { Caja } from "./psd.ts";

export type Halo = { pad: number; w: number; h: number; mapa: Uint8ClampedArray };
type PiezaHalo = { caja: Caja; rgba: Uint8ClampedArray; letraMinPx?: number | null; base?: Uint8ClampedArray | null };
type MaestroHalo = { w: number; h: number; fondo: Uint8ClampedArray };

/** Qué tan oscuro queda junto a las letras (0-1). */
const FUERZA = 0.55;
/** Radio del desenfoque: esta parte de la letra más chica de la pieza (o de su lado corto, si no se sabe). */
const RADIO_LETRA = 0.45;
const RADIO_LADO = 0.04;
/** El tono: el color medio del fondo bajo la pieza, así de oscuro. */
const TONO = 0.3;
/** Cuánto se ensancha la mancha: el alfa desenfocado por esto, hasta 1. */
const LLENO = 1.6;

const hechos = new WeakMap<object, Halo | null>();

/** La sombra de una pieza del maestro (o de una de sus partes, si se abrió: cada una lleva la suya), una vez por
 *  pieza. `sinLetras`: sin sus textos (quitados en esa medida), sale de su base. null si no trae píxeles completos. */
export function haloDe(ma: MaestroHalo, p: PiezaHalo | undefined, sinLetras = false): Halo | null {
  if (!p) return null;
  // Se guarda por los píxeles de los que sale: la pieza con sus letras, o su base.
  const rgba = sinLetras && p.base ? p.base : p.rgba;
  const ya = hechos.get(rgba);
  if (ya !== undefined) return ya;
  const h = hacer(ma, { ...p, rgba });
  hechos.set(rgba, h);
  return h;
}

/** Desenfoque de caja de radio r a lo largo de un eje (fuera de la imagen cuenta como 0). */
function caja1(src: Float32Array, dst: Float32Array, n: number, lineas: number, paso: number, salto: number, r: number): void {
  const ancho = 2 * r + 1;
  for (let l = 0; l < lineas; l++) {
    const o = l * salto;
    let s = 0;
    for (let i = 0; i <= Math.min(r, n - 1); i++) s += src[o + i * paso];
    for (let i = 0; i < n; i++) {
      dst[o + i * paso] = s / ancho;
      if (i + r + 1 < n) s += src[o + (i + r + 1) * paso];
      if (i - r >= 0) s -= src[o + (i - r) * paso];
    }
  }
}

function hacer(ma: MaestroHalo, p: PiezaHalo): Halo | null {
  const { w: cw, h: ch } = p.caja;
  if (!(cw > 0 && ch > 0) || p.rgba.length < cw * ch * 4) return null;
  const base = typeof p.letraMinPx === "number" && p.letraMinPx > 0 ? p.letraMinPx * RADIO_LETRA : Math.min(cw, ch) * RADIO_LADO;
  // Tres pasadas de caja (≈ gaussiana) llegan a 3r: el margen es ése, o la sombra se cortaría en la orilla.
  const r = Math.max(2, Math.round(base)), pad = 3 * r, w = cw + 2 * pad, h = ch + 2 * pad;
  const alfa = new Float32Array(w * h), tmp = new Float32Array(w * h);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) alfa[(y + pad) * w + x + pad] = p.rgba[(y * cw + x) * 4 + 3] / 255;
  for (let n = 0; n < 3; n++) {
    caja1(alfa, tmp, w, h, 1, w, r);
    caja1(tmp, alfa, h, w, w, 1, r);
  }
  // El tono: el fondo del maestro bajo la caja (lo que el diseñador puso ahí), oscurecido.
  const suma = [0, 0, 0];
  let n = 0;
  const x0 = Math.max(0, p.caja.x), y0 = Math.max(0, p.caja.y), x1 = Math.min(ma.w, p.caja.x + cw), y1 = Math.min(ma.h, p.caja.y + ch);
  for (let y = y0; y < y1; y += 2)
    for (let x = x0; x < x1; x += 2) {
      const i = (y * ma.w + x) * 4;
      for (let c = 0; c < 3; c++) suma[c] += ma.fondo[i + c];
      n++;
    }
  const tono = suma.map((s) => (n ? s / n : 0) * TONO);
  const mapa = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = Math.min(1, alfa[i] * LLENO) * FUERZA;
    for (let c = 0; c < 3; c++) mapa[i * 4 + c] = 255 * (1 - a * (1 - tono[c] / 255));
    mapa[i * 4 + 3] = 255;
  }
  return { pad, w, h, mapa };
}
