/**
 * HÜE Prisma › Formatos — UNA medida como PSD EDITABLE: las capas del PSD original, movidas y escaladas con su pieza
 * (Pedro, 2026-10-19: "every single element that is editable in the orignal psd should be editable in the one you can
 * download by size individually ... the legales should be editable not an image").
 *
 * Se copia el árbol de la mesa tal cual (carpetas, subcarpetas, orden, capas ocultas, nombres) y a cada capa se le
 * aplica el movimiento de SU carpeta de primer nivel: la escala pareja `k` y el desplazamiento que le dio el acomodo
 * (o la edición a mano). El fondo se mueve como el fondo de la medida. Lo que cambia por tipo de capa:
 * - píxeles y máscaras: remuestreados con el mismo filtro de la tarjeta (nitido.ts);
 * - texto: sigue VIVO, sólo cambia su matriz (Photoshop pide «Actualizar» las capas de texto al abrirlo);
 * - objeto inteligente: sus 4 esquinas, con su archivo adentro (el original completo, no los píxeles);
 * - forma: el trazo, la caja de la forma viva, los radios y el grosor del contorno;
 * - efectos (sombra, contorno, bisel…): sus medidas en px por k.
 * Se aplana (va como imagen) sólo lo que no se puede escribir bien, y se dice capa por capa.
 *
 * Puro: arma el objeto que escribe `ag-psd` (sólo sus tipos aquí). Los píxeles de cada capa los da quien llama (el
 * worker los decodifica de los datos crudos), así que corre igual en Node y en un Web Worker.
 */
import type { BezierPath, KeyDescriptorItem, Layer, LayerEffectsInfo, LayerMaskData, PixelData, Psd, UnitsValue } from "ag-psd";
import type { Acomodo } from "./acomodo.ts";
import type { Origen } from "./psd.ts";
import { EDITABLE_CAPAS_MAX, EDITABLE_CAPA_MAX_PX, EDITABLE_PX_MAX, EDITABLE_SALIDA_PX_MAX } from "./listo.ts";
import { aCapa, remuestrear, type CapaSalida } from "./nitido.ts";
import { CAPA_SOMBRA_CONTRASTE } from "./psd-salida.ts";
import { nombreDeCapa, rolDe } from "./roles.ts";

/** Escala pareja y desplazamiento: el punto (X, Y) del PSD original cae en (k·X + x, k·Y + y) de la medida. */
export type Afin = { k: number; x: number; y: number };
export type PlanEditable = {
  W: number;
  H: number;
  origen: Origen;
  fondo: Afin;
  /** Por carpeta de primer nivel (el nombre de su pieza): su movimiento, o null si se quitó en esta medida. */
  piezas: [string, Afin | null][];
};
/** Lo que la página ya pintó y va encima de las capas del original. */
export type ExtrasEditable = {
  /** La medida tal cual la tarjeta (W × H, RGBA): la imagen aplanada del PSD (miniatura y programas sin capas). */
  compuesto: Uint8ClampedArray;
  /** Sombras de contraste de HÜE por pieza, ya en px de la medida. */
  halos: { nombre: string; capa: CapaSalida }[];
  /** Sólo lo que cambió del fondo al quitar la copia («Quitar del fondo» / IA), en px de la medida. */
  retoque: CapaSalida | null;
};
/** Lo que hay que decir de una capa (la pantalla lo dice en su idioma): `aplanada` = va como imagen porque no se puede
 *  escribir bien; si no, sigue editable pero hay que revisarla al editarla en Photoshop. */
export type MotivoCapa = "texto-vertical" | "texto-en-trayecto" | "filtros-inteligentes";
export type NotaCapa = { capa: string; motivo: MotivoCapa; aplanada: boolean };
/** Un tope del PSD editable: sale el de capas planas. `deArchivo` = lo trae el archivo (capas en ZIP, demasiadas o muy
 *  grandes en el original) y ninguna medida va a salir; si no, es de ESTA medida y otra puede salir. */
export class TopeEditable extends Error {
  deArchivo: boolean;
  constructor(mensaje: string, deArchivo: boolean) {
    super(mensaje);
    this.deArchivo = deArchivo;
  }
}
/** Píxeles de una capa, de su máscara y de su segunda máscara (la de píxeles, cuando también trae máscara vectorial). */
export type PixelesDe = { capa: (l: Layer) => PixelData | undefined; mascara: (l: Layer) => PixelData | undefined; mascaraReal: (l: Layer) => PixelData | undefined };

export const CAPA_RETOQUE = "Fondo retocado (HÜE)";
export const CAPA_COLOR_MESA = "Color de la mesa (HÜE)";
/** Una escala a menos de esto de 1 con desplazamiento entero = copiar los píxeles tal cual (identidad exacta). */
const MISMA = 1e-9;

/**
 * El movimiento de cada carpeta en una medida, del documento original a la medida: lo mismo que pinta `armarMedida`.
 * Una pieza puesta lleva su parte sólida a (q.x, q.y) con escala q.k; el fondo pone su esquina en (fondo.x, fondo.y).
 */
export function planDeMedida(ma: { piezas: readonly { nombre: string; solido: { x: number; y: number } }[]; origen: Origen }, a: Acomodo, W: number, H: number): PlanEditable {
  const o = ma.origen;
  const fk = a.fondo.k * o.s;
  const puestas = new Map(a.puestas.map((q) => [q.pieza, q]));
  return {
    W,
    H,
    origen: o,
    fondo: { k: fk, x: a.fondo.x - fk * o.x, y: a.fondo.y - fk * o.y },
    piezas: ma.piezas.map((p, i): [string, Afin | null] => {
      const q = puestas.get(i);
      if (!q) return [p.nombre, null];
      const k = q.k * o.s;
      return [p.nombre, { k, x: q.x - q.k * p.solido.x - k * o.x, y: q.y - q.k * p.solido.y - k * o.y }];
    }),
  };
}

/** Cuánto se agranda el parche del retoque alrededor de lo que cambió (para que la orilla del filtro no quede corta). */
const RETOQUE_MARGEN = 2;

/**
 * Lo que cambió del fondo al quitar la copia («Quitar del fondo» / IA), puesto en la medida como el fondo: sólo ese
 * parche (opaco donde cambió, más un margen), para que el resto del fondo sigan siendo las capas del original.
 * `antes` y `despues`: RGBA de w × h (el fondo del maestro sin y con el retoque). null si no cambió nada.
 */
export function retoqueDeFondo(antes: Uint8ClampedArray, despues: Uint8ClampedArray, w: number, h: number, fondo: Acomodo["fondo"], W: number, H: number): CapaSalida | null {
  const cambio = new Uint8Array(w * h);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (antes[i * 4] === despues[i * 4] && antes[i * 4 + 1] === despues[i * 4 + 1] && antes[i * 4 + 2] === despues[i * 4 + 2]) continue;
      cambio[i] = 1;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  if (x1 < 0) return null;
  const m = RETOQUE_MARGEN;
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
  const pw = x1 - x0 + 1, ph = y1 - y0 + 1;
  const parche = new Uint8ClampedArray(pw * ph * 4);
  for (let y = 0; y < ph; y++)
    for (let x = 0; x < pw; x++) {
      // Dentro del parche: opaco si hay un cambio a `m` px o menos (un cuadro alrededor de cada píxel cambiado).
      let cerca = false;
      for (let dy = -m; dy <= m && !cerca; dy++)
        for (let dx = -m; dx <= m && !cerca; dx++) {
          const X = x0 + x + dx, Y = y0 + y + dy;
          cerca = X >= 0 && Y >= 0 && X < w && Y < h && cambio[Y * w + X] === 1;
        }
      if (!cerca) continue;
      const s = ((y0 + y) * w + x0 + x) * 4, d = (y * pw + x) * 4;
      parche[d] = despues[s]; parche[d + 1] = despues[s + 1]; parche[d + 2] = despues[s + 2]; parche[d + 3] = 255;
    }
  const ox = fondo.x + x0 * fondo.k, oy = fondo.y + y0 * fondo.k;
  const X0 = Math.max(0, Math.floor(ox) - 1), Y0 = Math.max(0, Math.floor(oy) - 1);
  const X1 = Math.min(W, Math.ceil(ox + pw * fondo.k) + 1), Y1 = Math.min(H, Math.ceil(oy + ph * fondo.k) + 1);
  if (X1 <= X0 || Y1 <= Y0) return null;
  return justa(aCapa(remuestrear(parche, pw, ph, fondo.k, ox, oy, X0, Y0, X1, Y1, "fuera", true), X0, Y0, X1 - X0, Y1 - Y0));
}

/** Las mesas como las cuenta `leerPsd`: las visibles, en el orden en que se recorre el árbol (también dentro de
 *  carpetas); sin mesas, el documento entero. La elegida tiene que estar donde estaba y medir lo mismo. */
function mesaDe(psd: Psd, o: Origen): { capas: Layer[]; color: { r: number; g: number; b: number } | null } {
  const mesas: Layer[] = [];
  const andar = (ls: Layer[] | undefined) => {
    for (const l of ls ?? []) {
      if (l.hidden || !l.children) continue;
      if (l.artboard?.rect) mesas.push(l);
      andar(l.children);
    }
  };
  andar(psd.children);
  if (!mesas.length) {
    if (o.mesa !== 0 || o.x !== 0 || o.y !== 0 || o.w !== psd.width || o.h !== psd.height) throw new Error("El PSD no trae esa mesa de trabajo");
    return { capas: psd.children ?? [], color: null };
  }
  const r = mesas[o.mesa]?.artboard?.rect;
  const x = r && Math.round(r.left), y = r && Math.round(r.top);
  if (!r || x !== o.x || y !== o.y || Math.round(r.right) - x !== o.w || Math.round(r.bottom) - y !== o.h) throw new Error("El PSD no coincide con el que se leyó");
  // El color de fondo de la mesa (Photoshop: 1 blanco, 2 negro, 3 transparente, 4 otro): se ve donde el fondo del
  // anuncio deja huecos, y la tarjeta (de la copia aplanada) lo trae.
  const ab = mesas[o.mesa].artboard, tipo = ab?.backgroundType;
  const c = ab?.color && "r" in ab.color ? ab.color : null;
  const color = tipo === 1 ? { r: 255, g: 255, b: 255 } : tipo === 2 ? { r: 0, g: 0, b: 0 } : tipo === 4 && c ? { r: c.r, g: c.g, b: c.b } : null;
  return { capas: mesas[o.mesa].children ?? [], color };
}

const punto = (A: Afin, x: number, y: number): [number, number] => [A.k * x + A.x, A.k * y + A.y];
/** Lista plana x0, y0, x1, y1… (esquinas de un objeto inteligente, puntos de un trazo). */
const puntos = (A: Afin, v: readonly number[]): number[] => v.map((n, i) => (i % 2 ? A.k * n + A.y : A.k * n + A.x));
const largo = (A: Afin, u: UnitsValue | undefined): UnitsValue | undefined =>
  u && (u.units === "Pixels" || u.units === "Points") ? { ...u, value: u.value * A.k } : u;
const identidad = (A: Afin) => Math.abs(A.k - 1) < MISMA && Number.isInteger(A.x) && Number.isInteger(A.y);

/** Recorta las filas y columnas de afuera totalmente transparentes (la caja de la capa queda justa, como en Photoshop). */
function justa(c: CapaSalida): CapaSalida | null {
  let x0 = c.w, y0 = c.h, x1 = -1, y1 = -1;
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++)
      if (c.rgba[(y * c.w + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  if (x0 === 0 && y0 === 0 && x1 === c.w - 1 && y1 === c.h - 1) return c;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) rgba.set(c.rgba.subarray(((y + y0) * c.w + x0) * 4, ((y + y0) * c.w + x0 + w) * 4), y * w * 4);
  return { x: c.x + x0, y: c.y + y0, w, h, rgba };
}

/** Cuánta salida (en px) se remuestrea por vuelta: ~64 MB en flotantes, más las filas del original que esa banda lee
 *  (al reducir, 1/k veces más; con k = 0.3 en una capa de 8000 px de ancho, ~200 MB). */
const BANDA_PX = 4_000_000;

/**
 * La caja de una capa de `w × h` con su esquina en (left, top), movida con `A`, en px enteros de la medida y con un
 * margen de 1 px para la orilla del filtro. Se recorta a la medida más una medida de margen por lado: lo que sale de
 * la medida se puede recorrer en Photoshop, pero una capa agrandada no crece sin fin (los objetos inteligentes siguen
 * completos: Photoshop los vuelve a dibujar desde su archivo).
 */
function cajaMovida(left: number, top: number, w: number, h: number, A: Afin, W: number, H: number) {
  const [ox, oy] = punto(A, left, top);
  const x0 = Math.max(-W, Math.floor(ox) - 1), y0 = Math.max(-H, Math.floor(oy) - 1);
  const x1 = Math.min(2 * W, Math.ceil(ox + w * A.k) + 1), y1 = Math.min(2 * H, Math.ceil(oy + h * A.k) + 1);
  return { ox, oy, x0, y0, x1, y1, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/** Remuestrea por bandas de filas (mismo resultado que de una vez: cada fila nueva depende sólo de su vertical) y
 *  entrega cada píxel ya en 8 bits: `color` = RGBA sin premultiplicar (como `aCapa`); `mascara` = gris de la máscara,
 *  con su color por defecto donde no llega lo de adentro. */
function remuestrearU8(src: Uint8ClampedArray, sw: number, sh: number, A: Afin, c: ReturnType<typeof cajaMovida>, modo: "color" | "mascara", def = 255): Uint8ClampedArray {
  const out = new Uint8ClampedArray(c.w * c.h * 4);
  const filas = Math.max(1, Math.floor(BANDA_PX / Math.max(1, c.w)));
  for (let b = c.y0; b < c.y1; b += filas) {
    const f = remuestrear(src, sw, sh, A.k, c.ox, c.oy, c.x0, b, c.x1, Math.min(c.y1, b + filas), "fuera", modo === "color");
    const o = (b - c.y0) * c.w * 4;
    for (let i = 0; i < f.length; i += 4) {
      if (modo === "mascara") {
        const v = Math.round(f[i] + def * (1 - f[i + 3] / 255));
        out[o + i] = out[o + i + 1] = out[o + i + 2] = v;
        out[o + i + 3] = 255;
      } else if (f[i + 3] > 0) {
        const a = f[i + 3];
        for (let k = 0; k < 3; k++) out[o + i + k] = Math.round((f[i + k] * 255) / a);
        out[o + i + 3] = Math.round(a);
      }
    }
  }
  return out;
}

/** Los píxeles de una capa movidos: misma caja corrida si es identidad; si no, remuestreados (alfa premultiplicada). */
function moverPixeles(img: PixelData, left: number, top: number, A: Afin, W: number, H: number): CapaSalida | null {
  const data = img.data instanceof Uint8ClampedArray ? img.data : Uint8ClampedArray.from(img.data);
  if (identidad(A)) return { x: left + A.x, y: top + A.y, w: img.width, h: img.height, rgba: data };
  const c = cajaMovida(left, top, img.width, img.height, A, W, H);
  if (!(c.w > 0 && c.h > 0)) return null;
  return justa({ x: c.x0, y: c.y0, w: c.w, h: c.h, rgba: remuestrearU8(data, img.width, img.height, A, c, "color") });
}

/** Una máscara movida: fuera de su caja vale su color por defecto, también al remuestrear la orilla. */
function moverMascara(m: LayerMaskData, img: PixelData | undefined, A: Afin, W: number, H: number): LayerMaskData {
  const out: LayerMaskData = { ...m };
  delete out.canvas;
  delete out.imageData;
  if (out.userMaskFeather) out.userMaskFeather *= A.k;
  if (out.vectorMaskFeather) out.vectorMaskFeather *= A.k;
  const left = m.left ?? 0, top = m.top ?? 0;
  if (!img || !(img.width > 0 && img.height > 0)) {
    const [l, t] = punto(A, left, top), [r, b] = punto(A, m.right ?? 0, m.bottom ?? 0);
    return { ...out, left: Math.round(l), top: Math.round(t), right: Math.round(r), bottom: Math.round(b) };
  }
  const data = img.data instanceof Uint8ClampedArray ? img.data : Uint8ClampedArray.from(img.data);
  if (identidad(A)) return { ...out, left: left + A.x, top: top + A.y, right: left + A.x + img.width, bottom: top + A.y + img.height, imageData: { width: img.width, height: img.height, data } };
  const c = cajaMovida(left, top, img.width, img.height, A, W, H);
  if (!(c.w > 0 && c.h > 0)) return { ...out, left: c.x0, top: c.y0, right: c.x0, bottom: c.y0 };
  // Sin premultiplicar, "fuera": el valor suma sólo lo de adentro y el alfa dice cuánto de adentro hubo.
  const gris = remuestrearU8(data, img.width, img.height, A, c, "mascara", m.defaultColor ?? 255);
  return { ...out, left: c.x0, top: c.y0, right: c.x1, bottom: c.y1, imageData: { width: c.w, height: c.h, data: gris } };
}

/** Las medidas de los efectos (tamaño, distancia, suavizado, contorno) por k, como «Escalar efectos» de Photoshop. */
function moverEfectos(e: LayerEffectsInfo, A: Afin): LayerEffectsInfo {
  const t = <T extends { size?: UnitsValue; distance?: UnitsValue; soften?: UnitsValue }>(x: T): T => ({
    ...x,
    ...(x.size ? { size: largo(A, x.size) } : {}),
    ...(x.distance ? { distance: largo(A, x.distance) } : {}),
    ...(x.soften ? { soften: largo(A, x.soften) } : {}),
  });
  return {
    ...e,
    ...(e.dropShadow ? { dropShadow: e.dropShadow.map(t) } : {}),
    ...(e.innerShadow ? { innerShadow: e.innerShadow.map(t) } : {}),
    ...(e.outerGlow ? { outerGlow: t(e.outerGlow) } : {}),
    ...(e.innerGlow ? { innerGlow: t(e.innerGlow) } : {}),
    ...(e.bevel ? { bevel: t(e.bevel) } : {}),
    ...(e.satin ? { satin: t(e.satin) } : {}),
    ...(e.stroke ? { stroke: e.stroke.map(t) } : {}),
    ...(e.patternOverlay ? { patternOverlay: { ...e.patternOverlay, ...(e.patternOverlay.scale ? { scale: e.patternOverlay.scale * A.k } : {}) } } : {}),
  };
}

const moverTrazos = (paths: BezierPath[], A: Afin): BezierPath[] => paths.map((p) => ({ ...p, knots: p.knots.map((k) => ({ ...k, points: puntos(A, k.points) })) }));

/** La forma viva (rectángulo, elipse…): su caja, sus esquinas y sus radios, para que Photoshop la siga editando. */
function moverOrigen(d: KeyDescriptorItem, A: Afin): KeyDescriptorItem {
  const out: KeyDescriptorItem = { ...d };
  const b = d.keyOriginShapeBoundingBox;
  if (b) out.keyOriginShapeBoundingBox = { top: { ...b.top, value: A.k * b.top.value + A.y }, left: { ...b.left, value: A.k * b.left.value + A.x }, bottom: { ...b.bottom, value: A.k * b.bottom.value + A.y }, right: { ...b.right, value: A.k * b.right.value + A.x } };
  const r = d.keyOriginRRectRadii;
  if (r) out.keyOriginRRectRadii = { topRight: { ...r.topRight, value: r.topRight.value * A.k }, topLeft: { ...r.topLeft, value: r.topLeft.value * A.k }, bottomLeft: { ...r.bottomLeft, value: r.bottomLeft.value * A.k }, bottomRight: { ...r.bottomRight, value: r.bottomRight.value * A.k } };
  if (d.keyOriginBoxCorners) out.keyOriginBoxCorners = d.keyOriginBoxCorners.map((c) => ({ x: A.k * c.x + A.x, y: A.k * c.y + A.y }));
  if (d.transform?.length === 6) {
    const [xx, xy, yx, yy, tx, ty] = d.transform;
    out.transform = [xx * A.k, xy * A.k, yx * A.k, yy * A.k, A.k * tx + A.x, A.k * ty + A.y];
  }
  return out;
}

/** Una capa (y lo que tenga adentro) movida con `A`. No toca la original. */
function mover(l: Layer, A: Afin, W: number, H: number, px: PixelesDe, notas: NotaCapa[]): Layer {
  const out: Layer = { ...l };
  delete out.rawData;
  delete out.canvas;
  delete out.imageData;
  if (l.children) {
    out.children = l.children.map((c) => mover(c, A, W, H, px, notas));
  } else {
    const img = (l.right ?? 0) > (l.left ?? 0) && (l.bottom ?? 0) > (l.top ?? 0) ? px.capa(l) : undefined;
    const c = img && moverPixeles(img, l.left ?? 0, l.top ?? 0, A, W, H);
    if (c) Object.assign(out, { left: c.x, top: c.y, right: c.x + c.w, bottom: c.y + c.h, imageData: { width: c.w, height: c.h, data: c.rgba } });
    else Object.assign(out, { left: 0, top: 0, right: 0, bottom: 0 });
  }
  // Una mesa de trabajo dentro de lo que se copia (p. ej. una oculta, en un documento sin otras) dejaría de serlo.
  delete out.artboard;
  if (l.mask) out.mask = moverMascara(l.mask, px.mascara(l), A, W, H);
  if (l.realMask) out.realMask = moverMascara(l.realMask, px.mascaraReal(l), A, W, H);
  if (l.referencePoint) {
    const [x, y] = punto(A, l.referencePoint.x, l.referencePoint.y);
    out.referencePoint = { x, y };
  }
  if (l.effects) out.effects = moverEfectos(l.effects, A);
  if (l.text) {
    // ag-psd lo advierte: escribir texto vertical puede dejar un PSD que tumba a Photoshop. El texto en un trayecto
    // (tipo 2; el 1 es la caja de un párrafo) ag-psd no lo escribe: al actualizarlo, Photoshop lo dibujaría derecho
    // (s33: «Hasta», en arco). Los dos van como imagen.
    const motivo = l.text.orientation === "vertical" ? "texto-vertical" : l.text.textPath?.data?.type === 2 ? "texto-en-trayecto" : null;
    if (motivo) {
      delete out.text;
      notas.push({ capa: nombreDeCapa(l.name), motivo, aplanada: true });
    } else {
      const t = l.text.transform?.length === 6 ? l.text.transform : [1, 0, 0, 1, 0, 0];
      const [xx, xy, yx, yy, tx, ty] = t;
      out.text = { ...l.text, transform: [xx * A.k, xy * A.k, yx * A.k, yy * A.k, A.k * tx + A.x, A.k * ty + A.y] };
    }
  }
  if (l.placedLayer) {
    // Sus filtros inteligentes viajan tal cual: sus medidas en px no se escalan y sus máscaras no se copian (bloques
    // FEid/FXid, adelgazar.ts). Sigue editable; al volver a dibujarse en Photoshop hay que revisarla.
    if (l.placedLayer.filter?.list?.length) notas.push({ capa: nombreDeCapa(l.name), motivo: "filtros-inteligentes", aplanada: false });
    out.placedLayer = {
      ...l.placedLayer,
      transform: puntos(A, l.placedLayer.transform),
      ...(l.placedLayer.nonAffineTransform ? { nonAffineTransform: puntos(A, l.placedLayer.nonAffineTransform) } : {}),
    };
  }
  if (l.vectorMask) out.vectorMask = { ...l.vectorMask, paths: moverTrazos(l.vectorMask.paths, A) };
  if (l.vectorOrigination) out.vectorOrigination = { keyDescriptorList: l.vectorOrigination.keyDescriptorList.map((d) => moverOrigen(d, A)) };
  if (l.vectorStroke) {
    const s = l.vectorStroke;
    out.vectorStroke = { ...s, ...(s.lineWidth ? { lineWidth: largo(A, s.lineWidth) } : {}), ...(s.lineDashOffset ? { lineDashOffset: largo(A, s.lineDashOffset) } : {}) };
  }
  return out;
}

const capaSalida = (name: string, c: CapaSalida, extra: Partial<Layer> = {}): Layer => ({
  name,
  left: c.x,
  top: c.y,
  right: c.x + c.w,
  bottom: c.y + c.h,
  imageData: { width: c.w, height: c.h, data: c.rgba },
  ...extra,
});

/** Cómo se mueve cada capa de primer nivel de la mesa: su pieza, o el fondo. */
type Paso = { l: Layer; nombre: string; A: Afin; quitada: boolean; halo: CapaSalida | undefined };

/**
 * El movimiento de cada capa de primer nivel, antes de tocar un píxel. Una capa recortada (clipping) va con la de abajo
 * a la que se recorta: su mismo movimiento y, si esa pieza se quitó, oculta también. Lo oculto, el fondo y lo que no
 * es pieza (un ajuste suelto) se mueven con el fondo; una pieza quitada en esta medida va con el fondo y oculta.
 */
function pasosDe(mesa: Layer[], plan: PlanEditable, halos: Map<string, CapaSalida>): Paso[] {
  const piezas = new Map(plan.piezas);
  let base: { A: Afin; quitada: boolean } = { A: plan.fondo, quitada: false };
  return mesa.map((l): Paso => {
    const nombre = nombreDeCapa(l.name);
    let halo: CapaSalida | undefined;
    if (!l.clipping) {
      const pieza = l.hidden || rolDe(nombre) === "BACKGROUND" ? undefined : piezas.get(nombre);
      base = { A: pieza ?? plan.fondo, quitada: pieza === null };
      halo = pieza ? halos.get(nombre) : undefined;
      if (halo) halos.delete(nombre);
    }
    return { l, nombre, ...base, halo };
  });
}

/**
 * Antes de decodificar nada, en TODAS las capas (carpetas incluidas: su máscara también se decodifica): cada capa y su
 * máscara caben en su tope, todas juntas en el total, y lo que van a medir YA MOVIDAS (una capa se agranda con k²)
 * cabe en el tope de salida. Las capas en ZIP se rechazan, como en la lectura (`leerPsd`): se inflan enteras antes de
 * poder medirlas. Pasar un tope lanza: sale el PSD de capas planas.
 */
function revisarTopes(pasos: Paso[], W: number, H: number, extra: number): void {
  // Primero lo que trae el ARCHIVO, en todas las capas; después lo de ESTA medida. Así un problema del archivo (que no
  // sale en ninguna medida) nunca se reporta como "demasiado grande en esta medida".
  let n = 0, px = 0, salida = extra;
  const cajas = (l: Layer) => (l.children ? [l.mask ?? {}, l.realMask ?? {}] : [l, l.mask ?? {}, l.realMask ?? {}]);
  const medida = (c: { left?: number; top?: number; right?: number; bottom?: number }) => ({ w: (c.right ?? 0) - (c.left ?? 0), h: (c.bottom ?? 0) - (c.top ?? 0) });
  const delArchivo = (l: Layer) => {
    const nombre = nombreDeCapa(l.name);
    if (++n > EDITABLE_CAPAS_MAX) throw new TopeEditable(`la mesa tiene más de ${EDITABLE_CAPAS_MAX} capas`, true);
    if (l.rawData?.channels.some((ch) => Number(ch.compression) >= 2)) throw new TopeEditable(`la capa «${nombre}» viene comprimida en ZIP`, true);
    for (const c of cajas(l)) {
      const { w, h } = medida(c);
      if (!(w >= 0 && h >= 0) || w * h > EDITABLE_CAPA_MAX_PX) throw new TopeEditable(`la capa «${nombre}» mide ${w}×${h}`, true);
      px += w * h;
    }
    if (px > EDITABLE_PX_MAX) throw new TopeEditable(`las capas de la mesa suman más de ${EDITABLE_PX_MAX / 1e6} millones de píxeles`, true);
    for (const c of l.children ?? []) delArchivo(c);
  };
  const deLaMedida = (l: Layer, A: Afin) => {
    const nombre = nombreDeCapa(l.name);
    for (const c of cajas(l)) {
      const { w, h } = medida(c);
      if (!(w > 0 && h > 0)) continue;
      const m = identidad(A) ? { w, h } : cajaMovida(c.left ?? 0, c.top ?? 0, w, h, A, W, H);
      if (m.w * m.h > EDITABLE_CAPA_MAX_PX) throw new TopeEditable(`la capa «${nombre}» quedaría de ${m.w}×${m.h} en esta medida`, false);
      salida += m.w * m.h;
    }
    if (salida > EDITABLE_SALIDA_PX_MAX) throw new TopeEditable(`en esta medida las capas sumarían más de ${EDITABLE_SALIDA_PX_MAX / 1e6} millones de píxeles`, false);
    for (const c of l.children ?? []) deLaMedida(c, A);
  };
  for (const p of pasos) delArchivo(p.l);
  for (const p of pasos) deLaMedida(p.l, p.A);
}


/** El objeto inteligente de cada capa necesita su archivo; se llevan sólo los que usa esta medida. */
function idsUsados(capas: Layer[], ids = new Set<string>()): Set<string> {
  for (const l of capas) {
    if (l.placedLayer?.id) ids.add(l.placedLayer.id);
    if (l.children) idsUsados(l.children, ids);
  }
  return ids;
}

/**
 * La medida como PSD editable. `fuente`: el PSD leído ENTERO (con los archivos de sus objetos inteligentes), con
 * `useRawData`; `px` decodifica los píxeles de una capa cuando hace falta. `children` va de abajo hacia arriba.
 */
export function psdEditable(fuente: Psd, plan: PlanEditable, extras: ExtrasEditable, px: PixelesDe): { psd: Psd; notas: NotaCapa[] } {
  const notas: NotaCapa[] = [];
  const mesa = mesaDe(fuente, plan.origen);
  const pasos = pasosDe(mesa.capas, plan, new Map(extras.halos.map((h) => [h.nombre, h.capa])));
  // La capa del color de la mesa también cuenta en el tope de salida.
  revisarTopes(pasos, plan.W, plan.H, mesa.color ? plan.W * plan.H : 0);
  const hijos: Layer[] = [];
  if (mesa.color) {
    const [r, g, b] = [mesa.color.r, mesa.color.g, mesa.color.b].map((v) => Math.min(255, Math.max(0, Math.round(v)))), rgba = new Uint8ClampedArray(plan.W * plan.H * 4);
    // Un píxel RGBA como un entero de 32 bits (los navegadores son little-endian: el rojo va en el byte bajo).
    new Uint32Array(rgba.buffer).fill((0xff000000 | (b << 16) | (g << 8) | r) >>> 0);
    hijos.push(capaSalida(CAPA_COLOR_MESA, { x: 0, y: 0, w: plan.W, h: plan.H, rgba }));
  }
  // El retoque va encima del ÚLTIMO fondo visible que está debajo de todas las piezas (si hay dos, uno encima del otro,
  // el de arriba no se pinta dos veces sobre un parche que ya lo trae), y de sus recortadas: nunca se mete entre una
  // base y sus recortadas, ni encima de una pieza (la tarjeta pinta todo el fondo debajo de las piezas). Si un fondo
  // va encima de una pieza y no hay otro debajo, va encima de ése.
  const esFondo = ({ l, nombre }: Paso) => !l.hidden && !l.clipping && rolDe(nombre) === "BACKGROUND";
  const primeraPieza = pasos.findIndex((p) => p.A !== plan.fondo || p.quitada);
  const debajo = pasos.slice(0, primeraPieza < 0 ? pasos.length : primeraPieza).findLastIndex(esFondo);
  const ultimoFondo = debajo >= 0 ? debajo : pasos.findLastIndex(esFondo);
  let finFondo = ultimoFondo;
  while (finFondo + 1 < pasos.length && pasos[finFondo + 1].l.clipping) finFondo++;
  pasos.forEach(({ l, A, quitada, halo }, i) => {
    const movida = mover(l, A, plan.W, plan.H, px, notas);
    if (quitada) movida.hidden = true;
    if (halo) {
      // La sombra de contraste va justo debajo de la carpeta de su pieza, como la pinta la tarjeta. Dentro de la carpeta
      // cambiaría lo que se ve: su caja es opaca (blanco = no oscurece), así que el estilo de capa de la carpeta, su
      // máscara vectorial o una capa recortada a la carpeta tomarían la caja entera como forma. (Una pieza nunca está
      // recortada: lo recortado va con su base, `pasosDe`.)
      hijos.push(capaSalida(CAPA_SOMBRA_CONTRASTE, halo, { blendMode: "multiply" }));
    }
    hijos.push(movida);
    if (extras.retoque && i === finFondo) {
      const capa = capaSalida(CAPA_RETOQUE, extras.retoque);
      if (i === ultimoFondo && movida.children) movida.children.push(capa);
      else hijos.push(capa);
    }
  });
  const ids = idsUsados(hijos);
  const r = fuente.imageResources;
  return {
    psd: {
      width: plan.W,
      height: plan.H,
      imageData: { width: plan.W, height: plan.H, data: extras.compuesto },
      children: hijos,
      ...(fuente.linkedFiles?.length ? { linkedFiles: fuente.linkedFiles.filter((f) => ids.has(f.id)) } : {}),
      ...(fuente.patterns?.length ? { patterns: fuente.patterns } : {}),
      ...(r
        ? {
            imageResources: {
              ...(r.resolutionInfo ? { resolutionInfo: r.resolutionInfo } : {}),
              ...(r.globalAngle !== undefined ? { globalAngle: r.globalAngle } : {}),
              ...(r.globalAltitude !== undefined ? { globalAltitude: r.globalAltitude } : {}),
            },
          }
        : {}),
    },
    notas,
  };
}
