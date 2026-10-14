/**
 * HÜE Prisma › Formatos — armar una medida en píxeles, con un filtro propio (puro: sólo arreglos; corre igual en
 * Node, en el navegador y en un Web Worker).
 *
 * Por qué no `drawImage` del navegador: al reducir mucho (una pieza al 18 %) su filtro deja el texto blando, y
 * cada navegador filtra distinto. Aquí cada píxel nuevo sale de un filtro Lanczos-3 (el que usan los programas de
 * imagen para reducir sin perder nitidez), con alfa premultiplicada para que los bordes transparentes no
 * oscurezcan la orilla, y las piezas de texto reciben además un enfoque suave cuando se reducen. Mismo resultado en
 * todos los navegadores, y a la medida del maestro sale EXACTAMENTE el anuncio (prueba de identidad).
 */
import type { Acomodo } from "./acomodo.ts";
import type { Caja, Rol } from "./psd.ts";

/** Lo que hace falta de un maestro para pintarlo: los mismos arreglos que manda el worker (RGBA). */
export type MaestroDatos = {
  w: number;
  h: number;
  /** RGBA opaco, w × h. */
  fondo: Uint8ClampedArray;
  piezas: { rol: Rol | null; caja: Caja; solido: Caja; rgba: Uint8ClampedArray; oscurece: Uint8ClampedArray | null }[];
};

/** Bajo esta escala, a las piezas de texto se les aplica el enfoque (a su tamaño o casi, no hace falta). */
export const ENFOQUE_DESDE = 0.75;
/** Cuánto enfoque (máscara de enfoque sobre un desenfoque de 1 px). Suave: más deja halos claros alrededor de la letra. */
export const ENFOQUE = 0.35;
const DE_TEXTO = new Set<Rol | null>(["TITULO", "SUBTITULO", "CTA", "FOOTER"]);

const lanczos3 = (x: number): number => {
  if (x === 0) return 1;
  if (x <= -3 || x >= 3) return 0;
  const px = Math.PI * x;
  return (3 * Math.sin(px) * Math.sin(px / 3)) / (px * px);
};

/**
 * Para un eje: qué píxeles del original (y con qué peso) forman cada píxel nuevo. El píxel nuevo `i` cae en
 * `(i + 0.5 - off) / k - 0.5` del original. Al reducir, el filtro se ensancha 1/k (si no, se saltaría píxeles).
 * `borde`: "extender" repite la orilla (el fondo, que siempre cubre); "fuera" cuenta lo de afuera como transparente
 * (una pieza): su peso se pierde y la orilla se desvanece como debe.
 */
function pesos(n: number, d0: number, d1: number, k: number, off: number, borde: "extender" | "fuera") {
  const m = d1 - d0;
  const ini = new Int32Array(m), cuantos = new Int32Array(m);
  const s = Math.min(1, k), radio = 3 / s;
  const idx: number[] = [], w: number[] = [];
  for (let i = 0; i < m; i++) {
    const c = (d0 + i + 0.5 - off) / k - 0.5;
    const j0 = Math.ceil(c - radio), j1 = Math.floor(c + radio);
    let total = 0;
    const desde = idx.length;
    for (let j = j0; j <= j1; j++) {
      const p = lanczos3((j - c) * s);
      if (p === 0) continue;
      total += p;
      const jj = borde === "extender" ? Math.min(n - 1, Math.max(0, j)) : j;
      if (jj < 0 || jj >= n) continue;
      idx.push(jj);
      w.push(p);
    }
    for (let t = desde; t < idx.length; t++) w[t] /= total;
    ini[i] = desde;
    cuantos[i] = idx.length - desde;
  }
  return { ini, cuantos, idx: Int32Array.from(idx), w: Float32Array.from(w) };
}

/**
 * Remuestrea `src` (RGBA, premultiplicado si `premult`) al rectángulo [x0, x1) × [y0, y1) de la medida, con el
 * original puesto a escala `k` y su esquina en (ox, oy). Devuelve RGBA en flotantes, PREMULTIPLICADO.
 */
function remuestrear(src: Uint8ClampedArray, sw: number, sh: number, k: number, ox: number, oy: number, x0: number, y0: number, x1: number, y1: number, borde: "extender" | "fuera", premult: boolean): Float32Array {
  const dw = x1 - x0, dh = y1 - y0;
  const px = pesos(sw, x0, x1, k, ox, borde), py = pesos(sh, y0, y1, k, oy, borde);
  // Qué filas del original hacen falta.
  let r0 = sh, r1 = -1;
  for (let t = 0; t < py.idx.length; t++) { if (py.idx[t] < r0) r0 = py.idx[t]; if (py.idx[t] > r1) r1 = py.idx[t]; }
  const out = new Float32Array(dw * dh * 4);
  if (r1 < r0) return out;
  // 1) horizontal, sólo esas filas
  const nf = r1 - r0 + 1;
  const hz = new Float32Array(nf * dw * 4);
  for (let r = 0; r < nf; r++) {
    const fila = (r + r0) * sw * 4, o = r * dw * 4;
    for (let i = 0; i < dw; i++) {
      let R = 0, G = 0, B = 0, A = 0;
      for (let t = px.ini[i], fin = t + px.cuantos[i]; t < fin; t++) {
        const s = fila + px.idx[t] * 4, p = px.w[t], a = src[s + 3];
        if (premult) {
          const pa = (p * a) / 255;
          R += src[s] * pa; G += src[s + 1] * pa; B += src[s + 2] * pa;
        } else {
          R += src[s] * p; G += src[s + 1] * p; B += src[s + 2] * p;
        }
        A += a * p;
      }
      const q = o + i * 4;
      hz[q] = R; hz[q + 1] = G; hz[q + 2] = B; hz[q + 3] = A;
    }
  }
  // 2) vertical
  for (let y = 0; y < dh; y++) {
    const o = y * dw * 4;
    for (let t = py.ini[y], fin = t + py.cuantos[y]; t < fin; t++) {
      const f = (py.idx[t] - r0) * dw * 4, p = py.w[t];
      for (let q = 0; q < dw * 4; q++) out[o + q] += hz[f + q] * p;
    }
  }
  // Lanczos rebota un poco en los bordes duros: se recorta a lo posible (premultiplicado: color ≤ alfa).
  for (let q = 0; q < out.length; q += 4) {
    const a = Math.min(255, Math.max(0, out[q + 3]));
    out[q + 3] = a;
    const tope = premult ? a : 255;
    for (let c = 0; c < 3; c++) out[q + c] = Math.min(tope, Math.max(0, out[q + c]));
  }
  return out;
}

/** Máscara de enfoque suave (desenfoque 1-2-1), sobre RGBA premultiplicado; respeta color ≤ alfa. */
function enfocar(v: Float32Array, w: number, h: number, cuanto: number): void {
  const blur = new Float32Array(v.length), tmp = new Float32Array(v.length);
  const at = (x: number, y: number) => (Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 4; c++) tmp[(y * w + x) * 4 + c] = (v[at(x - 1, y) + c] + 2 * v[at(x, y) + c] + v[at(x + 1, y) + c]) / 4;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 4; c++) blur[(y * w + x) * 4 + c] = (tmp[at(x, y - 1) + c] + 2 * tmp[at(x, y) + c] + tmp[at(x, y + 1) + c]) / 4;
  for (let q = 0; q < v.length; q += 4) {
    const a = Math.min(255, Math.max(0, v[q + 3] + cuanto * (v[q + 3] - blur[q + 3])));
    v[q + 3] = a;
    for (let c = 0; c < 3; c++) v[q + c] = Math.min(a, Math.max(0, v[q + c] + cuanto * (v[q + c] - blur[q + c])));
  }
}

/**
 * La medida W × H armada: el fondo que la cubre y cada pieza donde la dejó el acomodo (sin redondear su lugar al
 * píxel), sus sombras en "multiplicar". RGBA opaco, listo para `ImageData`. `enfoque: false` = sin enfoque extra.
 */
export function armarMedida(ma: MaestroDatos, a: Acomodo, W: number, H: number, op: { enfoque?: boolean } = {}): Uint8ClampedArray {
  const dest = remuestrear(ma.fondo, ma.w, ma.h, a.fondo.k, a.fondo.x, a.fondo.y, 0, 0, W, H, "extender", false);
  for (const q of a.puestas) {
    const p = ma.piezas[q.pieza];
    // Dónde cae la esquina de la caja completa (con sombra) para que su parte sólida quede donde dijo el acomodo.
    const ox = q.x - (p.solido.x - p.caja.x) * q.k, oy = q.y - (p.solido.y - p.caja.y) * q.k;
    const x0 = Math.max(0, Math.floor(ox) - 1), y0 = Math.max(0, Math.floor(oy) - 1);
    const x1 = Math.min(W, Math.ceil(ox + p.caja.w * q.k) + 1), y1 = Math.min(H, Math.ceil(oy + p.caja.h * q.k) + 1);
    if (x1 <= x0 || y1 <= y0) continue;
    const rw = x1 - x0;
    if (p.oscurece) {
      // Mapa de sombra: blanco = no oscurece. Afuera de su caja tampoco.
      const s = remuestrear(p.oscurece, p.caja.w, p.caja.h, q.k, ox, oy, x0, y0, x1, y1, "fuera", false);
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const i = ((y - y0) * rw + (x - x0)) * 4, d = (y * W + x) * 4, cub = s[i + 3] / 255;
          for (let c = 0; c < 3; c++) dest[d + c] *= (s[i + c] + 255 * (1 - cub)) / 255;
        }
    }
    const col = remuestrear(p.rgba, p.caja.w, p.caja.h, q.k, ox, oy, x0, y0, x1, y1, "fuera", true);
    if (op.enfoque !== false && q.k < ENFOQUE_DESDE && DE_TEXTO.has(p.rol)) enfocar(col, rw, y1 - y0, ENFOQUE);
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = ((y - y0) * rw + (x - x0)) * 4, d = (y * W + x) * 4, al = col[i + 3] / 255;
        for (let c = 0; c < 3; c++) dest[d + c] = col[i + c] + dest[d + c] * (1 - al);
      }
  }
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    out[i * 4] = Math.round(dest[i * 4]);
    out[i * 4 + 1] = Math.round(dest[i * 4 + 1]);
    out[i * 4 + 2] = Math.round(dest[i * 4 + 2]);
    out[i * 4 + 3] = 255;
  }
  return out;
}
