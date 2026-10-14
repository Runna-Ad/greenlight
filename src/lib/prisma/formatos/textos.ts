/**
 * HÜE Prisma › Formatos — volver a ESCRIBIR el texto de un PSD a la medida final (nitidez C, Pedro 2026-10-14),
 * en vez de reducir una foto del texto. Puro (sin DOM ni ag-psd): corre en el worker, en la página y en Node.
 *
 *   1. `textoDe`: lo que Photoshop guarda de una capa de texto (letras, tramos con su tipografía, tamaño, color,
 *      interlineado, posición). Lo que no sabemos reproducir igual (deformar, vertical, falsas negritas, escalas)
 *      queda con su `motivo` y esa capa sigue como imagen.
 *   2. `maquetar`: las líneas y dónde va cada tramo, en las unidades de Photoshop (puntos de la capa).
 *   3. `fuentesDe`: qué tipografías trae un archivo .otf/.ttf, por su nombre PostScript (el que guarda el PSD).
 *   4. `compararAlfa`: la prueba que decide si el texto se redibuja: se escribe a la medida del maestro y se compara
 *      con los píxeles de esa capa en Photoshop. Si no coincide, va como imagen. Nunca se adivina.
 */

export type Rgb = [number, number, number];
export type TramoTexto = {
  /** Cuántas letras del texto cubre. */
  n: number;
  /** Nombre PostScript ("DiDiSans-Pro-Bold"). */
  fuente: string;
  tam: number;
  color: Rgb;
  /** Milésimas de eme entre letras. */
  track: number;
  /** null = automático (120 % del tamaño, como Photoshop). */
  interlineado: number | null;
  subir: number;
  mayusculas: boolean;
};
export type Alineacion = "left" | "center" | "right";
export type TextoCapa = {
  /** Saltos de línea normalizados a "\n" (Photoshop usa "\r" y, dentro de una caja, "\u0003"). Mismo largo. */
  texto: string;
  tramos: TramoTexto[];
  alineacion: Alineacion;
  /** [xx, xy, yx, yy, tx, ty]: de unidades de la capa a px del lienzo. */
  transform: [number, number, number, number, number, number];
  /** Texto de párrafo: su caja [izq, arriba, der, abajo] en unidades de la capa; null = texto de punto. */
  caja: [number, number, number, number] | null;
  /** Por qué NO se puede redibujar (null = se puede intentar). */
  motivo: string | null;
};

/** Lo que trae ag-psd de una capa de texto (sólo lo que se usa; tipado aquí para no importar la librería). */
type EstiloPsd = {
  font?: { name?: string };
  fontSize?: number;
  fauxBold?: boolean;
  fauxItalic?: boolean;
  autoLeading?: boolean;
  leading?: number;
  horizontalScale?: number;
  verticalScale?: number;
  tracking?: number;
  baselineShift?: number;
  fontCaps?: number;
  underline?: boolean;
  strikethrough?: boolean;
  fillColor?: { r?: number; g?: number; b?: number };
  strokeFlag?: boolean;
};
export type TextoPsdCrudo = {
  text?: string;
  transform?: number[];
  orientation?: string;
  warp?: { style?: string };
  style?: EstiloPsd;
  styleRuns?: { length: number; style?: EstiloPsd }[];
  paragraphStyle?: { justification?: string };
  paragraphStyleRuns?: { length: number; style?: { justification?: string } }[];
  shapeType?: string;
  boxBounds?: number[];
};

const TEXTO_MAX = 2000;
/** Un texto real cambia de estilo unas pocas veces; con más, maquetarlo costaría demasiado y va como imagen. */
export const TRAMOS_MAX = 64;
const FUENTE_NOMBRE_MAX = 128;
const casi = (a: number | undefined, b: number) => a === undefined || Math.abs(a - b) < 1e-3;
/** El nombre de una tipografía tal como viene del archivo: sin caracteres de control ni de dirección, y corto. */
const nombreFuente = (n: string | undefined): string => (n ?? "").replace(/[\p{Cc}\p{Cf}]/gu, "").slice(0, FUENTE_NOMBRE_MAX);

export function textoDe(t: TextoPsdCrudo): TextoCapa {
  const texto = (t.text ?? "").slice(0, TEXTO_MAX).replace(/[\r\u0003]/g, "\n");
  const base = t.style ?? {};
  // Las corridas de largo 0 no pintan nada (la librería las conserva): fuera.
  const todas = t.styleRuns?.length ? t.styleRuns.filter((r) => (r.length | 0) > 0) : [{ length: texto.length, style: {} }];
  const motivos: string[] = [];
  if (todas.length > TRAMOS_MAX) motivos.push("demasiados cambios de estilo");
  const corridas = todas.length > TRAMOS_MAX ? [] : todas;
  const tramos: TramoTexto[] = [];
  for (const r of corridas) {
    const s: EstiloPsd = { ...base, ...(r.style ?? {}) };
    if (s.fauxBold || s.fauxItalic) motivos.push("negrita o cursiva falsa");
    if (!casi(s.horizontalScale, 1) || !casi(s.verticalScale, 1)) motivos.push("letra estirada");
    if (s.fontCaps === 1) motivos.push("versalitas");
    if (s.underline || s.strikethrough) motivos.push("subrayado o tachado");
    if (s.strokeFlag) motivos.push("contorno de letra");
    const tam = s.fontSize ?? 0;
    if (!(tam > 0) || !s.font?.name) motivos.push("tramo sin tipografía o tamaño");
    const c = s.fillColor ?? {};
    tramos.push({
      n: Math.max(0, r.length | 0),
      fuente: nombreFuente(s.font?.name),
      tam,
      color: [c.r ?? 0, c.g ?? 0, c.b ?? 0],
      track: s.tracking ?? 0,
      interlineado: s.autoLeading === false && (s.leading ?? 0) > 0 ? (s.leading as number) : null,
      subir: s.baselineShift ?? 0,
      mayusculas: s.fontCaps === 2,
    });
  }
  // Los tramos tienen que cubrir el texto exacto (si no, algo no se leyó bien).
  if (corridas.length && tramos.reduce((t2, r) => t2 + r.n, 0) !== texto.length) motivos.push("tramos que no cubren el texto");
  const justs = new Set([t.paragraphStyle?.justification ?? "left", ...(t.paragraphStyleRuns ?? []).map((r) => r.style?.justification ?? t.paragraphStyle?.justification ?? "left")]);
  const just = [...justs][0];
  if (justs.size > 1) motivos.push("párrafos con distinta alineación");
  if (!["left", "center", "right"].includes(just)) motivos.push(`alineación «${just}»`);
  if (t.warp?.style && t.warp.style !== "none") motivos.push("texto deformado");
  if (t.orientation === "vertical") motivos.push("texto vertical");
  const tr = t.transform ?? [1, 0, 0, 1, 0, 0];
  if (tr.length < 6 || !tr.every(Number.isFinite)) motivos.push("posición ilegible");
  const caja = t.shapeType === "box" && t.boxBounds?.length === 4 && t.boxBounds.every(Number.isFinite) ? (t.boxBounds as [number, number, number, number]) : null;
  if (t.shapeType === "box" && !caja) motivos.push("caja de párrafo ilegible");
  if (!texto.trim()) motivos.push("sin letras");
  return {
    texto,
    tramos,
    alineacion: (["left", "center", "right"].includes(just) ? just : "left") as Alineacion,
    transform: [tr[0], tr[1], tr[2], tr[3], tr[4], tr[5]],
    caja,
    motivo: motivos.length ? [...new Set(motivos)].join(", ") : null,
  };
}

// ── Maquetar ──────────────────────────────────────────────────────────────

/** Mide un pedazo de texto con una tipografía y tamaño (en unidades de la capa): su avance y cuánto sube su tinta
 *  sobre la base. En la página: canvas `measureText`. */
export type Medidor = (texto: string, tramo: TramoTexto) => { ancho: number; sube: number };
export type PedazoLinea = { texto: string; tramo: TramoTexto; x: number; ancho: number };
export type LineaTexto = { base: number; pedazos: PedazoLinea[]; ancho: number };

/** Photoshop: interlineado automático = 120 % del tamaño más grande de la línea. */
const interlineadoDe = (ps: PedazoLinea[], vacia: TramoTexto) =>
  Math.max(...(ps.length ? ps : [{ tramo: vacia }]).map((p) => p.tramo.interlineado ?? p.tramo.tam * 1.2));

/**
 * Las líneas del texto y dónde empieza cada pedazo, en unidades de la capa (el `transform` lleva al lienzo).
 * Texto de punto: la primera línea tiene su base en y = 0 y la alineación es respecto a x = 0. Texto de caja: se
 * parte en palabras al ancho de la caja y la primera base baja lo que sube la "d" (la regla "Ascent" de Adobe; con
 * el tope de la tipografía quedaba 3 px abajo en el legal real: DiDi Medium, "d" 10.43 contra tope 13.00).
 */
export function maquetar(t: TextoCapa, medir: Medidor): LineaTexto[] {
  // Letras con su tramo; mayúsculas aplicadas aquí (el tramo se queda igual).
  const letras: { c: string; tramo: TramoTexto }[] = [];
  let i = 0;
  for (const tramo of t.tramos)
    for (let k = 0; k < tramo.n && i < t.texto.length; k++, i++) letras.push({ c: tramo.mayusculas ? t.texto[i].toUpperCase() : t.texto[i], tramo });
  // Pedazos = letras seguidas con el mismo tramo; líneas = cortes en "\n" (y, en caja, al ancho).
  const lineas: { letras: typeof letras }[] = [{ letras: [] }];
  for (const l of letras) {
    if (l.c === "\n") lineas.push({ letras: [] });
    else lineas[lineas.length - 1].letras.push(l);
  }
  const anchoCaja = t.caja ? t.caja[2] - t.caja[0] : Infinity;
  const pedazosDe = (ls: typeof letras): PedazoLinea[] => {
    const out: PedazoLinea[] = [];
    let x = 0;
    for (let j = 0; j < ls.length; ) {
      let k = j;
      while (k < ls.length && ls[k].tramo === ls[j].tramo) k++;
      const texto = ls.slice(j, k).map((l) => l.c).join("");
      const ancho = medir(texto, ls[j].tramo).ancho;
      out.push({ texto, tramo: ls[j].tramo, x, ancho });
      x += ancho;
      j = k;
    }
    return out;
  };
  const anchoDe = (ps: PedazoLinea[]) => ps.reduce((s, p) => s + p.ancho, 0);
  // En caja: partir en palabras para que cada línea quepa (los espacios del final no cuentan, como en Photoshop).
  const partidas: (typeof letras)[] = [];
  for (const ln of lineas) {
    if (!t.caja) { partidas.push(ln.letras); continue; }
    let actual: typeof letras = [];
    let palabra: typeof letras = [];
    const cabe = (ls: typeof letras) => anchoDe(pedazosDe(trimFin(ls))) <= anchoCaja + 0.5;
    for (const l of [...ln.letras, { c: " ", tramo: ln.letras.at(-1)?.tramo ?? t.tramos[0] }]) {
      palabra.push(l);
      if (l.c !== " ") continue;
      if (actual.length && !cabe([...actual, ...palabra])) { partidas.push(trimFin(actual)); actual = []; }
      actual.push(...palabra);
      palabra = [];
    }
    partidas.push(trimFin(actual));
  }
  const vacia = t.tramos[0];
  const out: LineaTexto[] = [];
  let y = 0;
  partidas.forEach((ls, n) => {
    const ps = pedazosDe(ls);
    const ancho = anchoDe(ps);
    if (n === 0) y = t.caja ? t.caja[1] + Math.max(...(ps.length ? ps : [{ texto: "M", tramo: vacia }]).map((p) => medir("d", p.tramo).sube)) : 0;
    else y += interlineadoDe(ps, vacia);
    const x0 = t.caja
      ? t.alineacion === "center" ? t.caja[0] + (anchoCaja - ancho) / 2 : t.alineacion === "right" ? t.caja[2] - ancho : t.caja[0]
      : t.alineacion === "center" ? -ancho / 2 : t.alineacion === "right" ? -ancho : 0;
    out.push({ base: y, ancho, pedazos: ps.map((p) => ({ ...p, x: p.x + x0 })) });
  });
  return out;
}
function trimFin<T extends { c: string }>(ls: T[]): T[] {
  let k = ls.length;
  while (k > 0 && ls[k - 1].c === " ") k--;
  return ls.slice(0, k);
}

// ── Tipografías: qué trae un archivo ─────────────────────────────────────

/** Una tipografía que se puede pedir por su nombre PostScript; `peso` sólo en las variables (valor del eje wght). */
export type FuenteArchivo = { ps: string; peso: number | null };

/**
 * Los nombres PostScript que trae un .otf/.ttf: el suyo y, si es variable, el de cada estilo con nombre (Photoshop
 * guarda "DiDiSansVariable-Bold": el nombre propio del estilo, o prefijo de la familia + nombre del estilo), más el
 * que tendría su versión estática ("OpenSans-Bold" para "OpenSansRoman-Bold"). Sin estilos del eje de cursiva. Lanza
 * si no es una tipografía.
 */
/** Topes de lo que se cree de un archivo de tipografía (uno hecho a propósito podría pedir millones de nombres). */
const TABLAS_MAX = 64, EJES_MAX = 64, ESTILOS_MAX = 256, NOMBRE_BYTES_MAX = 256;
const utf16 = new TextDecoder("utf-16be"), latin1 = new TextDecoder("latin1");

export function fuentesDe(buf: ArrayBuffer): FuenteArchivo[] {
  const v = new DataView(buf);
  const L = buf.byteLength;
  if (L < 12) throw new Error("no es una tipografía OpenType/TrueType");
  const firma = v.getUint32(0);
  if (firma !== 0x00010000 && firma !== 0x4f54544f /* OTTO */ && firma !== 0x74727565 /* true */) throw new Error("no es una tipografía OpenType/TrueType");
  const n = Math.min(v.getUint16(4), TABLAS_MAX);
  const tablas: Record<string, { off: number; len: number }> = {};
  for (let i = 0; i < n && 12 + i * 16 + 16 <= L; i++) {
    const o = 12 + i * 16;
    const t = { off: v.getUint32(o + 8), len: v.getUint32(o + 12) };
    // Una tabla que se sale del archivo no se usa.
    if (t.off + t.len <= L) tablas[String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3))] = t;
  }
  const nm = tablas.name;
  if (!nm || nm.len < 6) throw new Error("tipografía sin tabla de nombres");
  const finNm = nm.off + nm.len;
  // fvar primero: dice qué nombres (de sus estilos) hacen falta. Sólo se decodifican ésos.
  const fv = tablas.fvar;
  const ejes: string[] = [], estilos: { o: number; tam: number }[] = [];
  const quiero = new Set([1, 6, 16, 25]);
  if (fv && fv.len >= 16) {
    const ejesOff = fv.off + v.getUint16(fv.off + 4);
    const nEjes = v.getUint16(fv.off + 8), nInst = v.getUint16(fv.off + 12), tam = v.getUint16(fv.off + 14);
    if (nEjes <= EJES_MAX && nInst <= ESTILOS_MAX && tam >= nEjes * 4 + 4 && ejesOff + nEjes * 20 + nInst * tam <= fv.off + fv.len) {
      for (let i = 0; i < nEjes; i++) {
        const o = ejesOff + i * 20;
        ejes.push(String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3)));
      }
      for (let i = 0; i < nInst; i++) {
        const o = ejesOff + nEjes * 20 + i * tam;
        estilos.push({ o, tam });
        quiero.add(v.getUint16(o));
        if (tam >= nEjes * 4 + 6) quiero.add(v.getUint16(o + 4 + nEjes * 4));
      }
    }
  }
  const nombres: Record<number, string> = {};
  const cuenta = v.getUint16(nm.off + 2), cadenas = nm.off + v.getUint16(nm.off + 4);
  for (let i = 0; i < cuenta && nm.off + 6 + i * 12 + 12 <= finNm; i++) {
    const r = nm.off + 6 + i * 12;
    const plat = v.getUint16(r), id = v.getUint16(r + 6), len = v.getUint16(r + 8), off = v.getUint16(r + 10);
    if (!quiero.has(id) || len > NOMBRE_BYTES_MAX || cadenas + off + len > L) continue;
    if (plat === 3 || plat === 0) nombres[id] = utf16.decode(new Uint8Array(buf, cadenas + off, len & ~1));
    else if (plat === 1 && nombres[id] === undefined) nombres[id] = latin1.decode(new Uint8Array(buf, cadenas + off, len));
  }
  const ps = nombres[6];
  if (!ps) throw new Error("tipografía sin nombre PostScript");
  if (!estilos.length) return [{ ps, peso: null }];
  const nEjes = ejes.length;
  const iW = ejes.indexOf("wght"), iI = ejes.indexOf("ital");
  const prefijo = nombres[25] ?? ps.replace(/-[^-]*$/, "");
  // Familia sin espacios: así nombra Google (y casi todos) a la versión ESTÁTICA de cada estilo ("OpenSans-Bold"),
  // que es la que suele tener instalada el diseñador y la que guarda el PSD. La variable dice "OpenSansRoman-Bold".
  const familia = (nombres[16] ?? nombres[1] ?? "").replace(/\s+/g, "");
  const out = new Map<string, FuenteArchivo>();
  for (const { o, tam } of estilos) {
    const coord = (k: number) => v.getInt32(o + 4 + k * 4) / 65536;
    if (iI >= 0 && coord(iI) !== 0) continue;
    const psId = tam >= nEjes * 4 + 6 ? v.getUint16(o + 4 + nEjes * 4) : 0xffff;
    // El nombre PostScript propio del estilo: si ya viene completo ("Montserrat-SemiBoldItalic", con guion o con el
    // prefijo) va tal cual; si es sólo el estilo ("Bold", como en DiDi), o no hay y se usa el nombre del estilo
    // ("Semi-Bold" también), lleva el prefijo de la familia delante.
    const ps0 = (psId !== 0xffff && nombres[psId]) || "";
    const estilo = (nombres[v.getUint16(o)] ?? "").replace(/\s+/g, "");
    const peso = iW >= 0 ? coord(iW) : null;
    const completo = !!ps0 && !/\s/.test(ps0) && (ps0.includes("-") || ps0.startsWith(prefijo));
    const base = (ps0 || estilo).replace(/\s+/g, "");
    const principal = completo ? ps0 : base && `${prefijo}-${base}`;
    for (const nombre of [principal, familia && estilo && `${familia}-${estilo}`]) {
      if (nombre && !out.has(nombre)) out.set(nombre, { ps: nombre, peso });
    }
  }
  return out.size ? [...out.values()] : [{ ps, peso: null }];
}

// ── La prueba: ¿lo que escribimos es lo que dibujó Photoshop? ────────────

/** Diferencia aceptada entre nuestro texto y el de Photoshop (fracción de su tinta). Medido en el PSD real, las dos
 *  mesas: con su tipografía, 0.035-0.218 (el legal de 16 px es el más alto: casi todo es orilla, y el navegador
 *  dibuja la letra 10-14 % más gruesa); con OTRO grosor de la misma familia, 0.392 o más. 0.3 queda en medio.
 *  (Antes 0.2 dejaba el legal como imagen; Pedro pidió escribirlo si sale mejor, y sale: más nítido al ampliarlo y
 *  al reducirlo, con el mismo tono de Photoshop desde que el texto se mezcla con su gamma.) */
export const TEXTO_DIF_MAX = 0.3;
/** Lo más que se acepta corregir de lugar (px del maestro) al alinear: más que esto es que la maqueta está mal. */
export const TEXTO_CORRER_MAX = 6;
/** Cuánto puede diferir el ancho de la tinta (fracción): con otra tipografía o un salto de línea distinto, se pasa. */
export const TEXTO_ANCHO_TOL = 0.03;
/** Desde esta alfa (0-255) un píxel cuenta como letra al medir el ancho de la tinta (el borde suave no). */
const TINTA_UMBRAL = 64;

/**
 * Compara dos alfas del mismo tamaño (w × h, 0-255): cuánto hay que correr el nuestro para empatar con el de
 * Photoshop (px enteros: el mejor junto al centro de masa) y, ya corrido, qué fracción de la tinta de Photoshop no
 * coincide.
 */
export function compararAlfa(nuestro: Uint8ClampedArray | Uint8Array, ps: Uint8ClampedArray | Uint8Array, w: number, h: number): { dx: number; dy: number; dif: number; anchoRazon: number } {
  const centro = (a: ArrayLike<number>) => {
    let s = 0, sx = 0, sy = 0, x0 = w, x1 = -1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = a[y * w + x];
        if (!v) continue;
        s += v; sx += v * x; sy += v * y;
        if (v > TINTA_UMBRAL) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
      }
    return { s, cx: s ? sx / s : 0, cy: s ? sy / s : 0, ancho: x1 - x0 + 1 };
  };
  const a = centro(nuestro), b = centro(ps);
  if (!a.s || !b.s) return { dx: 0, dy: 0, dif: 1, anchoRazon: 0 };
  // `tope`: en cuanto un corrimiento ya es peor que el mejor, se deja de sumar.
  const malCon = (dx: number, dy: number, tope: number) => {
    let mal = 0;
    for (let y = 0; y < h && mal < tope; y++)
      for (let x = 0; x < w; x++) {
        const xs = x - dx, ys = y - dy;
        const v = xs >= 0 && xs < w && ys >= 0 && ys < h ? nuestro[ys * w + xs] : 0;
        mal += Math.abs(v - ps[y * w + x]);
      }
    return mal;
  };
  // El centro de la tinta da el corrimiento a ±1 px; en letra de 14 px ese píxel duplica la diferencia (legal real:
  // 0.84 con el centro, 0.41 un píxel al lado). Se prueba alrededor y se queda el mejor.
  const cx = Math.round(b.cx - a.cx), cy = Math.round(b.cy - a.cy);
  let mejor = { dx: cx, dy: cy, mal: Infinity };
  for (let dy = cy - 1; dy <= cy + 1; dy++)
    for (let dx = cx - 1; dx <= cx + 1; dx++) {
      const mal = malCon(dx, dy, mejor.mal);
      if (mal < mejor.mal) mejor = { dx, dy, mal };
    }
  return { dx: mejor.dx, dy: mejor.dy, dif: mejor.mal / b.s, anchoRazon: a.ancho / b.ancho };
}
