/**
 * HÜE Prisma › Formatos — el LEGAL en otros renglones (B27; Pedro, 2026-10-22: "fewer legal lines on every wide size,
 * plus a lines picker in the editor"). Puro: escribir llega como `pintar` y medir como `maquetar` (cambios-texto.ts),
 * así corre igual en la página y en las pruebas.
 *
 * Cada número de renglones es OTRA versión del maestro, como un texto cambiado: el legal con los saltos del PSD
 * juntos, en una caja de párrafo al ancho mínimo que da esos renglones (así salen parejos); lo demás del pie (los
 * iconos de las tiendas) a escala con el alto nuevo del legal, del mismo lado y con el hueco a escala; y el pie con su
 * mismo centro y su mismo borde de abajo. Todo lo de después (acomodo, tarjeta, PNG, contraste, los dos PSD) la usa sin
 * saber que cambió. Cada parte movida dice cómo (`desde`), para el PSD editable.
 */
import { RENGLONES_MAS } from "./acomodo.ts";
import { aCaja, reescribir, reservado, solidoDe, tintaSola, type Listo, type Maquetar, type Pintar } from "./cambios-texto.ts";
import { legalDelPsd } from "./legal.ts";
import type { MaestroListo, ParteLista, PiezaLista } from "./listo.ts";
import { remuestrear } from "./nitido.ts";
import { TEXTO_CAJA_MAX_PX, type Caja } from "./psd.ts";
import { cajaQueCabe, textoCambiado, type LineaTexto, type TextoCapa } from "./textos.ts";

/** El legal de un maestro que se puede poner en otros renglones: su pieza, su parte (null = la pieza es sólo el legal),
 *  su texto (índice en `pieza.textos`) y en cuántos renglones viene del PSD. */
export type LegalRenglones = { pieza: number; parte: number | null; j: number; psd: number };
/** Por qué no (la pantalla lo dice en su idioma). */
export type SinRenglones =
  | "sin-legal" // el PSD no trae texto en el pie
  | "tipografia" // la página no lo sabe escribir (falta su tipografía o no pasó la prueba)
  | "estilos" // tiene varios estilos
  | "de-punto" // texto de punto: sus renglones los pone Photoshop con Enter
  | "girado" // girado o inclinado: menos renglones no lo hacen más ancho a lo largo de la medida
  | "guion" // corta una palabra con guion al final de un renglón: juntarlo cambiaría las letras
  | "placa" // algo pintado detrás del legal en su misma carpeta
  | "partes" // lo demás del pie no está a un lado del legal (o viene en la misma capa)
  | "otro-texto"; // el pie trae otro texto
/** Alfa (0-255) desde la que algo pintado cuenta como placa o como otra cosa junto al legal. */
const TINTA_MIN = 12;
/** px del maestro de holgura para decir que una parte está a un lado del legal. */
const AL_LADO = 2;
/** Holgura del ancho de la caja: Photoshop mide la letra un poco distinto, y en la caja justa partiría un renglón más al
 *  «Actualizar» el PSD editable. Más ancho no cambia los renglones (para quitar uno hace falta mucho más). */
const HOLGURA = 1.02;
/** Un legal en tantos renglones que pasaría de esto (veces el ancho del maestro) no se ofrece. */
const ANCHO_MAX = 4;
/** Hasta dónde se busca el ancho de la caja: medio paso de más no cambia los renglones (unidades de la capa). */
const PRECISION = 0.1, PASOS_MAX = 24;
/** Lo que se recorta alrededor de la tinta del legal nuevo (px del maestro): la orilla suave de la letra. */
const ORILLA = 2;

const hayTinta = (rgba: Uint8ClampedArray | null) => {
  if (!rgba) return false;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > TINTA_MIN) return true;
  return false;
};

/** El legal del maestro (el mismo de B24, `legalDelPsd`) si se puede poner en otros renglones; si no, por qué. */
export function legalParaRenglones(ma: Pick<MaestroListo, "piezas">, listosDe: (pieza: number) => readonly Listo[] | undefined): LegalRenglones | { no: SinRenglones } {
  const legal = legalDelPsd([ma])[0];
  if (!legal) return { no: "sin-legal" };
  const p = ma.piezas[legal.pieza], tp = p.textos[legal.j];
  if (p.textos.length !== 1) return { no: "otro-texto" };
  const l = listosDe(legal.pieza)?.find((x) => x.tp === tp);
  if (!l) return { no: "tipografia" };
  if (tp.texto.tramos.length !== 1) return { no: "estilos" };
  if (!tp.texto.caja) return { no: "de-punto" };
  const [a, b, c, d0] = tp.texto.transform, escala = Math.hypot(a, b);
  if (!(escala > 0) || Math.abs(b) > 1e-3 * escala || Math.abs(c) > 1e-3 * escala || !(d0 > 0)) return { no: "girado" };
  // Uno solo también: puede ir en MÁS renglones (B29).
  const psd = l.lineas.length;
  if (tp.texto.saltosSuaves && /-[ \t]*\n/.test(tp.texto.texto)) return { no: "guion" };
  if (!p.partes) return hayTinta(p.base) ? { no: "partes" } : { pieza: legal.pieza, parte: null, j: legal.j, psd };
  const parte = p.partes.findIndex((d) => d.textos.includes(tp));
  if (parte < 0) return { no: "partes" };
  const d = p.partes[parte], L = d.solido;
  if (!d.base || hayTinta(d.base)) return { no: "placa" };
  const otras = p.partes.filter((_, i) => i !== parte).map((o) => o.solido);
  const izquierda = otras.every((o) => o.x + o.w <= L.x + AL_LADO), derecha = otras.every((o) => o.x >= L.x + L.w - AL_LADO);
  const aSuAltura = otras.every((o) => o.y < L.y + L.h && o.y + o.h > L.y);
  if (otras.length && (!(izquierda || derecha) || !aSuAltura)) return { no: "partes" };
  return { pieza: legal.pieza, parte, j: legal.j, psd };
}

/** Un párrafo partido a mano (sólo saltos suaves), en uno: cada salto con sus espacios es un espacio. Con párrafos de
 *  verdad, sus saltos se quedan (sólo cambia dónde parte la caja). */
const juntar = (t: TextoCapa) => (t.saltosSuaves ? t.texto.replace(/[ \t]*\n[ \t\n]*/g, " ").trim() : t.texto);

/** La caja de párrafo más angosta en que el texto va en `n` renglones o menos (con `HOLGURA`), con su alto justo, y
 *  sus líneas; null si ni a `limite` de ancho (unidades de la capa) cabe. */
function cajaPara(capa: TextoCapa, n: number, maquetar: Maquetar, limite: number): { capa: TextoCapa; lineas: LineaTexto[] } | null {
  const c = capa.caja;
  if (!c || !(limite > 0)) return null;
  const con = (w: number): TextoCapa => ({ ...capa, caja: [c[0], c[1], c[0] + w, c[1]] });
  const caben = (w: number) => maquetar(con(w)).length <= n;
  if (!caben(limite)) return null;
  // Del ancho del PSD hacia arriba hasta que quepa (sin pasar del tope), y luego a la mitad hasta un décimo.
  let hi = Math.min(limite, Math.max(1, c[2] - c[0]));
  while (!caben(hi)) hi = Math.min(limite, hi * 2);
  let lo = 0;
  for (let i = 0; i < PASOS_MAX && hi - lo > PRECISION; i++) {
    const m = (lo + hi) / 2;
    if (caben(m)) hi = m;
    else lo = m;
  }
  const t = con(hi * HOLGURA + 1), lineas = maquetar(t), justa = cajaQueCabe(t, lineas);
  // De alto, la del PSD si era más alta: al «Actualizar» en Photoshop, un renglón de más no se esconde.
  const b = justa.caja ?? t.caja!;
  return { capa: { ...justa, caja: [b[0], b[1], b[2], Math.max(b[3], c[3])] }, lineas };
}

/** Un dibujo recortado a su tinta (alfa > 0) más `ORILLA`: lo que queda de la caja de antes, vacío, no sigue colgando. */
function aSuTinta<D extends { caja: Caja; rgba: Uint8ClampedArray; base: Uint8ClampedArray | null; oscurece: Uint8ClampedArray | null }>(d: D): D {
  const { w, h } = d.caja;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (d.rgba[(y * w + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return d;
  x0 = Math.max(0, x0 - ORILLA);
  y0 = Math.max(0, y0 - ORILLA);
  x1 = Math.min(w - 1, x1 + ORILLA);
  y1 = Math.min(h - 1, y1 + ORILLA);
  if (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1) return d;
  const W = x1 - x0 + 1, H = y1 - y0 + 1;
  const corta = (src: Uint8ClampedArray) => {
    const out = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) out.set(src.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x0 + W) * 4), y * W * 4);
    return out;
  };
  return { ...d, caja: { x: d.caja.x + x0, y: d.caja.y + y0, w: W, h: H }, rgba: corta(d.rgba), base: d.base && corta(d.base), oscurece: d.oscurece && corta(d.oscurece) };
}

const unir = (a: Caja, b: Caja): Caja => {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};
const mover = <D extends { caja: Caja; solido: Caja }>(d: D, x: number, y: number): D => ({ ...d, caja: { ...d.caja, x: d.caja.x + x, y: d.caja.y + y }, solido: { ...d.solido, x: d.solido.x + x, y: d.solido.y + y } });

/** Un RGBA (u8, sin premultiplicar) a escala `s` con su esquina en (cx, cy) de la mesa: sus píxeles nuevos y su caja
 *  entera. `blanco`: lo de afuera es blanco (el mapa de lo que oscurece), si no, transparente. */
function aEscala(src: Uint8ClampedArray, c: Caja, s: number, cx: number, cy: number, blanco = false): { rgba: Uint8ClampedArray; caja: Caja } {
  const x0 = Math.floor(cx), y0 = Math.floor(cy), x1 = Math.max(x0 + 1, Math.ceil(cx + c.w * s)), y1 = Math.max(y0 + 1, Math.ceil(cy + c.h * s));
  const w = x1 - x0, h = y1 - y0, rgba = new Uint8ClampedArray(w * h * 4);
  if (blanco) {
    // Lo que oscurece se remuestrea al revés (0 = nada), así lo de afuera no oscurece.
    const inv = new Uint8ClampedArray(src.length);
    for (let i = 0; i < src.length; i++) inv[i] = i % 4 === 3 ? 255 : 255 - src[i];
    const f = remuestrear(inv, c.w, c.h, s, cx, cy, x0, y0, x1, y1, "fuera", false);
    for (let i = 0; i < w * h * 4; i++) rgba[i] = i % 4 === 3 ? 255 : 255 - f[i];
  } else {
    const f = remuestrear(src, c.w, c.h, s, cx, cy, x0, y0, x1, y1, "fuera", true);
    for (let i = 0; i < w * h * 4; i += 4) {
      const a = f[i + 3];
      rgba[i + 3] = Math.round(a);
      if (a > 0) for (let k = 0; k < 3; k++) rgba[i + k] = Math.round(Math.min(255, (f[i + k] * 255) / a));
    }
  }
  return { rgba, caja: { x: x0, y: y0, w, h } };
}

/** Una parte (sin textos) a escala `s` con su esquina en (cx, cy): sus píxeles, lo que oscurece y su letra, a escala. */
function parteAEscala(d: ParteLista, s: number, cx: number, cy: number, desde: { k: number; x: number; y: number }): ParteLista {
  const { rgba, caja } = aEscala(d.rgba, d.caja, s, cx, cy);
  const solido = solidoDe(rgba, caja);
  return {
    ...d,
    caja,
    solido: solido ? aCaja(solido) : caja,
    rgba,
    oscurece: d.oscurece ? aEscala(d.oscurece, d.caja, s, cx, cy, true).rgba : null,
    base: d.base ? aEscala(d.base, d.caja, s, cx, cy).rgba : null,
    letraMinPx: d.letraMinPx === null ? null : d.letraMinPx * s,
    desde,
  };
}

/** Un dibujo encima de otro (RGBA u8 sin premultiplicar, cada uno en su caja), sobre un lienzo de `caja`. */
function encima(dest: Uint8ClampedArray, caja: Caja, src: Uint8ClampedArray, c: Caja): void {
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      const j = (y * c.w + x) * 4, a = src[j + 3] / 255;
      if (!(a > 0)) continue;
      const i = ((y + c.y - caja.y) * caja.w + (x + c.x - caja.x)) * 4, b = dest[i + 3] / 255, o = a + b * (1 - a);
      for (let k = 0; k < 3; k++) dest[i + k] = Math.round((src[j + k] * a + dest[i + k] * b * (1 - a)) / o);
      dest[i + 3] = Math.round(o * 255);
    }
}

/** La pieza armada con sus partes (de abajo hacia arriba): su caja, sus píxeles, lo que oscurece y su base sin textos. */
function armarPieza(p: PiezaLista, partes: ParteLista[]): PiezaLista {
  const caja = partes.map((d) => d.caja).reduce(unir);
  const nuevo = () => new Uint8ClampedArray(caja.w * caja.h * 4);
  const rgba = nuevo(), base = nuevo();
  let oscurece: Uint8ClampedArray | null = null;
  let conBase = true;
  for (const d of partes) {
    encima(rgba, caja, d.rgba, d.caja);
    const b = d.base ?? (d.textos.length ? null : d.rgba);
    if (b) encima(base, caja, b, d.caja);
    else conBase = false;
    if (!d.oscurece) continue;
    oscurece ??= nuevo().fill(255);
    // «Multiplicar»: lo que oscurece cada parte, una encima de otra.
    for (let y = 0; y < d.caja.h; y++)
      for (let x = 0; x < d.caja.w; x++) {
        const j = (y * d.caja.w + x) * 4, i = ((y + d.caja.y - caja.y) * caja.w + (x + d.caja.x - caja.x)) * 4;
        for (let k = 0; k < 3; k++) oscurece[i + k] = Math.round((oscurece[i + k] * d.oscurece[j + k]) / 255);
      }
  }
  const solido = solidoDe(rgba, caja);
  const letras = partes.map((d) => d.letraMinPx).filter((v): v is number => v !== null);
  return { ...p, caja, solido: solido ? aCaja(solido) : caja, rgba, oscurece, base: conBase ? base : null, letraMinPx: letras.length ? Math.min(...letras) : null, partes };
}

/**
 * El maestro con el legal en `n` renglones (menos que en el PSD, o hasta RENGLONES_MAS más: B29) y lo que la página escribe de su pieza (sus `Listo`).
 * `listo`: el legal tal como la página ya lo escribe (`legalParaRenglones` dijo que se puede). null si no sale (un
 * texto que en `n` renglones sería demasiado largo, o que no se pudo pintar).
 */
export function conRenglones<M extends MaestroListo>(ma: M, legal: LegalRenglones, n: number, listo: Listo, maquetar: Maquetar, pintar: Pintar): { maestro: M; listos: Map<number, Listo[]> } | null {
  if (!Number.isInteger(n) || n < 1 || n === legal.psd || n > legal.psd + RENGLONES_MAS) return null;
  const p = ma.piezas[legal.pieza], tp = listo.tp;
  const plano = textoCambiado(tp.texto, juntar(tp.texto)), tr = tp.texto.transform;
  // Tope del ancho del legal (unidades de su capa): ANCHO_MAX veces la mesa.
  const hecha = plano && cajaPara(plano, n, maquetar, (ANCHO_MAX * ma.w) / Math.hypot(tr[0], tr[1]));
  // Justo `n`: con una palabra larga (una dirección web) quizá sale uno menos, y esa versión ya es otra.
  if (!hecha || hecha.lineas.length !== n) return null;
  const { capa, lineas } = hecha;
  const sinTinta: Listo = { tp: { ...tp, texto: capa }, lineas, dx: listo.dx, dy: listo.dy };
  // Lo que se va a pintar, con un tope (como el de las capas de texto que se leen del PSD): un texto raro no pide un
  // lienzo enorme.
  const r = reservado(sinTinta);
  if (!r || ![r.x0, r.y0, r.x1, r.y1].every(Number.isFinite) || (r.x1 - r.x0) * (r.y1 - r.y0) > TEXTO_CAJA_MAX_PX) return null;
  // La tinta para el PSD editable va donde está la capa en el PSD (sin mover): la capa se mueve con su parte (`desde`).
  const tinta = tintaSola(sinTinta, pintar);
  if (!tinta) return null;
  const nuevo: Listo = { ...sinTinta, tp: { ...sinTinta.tp, cambio: { de: tp.cambio?.de ?? tp.texto.texto, tinta } } };
  const d = legal.parte === null ? p : p.partes?.[legal.parte];
  const escrito0 = d && reescribir(d, [nuevo], pintar, ma.textoGamma ?? 1);
  if (!escrito0 || !(d.solido.h > 0) || !(escrito0.solido.h > 0)) return null;
  const escrito = aSuTinta(escrito0);
  const L0 = d.solido, L1 = escrito.solido;
  // Lo demás del pie (los iconos), a escala con el alto del legal, del mismo lado, con el hueco y el centro a escala.
  const otras = (p.partes ?? []).map((q, i) => ({ q, i })).filter(({ i }) => i !== legal.parte);
  const s = Math.min(1, L1.h / L0.h);
  let franja = L1, grupo: { O: Caja; x: number; y: number } | null = null;
  if (otras.length) {
    const O = otras.map(({ q }) => q.solido).reduce(unir);
    const izquierda = O.x + O.w <= L0.x + AL_LADO;
    const hueco = Math.max(0, izquierda ? L0.x - (O.x + O.w) : O.x - (L0.x + L0.w)) * s;
    const x = izquierda ? L1.x - hueco - O.w * s : L1.x + L1.w + hueco;
    const y = L1.y + L1.h / 2 + (O.y + O.h / 2 - (L0.y + L0.h / 2)) * s - (O.h * s) / 2;
    grupo = { O, x, y };
    franja = unir(L1, { x, y, w: O.w * s, h: O.h * s });
  }
  // El pie con su mismo centro y su mismo borde de abajo (como crece el legal en el acomodo), en píxeles enteros; si
  // cabe a lo ancho en la mesa, sin salirse de ella (un pie pegado a una orilla que se hace más ancho).
  const centrado = Math.round(p.solido.x + p.solido.w / 2 - (franja.x + franja.w / 2));
  const tx = franja.w <= ma.w ? Math.min(Math.max(centrado, Math.ceil(-franja.x)), Math.floor(ma.w - franja.x - franja.w)) : centrado;
  const ty = Math.round(p.solido.y + p.solido.h - (franja.y + franja.h));
  const tpMovido = { ...nuevo.tp, texto: { ...capa, transform: [tr[0], tr[1], tr[2], tr[3], tr[4] + tx, tr[5] + ty] as TextoCapa["transform"] }, caja: { ...tp.caja, x: tp.caja.x + tx, y: tp.caja.y + ty } };
  const listoMovido: Listo = { ...nuevo, tp: tpMovido };
  const legalMovido = { ...mover(escrito, tx, ty), textos: [tpMovido], desde: { k: 1, x: tx, y: ty } };
  let pieza: PiezaLista;
  if (legal.parte === null || !p.partes) pieza = { ...p, ...legalMovido };
  else {
    const partes = p.partes.map((q, i) => {
      if (i === legal.parte) return legalMovido as ParteLista;
      if (!grupo) return q;
      // Todo el grupo a escala desde su esquina: la esquina nueva, en píxeles enteros.
      const gx = Math.round(grupo.x + tx), gy = Math.round(grupo.y + ty), desde = { k: s, x: gx - s * grupo.O.x, y: gy - s * grupo.O.y };
      return parteAEscala(q, s, s * q.caja.x + desde.x, s * q.caja.y + desde.y, desde);
    });
    pieza = { ...armarPieza(p, partes), textos: [tpMovido] };
  }
  return { maestro: { ...ma, piezas: ma.piezas.map((q, i) => (i === legal.pieza ? pieza : q)) }, listos: new Map([[legal.pieza, [listoMovido]]]) };
}
