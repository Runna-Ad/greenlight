/**
 * HÜE Prisma › Formatos — la puerta de IMAGEN PLANA (B28; Pedro, 2026-10-27: "is there a way we can trace the
 * elements and separate them so we are able to move them delete if needed or using didi fonts change texts", y
 * "Option 1: build B28 in the app, plain backgrounds first."). Puro: corre igual en el servidor, en Node y en el
 * navegador.
 *
 * Un anuncio sin PSD: la IA LEE cada elemento (dónde está, qué es y, si es texto, sus letras exactas) y nuestro
 * código hace lo demás: (1) limpiar lo que dice la IA antes de usarlo (es dato de afuera: puede traer cajas fuera de
 * la imagen, roles inventados o textos enormes); (2) medir cada elemento en los píxeles y sacar un fondo limpio
 * (`medirPlano`, sólo fondos lisos o en degradado por ahora); (3) armar el MISMO maestro que da un PSD
 * (`maestroDePlano`): una pieza por rol, cada elemento una parte, cada texto un `TextoPieza` que la página prueba.
 */
import type { Caja, MaestroPsd, PartePsd, PiezaPsd, TextoPieza } from "./psd.ts";
import type { Rol } from "./roles.ts";
import { TEXTO_DIF_MAX_PLANO, type Alineacion, type TextoCapa } from "./textos.ts";

/** Lo que la IA puede decir que es cada elemento (los nombres de la guía del equipo, más OTRO). */
export const ROLES_LECTURA = ["BRAND", "TITULO", "SUBTITULO", "CTA", "HERO", "FOOTER", "OTRO"] as const;
export type RolLeido = (typeof ROLES_LECTURA)[number];
/** texto = letras que se pueden volver a escribir; imagen = foto, producto, logo, ícono; forma = pastilla, barra. */
export const TIPOS_LECTURA = ["texto", "imagen", "forma"] as const;
export type TipoLeido = (typeof TIPOS_LECTURA)[number];

/** Un elemento leído. `caja` en px de la imagen leída: x0, y0 incluidos; x1, y1 excluidos. */
export type ElementoLeido = {
  id: string;
  rol: RolLeido;
  tipo: TipoLeido;
  caja: { x0: number; y0: number; x1: number; y1: number };
  /** Las letras, con "\n" entre renglones; "" si no es texto. */
  texto: string;
  /** El id del elemento sobre el que está (un texto sobre una pastilla), o null. */
  sobre: string | null;
};

/** Un anuncio real trae 10-20; más de esto es una respuesta rota. */
export const ELEMENTOS_MAX = 60;
/** El legal más largo de los anuncios de prueba tiene ~210 letras. */
export const TEXTO_LEIDO_MAX = 1000;
/** Una caja de menos de esto por lado (px) no es un elemento que se pueda mover. */
export const CAJA_MIN_PX = 3;
/** Lado más largo de lo que se le manda a la IA (la pantalla reduce antes de subir): las cajas vuelven de 0 a 1000,
 *  así que más no ayuda. */
export const LADO_LECTURA = 1600;

const esUno = <T extends string>(lista: readonly T[], v: unknown): v is T => typeof v === "string" && (lista as readonly string[]).includes(v);
/** Sin caracteres de control ni de formato invisibles (cambios de dirección, espacios de ancho cero: en la revisión
 *  se ven iguales y en el PSD no lo son; el tabulador cuenta como espacio; el salto de renglón se queda) y sin
 *  espacios de más. También para las letras que corrige la persona. */
export const limpiarLetras = (v: string) =>
  v
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]|\p{Cf}/gu, "")
    .split("\n")
    .map((r) => r.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

/**
 * Lo que la IA devolvió → elementos que se pueden usar, o null si no es una lectura (no es lista, o no quedó nada).
 * `box_2d` viene como [ymin, xmin, ymax, xmax] de 0 a 1000 (la convención de Gemini); sale en px de una imagen de
 * w × h. Lo que no tiene sentido se descarta uno por uno, no toda la lectura: roles o tipos desconocidos, cajas
 * vacías o fuera de la imagen, textos sin letras (pasan a imagen) y "sobre" que no apunta a otro elemento.
 */
export function limpiarLectura(v: unknown, w: number, h: number): ElementoLeido[] | null {
  if (!Array.isArray(v) || !(w > 0) || !(h > 0)) return null;
  const salida: (ElementoLeido & { sobreLabel: string | null })[] = [];
  const vistos = new Set<string>();
  /** "sobre" llega con el label de la IA: aquí se traduce al id. */
  const porLabel = new Map<string, string>();
  for (const e of v.slice(0, ELEMENTOS_MAX)) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    const b = o.box_2d;
    if (!Array.isArray(b) || b.length !== 4 || !b.every((n) => typeof n === "number" && Number.isFinite(n))) continue;
    const [ymin, xmin, ymax, xmax] = (b as number[]).map((n) => Math.min(1000, Math.max(0, n)));
    const caja = { x0: Math.floor((xmin / 1000) * w), y0: Math.floor((ymin / 1000) * h), x1: Math.ceil((xmax / 1000) * w), y1: Math.ceil((ymax / 1000) * h) };
    if (caja.x1 - caja.x0 < CAJA_MIN_PX || caja.y1 - caja.y0 < CAJA_MIN_PX) continue;
    const letras = typeof o.texto === "string" ? limpiarLetras(o.texto).slice(0, TEXTO_LEIDO_MAX) : "";
    let tipo: TipoLeido = esUno(TIPOS_LECTURA, o.tipo) ? o.tipo : "imagen";
    if (tipo === "texto" && !letras) tipo = "imagen";
    const base = (typeof o.label === "string" ? o.label : "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || `elemento_${salida.length + 1}`;
    let id = base;
    for (let n = 2; vistos.has(id); n++) id = `${base}_${n}`;
    vistos.add(id);
    if (typeof o.label === "string" && !porLabel.has(o.label)) porLabel.set(o.label, id);
    salida.push({
      id,
      rol: esUno(ROLES_LECTURA, o.rol) ? o.rol : "OTRO",
      tipo,
      caja,
      texto: tipo === "texto" ? letras : "",
      sobre: null,
      sobreLabel: typeof o.sobre === "string" && o.sobre ? o.sobre : null,
    });
  }
  // "sobre" sólo vale si apunta a OTRO elemento que lo contiene.
  const contiene = (a: ElementoLeido["caja"], b: ElementoLeido["caja"]) => a.x0 <= b.x0 + 2 && a.y0 <= b.y0 + 2 && a.x1 >= b.x1 - 2 && a.y1 >= b.y1 - 2;
  const limpios = salida.map(({ sobreLabel, ...e }) => {
    const id = sobreLabel ? porLabel.get(sobreLabel) : undefined;
    const debajo = id && id !== e.id ? salida.find((x) => x.id === id) : undefined;
    return { ...e, sobre: debajo && contiene(debajo.caja, e.caja) ? debajo.id : null };
  });
  // Dos cajas casi iguales (la tolerancia de 2 px) pueden apuntarse una a la otra: en un círculo, el más grande deja
  // de ir "sobre" (queda de base). Una cadena (texto sobre pastilla sobre tarjeta) sí vale.
  const porId = new Map(limpios.map((e) => [e.id, e]));
  const area = (e: ElementoLeido) => (e.caja.x1 - e.caja.x0) * (e.caja.y1 - e.caja.y0);
  for (const e of limpios) {
    const vistos: ElementoLeido[] = [];
    for (let x: ElementoLeido | undefined = e; x && !vistos.includes(x); x = x.sobre ? porId.get(x.sobre) : undefined) vistos.push(x);
    const ultimo = vistos.at(-1)!, cierra = ultimo.sobre ? porId.get(ultimo.sobre) : undefined;
    if (!cierra) continue;
    const ciclo = vistos.slice(vistos.indexOf(cierra));
    ciclo.reduce((a, b) => (area(b) > area(a) ? b : a)).sobre = null;
  }
  // Un renglón que la IA marca SUBTITULO entre dos del TITULO es parte del titular (DiDi Card, 2a lectura en la
  // preview: «con tus cupones de» entre «3 MSI» y «DiDi Card»). Como pieza aparte su caja queda dentro de la del
  // TITULO, y en una medida alta el acomodo los mueve distinto y se encima a «3 MSI». En la revisión se puede regresar.
  const titulo = limpios.filter((e) => e.rol === "TITULO");
  const medioY = (c: ElementoLeido["caja"]) => (c.y0 + c.y1) / 2;
  const cruzaX = (a: ElementoLeido["caja"], b: ElementoLeido["caja"]) => Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0);
  for (const e of limpios) {
    if (e.rol !== "SUBTITULO") continue;
    const junto = titulo.filter((t) => cruzaX(t.caja, e.caja));
    if (junto.some((t) => medioY(t.caja) < e.caja.y0) && junto.some((t) => medioY(t.caja) > e.caja.y1)) e.rol = "TITULO";
  }
  return limpios.length ? limpios : null;
}

// ── (2) Medir en los píxeles ──────────────────────────────────────────────────────────────────────────────────────

type RGB = [number, number, number];
/** Una imagen RGBA sin premultiplicar. */
export type Imagen = { w: number; h: number; rgba: Uint8ClampedArray };

/** Un elemento leído y medido en la imagen (px de la imagen). */
export type ElementoMedido = Omit<ElementoLeido, "caja"> & {
  /** Todo lo que pinta u oscurece: su orilla suave y su sombra. `alfa` y `oscurece` miden pinta.w × pinta.h. */
  pinta: Caja;
  /** Sólo lo sólido (alfa > 50 %). */
  solido: Caja;
  /** Cuánto cubre cada píxel (0-255). Texto: la tinta desmezclada del fondo; imagen y forma: su silueta. */
  alfa: Uint8ClampedArray;
  /** RGB: cuánto oscurece lo que tiene debajo (255 = nada): su sombra. null si no trae. */
  oscurece: Uint8ClampedArray | null;
  /** El color de lo que tiene alrededor (o de lo que tiene debajo, si va "sobre" otro). */
  debajo: RGB;
  /** Texto: el color de su tinta. */
  color: RGB | null;
  /** Texto: la caja de cada renglón con la orilla al 50 % (como mide la página). */
  renglones: Caja[];
};

/** Diferencia máxima por canal (0-255) con el fondo que todavía cuenta como fondo. */
const FONDO_TOL = 10;
/** Lo que se busca alrededor de una imagen o forma: su sombra suave (la IA la deja fuera de la caja). */
const SOMBRA_PX = 60;
/** Lo que se borra alrededor de la tinta de un texto: las letras de estos anuncios traen un halo suave. */
const HALO_PX = 10;
/** Error típico (niveles de 255) del plano ajustado al anillo que todavía es "fondo liso". Más = foto o textura. */
export const LISO_MAX = 6;

const lum = (c: ArrayLike<number>) => (c[0] + c[1] + c[2]) / 3;

/**
 * El color que MÁS hay (no la mediana de cada canal): alrededor de un texto sobre una pastilla de dos colores (naranja
 * arriba, blanco abajo) la mediana por canal inventaba un rosa que no estaba en ningún lado, y con ese "fondo" la tinta
 * blanca salía pálida y transparente (2026-10-28, el precio de la pastilla de DiDi). Se cuentan colores en cubos de 32
 * niveles y del más lleno sale la mediana de sus píxeles. Sin píxeles, blanco (como `mediana` de nada).
 */
function dominante(r: readonly number[], g: readonly number[], b: readonly number[]): [number, number, number] {
  if (!r.length) return [255, 255, 255];
  const cubos = new Map<number, number[]>();
  for (let i = 0; i < r.length; i++) {
    const k = ((r[i] >> 5) << 6) | ((g[i] >> 5) << 3) | (b[i] >> 5);
    const l = cubos.get(k);
    if (l) l.push(i); else cubos.set(k, [i]);
  }
  let mejor: number[] = [];
  for (const l of cubos.values()) if (l.length > mejor.length) mejor = l;
  const med = (v: readonly number[]) => { const o = mejor.map((i) => v[i]).sort((x, y) => x - y); return o[o.length >> 1]; };
  return [med(r), med(g), med(b)];
}

/**
 * Mide cada elemento leído en la imagen y saca el fondo limpio (RGB). Sólo sirve con fondo liso o en degradado: si
 * el anillo alrededor de lo que se quitó no se parece a un plano, `liso` sale en falso (la pantalla avisa y no
 * sigue: el fondo de foto necesita la IA, que viene después).
 */
export function medirPlano(img: Imagen, leidos: ElementoLeido[], fijos: ReadonlySet<string> = new Set()): { elementos: ElementoMedido[]; fondo: Uint8ClampedArray; liso: boolean; avisos: string[]; fallan: string[] } {
  const { w: W, h: H, rgba: d } = img;
  const at = (x: number, y: number) => (y * W + x) * 4;
  const dif = (i: number, f: RGB) => Math.max(Math.abs(d[i] - f[0]), Math.abs(d[i + 1] - f[1]), Math.abs(d[i + 2] - f[2]));
  const dentro = (c: ElementoLeido["caja"], x: number, y: number, m = 0) => x >= c.x0 - m && x < c.x1 + m && y >= c.y0 - m && y < c.y1 + m;
  const mediana = (v: number[]) => (v.length ? [...v].sort((a, b) => a - b)[v.length >> 1] : 255);
  const avisos: string[] = [];

  /** El color de alrededor: el que más hay (`dominante`) en un anillo fuera de la caja, sin los demás elementos (salvo
   *  el que tiene debajo, que ES su fondo). */
  function alrededor(e: ElementoLeido): RGB {
    const r: number[] = [], g: number[] = [], b: number[] = [];
    const otros = leidos.filter((o) => o.id !== e.id && o.id !== e.sobre);
    // Un texto: el anillo pegado a su caja (1-5 px), que es lo que tiene detrás; más lejos, en una pastilla de dos
    // colores ya entra el otro (2026-10-28). Una figura: 6-14 px, fuera de su sombra.
    const [dentroPx, fueraPx] = e.tipo === "texto" ? [1, 5] : [6, 14];
    for (let y = e.caja.y0 - fueraPx; y < e.caja.y1 + fueraPx; y++) for (let x = e.caja.x0 - fueraPx; x < e.caja.x1 + fueraPx; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H || dentro(e.caja, x, y, dentroPx) || otros.some((o) => dentro(o.caja, x, y))) continue;
      const i = at(x, y);
      r.push(d[i]); g.push(d[i + 1]); b.push(d[i + 2]);
    }
    return dominante(r, g, b);
  }

  const medidos: ElementoMedido[] = [];
  for (const e of leidos) {
    const B = alrededor(e);
    const otros = leidos.filter((o) => o.id !== e.id && o.sobre !== e.id && o.id !== e.sobre);
    let m = e.tipo === "texto" ? medirTexto(e, B) : null;
    if (e.tipo === "texto" && !m) avisos.push(`${e.id}: no se encontró su tinta; va como imagen.`);
    m ??= medirFigura(e, B, otros);
    if (m) medidos.push(m);
    else avisos.push(`${e.id}: no se encontró en la imagen; se deja en el fondo.`);
  }

  /** Texto: el color de su tinta (lo más lejano del fondo) y cuánto de ese color tiene cada píxel. */
  function medirTexto(e: ElementoLeido, B: RGB): ElementoMedido | null {
    const P = 4, x0 = Math.max(0, e.caja.x0 - P), y0 = Math.max(0, e.caja.y0 - P), x1 = Math.min(W, e.caja.x1 + P), y1 = Math.min(H, e.caja.y1 + P);
    let max = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) max = Math.max(max, dif(at(x, y), B));
    if (max < 40) return null;
    const r: number[] = [], g: number[] = [], b: number[] = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = at(x, y); if (dif(i, B) > 0.85 * max) { r.push(d[i]); g.push(d[i + 1]); b.push(d[i + 2]); } }
    const F: RGB = [mediana(r), mediana(g), mediana(b)];
    const v = [F[0] - B[0], F[1] - B[1], F[2] - B[2]], vv = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
    const w = x1 - x0, h = y1 - y0, a = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = at(x0 + x, y0 + y), p = [d[i] - B[0], d[i + 1] - B[1], d[i + 2] - B[2]];
      const t = Math.min(1, Math.max(0, (p[0] * v[0] + p[1] * v[1] + p[2] * v[2]) / vv));
      // Un color que no está en la recta del fondo a la tinta es de otro elemento (otra tinta, otra forma).
      a[y * w + x] = Math.hypot(p[0] - t * v[0], p[1] - t * v[1], p[2] - t * v[2]) > 60 ? 0 : t;
    }
    // Renglones: filas con tinta al 50 %; las bandas de más (acentos, puntos) se juntan con su vecina más cercana y,
    // si faltan (renglones pegados), la más alta se parte en su fila con menos tinta.
    const lineas = e.texto.split("\n").length;
    const cuenta = Array.from({ length: h }, (_, y) => { let s = 0; for (let x = 0; x < w; x++) if (a[y * w + x] > 0.5) s++; return s; });
    const bandas: { y0: number; y1: number }[] = [];
    for (let y = 0; y < h; y++) if (cuenta[y] > 0) { const u = bandas.at(-1); if (u && y - u.y1 <= 1) u.y1 = y; else bandas.push({ y0: y, y1: y }); }
    if (!bandas.length) return null;
    while (bandas.length > lineas) {
      let k = 0;
      for (let i = 1; i < bandas.length - 1; i++) if (bandas[i + 1].y0 - bandas[i].y1 < bandas[k + 1].y0 - bandas[k].y1) k = i;
      bandas.splice(k, 2, { y0: bandas[k].y0, y1: bandas[k + 1].y1 });
    }
    while (bandas.length < lineas) {
      const k = bandas.reduce((mx, q, i) => (q.y1 - q.y0 > bandas[mx].y1 - bandas[mx].y0 ? i : mx), 0), q = bandas[k];
      if (q.y1 - q.y0 < 4) break;
      const desde = q.y0 + Math.round((q.y1 - q.y0) * 0.2), hasta = q.y1 - Math.round((q.y1 - q.y0) * 0.2);
      let corte = desde;
      for (let y = desde; y <= hasta; y++) if (cuenta[y] < cuenta[corte]) corte = y;
      bandas.splice(k, 1, { y0: q.y0, y1: corte - 1 }, { y0: corte + 1, y1: q.y1 });
    }
    const renglones = bandas.map((q) => {
      let bx0 = w, bx1 = -1;
      for (let y = q.y0; y <= q.y1; y++) for (let x = 0; x < w; x++) if (a[y * w + x] > 0.5) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); }
      return { x: x0 + bx0, y: y0 + q.y0, w: bx1 - bx0 + 1, h: q.y1 - q.y0 + 1 };
    });
    const pinta = cajaDe(a, w, h, 0.03, x0, y0), solido = cajaDe(a, w, h, 0.5, x0, y0);
    if (!pinta || !solido) return null;
    const alfa = new Uint8ClampedArray(pinta.w * pinta.h);
    for (let y = 0; y < pinta.h; y++) for (let x = 0; x < pinta.w; x++) alfa[y * pinta.w + x] = Math.round(a[(pinta.y - y0 + y) * w + (pinta.x - x0 + x)] * 255);
    const { caja: _c, ...resto } = e;
    void _c;
    return { ...resto, pinta, solido, alfa, oscurece: null, debajo: B, color: F, renglones };
  }

  /** Imagen o forma: su silueta es lo que el fondo de alrededor NO alcanza (relleno desde la orilla de una zona un
   *  poco más grande que su caja, sin entrar a otros elementos); su orilla, suave; y lo que oscurece cerca, sombra. */
  function medirFigura(e: ElementoLeido, B: RGB, otros: ElementoLeido[]): ElementoMedido | null {
    const G = SOMBRA_PX, x0 = Math.max(0, e.caja.x0 - G), y0 = Math.max(0, e.caja.y0 - G), x1 = Math.min(W, e.caja.x1 + G), y1 = Math.min(H, e.caja.y1 + G);
    const w = x1 - x0, h = y1 - y0;
    const ajeno = new Uint8Array(w * h), fondo = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (otros.some((o) => dentro(o.caja, x0 + x, y0 + y))) ajeno[y * w + x] = 1;
    const cola: number[] = [];
    const sembrar = (x: number, y: number) => { const k = y * w + x; if (!fondo[k] && !ajeno[k] && dif(at(x0 + x, y0 + y), B) <= FONDO_TOL) { fondo[k] = 1; cola.push(k); } };
    for (let x = 0; x < w; x++) { sembrar(x, 0); sembrar(x, h - 1); }
    for (let y = 0; y < h; y++) { sembrar(0, y); sembrar(w - 1, y); }
    // Lo que queda fuera de su caja de la IA y no toca la orilla (un hueco del fondo encerrado) también es fondo.
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!dentro(e.caja, x0 + x, y0 + y, 2)) sembrar(x, y);
    while (cola.length) {
      const k = cola.pop()!, x = k % w, y = (k / w) | 0;
      if (x > 0) sembrar(x - 1, y); if (x < w - 1) sembrar(x + 1, y); if (y > 0) sembrar(x, y - 1); if (y < h - 1) sembrar(x, y + 1);
    }
    // La figura: lo que no es fondo DENTRO de su caja (+2 px), y afuera sólo lo que se aleja claramente del fondo y
    // está pegado a eso (un reflejo tenue de otro objeto que llega hasta aquí no es suyo).
    const mio = new Uint8Array(w * h);
    const enCaja = (x: number, y: number) => dentro(e.caja, x0 + x, y0 + y, 2);
    const fuerte = (x: number, y: number) => dif(at(x0 + x, y0 + y), B) > 24;
    const pila: number[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = y * w + x; if (!fondo[k] && !ajeno[k] && enCaja(x, y)) { mio[k] = 1; pila.push(k); } }
    while (pila.length) {
      const k = pila.pop()!, x = k % w, y = (k / w) | 0;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (!mio[n] && !fondo[n] && !ajeno[n] && (enCaja(nx, ny) || fuerte(nx, ny))) { mio[n] = 1; pila.push(n); }
      }
    }
    /** Distancia de un punto a una caja leída (0 adentro). */
    const lejos = (c: ElementoLeido["caja"], X: number, Y: number) => Math.hypot(Math.max(c.x0 - X, 0, X - c.x1 + 1), Math.max(c.y0 - Y, 0, Y - c.y1 + 1));
    const a = new Float32Array(w * h), som = new Float32Array(w * h).fill(1);
    let haySombra = false;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y * w + x, i = at(x0 + x, y0 + y);
      if (ajeno[k]) continue;
      if (mio[k]) {
        // Orilla: un píxel de la figura con algo que no es ella al lado se mezcla con eso (su alfa, por cuánto se
        // aleja del fondo).
        const orilla = (x > 0 && !mio[k - 1]) || (x < w - 1 && !mio[k + 1]) || (y > 0 && !mio[k - w]) || (y < h - 1 && !mio[k + w]);
        a[k] = orilla ? Math.min(1, dif(i, B) / 40) : 1;
      } else {
        // Sombra: lo que oscurece el fondo cerca, si este elemento es el más cercano.
        const r = lum([d[i], d[i + 1], d[i + 2]]) / Math.max(1, lum(B)), X = x0 + x, Y = y0 + y;
        if (r < 0.985 && leidos.every((o) => o.id === e.id || lejos(o.caja, X, Y) > lejos(e.caja, X, Y))) { som[k] = r; haySombra = true; }
      }
    }
    const solido = cajaDe(a, w, h, 0.5, x0, y0);
    if (!solido) return null;
    // La sombra sólo cuenta si está pegada a la figura (a ≤ SOMBRA_PX de su parte sólida): lo demás es del fondo.
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const X = x0 + x, Y = y0 + y;
      if (som[y * w + x] < 1 && (X < solido.x - G || X >= solido.x + solido.w + G || Y < solido.y - G || Y >= solido.y + solido.h + G)) som[y * w + x] = 1;
    }
    const todo = new Float32Array(w * h);
    for (let k = 0; k < w * h; k++) todo[k] = Math.max(a[k], som[k] < 1 ? 1 : 0);
    const pinta = cajaDe(todo, w, h, 0.01, x0, y0)!;
    const alfa = new Uint8ClampedArray(pinta.w * pinta.h);
    const oscurece = haySombra ? new Uint8ClampedArray(pinta.w * pinta.h * 3).fill(255) : null;
    for (let y = 0; y < pinta.h; y++) for (let x = 0; x < pinta.w; x++) {
      const k = (pinta.y - y0 + y) * w + (pinta.x - x0 + x), j = y * pinta.w + x;
      alfa[j] = Math.round(a[k] * 255);
      if (oscurece && som[k] < 1) oscurece.fill(Math.round(som[k] * 255), j * 3, j * 3 + 3);
    }
    const { caja: _c, ...resto } = e;
    void _c;
    return { ...resto, tipo: e.tipo === "texto" ? "imagen" : e.tipo, texto: e.tipo === "texto" ? "" : e.texto, pinta, solido, alfa, oscurece, debajo: B, color: null, renglones: [] };
  }

  // ── El fondo limpio: lo que pinta cada elemento (un texto, con su halo) se rellena con un plano inclinado ajustado
  // al anillo de fondo de alrededor, más su grano. Copiar la orilla arrastraba los halos de las letras vecinas
  // ("fantasmas"); una cuadrática hacía "tazones" en los huecos grandes (laboratorio B28).
  const quitar = new Uint8Array(W * H);
  // Los fijos se miden igual (ocupan su lugar: si no, sus píxeles parecerían la sombra de un vecino) pero no se sacan.
  for (const m of medidos) {
    if (fijos.has(m.id)) continue;
    const halo = m.tipo === "texto" ? HALO_PX : 3;
    for (let y = 0; y < m.pinta.h; y++) for (let x = 0; x < m.pinta.w; x++) {
      const j = y * m.pinta.w + x;
      if (m.alfa[j] === 0 && !(m.oscurece && m.oscurece[j * 3] < 255)) continue;
      const X = m.pinta.x + x, Y = m.pinta.y + y;
      for (let yy = Math.max(0, Y - halo); yy <= Math.min(H - 1, Y + halo); yy++) quitar.fill(1, yy * W + Math.max(0, X - halo), yy * W + Math.min(W - 1, X + halo) + 1);
    }
  }
  const fondo = new Uint8ClampedArray(W * H * 3);
  for (let k = 0, i = 0; k < W * H; k++, i += 4) { fondo[k * 3] = d[i]; fondo[k * 3 + 1] = d[i + 1]; fondo[k * 3 + 2] = d[i + 2]; }
  const visto = new Uint8Array(W * H);
  /** Los huecos donde el fondo no es liso: los elementos que caen ahí no se pueden sacar (`medirPlanoFijo`). */
  const malo = new Uint8Array(W * H);
  let liso = true;
  for (let s = 0; s < W * H; s++) {
    if (!quitar[s] || visto[s]) continue;
    // Un hueco (lo que se quita, conectado): sus píxeles y su caja.
    const pix: number[] = [], cola = [s];
    visto[s] = 1;
    let cx0 = W, cy0 = H, cx1 = 0, cy1 = 0;
    while (cola.length) {
      const k = cola.pop()!, x = k % W, y = (k / W) | 0;
      pix.push(k);
      cx0 = Math.min(cx0, x); cx1 = Math.max(cx1, x); cy0 = Math.min(cy0, y); cy1 = Math.max(cy1, y);
      for (const n of [x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, y > 0 ? k - W : -1, y < H - 1 ? k + W : -1]) if (n >= 0 && quitar[n] && !visto[n]) { visto[n] = 1; cola.push(n); }
    }
    const ajuste = planoDelAnillo(fondo, W, H, quitar, { x0: cx0, y0: cy0, x1: cx1, y1: cy1 });
    if (!ajuste || ajuste.error > LISO_MAX) {
      liso = false;
      for (const k of pix) malo[k] = 1;
      if (!ajuste) continue;
    }
    let semilla = (cx0 * 7919 + cy0 * 104729) >>> 0;
    const azar = () => { semilla = (semilla * 1664525 + 1013904223) >>> 0; return semilla / 4294967296 - 0.5; };
    const grano = Math.min(3, ajuste.error);
    for (const k of pix) {
      const x = k % W, y = (k / W) | 0, g = grano * (azar() + azar() + azar()) * 2;
      for (let c = 0; c < 3; c++) fondo[k * 3 + c] = ajuste.valor(x, y, c) + g;
    }
  }
  if (!liso) avisos.push("El fondo no es liso (foto o textura): todavía no se puede limpiar sin IA.");
  const fallan = liso ? [] : medidos.filter((m) => !fijos.has(m.id)).filter((m) => {
    for (let y = 0; y < m.pinta.h; y++) for (let x = 0; x < m.pinta.w; x++)
      if ((m.alfa[y * m.pinta.w + x] > 0 || (m.oscurece && m.oscurece[(y * m.pinta.w + x) * 3] < 255)) && malo[(m.pinta.y + y) * W + m.pinta.x + x]) return true;
    return false;
  }).map((m) => m.id);
  return { elementos: fijos.size ? medidos.filter((m) => !fijos.has(m.id)) : medidos, fondo, liso, avisos, fallan };
}

/** Lo más que se vuelve a medir quitando elementos: cada vuelta saca al menos uno. */
const VUELTAS_FIJO = 8;

/**
 * Como `medirPlano`, pero no rechaza la imagen si el fondo no es liso (Pedro, 2026-10-28: "even if it cant edit or move
 * the background shouldnt outwrite refuse the asset it should just say the bg is not editable"): los elementos de los
 * huecos que no se pueden rellenar se quedan pintados en el fondo (`fijos`, no se mueven ni se editan) y se vuelve a
 * medir con los demás (los fijos se siguen midiendo: ocupan su lugar). Con todo fijo, la imagen va entera de fondo.
 */
export function medirPlanoFijo(img: Imagen, leidos: ElementoLeido[]): ReturnType<typeof medirPlano> & { fijos: string[] } {
  const fijos = new Set<string>();
  for (let vuelta = 0; ; vuelta++) {
    const m = medirPlano(img, leidos, fijos);
    const nuevos = m.fallan.filter((id) => !fijos.has(id));
    if (m.liso || !nuevos.length || vuelta >= VUELTAS_FIJO) {
      // Sin liso al final (no debería: sin elementos no hay huecos), lo que falla también se queda fijo.
      if (!m.liso) for (const id of m.fallan) fijos.add(id);
      // Un texto sobre un elemento fijo ya no va en su pieza (ese se queda en el fondo): va suelto.
      const elementos = m.elementos.filter((e) => !fijos.has(e.id)).map((e) => (e.sobre && fijos.has(e.sobre) ? { ...e, sobre: null } : e));
      const avisos = m.avisos.filter((a) => !a.startsWith("El fondo no es liso"));
      return { ...m, elementos, liso: true, avisos, fallan: [], fijos: [...fijos] };
    }
    for (const id of nuevos) fijos.add(id);
  }
}

/** La caja de lo que pasa del umbral en un búfer w × h que empieza en (ox, oy); null si no hay nada. */
function cajaDe(a: ArrayLike<number>, w: number, h: number, umbral: number, ox: number, oy: number): Caja | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (a[y * w + x] > umbral) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x: ox + x0, y: oy + y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Un plano inclinado (bilineal) por canal ajustado al anillo de 16 px alrededor de la caja, sin lo que se quita (y,
 *  con `sirve`, sólo con esos píxeles); y su error típico (niveles), que dice si el fondo de ahí es liso. null si no
 *  hay anillo con qué ajustar. */
function planoDelAnillo(rgb: Uint8ClampedArray, W: number, H: number, quitar: Uint8Array, c: { x0: number; y0: number; x1: number; y1: number }, sirve?: (k: number) => boolean):
  { valor: (x: number, y: number, canal: number) => number; error: number } | null {
  const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2, s = 100, N = 4;
  const fila = (x: number, y: number) => { const u = (x - cx) / s, v = (y - cy) / s; return [1, u, v, u * v]; };
  const M = Array.from({ length: N }, () => new Float64Array(N)), R = [0, 1, 2].map(() => new Float64Array(N));
  const muestras: number[] = [];
  const paso = Math.max(1, Math.round(Math.sqrt(((c.x1 - c.x0 + 33) * (c.y1 - c.y0 + 33)) / 40_000)));
  for (let y = Math.max(0, c.y0 - 16); y <= Math.min(H - 1, c.y1 + 16); y += paso) for (let x = Math.max(0, c.x0 - 16); x <= Math.min(W - 1, c.x1 + 16); x += paso) {
    const k = y * W + x;
    if (quitar[k] || (sirve && !sirve(k))) continue;
    const f = fila(x, y);
    muestras.push(k);
    for (let a = 0; a < N; a++) { for (let b = 0; b < N; b++) M[a][b] += f[a] * f[b]; for (let q = 0; q < 3; q++) R[q][a] += f[a] * rgb[k * 3 + q]; }
  }
  if (muestras.length < 30) return null;
  const coef = R.map((r) => {
    const A = M.map((fl, a) => [...fl, r[a]]);
    for (let p = 0; p < N; p++) {
      let m = p;
      for (let q = p + 1; q < N; q++) if (Math.abs(A[q][p]) > Math.abs(A[m][p])) m = q;
      [A[p], A[m]] = [A[m], A[p]];
      if (Math.abs(A[p][p]) < 1e-9) return null;
      for (let q = 0; q < N; q++) if (q !== p) { const f = A[q][p] / A[p][p]; for (let z = p; z <= N; z++) A[q][z] -= f * A[p][z]; }
    }
    return A.map((fl, p) => fl[N] / fl[p]);
  });
  if (coef.some((k) => !k)) return null;
  const valor = (x: number, y: number, q: number) => fila(x, y).reduce((t, v, a) => t + v * coef[q]![a], 0);
  let sq = 0;
  for (const k of muestras) { const x = k % W, y = (k / W) | 0; const e = (rgb[k * 3] + rgb[k * 3 + 1] + rgb[k * 3 + 2] - valor(x, y, 0) - valor(x, y, 1) - valor(x, y, 2)) / 3; sq += e * e; }
  return { valor, error: Math.sqrt(sq / muestras.length) };
}

// ── (3) El maestro: lo mismo que da un PSD ───────────────────────────────────────────────────────────────────────

/** El orden de las piezas, de abajo hacia arriba (en un plano nada dice cuál va encima: lo grande abajo). */
const ORDEN_ROLES: (Rol | null)[] = ["HERO", "BRAND", "TITULO", "SUBTITULO", "CTA", "FOOTER", null];

type Dibujo = { caja: Caja; rgba: Uint8ClampedArray; oscurece: Uint8ClampedArray | null };

/** Pinta `de` sobre `en` (RGBA sin premultiplicar, "encima"); `en` mide `caja`. */
function encima(en: Uint8ClampedArray, caja: Caja, de: Dibujo) {
  for (let y = 0; y < de.caja.h; y++) for (let x = 0; x < de.caja.w; x++) {
    const j = (y * de.caja.w + x) * 4, sa = de.rgba[j + 3] / 255;
    if (!sa) continue;
    const i = ((de.caja.y - caja.y + y) * caja.w + (de.caja.x - caja.x + x)) * 4, da = en[i + 3] / 255, oa = sa + da * (1 - sa);
    for (let c = 0; c < 3; c++) en[i + c] = (de.rgba[j + c] * sa + en[i + c] * da * (1 - sa)) / oa;
    en[i + 3] = oa * 255;
  }
}
const union = (cs: Caja[]): Caja => {
  const x0 = Math.min(...cs.map((c) => c.x)), y0 = Math.min(...cs.map((c) => c.y));
  return { x: x0, y: y0, w: Math.max(...cs.map((c) => c.x + c.w)) - x0, h: Math.max(...cs.map((c) => c.y + c.h)) - y0 };
};
/** Junta dibujos en su caja común: color encima, y las sombras se multiplican. */
function juntar(ds: Dibujo[]): Dibujo {
  const caja = union(ds.map((d) => d.caja)), rgba = new Uint8ClampedArray(caja.w * caja.h * 4);
  const conSombra = ds.some((d) => d.oscurece);
  const oscurece = conSombra ? new Uint8ClampedArray(caja.w * caja.h * 3).fill(255) : null;
  for (const d of ds) {
    encima(rgba, caja, d);
    if (oscurece && d.oscurece) for (let y = 0; y < d.caja.h; y++) for (let x = 0; x < d.caja.w; x++) {
      const j = (y * d.caja.w + x) * 3, i = ((d.caja.y - caja.y + y) * caja.w + (d.caja.x - caja.x + x)) * 3;
      for (let c = 0; c < 3; c++) oscurece[i + c] = (oscurece[i + c] * d.oscurece[j + c]) / 255;
    }
  }
  return { caja, rgba, oscurece };
}

/**
 * Arma el maestro de una imagen plana con lo medido: el fondo limpio, UNA pieza por rol (como las carpetas de la
 * guía: el acomodo busca la pieza por su rol) y cada elemento una PARTE de ella, con lo que va "sobre" él adentro
 * (la pastilla con su precio). Cada texto con un `TextoCapa` en `textos` (los que se ajustaron a una tipografía) va
 * como `TextoPieza`, con su tinta original para que la página lo pruebe; los demás van como píxeles en la `base`.
 */
export function maestroDePlano(nombre: string, img: Imagen, medidos: ElementoMedido[], fondo: Uint8ClampedArray, textos: ReadonlyMap<string, TextoCapa>, avisos: string[]):
  Omit<MaestroPsd, "origen"> {
  const { w: W, h: H, rgba: d } = img;
  const porId = new Map(medidos.map((m) => [m.id, m]));
  /** Lo que se ve de un elemento: un texto con su color; una figura con su color desmezclado del fondo en la orilla. */
  const dibujo = (m: ElementoMedido): Dibujo => {
    const { pinta } = m, rgba = new Uint8ClampedArray(pinta.w * pinta.h * 4);
    for (let y = 0; y < pinta.h; y++) for (let x = 0; x < pinta.w; x++) {
      const j = y * pinta.w + x, a = m.alfa[j];
      if (!a) continue;
      const i = ((pinta.y + y) * W + pinta.x + x) * 4, t = a / 255;
      for (let c = 0; c < 3; c++) rgba[j * 4 + c] = m.color ? m.color[c] : t >= 0.999 ? d[i + c] : (d[i + c] - (1 - t) * m.debajo[c]) / Math.max(0.1, t);
      rgba[j * 4 + 3] = a;
    }
    return { caja: pinta, rgba, oscurece: m.oscurece };
  };
  /** Una figura sin los textos que lleva encima: donde estaban, su propio color (un plano ajustado a ella alrededor de
   *  CADA texto: uno para todos cruzaba una pastilla de dos colores y dejaba una mancha rosa, 2026-10-28). */
  const sinLetras = (m: ElementoMedido, hijos: ElementoMedido[]): Dibujo => {
    const base = dibujo(m);
    if (!hijos.length) return base;
    const quitar = new Uint8Array(W * H);
    const marcar = (t: ElementoMedido, v: Uint8Array) => {
      for (let y = 0; y < t.pinta.h; y++) for (let x = 0; x < t.pinta.w; x++) {
        if (!t.alfa[y * t.pinta.w + x]) continue;
        const X = t.pinta.x + x, Y = t.pinta.y + y;
        for (let yy = Math.max(0, Y - 2); yy <= Math.min(H - 1, Y + 2); yy++) v.fill(1, yy * W + Math.max(0, X - 2), yy * W + Math.min(W - 1, X + 2) + 1);
      }
    };
    // Lo de TODOS los textos queda fuera del anillo de cada uno (las letras del vecino no son su fondo).
    for (const t of hijos) marcar(t, quitar);
    const rgb = new Uint8ClampedArray(W * H * 3);
    for (let k = 0; k < W * H; k++) for (let c = 0; c < 3; c++) rgb[k * 3 + c] = d[k * 4 + c];
    const lleno = (k: number) => { const x = k % W, y = (k / W) | 0; return x >= m.pinta.x && x < m.pinta.x + m.pinta.w && y >= m.pinta.y && y < m.pinta.y + m.pinta.h && m.alfa[(y - m.pinta.y) * m.pinta.w + (x - m.pinta.x)] === 255; };
    for (const t of hijos) {
      const suyo = new Uint8Array(W * H);
      marcar(t, suyo);
      const c = t.pinta;
      // Del anillo, sólo lo del color de SU fondo: el otro color de la pastilla no entra al plano.
      const B = t.debajo, parecido = (k: number) => lleno(k) && Math.max(Math.abs(rgb[k * 3] - B[0]), Math.abs(rgb[k * 3 + 1] - B[1]), Math.abs(rgb[k * 3 + 2] - B[2])) <= 48;
      const ajuste = planoDelAnillo(rgb, W, H, quitar, { x0: c.x - 2, y0: c.y - 2, x1: c.x + c.w + 1, y1: c.y + c.h + 1 }, parecido);
      for (let y = 0; y < m.pinta.h; y++) for (let x = 0; x < m.pinta.w; x++) {
        const X = m.pinta.x + x, Y = m.pinta.y + y, j = (y * m.pinta.w + x) * 4;
        if (!suyo[Y * W + X] || !base.rgba[j + 3]) continue;
        for (let q = 0; q < 3; q++) base.rgba[j + q] = ajuste ? ajuste.valor(X, Y, q) : t.debajo[q];
      }
    }
    return base;
  };
  const tpDe = (m: ElementoMedido): TextoPieza => ({ capa: m.id, texto: textos.get(m.id)!, opacidad: 1, caja: m.pinta, alfa: m.alfa, motivo: null, ruta: [], difMax: TEXTO_DIF_MAX_PLANO });
  const tamMin = (ts: TextoPieza[]) => (ts.length ? Math.min(...ts.map((t) => t.texto.tramos[0].tam)) : null);

  // Las partes: cada elemento que no va sobre otro, con todo lo que va sobre él (también una cadena: texto sobre
  // pastilla sobre tarjeta), de abajo hacia arriba. `limpiarLectura` ya rompió los círculos; si aun así hay uno, cada
  // elemento del círculo es su propia parte (nada se pierde).
  const raizDe = (m: ElementoMedido) => {
    const vistos = new Set<ElementoMedido>();
    let x = m;
    while (x.sobre && porId.has(x.sobre)) {
      vistos.add(x);
      x = porId.get(x.sobre)!;
      if (vistos.has(x)) return m;
    }
    return x;
  };
  const raices = medidos.filter((m) => raizDe(m) === m);
  const partePorRol = new Map<Rol | null, PartePsd[]>();
  for (const r of raices) {
    const todos = [r];
    for (let i = 0; i < todos.length; i++) todos.push(...medidos.filter((m) => m.sobre === todos[i].id && raizDe(m) === r && !todos.includes(m)));
    const escritos = todos.filter((m) => m.tipo === "texto" && textos.has(m.id));
    const ts = escritos.map(tpDe);
    // Lo que se ve: cada figura SIN las letras que lleva encima (su color donde estaban) y cada texto encima con su
    // color; la figura tal cual ya trae sus letras, y pintarlas otra vez encima duplicaba la orilla.
    const pintado = (m: ElementoMedido) => {
      const letras = m.tipo === "texto" ? [] : todos.filter((h) => h.sobre === m.id && h.tipo === "texto");
      return letras.length ? sinLetras(m, letras) : dibujo(m);
    };
    const vista = juntar(todos.map(pintado));
    // La base: lo mismo sin las letras que se escriben (las demás van tal cual).
    const vacio = { caja: vista.caja, rgba: new Uint8ClampedArray(vista.caja.w * vista.caja.h * 4), oscurece: null };
    const base = juntar([...todos.filter((m) => !escritos.includes(m)).map(pintado), vacio]);
    const rol: Rol | null = r.rol === "OTRO" ? null : r.rol;
    const lista = partePorRol.get(rol) ?? [];
    lista.push({ nombre: r.id, hijo: null, rellenoPct: 0, tapadaPor: [], caja: vista.caja, solido: union(todos.map((m) => m.solido)), rgba: vista.rgba, oscurece: vista.oscurece, letraMinPx: tamMin(ts), textos: ts, base: base.rgba });
    partePorRol.set(rol, lista);
  }
  const piezas: PiezaPsd[] = [];
  for (const rol of ORDEN_ROLES) {
    const partes = (partePorRol.get(rol) ?? []).sort((a, b) => b.solido.w * b.solido.h - a.solido.w * a.solido.h).map((p, i) => ({ ...p, hijo: i }));
    if (!partes.length) continue;
    const vista = juntar(partes);
    const base = juntar(partes.map((p) => ({ caja: p.caja, rgba: p.base!, oscurece: null })).concat({ caja: vista.caja, rgba: new Uint8ClampedArray(vista.caja.w * vista.caja.h * 4), oscurece: null }));
    const ts = partes.flatMap((p) => p.textos);
    piezas.push({
      nombre: rol ?? "OTRO", rol, caja: vista.caja, solido: union(partes.map((p) => p.solido)), rgba: vista.rgba, oscurece: vista.oscurece, tapadaPct: 0,
      letraMinPx: tamMin(ts), textos: ts, base: base.rgba, ...(partes.length > 1 ? { partes } : {}),
    });
  }
  return { nombre, w: W, h: H, fondo, piezas, fondoDistintoPct: 0, rearmadoDistintoPct: 0, textoGamma: 1, avisos };
}

// ── El texto contra una tipografía (la página mide con su canvas; aquí sólo la cuenta) ─────────────────────────────

/** Lo que la página mide de un texto con una tipografía, tamaño y track (milésimas de eme): su avance (lo que usa
 *  `maquetar`) y su tinta respecto al origen: `izq` a la izquierda, `der` a la derecha, `sube` y `baja` de la base. */
export type MedidaTinta = { avance: number; izq: number; der: number; sube: number; baja: number };
export type MedirTinta = (texto: string, fuente: string, tam: number, track: number) => MedidaTinta;

/** El track más estrecho y el más ancho que se aceptan: más allá, esa tipografía no es la del texto. */
const TRACK_MIN = -200, TRACK_MAX = 400;

/**
 * Cómo está alineado un texto: con varios renglones, por la orilla (o el centro) que comparten; con uno, centrado si
 * su centro cae en el de la mesa o en el de algo que tiene arriba o abajo (el precio y la pastilla), si no a la
 * izquierda. Sólo importa al cambiarle las letras: crece desde ahí.
 */
export function alineacionDe(m: ElementoMedido, W: number, otros: readonly ElementoMedido[]): Alineacion {
  const R = m.renglones;
  if (!R.length) return "left";
  const centro = (c: Caja) => c.x + c.w / 2;
  if (R.length > 1) {
    const rango = (v: number[]) => Math.max(...v) - Math.min(...v);
    const izq = rango(R.map((c) => c.x)), cen = rango(R.map(centro)), der = rango(R.map((c) => c.x + c.w));
    return cen < izq && cen < der ? "center" : der < izq ? "right" : "left";
  }
  const cx = centro(R[0]);
  if (Math.abs(cx - W / 2) <= Math.max(3, W * 0.01)) return "center";
  const cerca = otros.filter((o) => o.id !== m.id && o.solido.x <= cx && o.solido.x + o.solido.w >= cx && Math.abs(o.solido.y + o.solido.h / 2 - (m.solido.y + m.solido.h / 2)) < 3 * m.solido.h + o.solido.h / 2);
  return cerca.some((o) => Math.abs(centro(o.solido) - cx) <= Math.max(4, o.solido.w * 0.02)) ? "center" : "left";
}

/**
 * El `TextoCapa` de un texto medido escrito con `fuente`: el tamaño sale del alto de su renglón más ancho (la orilla
 * al 50 %, como su tinta), el track de su ancho, cada base de dónde empieza su tinta, y el origen de la alineación.
 * null si no se puede (sin renglones, o la tipografía pide un track fuera de lo razonable: no es ésa). La página lo
 * prueba después contra la tinta, igual que un texto de un PSD.
 */
export function capaDeTexto(m: ElementoMedido, fuente: string, alineacion: Alineacion, medir: MedirTinta): TextoCapa | null {
  const lineas = m.texto.split("\n"), R = m.renglones;
  if (!m.color || !lineas.length || R.length !== lineas.length) return null;
  const k = R.reduce((mx, c, i) => (c.w > R[mx].w ? i : mx), 0);
  const ref = medir(lineas[k], fuente, 100, 0);
  const altoRef = ref.sube + ref.baja;
  if (!(altoRef > 0)) return null;
  const tam = (100 * R[k].h) / altoRef;
  const n = [...lineas[k]].length;
  const sin = medir(lineas[k], fuente, tam, 0);
  const track = n > 1 ? ((R[k].w - (sin.izq + sin.der)) * 1000) / ((n - 1) * tam) : 0;
  if (!Number.isFinite(track) || track < TRACK_MIN || track > TRACK_MAX) return null;
  const medidas = lineas.map((l) => medir(l, fuente, tam, track));
  const bases = R.map((c, i) => c.y + medidas[i].sube);
  const t0 = medidas[0], pluma = R[0].x + t0.izq;
  const tx = alineacion === "center" ? pluma + t0.avance / 2 : alineacion === "right" ? pluma + t0.avance : pluma;
  return {
    texto: m.texto,
    tramos: [{ n: m.texto.length, fuente, tam, color: m.color, track, interlineado: lineas.length > 1 ? (bases.at(-1)! - bases[0]) / (lineas.length - 1) : null, subir: 0, mayusculas: false }],
    alineacion,
    transform: [1, 0, 0, 1, tx, bases[0]],
    caja: null,
    motivo: null,
  };
}
