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
import { haloDe } from "./halo.ts";
import type { Caja, Rol } from "./psd.ts";

/** Lo que hace falta de un maestro para pintarlo: los mismos arreglos que manda el worker (RGBA). */
export type MaestroDatos = {
  w: number;
  h: number;
  /** RGBA opaco, w × h. */
  fondo: Uint8ClampedArray;
  piezas: { rol: Rol | null; caja: Caja; solido: Caja; rgba: Uint8ClampedArray; oscurece: Uint8ClampedArray | null; base?: Uint8ClampedArray | null; letraMinPx?: number | null }[];
  /** Gamma con que se mezcla el texto vuelto a escribir, la misma que usó Photoshop (sin dato: la mezcla normal). */
  textoGamma?: number;
};
/** Lugar de una pieza en la medida: su escala, dónde cae la esquina de su caja y el rectángulo [x0, x1) × [y0, y1). */
export type Lugar = { k: number; ox: number; oy: number; x0: number; y0: number; x1: number; y1: number };
/** El texto de una pieza ya escrito a la medida final: RGBA premultiplicado (0-255) del rectángulo de `Lugar`, o
 *  null si esa pieza va con su texto como imagen. */
export type TextoEscrito = (pieza: number, lugar: Lugar) => Float32Array | null;

/** Bajo esta escala, a las piezas de texto se les aplica el enfoque (a su tamaño o casi, no hace falta). */
export const ENFOQUE_DESDE = 0.75;
/** Una pieza a su tamaño (escala a menos de esto de 1) lleva las letras de Photoshop tal cual: nada las mejora, y
 *  el navegador dibuja la letra un poco más gruesa. */
export const ESCRIBIR_LEJOS_DE_1 = 0.02;
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
 * `capa` (RGBA premultiplicado del rectángulo [x0, x1) × [y0, y1)) encima de `dest` (RGB en flotantes, ancho W).
 * Con gamma ≠ 1 se mezcla como Photoshop mezcla el texto: en valores elevados a la gamma.
 */
function encima(dest: Float32Array, W: number, capa: Float32Array, x0: number, y0: number, x1: number, y1: number, gamma: number): void {
  const rw = x1 - x0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = ((y - y0) * rw + (x - x0)) * 4, d = (y * W + x) * 4, al = capa[i + 3] / 255;
      if (gamma === 1) {
        for (let c = 0; c < 3; c++) dest[d + c] = capa[i + c] + dest[d + c] * (1 - al);
      } else if (al > 0) {
        for (let c = 0; c < 3; c++) {
          const color = Math.min(1, capa[i + c] / al / 255), abajo = Math.min(1, Math.max(0, dest[d + c] / 255));
          dest[d + c] = 255 * Math.pow(al * Math.pow(color, gamma) + (1 - al) * Math.pow(abajo, gamma), 1 / gamma);
        }
      }
    }
}

/** Multiplica lo ya pintado por un mapa de sombra (blanco = no oscurece; fuera del mapa, tampoco) de `mw × mh`
 *  puesto a escala k con su esquina en (ox, oy). */
function oscurecer(dest: Float32Array, W: number, H: number, mapa: Uint8ClampedArray, mw: number, mh: number, k: number, ox: number, oy: number): void {
  const x0 = Math.max(0, Math.floor(ox) - 1), y0 = Math.max(0, Math.floor(oy) - 1);
  const x1 = Math.min(W, Math.ceil(ox + mw * k) + 1), y1 = Math.min(H, Math.ceil(oy + mh * k) + 1);
  if (x1 <= x0 || y1 <= y0) return;
  const rw = x1 - x0;
  const s = remuestrear(mapa, mw, mh, k, ox, oy, x0, y0, x1, y1, "fuera", false);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = ((y - y0) * rw + (x - x0)) * 4, d = (y * W + x) * 4, cub = s[i + 3] / 255;
      for (let c = 0; c < 3; c++) dest[d + c] *= (s[i + c] + 255 * (1 - cub)) / 255;
    }
}

/** El fondo de la medida ya remuestreado: el editor lo guarda y no lo rehace en cada cuadro de un arrastre. */
export function armarFondo(ma: MaestroDatos, a: Acomodo, W: number, H: number): Float32Array {
  return remuestrear(ma.fondo, ma.w, ma.h, a.fondo.k, a.fondo.x, a.fondo.y, 0, 0, W, H, "extender", false);
}

/**
 * La medida W × H armada: el fondo que la cubre y cada pieza donde la dejó el acomodo (sin redondear su lugar al
 * píxel), sus sombras en "multiplicar". RGBA opaco, listo para `ImageData`. `enfoque: false` = sin enfoque extra.
 * `fondo`: el de `armarFondo` para este mismo acomodo y tamaño (no se modifica; se copia).
 */
export function armarMedida(ma: MaestroDatos, a: Acomodo, W: number, H: number, op: { enfoque?: boolean; texto?: TextoEscrito; fondo?: Float32Array } = {}): Uint8ClampedArray {
  const dest = op.fondo?.length === W * H * 4 ? op.fondo.slice() : armarFondo(ma, a, W, H);
  const sombras = new Set(a.sombras ?? []);
  for (const q of a.puestas) {
    const p = ma.piezas[q.pieza];
    // Dónde cae la esquina de la caja completa (con sombra) para que su parte sólida quede donde dijo el acomodo.
    const ox = q.x - (p.solido.x - p.caja.x) * q.k, oy = q.y - (p.solido.y - p.caja.y) * q.k;
    // La sombra de contraste va primero (más abajo que las del PSD) y puede salir de la caja: su margen es suyo.
    const halo = sombras.has(q.pieza) ? haloDe(ma, q.pieza) : null;
    if (halo) oscurecer(dest, W, H, halo.mapa, halo.w, halo.h, q.k, ox - halo.pad * q.k, oy - halo.pad * q.k);
    const x0 = Math.max(0, Math.floor(ox) - 1), y0 = Math.max(0, Math.floor(oy) - 1);
    const x1 = Math.min(W, Math.ceil(ox + p.caja.w * q.k) + 1), y1 = Math.min(H, Math.ceil(oy + p.caja.h * q.k) + 1);
    if (x1 <= x0 || y1 <= y0) continue;
    const rw = x1 - x0;
    // Sus sombras del PSD (blanco = no oscurece; afuera de su caja tampoco).
    if (p.oscurece) oscurecer(dest, W, H, p.oscurece, p.caja.w, p.caja.h, q.k, ox, oy);
    // Texto vuelto a escribir: la pieza va SIN sus letras (su base) y las letras nuevas encima, en su mismo turno
    // (lo que esté más arriba las sigue tapando como en Photoshop). Sin enfoque: las letras ya salen nítidas.
    const escribir = p.base && Math.abs(q.k - 1) >= ESCRIBIR_LEJOS_DE_1;
    const escrito = escribir ? (op.texto?.(q.pieza, { k: q.k, ox, oy, x0, y0, x1, y1 }) ?? null) : null;
    const col = remuestrear(escrito && p.base ? p.base : p.rgba, p.caja.w, p.caja.h, q.k, ox, oy, x0, y0, x1, y1, "fuera", true);
    if (!escrito && op.enfoque !== false && q.k < ENFOQUE_DESDE && DE_TEXTO.has(p.rol)) enfocar(col, rw, y1 - y0, ENFOQUE);
    encima(dest, W, col, x0, y0, x1, y1, 1);
    if (escrito) encima(dest, W, escrito, x0, y0, x1, y1, ma.textoGamma ?? 1);
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

/** Una capa suelta para el PSD de salida: RGBA de 8 bits sin premultiplicar, con su esquina en la medida (puede
 *  salirse de ella: el diseñador la recorre en Photoshop y lo de afuera sigue ahí). */
export type CapaSalida = { x: number; y: number; w: number; h: number; rgba: Uint8ClampedArray };
/** Las capas de una pieza puesta, de abajo hacia arriba: sombra de contraste, sombras del PSD (las dos en
 *  "multiplicar") y la pieza. */
export type CapasPieza = { pieza: number; halo: CapaSalida | null; sombra: CapaSalida | null; color: CapaSalida };

/** Premultiplicado (0-255) → RGBA normal. Sirve también para los mapas de sombra: "fuera" de su caja los deja
 *  mezclados con 0, que es lo mismo que premultiplicados por su cobertura (ver `oscurecer`). */
function aCapa(f: Float32Array, x: number, y: number, w: number, h: number): CapaSalida {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = f[i * 4 + 3];
    if (!(a > 0)) continue;
    for (let c = 0; c < 3; c++) rgba[i * 4 + c] = Math.round((f[i * 4 + c] * 255) / a);
    rgba[i * 4 + 3] = Math.round(a);
  }
  return { x, y, w, h, rgba };
}

/**
 * La medida en capas, para bajarla como PSD y terminarla a mano (Pedro, 2026-10-15: "download that specific size as a
 * psd with the available layers"): el fondo entero a su escala (más grande que la medida si así quedó: se puede
 * recorrer) y cada pieza con sus sombras, tal como las pinta `armarMedida`. Con las capas puestas en orden (normal y
 * "multiplicar") sale la misma imagen; la diferencia: el texto vuelto a escribir se mezcla normal dentro de su pieza,
 * no con la gamma de Photoshop sobre lo de abajo.
 */
export function capasDeMedida(ma: MaestroDatos, a: Acomodo, W: number, H: number, op: { enfoque?: boolean; texto?: TextoEscrito } = {}): { fondo: CapaSalida; piezas: CapasPieza[] } {
  const f = a.fondo;
  const fx0 = Math.floor(f.x), fy0 = Math.floor(f.y), fx1 = Math.ceil(f.x + ma.w * f.k), fy1 = Math.ceil(f.y + ma.h * f.k);
  const fondo = aCapa(remuestrear(ma.fondo, ma.w, ma.h, f.k, f.x, f.y, fx0, fy0, fx1, fy1, "extender", false), fx0, fy0, fx1 - fx0, fy1 - fy0);
  const sombras = new Set(a.sombras ?? []);
  const piezas = a.puestas.map((q): CapasPieza => {
    const p = ma.piezas[q.pieza];
    const ox = q.x - (p.solido.x - p.caja.x) * q.k, oy = q.y - (p.solido.y - p.caja.y) * q.k;
    /** Un mapa (caja de mw × mh con esquina en mx, my) remuestreado a su rectángulo, sin recortar a la medida. */
    const mapa = (src: Uint8ClampedArray, mw: number, mh: number, mx: number, my: number, premult: boolean) => {
      const x0 = Math.floor(mx) - 1, y0 = Math.floor(my) - 1, x1 = Math.ceil(mx + mw * q.k) + 1, y1 = Math.ceil(my + mh * q.k) + 1;
      return { x0, y0, x1, y1, v: remuestrear(src, mw, mh, q.k, mx, my, x0, y0, x1, y1, "fuera", premult) };
    };
    const halo = sombras.has(q.pieza) ? haloDe(ma, q.pieza) : null;
    const h = halo && mapa(halo.mapa, halo.w, halo.h, ox - halo.pad * q.k, oy - halo.pad * q.k, false);
    const s = p.oscurece && mapa(p.oscurece, p.caja.w, p.caja.h, ox, oy, false);
    const x0 = Math.floor(ox) - 1, y0 = Math.floor(oy) - 1, x1 = Math.ceil(ox + p.caja.w * q.k) + 1, y1 = Math.ceil(oy + p.caja.h * q.k) + 1;
    const w = x1 - x0, alto = y1 - y0;
    // Igual que `armarMedida`: con texto vuelto a escribir va la base y las letras nuevas encima (aquí, dentro de la
    // misma capa); si no, la pieza con su enfoque.
    const escribir = p.base && Math.abs(q.k - 1) >= ESCRIBIR_LEJOS_DE_1;
    const escrito = escribir ? (op.texto?.(q.pieza, { k: q.k, ox, oy, x0, y0, x1, y1 }) ?? null) : null;
    const col = remuestrear(escrito && p.base ? p.base : p.rgba, p.caja.w, p.caja.h, q.k, ox, oy, x0, y0, x1, y1, "fuera", true);
    if (!escrito && op.enfoque !== false && q.k < ENFOQUE_DESDE && DE_TEXTO.has(p.rol)) enfocar(col, w, alto, ENFOQUE);
    if (escrito)
      for (let i = 0; i < w * alto; i++) {
        const e = escrito[i * 4 + 3] / 255;
        for (let c = 0; c < 4; c++) col[i * 4 + c] = escrito[i * 4 + c] + col[i * 4 + c] * (1 - e);
      }
    return {
      pieza: q.pieza,
      halo: h ? aCapa(h.v, h.x0, h.y0, h.x1 - h.x0, h.y1 - h.y0) : null,
      sombra: s ? aCapa(s.v, s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0) : null,
      color: aCapa(col, x0, y0, w, alto),
    };
  });
  return { fondo, piezas };
}
