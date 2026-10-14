/**
 * HÜE Prisma › Formatos — una copia de la pieza pintada en el fondo (puro: sólo arreglos; corre igual en Node y en el
 * navegador).
 *
 * Pasa con fondos hechos con IA: la imagen ya trae el producto justo donde el diseñador puso su carpeta (s33 de DiDi:
 * la tarjeta naranja está pintada en el colchón debajo de la de CARD). En el maestro no se nota porque la pieza la
 * tapa; en las medidas donde la pieza se mueve, se ven dos. Aquí se DETECTA y, sólo si la persona lo aprueba, se borra
 * rellenando el hueco con lo que tiene a los lados, sin IA (Pedro, 2026-10-14: "detects, warns and suggest fix. if
 * they approve then option 1 kicks in").
 */
import { RATIOS_IA } from "./geometria.ts";
import type { Caja, Rol } from "./psd.ts";

type PiezaPixeles = { rol: Rol | null; caja: Caja; rgba: Uint8ClampedArray };
type ConFondo = { w: number; h: number; fondo: Uint8ClampedArray; piezas: PiezaPixeles[] };

/** Dentro de la silueta, qué parte del fondo se tiene que parecer a la pieza para llamarlo copia (s33: 91 %). */
export const GEMELA_MIN = 0.75;
/** Y cuánto más que a un lado de ella: un producto blanco sobre un fondo blanco se "parece" en todas partes y no es copia. */
export const GEMELA_VENTAJA = 0.3;
/** Una pieza que tapa más de esta parte del maestro no se borra: no queda alrededor de dónde rellenar. */
export const GEMELA_AREA_MAX = 0.5;
/** Diferencia media por canal (0-255) bajo la que un píxel del fondo es "el mismo" que el de la pieza. */
const PIXEL_PARECIDO = 45;
/** Píxeles de la silueta que se comparan como mucho (se salta en rejilla): medir no debe trabar la pantalla. */
const MUESTRAS_MAX = 40_000;
/** Para opinar: puntos mínimos de silueta, y qué parte de ellos tiene que caer dentro del fondo al correrla. */
const SILUETA_MIN = 100;
const DENTRO_MIN = 0.25;
/** Silueta para medir: lo opaco de la pieza. Para borrar: también su orilla suave. */
const ALFA_MEDIR = 230;
const ALFA_BORRAR = 25;
/** Renglones hacia arriba y hacia abajo que se mezclan dentro del hueco para que no queden rayas. */
const MEZCLA_VERTICAL = 2;
/** Renglones hacia arriba y hacia abajo con que se suaviza el color "de lejos" al quitar el reflejo. */
const LEJOS_SUAVE = 8;
/** Reflejo que se tolera (en unidades 0-255 hacia el color de la pieza) antes de quitarlo; y con qué tan poco color
 *  de diferencia entre la pieza y lo de alrededor ya no hay reflejo que quitar (pieza blanca sobre fondo blanco). */
const REFLEJO_TOLERADO = 8;
const COLOR_DISTINTO_MIN = 40;

/** `parecido` 0-1; `caja` = lo que se puede tocar al borrar, en px del maestro (la silueta, su orilla y el reflejo). */
export type Gemela = { pieza: number; parecido: number; caja: Caja };

/** Cuánto se ensancha la silueta al borrar: la copia pintada nunca cae píxel a píxel. */
const radioDe = (p: PiezaPixeles) => Math.max(6, Math.round(0.03 * Math.min(p.caja.w, p.caja.h)));
/** Hasta dónde llega el reflejo de color de la copia sobre lo de alrededor (s33: el naranja de la tarjeta en el colchón). */
const reflejoDe = (p: PiezaPixeles) => Math.max(8, Math.round(0.2 * Math.min(p.caja.w, p.caja.h)));
const completa = (ma: ConFondo, p: PiezaPixeles) =>
  p.caja.w > 0 && p.caja.h > 0 && p.rgba.length >= p.caja.w * p.caja.h * 4 && ma.fondo.length >= ma.w * ma.h * 4;

/** Qué parte de la silueta de `p` se parece al fondo corrido (dx, dy). null = casi toda cae fuera del fondo. */
function parecidoCorrido(ma: ConFondo, p: PiezaPixeles, dx: number, dy: number): number | null {
  const { x: cx, y: cy, w: cw, h: ch } = p.caja;
  const paso = Math.max(1, Math.ceil(Math.sqrt((cw * ch) / MUESTRAS_MAX)));
  let silueta = 0, dentro = 0, iguales = 0;
  for (let y = 0; y < ch; y += paso)
    for (let x = 0; x < cw; x += paso) {
      const k = (y * cw + x) * 4;
      if (p.rgba[k + 3] < ALFA_MEDIR) continue;
      silueta++;
      const X = cx + x + dx, Y = cy + y + dy;
      if (X < 0 || Y < 0 || X >= ma.w || Y >= ma.h) continue;
      dentro++;
      const j = (Y * ma.w + X) * 4;
      if (Math.abs(ma.fondo[j] - p.rgba[k]) + Math.abs(ma.fondo[j + 1] - p.rgba[k + 1]) + Math.abs(ma.fondo[j + 2] - p.rgba[k + 2]) < PIXEL_PARECIDO * 3) iguales++;
    }
  return silueta >= SILUETA_MIN && dentro >= silueta * DENTRO_MIN ? iguales / dentro : null;
}

/** ¿El fondo trae pintada una copia del HERO justo debajo de él? La más clara, o null. */
export function buscarGemela(ma: ConFondo): Gemela | null {
  let mejor: Gemela | null = null;
  for (let i = 0; i < ma.piezas.length; i++) {
    const p = ma.piezas[i];
    if (p.rol !== "HERO" || !completa(ma, p) || p.caja.w * p.caja.h > GEMELA_AREA_MAX * ma.w * ma.h) continue;
    const debajo = parecidoCorrido(ma, p, 0, 0);
    if (debajo === null || debajo < GEMELA_MIN || (mejor && mejor.parecido >= debajo)) continue;
    // Contra el fondo de al lado: una copia se parece DEBAJO, no en todas partes. Si la pieza es tan grande que
    // corrida entera cae fuera, se corre media. Sin ningún lado que medir no hay cómo saberlo: no se marca.
    const { w, h } = p.caja;
    const corrida = (f: number) => [[-w * f, 0], [w * f, 0], [0, -h * f], [0, h * f]].map(([dx, dy]) => parecidoCorrido(ma, p, Math.round(dx), Math.round(dy))).filter((v) => v !== null);
    let lados = corrida(1);
    if (!lados.length) lados = corrida(0.5);
    if (!lados.length || lados.some((v) => v > debajo - GEMELA_VENTAJA)) continue;
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (p.rgba[(y * w + x) * 4 + 3] >= ALFA_BORRAR) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    if (x1 < 0) continue;
    const r = radioDe(p) + reflejoDe(p);
    const X0 = Math.max(0, p.caja.x + x0 - r), Y0 = Math.max(0, p.caja.y + y0 - r);
    const X1 = Math.min(ma.w, p.caja.x + x1 + 1 + r), Y1 = Math.min(ma.h, p.caja.y + y1 + 1 + r);
    if (X1 > X0 && Y1 > Y0) mejor = { pieza: i, parecido: debajo, caja: { x: X0, y: Y0, w: X1 - X0, h: Y1 - Y0 } };
  }
  return mejor;
}

/** Ensancha una máscara (w × h, 0/1) `r` px en cuadro: una pasada por filas y otra por columnas, con sumas acumuladas. */
function ensanchar(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const fila = new Uint8Array(m.length), out = new Uint8Array(m.length), suma = new Int32Array(Math.max(w, h) + 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) suma[x + 1] = suma[x] + m[y * w + x];
    for (let x = 0; x < w; x++) fila[y * w + x] = suma[Math.min(w, x + r + 1)] - suma[Math.max(0, x - r)] > 0 ? 1 : 0;
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) suma[y + 1] = suma[y] + fila[y * w + x];
    for (let y = 0; y < h; y++) out[y * w + x] = suma[Math.min(h, y + r + 1)] - suma[Math.max(0, y - r)] > 0 ? 1 : 0;
  }
  return out;
}

/**
 * El fondo sin la copia (RGBA nuevo; el de entrada no se toca), en tres pasos:
 * 1. Cada renglón del hueco se rellena con lo que tiene a su izquierda y a su derecha, reflejado como en un espejo y
 *    mezclado según la distancia: las nubes y el colchón siguen en vez de emborronarse.
 * 2. Una mezcla vertical corta dentro del hueco, para que los renglones no se vean como rayas.
 * 3. El reflejo: alrededor, el fondo trae el color de la copia (el naranja de la tarjeta sobre el colchón) y el espejo
 *    lo mete al hueco. Se le quita sólo ese tinte, comparando con el color de más lejos; el brillo se queda igual, así
 *    que la textura no cambia.
 */
/** El hueco a borrar, dentro de `g.caja` (bw × bh, 0/1): la silueta de la pieza ensanchada. */
function huecoDe(p: PiezaPixeles, g: Gemela): Uint8Array {
  const { x: bx, y: by, w: bw, h: bh } = g.caja;
  const silueta = new Uint8Array(bw * bh);
  for (let y = 0; y < p.caja.h; y++)
    for (let x = 0; x < p.caja.w; x++) {
      const X = p.caja.x + x - bx, Y = p.caja.y + y - by;
      if (X >= 0 && Y >= 0 && X < bw && Y < bh && p.rgba[(y * p.caja.w + x) * 4 + 3] >= ALFA_BORRAR) silueta[Y * bw + X] = 1;
    }
  return ensanchar(silueta, bw, bh, radioDe(p));
}

export function quitarGemela(ma: ConFondo, g: Gemela): Uint8ClampedArray {
  const p = ma.piezas[g.pieza];
  if (!p || !completa(ma, p)) return ma.fondo;
  const { x: bx, y: by, w: bw, h: bh } = g.caja;
  const m = huecoDe(p, g);
  const W = ma.w, src = ma.fondo, out = new Uint8ClampedArray(src);
  const hueco = (X: number, Y: number) => X >= bx && X < bx + bw && m[(Y - by) * bw + (X - bx)] === 1;
  // 1) Espejo por renglón.
  for (let Y = by; Y < by + bh; Y++) {
    let X = bx;
    while (X < bx + bw) {
      if (!hueco(X, Y)) { X++; continue; }
      let b = X;
      while (b + 1 < bx + bw && hueco(b + 1, Y)) b++;
      const a = X, n = b - a + 1;
      for (let i = a; i <= b; i++) {
        // Reflejo a cada lado; si cae fuera o en otro hueco, la orilla (que nunca es hueco).
        let xl: number | null = a - 1 - (i - a), xr: number | null = b + 1 + (b - i);
        if (xl < 0 || hueco(xl, Y)) xl = a > 0 ? a - 1 : null;
        if (xr >= W || hueco(xr, Y)) xr = b + 1 < W ? b + 1 : null;
        if (xl === null && xr === null) continue;
        const t = n > 1 ? (i - a) / (n - 1) : 0.5;
        const wl = xl === null ? 0 : xr === null ? 1 : 1 - t;
        const d = (Y * W + i) * 4, l = (Y * W + (xl ?? 0)) * 4, r = (Y * W + (xr ?? 0)) * 4;
        for (let c = 0; c < 3; c++) out[d + c] = src[l + c] * wl + src[r + c] * (1 - wl);
      }
      X = b + 1;
    }
  }
  // 2) Mezcla vertical sólo dentro del hueco, leyendo de una copia de la caja para no arrastrar lo ya mezclado.
  const copia = new Uint8ClampedArray(bw * bh * 4);
  for (let y = 0; y < bh; y++) copia.set(out.subarray(((by + y) * W + bx) * 4, ((by + y) * W + bx + bw) * 4), y * bw * 4);
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      if (!m[y * bw + x]) continue;
      const d = ((by + y) * W + bx + x) * 4;
      for (let c = 0; c < 3; c++) {
        let s = 0, n = 0;
        for (let yy = Math.max(0, y - MEZCLA_VERTICAL); yy <= Math.min(bh - 1, y + MEZCLA_VERTICAL); yy++) {
          s += copia[(yy * bw + x) * 4 + c];
          n++;
        }
        out[d + c] = s / n;
      }
    }
  quitarReflejo(ma, p, g.caja, out);
  return out;
}

/** Paso 3 de `quitarGemela`, sobre `out` (sólo dentro de `caja`). El color sin brillo es (a, b): a = rojo − verde,
 *  b = amarillo − azul; con el brillo (el promedio de los tres canales) se vuelve a RGB sin pérdida. */
function quitarReflejo(ma: ConFondo, p: PiezaPixeles, caja: Caja, out: Uint8ClampedArray): void {
  // El color de la pieza (lo opaco), sin brillo.
  let pa = 0, pb = 0, n = 0;
  for (let i = 0; i < p.caja.w * p.caja.h; i++) {
    const k = i * 4;
    if (p.rgba[k + 3] < ALFA_MEDIR) continue;
    pa += p.rgba[k] - p.rgba[k + 1];
    pb += (p.rgba[k] + p.rgba[k + 1]) / 2 - p.rgba[k + 2];
    n++;
  }
  if (!n) return;
  pa /= n;
  pb /= n;
  // El color de más lejos a cada lado de cada renglón (una franja del ancho del reflejo), suavizado entre renglones
  // para que la corrección no deje rayas. Cada lado por separado: si a la izquierda hay cielo y a la derecha colchón,
  // cada punto se compara con lo de su lado.
  const W = ma.w, franja = reflejoDe(p);
  const lejos = (x0: number, x1: number) => {
    const v: (readonly [number, number] | null)[] = [];
    for (let Y = caja.y; Y < caja.y + caja.h; Y++) {
      let sa = 0, sb = 0, k = 0;
      for (let X = Math.max(0, x0); X < Math.min(W, x1); X++) {
        const j = (Y * W + X) * 4;
        sa += ma.fondo[j] - ma.fondo[j + 1];
        sb += (ma.fondo[j] + ma.fondo[j + 1]) / 2 - ma.fondo[j + 2];
        k++;
      }
      v.push(k ? [sa / k, sb / k] : null);
    }
    return v.map((_, fila) => {
      let ra = 0, rb = 0, k = 0;
      for (let f = Math.max(0, fila - LEJOS_SUAVE); f <= Math.min(v.length - 1, fila + LEJOS_SUAVE); f++) {
        const l = v[f];
        if (l) { ra += l[0]; rb += l[1]; k++; }
      }
      return k ? ([ra / k, rb / k] as const) : null;
    });
  };
  const izq = lejos(caja.x - franja, caja.x), der = lejos(caja.x + caja.w, caja.x + caja.w + franja);
  // Hacia la orilla de la caja la corrección se apaga: nunca queda un escalón contra lo que no se tocó.
  const orilla = Math.max(1, franja / 2);
  for (let fila = 0; fila < caja.h; fila++) {
    const L = izq[fila] ?? der[fila], R = der[fila] ?? izq[fila];
    if (!L || !R) continue;
    const Y = caja.y + fila;
    for (let x = 0; x < caja.w; x++) {
      const t = caja.w > 1 ? x / (caja.w - 1) : 0.5;
      const ra = L[0] * (1 - t) + R[0] * t, rb = L[1] * (1 - t) + R[1] * t;
      const da = pa - ra, db = pb - rb, largo = Math.hypot(da, db);
      if (largo < COLOR_DISTINTO_MIN) continue;
      const d = (Y * W + caja.x + x) * 4, rr = out[d], gg = out[d + 1], bb = out[d + 2];
      const a = rr - gg, b = (rr + gg) / 2 - bb;
      const hacia = ((a - ra) * da + (b - rb) * db) / largo;
      if (hacia <= REFLEJO_TOLERADO) continue;
      const cerca = Math.min(1, Math.min(x, caja.w - 1 - x, fila, caja.h - 1 - fila) / orilla);
      const quita = (cerca * (hacia - REFLEJO_TOLERADO)) / largo, na = a - quita * da, nb = b - quita * db;
      // De vuelta a RGB con el mismo brillo.
      const suma = rr + gg + bb, nB = suma / 3 - (2 * nb) / 3, rg = suma - nB;
      out[d] = (rg + na) / 2;
      out[d + 1] = (rg - na) / 2;
      out[d + 2] = nB;
    }
  }
}

// ── Respaldo con IA (Pedro, 2026-10-14: "build it as a second button") ─────────────────────────────────────
// Si el relleno gratis no quedó bien, se le manda a la IA SÓLO un recorte del fondo original alrededor de la copia
// (más una imagen de la pieza, para que sepa qué borrar). De lo que devuelve se pega únicamente el hueco y, cada
// vez menos, el anillo del reflejo: el resto del fondo queda idéntico al original, píxel por píxel.

/** Aire alrededor de la caja de la copia en el recorte (parte de su lado): la IA necesita ver de qué rellenar. */
const AIRE_IA = 0.25;
/** Lado mayor del recorte que se le manda (px). La IA devuelve ~1 000 px: mandar más sólo pesa. */
export const RECORTE_IA_MAX = 1536;
/** Error medio (0-255) en el aire del recorte, donde la IA no debía cambiar nada. Arriba = movió el fondo: revisar. */
export const DERIVA_IA_REVISAR = 18;

/** El recorte del maestro que se le manda a la IA: la caja de la copia con aire, en una proporción que la IA acepta
 *  (la más parecida), sin salir del maestro. null si no cabe ninguna (la caja casi del tamaño del maestro). */
export function recorteParaIA(ma: { w: number; h: number }, g: Gemela): { caja: Caja; aspect: string } | null {
  const c = g.caja;
  const w0 = c.w * (1 + 2 * AIRE_IA), h0 = c.h * (1 + 2 * AIRE_IA);
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  let mejor: { caja: Caja; aspect: string; error: number } | null = null;
  for (const aspect of Object.keys(RATIOS_IA)) {
    const [rw, rh] = aspect.split(":").map(Number), r = rw / rh;
    let w = Math.max(w0, h0 * r), h = w / r;
    if (w > ma.w) { w = ma.w; h = w / r; }
    if (h > ma.h) { h = ma.h; w = h * r; }
    w = Math.round(w);
    h = Math.round(h);
    if (w < c.w || h < c.h) continue; // no cabe la copia entera
    const x = Math.round(Math.min(Math.max(0, cx - w / 2), ma.w - w)), y = Math.round(Math.min(Math.max(0, cy - h / 2), ma.h - h));
    // Se prefiere la proporción que menos agrega fuera del aire pedido.
    const error = (w * h) / (w0 * h0);
    if (!mejor || error < mejor.error) mejor = { caja: { x, y, w, h }, aspect, error };
  }
  return mejor && { caja: mejor.caja, aspect: mejor.aspect };
}

/** Distancia (px, aproximada 3-4) de cada punto de la caja al hueco: dos pasadas sobre la caja. */
function distancias(m: Uint8Array, w: number, h: number): Float32Array {
  const d = new Float32Array(w * h).fill(1e9);
  for (let i = 0; i < m.length; i++) if (m[i]) d[i] = 0;
  const paso = (i: number, j: number, c: number) => { if (d[j] + c < d[i]) d[i] = d[j] + c; };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x > 0) paso(i, i - 1, 1);
      if (y > 0) {
        paso(i, i - w, 1);
        if (x > 0) paso(i, i - w - 1, 1.4);
        if (x < w - 1) paso(i, i - w + 1, 1.4);
      }
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (x < w - 1) paso(i, i + 1, 1);
      if (y < h - 1) {
        paso(i, i + w, 1);
        if (x < w - 1) paso(i, i + w + 1, 1.4);
        if (x > 0) paso(i, i + w - 1, 1.4);
      }
    }
  return d;
}

/**
 * El fondo con lo que devolvió la IA (`ia`: RGBA del tamaño de `recorte`, ya reescalado): entero dentro del hueco y
 * desvaneciéndose en el anillo del reflejo; fuera de eso, el fondo ORIGINAL sin tocar. `deriva`: el error medio en el
 * aire del recorte (fuera de la caja de la copia), donde la IA no debía cambiar nada; alto = la unión puede notarse.
 */
export function pegarRellenoIA(ma: ConFondo, g: Gemela, recorte: Caja, ia: Uint8ClampedArray): { fondo: Uint8ClampedArray; deriva: number } {
  const p = ma.piezas[g.pieza];
  if (!p || !completa(ma, p) || ia.length < recorte.w * recorte.h * 4) return { fondo: ma.fondo, deriva: Infinity };
  const { x: bx, y: by, w: bw, h: bh } = g.caja;
  const d = distancias(huecoDe(p, g), bw, bh), anillo = reflejoDe(p);
  const W = ma.w, out = new Uint8ClampedArray(ma.fondo);
  let suma = 0, n = 0;
  for (let y = 0; y < recorte.h; y++)
    for (let x = 0; x < recorte.w; x++) {
      const X = recorte.x + x, Y = recorte.y + y, j = (Y * W + X) * 4, k = (y * recorte.w + x) * 4;
      const dentro = X >= bx && X < bx + bw && Y >= by && Y < by + bh;
      if (!dentro) {
        for (let c = 0; c < 3; c++) suma += Math.abs(ia[k + c] - ma.fondo[j + c]);
        n += 3;
        continue;
      }
      const peso = Math.max(0, Math.min(1, 1 - d[(Y - by) * bw + (X - bx)] / anillo));
      if (peso > 0) for (let c = 0; c < 3; c++) out[j + c] = ia[k + c] * peso + ma.fondo[j + c] * (1 - peso);
    }
  return { fondo: out, deriva: n ? Math.round((suma / n) * 10) / 10 : 0 };
}
