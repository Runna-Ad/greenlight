/**
 * HÜE Prisma › Formatos — cambiar las letras de un texto del PSD en el editor (paso 3; Pedro, 2026-10-20: "All sizes,
 * once", "Let the box grow down", "Any text HÜE can redraw"). Puro: escribir en un canvas llega como `pintar` y medir
 * como `maquetar`, así corre igual en la página y en las pruebas.
 *
 * Un cambio es del ANUNCIO, no de una medida: la misma capa con las mismas letras cambia en todas las medidas (y en
 * todas las mesas del PSD que la repiten). De un maestro sale otro con esas piezas ya escritas con lo nuevo: su color,
 * su base y su caja crecen lo que haga falta, y todo lo de después (acomodo, tarjeta, PNG, los dos PSD, contraste) lo
 * usa sin saber que cambió. Sólo se cambia un texto que la página ya escribe (pasó la prueba contra Photoshop con su
 * tipografía, y su pieza tiene base).
 */
import type { MaestroListo, ParteLista, PiezaLista } from "./listo.ts";
import type { Caja, TextoPieza } from "./psd.ts";
import { cajaQueCabe, textoCambiado, type LineaTexto, type TextoCapa } from "./textos.ts";

/** Las letras nuevas de cada texto cambiado, por `claveTexto` (su capa y las letras del PSD). */
export type CambiosTexto = Readonly<Record<string, string>>;
/** Un texto que la página sabe escribir: sus líneas y cuánto se corrió para empatar con Photoshop (px del maestro). */
export type Listo = { tp: TextoPieza; lineas: LineaTexto[]; dx: number; dy: number };
/** Escribe textos a la escala del maestro en el rectángulo (x, y, w, h) de la mesa: RGBA premultiplicado (0-255). */
export type Pintar = (listos: readonly Listo[], x: number, y: number, w: number, h: number) => Float32Array;
export type Maquetar = (t: TextoCapa) => LineaTexto[];

/** Con qué se reconoce un texto en todas las mesas del PSD: el nombre de su capa y sus letras del PSD. */
export const claveTexto = (tp: Pick<TextoPieza, "capa" | "texto"> & { cambio?: { de: string } }) => `${tp.capa}\n${tp.cambio?.de ?? tp.texto.texto}`;

/**
 * El estilo cambiado de un texto con la barra del editor (Pedro, 2026-10-28: "like photoshop, word google docs… the
 * fonts… bold or not and change sizes"). Es del ANUNCIO como sus letras: viaja en los mismos `CambiosTexto`, en una
 * llave aparte (`claveEstilo`), así se guarda, se deshace y vuelve al original igual que las letras.
 *   · `familia`: la familia (el nombre PostScript sin su estilo: «DiDiSans-Pro»), para todos sus tramos.
 *   · `negrita`: true/false = todos en negrita o no; sin decir, cada tramo con su peso (el precio grande en Bold y su
 *     «m.n.» en Regular siguen así al cambiar la familia).
 *   · `escala`: el tamaño de todos sus tramos × esto (con dos tamaños, los dos crecen igual).
 */
export type EstiloCambiado = { familia?: string; negrita?: boolean; escala?: number };
/** Lo que se puede agrandar o achicar un texto (como parte de su tamaño del PSD). */
export const ESCALA_MIN = 0.3, ESCALA_MAX = 4;
const ESTILO = "\u0001estilo\n";
export const claveEstilo = (clave: string) => ESTILO + clave;

/** El estilo cambiado de un texto (null = el del PSD). Lo guardado roto o fuera de rango no cuenta. */
export function estiloDe(cambios: CambiosTexto, clave: string): EstiloCambiado | null {
  const v = cambios[claveEstilo(clave)];
  if (v === undefined) return null;
  try {
    const o = JSON.parse(v) as Record<string, unknown>;
    const e: EstiloCambiado = {};
    if (typeof o.familia === "string" && /^[\x21-\x7e]{1,127}$/.test(o.familia)) e.familia = o.familia;
    if (typeof o.negrita === "boolean") e.negrita = o.negrita;
    if (typeof o.escala === "number" && o.escala >= ESCALA_MIN && o.escala <= ESCALA_MAX && o.escala !== 1) e.escala = o.escala;
    return Object.keys(e).length ? e : null;
  } catch {
    return null;
  }
}

/** Los cambios con este estilo para el texto `clave` (null o vacío = el del PSD). Igual que antes: EL MISMO objeto. */
export function conEstilo(cambios: CambiosTexto, clave: string, e: EstiloCambiado | null): CambiosTexto {
  const k = claveEstilo(clave), limpio: EstiloCambiado = {};
  if (e?.familia) limpio.familia = e.familia;
  if (e?.negrita !== undefined) limpio.negrita = e.negrita;
  if (e?.escala !== undefined && Math.abs(e.escala - 1) > 1e-6) limpio.escala = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, Math.round(e.escala * 1000) / 1000));
  const v = Object.keys(limpio).length ? JSON.stringify(limpio) : undefined;
  if (cambios[k] === v) return cambios;
  const r = { ...cambios };
  if (v === undefined) delete r[k];
  else r[k] = v;
  return r;
}

/** «DiDiSans-Pro-Bold» → familia «DiDiSans-Pro», estilo «Bold»; sin guion, todo es la familia y el estilo es «Regular».
 *  La cursiva a veces va aparte («DiDiSans-Pro-Bold-Italic», así vienen las de DiDi): es parte del estilo. */
const PESO = /^(thin|hairline|extralight|ultralight|light|book|regular|normal|roman|medium|semibold|demibold|bold|extrabold|ultrabold|black|heavy)$/i;
export function partesFuente(ps: string): { familia: string; estilo: string } {
  let i = ps.lastIndexOf("-");
  if (i <= 0) return { familia: ps, estilo: "Regular" };
  const j = ps.lastIndexOf("-", i - 1);
  if (j > 0 && /^(italic|oblique)$/i.test(ps.slice(i + 1)) && PESO.test(ps.slice(j + 1, i))) i = j;
  return { familia: ps.slice(0, i), estilo: ps.slice(i + 1).replace("-", "") };
}
const NEGRITA = /bold|black|heavy/i;
const CURSIVA = /italic|oblique/i;
export const esNegrita = (ps: string) => NEGRITA.test(partesFuente(ps).estilo);

/**
 * La tipografía cargada (`fuentes`, nombres PostScript) más parecida a `ps` en la familia `familia`, en negrita o no.
 * Mismo estilo si está; si no, el peso que pide (Bold, luego SemiBold/ExtraBold/Black; o Regular, luego Book/Medium/…)
 * con la cursiva que traía. null = esa familia no tiene nada cargado.
 */
export function fuenteParecida(ps: string, familia: string, negrita: boolean, fuentes: readonly string[]): string | null {
  const suyas = fuentes.filter((f) => partesFuente(f).familia === familia);
  if (!suyas.length) return null;
  const { estilo } = partesFuente(ps), cursiva = CURSIVA.test(estilo);
  const exacta = suyas.find((f) => partesFuente(f).estilo === estilo);
  if (exacta && esNegrita(exacta) === negrita) return exacta;
  const orden = negrita ? ["Bold", "SemiBold", "Semibold", "ExtraBold", "Black", "Heavy"] : ["Regular", "Book", "Roman", "Medium", "Normal", "Light"];
  const nombre = (f: string) => partesFuente(f).estilo.replace(CURSIVA, "").replace(/^$/, "Regular");
  const mismaCursiva = suyas.filter((f) => CURSIVA.test(partesFuente(f).estilo) === cursiva && esNegrita(f) === negrita);
  for (const o of orden) {
    const f = mismaCursiva.find((x) => nombre(x).toLowerCase() === o.toLowerCase());
    if (f) return f;
  }
  return mismaCursiva[0] ?? suyas.find((f) => esNegrita(f) === negrita) ?? suyas[0];
}

/** Las familias que se pueden elegir: las que tienen algo cargado, A-Z. */
export const familiasDe = (fuentes: readonly string[]) => [...new Set(fuentes.map((f) => partesFuente(f).familia))].sort((a, b) => a.localeCompare(b, "es"));

/** Una capa con su estilo cambiado. Un tramo cuya tipografía nueva no está cargada se queda con la suya. */
export function capaConEstilo(t: TextoCapa, e: EstiloCambiado, fuentes: readonly string[]): TextoCapa {
  const k = e.escala ?? 1;
  return {
    ...t,
    tramos: t.tramos.map((r) => {
      const familia = e.familia ?? partesFuente(r.fuente).familia, negrita = e.negrita ?? esNegrita(r.fuente);
      const fuente = familia === partesFuente(r.fuente).familia && negrita === esNegrita(r.fuente) ? r.fuente : (fuenteParecida(r.fuente, familia, negrita, fuentes) ?? r.fuente);
      return { ...r, fuente, tam: r.tam * k, interlineado: r.interlineado === null ? null : r.interlineado * k, subir: r.subir * k };
    }),
  };
}

/** Lo que sube la letra sobre su base y baja debajo, como parte de su tamaño, para reservar dónde escribir (de más:
 *  luego se mide la tinta de verdad). */
const SUBE = 1.1, BAJA = 0.4;
/** Margen alrededor de lo reservado (px del maestro): el suavizado de la orilla. */
const MARGEN = 3;
/** Cuánto (px del maestro) puede salirse la tinta nueva de la parte sólida de su pieza sin avisar. */
const FUERA_PX = 2;
/** Hasta dónde puede caer un texto nuevo, como parte de su mesa, por cada lado: más allá no se escribe (un texto
 *  pegado con miles de letras pediría lienzos de cientos de MB y tumbaría la pestaña). */
const MARGEN_MESA = 0.25;
/** Por qué un texto cambiado no se escribió en esa mesa (se avisa en cada medida; va el texto del PSD). */
export const NO_SE_ESCRIBIO = {
  tipografia: "falta su tipografía o no pasó la prueba contra Photoshop",
  largo: "es demasiado largo para su pieza",
  estilos: "su texto no se puede cambiar",
  pintar: "no se pudo pintar",
} as const;

type Rect = { x0: number; y0: number; x1: number; y1: number };
const unir = (a: Rect, b: Rect): Rect => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
const deCaja = (c: Caja): Rect => ({ x0: c.x, y0: c.y, x1: c.x + c.w, y1: c.y + c.h });
export const aCaja = (r: Rect): Caja => ({ x: r.x0, y: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0 });

/** Dónde puede caer la tinta de un texto escrito con estas líneas (px de la mesa, enteros, con margen). */
export function reservado(l: Listo): Rect | null {
  const tr = l.tp.texto.transform;
  let r: Rect | null = null;
  for (const ln of l.lineas)
    for (const p of ln.pedazos) {
      const tam = p.tramo.tam, x0 = p.x - tam * 0.2, x1 = p.x + p.ancho + tam * 0.2, y0 = ln.base - p.tramo.subir - tam * SUBE, y1 = ln.base - p.tramo.subir + tam * BAJA;
      for (const [u, v] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
        const X = tr[0] * u + tr[2] * v + tr[4] + l.dx, Y = tr[1] * u + tr[3] * v + tr[5] + l.dy;
        r = r ? unir(r, { x0: X, y0: Y, x1: X, y1: Y }) : { x0: X, y0: Y, x1: X, y1: Y };
      }
    }
  return r && { x0: Math.floor(r.x0) - MARGEN, y0: Math.floor(r.y0) - MARGEN, x1: Math.ceil(r.x1) + MARGEN, y1: Math.ceil(r.y1) + MARGEN };
}

/** La caja de lo que tiene alfa de más de `umbral` (0-255) en un RGBA premultiplicado de `w × h` con esquina en (x, y). */
function tintaDe(f: Float32Array, x: number, y: number, w: number, h: number, umbral: number): Rect | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++)
      if (f[(yy * w + xx) * 4 + 3] > umbral) {
        if (xx < x0) x0 = xx;
        if (xx > x1) x1 = xx;
        if (yy < y0) y0 = yy;
        if (yy > y1) y1 = yy;
      }
  return x1 < 0 ? null : { x0: x + x0, y0: y + y0, x1: x + x1 + 1, y1: y + y1 + 1 };
}

/** Un RGBA (u8, `de` caja) puesto en otra caja más grande (`a`), con `fondo` en lo nuevo (la misma caja: el mismo). */
function aCajaMayor(src: Uint8ClampedArray, de: Caja, a: Caja, fondo: number): Uint8ClampedArray {
  if (de.x === a.x && de.y === a.y && de.w === a.w && de.h === a.h) return src;
  const out = new Uint8ClampedArray(a.w * a.h * 4).fill(fondo);
  for (let yy = 0; yy < de.h; yy++) out.set(src.subarray(yy * de.w * 4, (yy + 1) * de.w * 4), ((yy + de.y - a.y) * a.w + (de.x - a.x)) * 4);
  return out;
}

/** La caja de lo sólido (alfa > 50 %, como en el despiece) de un RGBA u8 con esquina en (x, y); null si nada. */
export function solidoDe(rgba: Uint8ClampedArray, c: Caja): Rect | null {
  let x0 = c.w, y0 = c.h, x1 = -1, y1 = -1;
  for (let yy = 0; yy < c.h; yy++)
    for (let xx = 0; xx < c.w; xx++)
      if (rgba[(yy * c.w + xx) * 4 + 3] > 127) {
        if (xx < x0) x0 = xx;
        if (xx > x1) x1 = xx;
        if (yy < y0) y0 = yy;
        if (yy > y1) y1 = yy;
      }
  return x1 < 0 ? null : { x0: c.x + x0, y0: c.y + y0, x1: c.x + x1 + 1, y1: c.y + y1 + 1 };
}

/**
 * Un dibujo (pieza o parte) con sus textos escritos de nuevo: su base en la caja nueva (la de antes más la tinta) y,
 * encima, lo pintado, mezclado sobre la base con la gamma de Photoshop (`gamma`, como `armarMedida`). La caja sólida
 * sale de los píxeles nuevos (alfa > 50 %, como en el despiece).
 */
export function reescribir<D extends Pick<PiezaLista, "caja" | "solido" | "rgba" | "oscurece" | "base" | "textos">>(d: D, listos: readonly Listo[], pintar: Pintar, gamma: number): D | null {
  if (!d.base) return null;
  let r = deCaja(d.caja);
  for (const l of listos) {
    const x = reservado(l);
    if (x) r = unir(r, x);
  }
  const w = r.x1 - r.x0, h = r.y1 - r.y0;
  const t = pintar(listos, r.x0, r.y0, w, h);
  const tinta = tintaDe(t, r.x0, r.y0, w, h, 0);
  const caja = aCaja(tinta ? unir(deCaja(d.caja), tinta) : deCaja(d.caja));
  const base = aCajaMayor(d.base, d.caja, caja, 0);
  const rgba = new Uint8ClampedArray(base.length);
  for (let yy = 0; yy < caja.h; yy++)
    for (let xx = 0; xx < caja.w; xx++) {
      const i = (yy * caja.w + xx) * 4, j = ((yy + caja.y - r.y0) * w + (xx + caja.x - r.x0)) * 4;
      const at = t[j + 3] / 255, ab = base[i + 3] / 255, a = at + ab * (1 - at);
      rgba[i + 3] = Math.round(a * 255);
      if (!(a > 0)) continue;
      if (gamma === 1 || !(at > 0) || !(ab > 0))
        for (let c = 0; c < 3; c++) rgba[i + c] = Math.round((t[j + c] + base[i + c] * ab * (1 - at)) / a);
      else
        for (let c = 0; c < 3; c++) {
          const letra = Math.min(1, t[j + c] / at / 255), abajo = base[i + c] / 255;
          rgba[i + c] = Math.round(255 * Math.pow((at * Math.pow(letra, gamma) + ab * (1 - at) * Math.pow(abajo, gamma)) / a, 1 / gamma));
        }
    }
  const s = solidoDe(rgba, caja);
  return {
    ...d,
    caja,
    solido: s ? aCaja(s) : caja,
    rgba,
    base,
    oscurece: d.oscurece ? aCajaMayor(d.oscurece, d.caja, caja, 255) : null,
    textos: listos.map((l) => l.tp),
  };
}

/** La tinta de UN texto sola, sin la opacidad de su capa (la capa del PSD editable la lleva aparte), sin premultiplicar. */
export function tintaSola(l: Listo, pintar: Pintar): NonNullable<TextoPieza["cambio"]>["tinta"] {
  const r = reservado(l);
  if (!r) return null;
  const w = r.x1 - r.x0, h = r.y1 - r.y0;
  const f = pintar([{ ...l, tp: { ...l.tp, opacidad: 1 } }], r.x0, r.y0, w, h);
  const t = tintaDe(f, r.x0, r.y0, w, h, 0);
  if (!t) return null;
  const c = aCaja(t), rgba = new Uint8ClampedArray(c.w * c.h * 4);
  for (let yy = 0; yy < c.h; yy++)
    for (let xx = 0; xx < c.w; xx++) {
      const j = ((yy + c.y - r.y0) * w + (xx + c.x - r.x0)) * 4, i = (yy * c.w + xx) * 4, a = f[j + 3];
      if (!(a > 0)) continue;
      for (let k = 0; k < 3; k++) rgba[i + k] = Math.round((f[j + k] * 255) / a);
      rgba[i + 3] = Math.round(a);
    }
  return { ...c, rgba };
}

/** Una pieza derivada: además dice si la tinta nueva se sale de su parte sólida de antes, si se quedó sin letras y por
 *  qué un texto cambiado no se escribió en ella (se avisa en cada medida). */
export type PiezaCambiada = PiezaLista & { textoFuera?: boolean; sinLetras?: boolean; textoSinEscribir?: string };

/** ¿Algún texto de la pieza tiene letras nuevas en `cambios`? */
const conCambio = (p: PiezaLista, cambios: CambiosTexto) =>
  p.textos.some((tp) => (cambios[claveTexto(tp)] !== undefined && cambios[claveTexto(tp)] !== tp.texto.texto) || estiloDe(cambios, claveTexto(tp)) !== null);

/** Las claves de `cambios` que sí cambian un texto de estos maestros (la misma prueba que `conCambio`). Lo guardado de
 *  otro archivo con el mismo nombre, o de otra lectura de la misma imagen plana (otros ids), se queda pero no cuenta. */
export function cambiosQueAplican(maestros: readonly { piezas: readonly Pick<PiezaLista, "textos">[] }[], cambios: CambiosTexto): string[] {
  const original = new Map(maestros.flatMap((m) => m.piezas.flatMap((p) => p.textos.map((tp) => [claveTexto(tp), tp.texto.texto] as const))));
  // Un estilo cambiado cuenta como su texto (una vez, aunque también cambien sus letras).
  const k = Object.keys(cambios).map((c) => (c.startsWith(ESTILO) ? c.slice(ESTILO.length) : c));
  return [...new Set(k)].filter((c) => original.has(c) && (cambios[c] !== undefined ? cambios[c] !== original.get(c) : estiloDe(cambios, c) !== null));
}

/** El maestro con cada pieza que tiene un texto cambiado marcada como no escrita (por `motivo`): lo que se ve es el
 *  texto del PSD, y cada medida lo dice. Sin piezas así, el MISMO maestro. */
export function marcarSinEscribir<M extends MaestroListo>(ma: M, cambios: CambiosTexto, motivo: string): M {
  if (!ma.piezas.some((p) => conCambio(p, cambios))) return ma;
  return { ...ma, piezas: ma.piezas.map((p): PiezaCambiada => (conCambio(p, cambios) ? { ...p, textoSinEscribir: motivo } : p)) };
}

/**
 * El maestro con los textos cambiados ya escritos, y lo que la página escribe de cada pieza que cambió (sus `Listo`,
 * con los mismos objetos de texto que la pieza y sus partes). `listosDe(pieza)`: los textos de esa pieza que la página
 * ya escribe (undefined = no se escriben: el cambio no se puede ver y la pieza queda igual). Sin cambios que apliquen,
 * el MISMO maestro.
 */
export function cambiarTextos<M extends MaestroListo>(
  ma: M,
  cambios: CambiosTexto,
  listosDe: (pieza: number) => readonly Listo[] | undefined,
  maquetar: Maquetar,
  pintar: Pintar,
  /** Las tipografías cargadas (nombres PostScript), para los estilos cambiados con la barra. */
  fuentes: readonly string[] = [],
): { maestro: M; listos: Map<number, Listo[]> } {
  const listos = new Map<number, Listo[]>();
  let tocado = false;
  const gamma = ma.textoGamma ?? 1;
  // Lo más lejos que puede caer un texto nuevo (px de la mesa).
  const dentro = (r: Rect) => r.x0 >= -MARGEN_MESA * ma.w && r.y0 >= -MARGEN_MESA * ma.h && r.x1 <= (1 + MARGEN_MESA) * ma.w && r.y1 <= (1 + MARGEN_MESA) * ma.h;
  const piezas = ma.piezas.map((p, i): PiezaCambiada => {
    if (!conCambio(p, cambios)) return p;
    const marcar = (motivo: string): PiezaCambiada => ((tocado = true), { ...p, textoSinEscribir: motivo });
    const suyos = listosDe(i);
    if (!suyos?.length) return marcar(NO_SE_ESCRIBIO.tipografia);
    // Cada texto cambiado: sus letras, su caja de párrafo crecida si hace falta y sus líneas nuevas. Uno que no se
    // puede escribir se queda como en el PSD y se dice por qué (el primero que falle).
    const nuevos = new Map<TextoPieza, Listo>();
    let motivo: string | null = null;
    for (const l of suyos) {
      const nuevo = cambios[claveTexto(l.tp)], estilo = estiloDe(cambios, claveTexto(l.tp));
      if ((nuevo === undefined || nuevo === l.tp.texto.texto) && !estilo) continue;
      const letras = textoCambiado(l.tp.texto, nuevo ?? l.tp.texto.texto);
      if (!letras) {
        motivo ??= NO_SE_ESCRIBIO.estilos;
        continue;
      }
      const capa = estilo ? capaConEstilo(letras, estilo, fuentes) : letras;
      const lineas = maquetar(capa);
      const sinTinta: Listo = { tp: { ...l.tp, texto: cajaQueCabe(capa, lineas) }, lineas, dx: l.dx, dy: l.dy };
      const r = reservado(sinTinta);
      if (r && !dentro(r)) {
        motivo ??= NO_SE_ESCRIBIO.largo;
        continue;
      }
      const tinta = tintaSola(sinTinta, pintar);
      // Letras que no dejan tinta (el lienzo no se pudo pintar): mejor el texto del PSD que una pieza sin letras.
      if (!tinta && capa.texto.trim()) {
        motivo ??= NO_SE_ESCRIBIO.pintar;
        continue;
      }
      nuevos.set(l.tp, { ...sinTinta, tp: { ...sinTinta.tp, cambio: { de: l.tp.texto.texto, tinta } } });
    }
    if (p.textos.some((tp) => !suyos.some((l) => l.tp === tp) && (cambios[claveTexto(tp)] !== undefined || estiloDe(cambios, claveTexto(tp)) !== null))) motivo ??= NO_SE_ESCRIBIO.tipografia;
    if (!nuevos.size) return marcar(motivo ?? NO_SE_ESCRIBIO.tipografia);
    const todos = suyos.map((l) => nuevos.get(l.tp) ?? l);
    const pieza = reescribir(p, todos, pintar, gamma);
    if (!pieza) return marcar(NO_SE_ESCRIBIO.pintar);
    // Sus partes: cada una con sus textos (los MISMOS objetos nuevos que la pieza). Una parte sin base no se puede
    // volver a escribir: la pieza se mueve entera.
    let partes: ParteLista[] | undefined;
    if (p.partes) {
      partes = [];
      for (const d of p.partes) {
        if (!d.textos.some((tp) => nuevos.has(tp))) {
          partes.push(d);
          continue;
        }
        const r = reescribir(d, suyos.filter((l) => d.textos.includes(l.tp)).map((l) => nuevos.get(l.tp) ?? l), pintar, gamma);
        if (!r) {
          partes = undefined;
          break;
        }
        partes.push(r);
      }
    }
    // ¿La tinta nueva se sale de lo sólido de la pieza SIN sus letras (un botón, una placa)? Sólo si el texto del PSD
    // estaba adentro: un texto suelto (sólo letras, o al lado de unos iconos) no tiene de qué salirse. Una caja de
    // párrafo crece hacia abajo a propósito: eso no cuenta.
    const s = p.base ? solidoDe(p.base, p.caja) : null;
    const en = (c: Caja) => !!s && c.w > 0 && c.h > 0 && c.x >= s.x0 - FUERA_PX && c.y >= s.y0 - FUERA_PX && c.x + c.w <= s.x1 + FUERA_PX && c.y + c.h <= s.y1 + FUERA_PX;
    const fuera = !!s && [...nuevos].some(([antes, l]) => {
      const t = l.tp.cambio?.tinta;
      return en(antes.caja) && !!t && (t.x < s.x0 - FUERA_PX || t.x + t.w > s.x1 + FUERA_PX || t.y < s.y0 - FUERA_PX || (!l.tp.texto.caja && t.y + t.h > s.y1 + FUERA_PX));
    });
    const vacia = todos.every((l) => !l.tp.texto.texto.trim());
    listos.set(i, todos);
    tocado = true;
    return {
      ...pieza,
      ...(partes ? { partes } : { partes: undefined, carpeta: undefined }),
      ...(fuera ? { textoFuera: true } : {}),
      ...(vacia ? { sinLetras: true } : {}),
      ...(motivo ? { textoSinEscribir: motivo } : {}),
    };
  });
  return { maestro: tocado ? { ...ma, piezas } : ma, listos };
}
