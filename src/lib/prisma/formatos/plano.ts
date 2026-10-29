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
import { rellenarSuave, type Caja, type MaestroPsd, type PartePsd, type PiezaPsd, type TextoPieza } from "./psd.ts";
import type { Rol } from "./roles.ts";
import { TEXTO_DIF_MAX_PLANO, type Alineacion, type TextoCapa } from "./textos.ts";
import type { PegadoAlFondo } from "./acomodo.ts";

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
  /** La caja que leyó la IA (px de la imagen). */
  leida?: Caja;
  /** Texto: letras de OTRO color dentro de su caja («Te da» oscuro junto a «hasta» naranja): no son su tinta, pero se
   *  borran con ella del fondo (si no, se quedaban pintadas junto al texto reescrito). Máscara de `caja`. */
  otraTinta?: { caja: Caja; m: Uint8Array } | null;
};

/** Diferencia máxima por canal (0-255) con el fondo que todavía cuenta como fondo. */
const FONDO_TOL = 10;
/** Lo que se busca alrededor de una imagen o forma: su sombra suave (la IA la deja fuera de la caja). */
const SOMBRA_PX = 60;
/** Lo más que una imagen o forma crece fuera de la caja de la IA (su orilla suave, lo que la caja cortó). */
const FIGURA_FUERA_PX = 8;
/** El borde de fondo real alrededor de un hueco con que se empareja su relleno (px). */
const ORILLA_PX = 3;
/** Lo que se toma por sombra de una figura: más oscuro que el fondo esperado en ese punto por debajo de esta razón. */
const SOMBRA_MIN = 0.985;
/** Lo que se borra alrededor de la tinta de un texto: las letras de estos anuncios traen un halo suave. */
const HALO_PX = 10;
/** Error típico (niveles de 255) del plano ajustado al anillo que todavía es "fondo liso". Más = foto o textura. */
export const LISO_MAX = 6;

const lum = (c: ArrayLike<number>) => (c[0] + c[1] + c[2]) / 3;
const mediana = (v: number[]) => { const o = [...v].sort((a, b) => a - b); return o[o.length >> 1]; };

/**
 * El color que MÁS hay (no la mediana de cada canal): alrededor de un texto sobre una pastilla de dos colores (naranja
 * arriba, blanco abajo) la mediana por canal inventaba un rosa que no estaba en ningún lado, y con ese "fondo" la tinta
 * blanca salía pálida y transparente (2026-10-28, el precio de la pastilla de DiDi). Se cuentan colores en cubos de 16
 * niveles (con 32, un beige claro y el blanco caían juntos) y del más lleno sale la mediana de sus píxeles. Sin
 * píxeles, blanco (como `mediana` de nada).
 */
function dominante(r: readonly number[], g: readonly number[], b: readonly number[]): [number, number, number] {
  if (!r.length) return [255, 255, 255];
  const cubos = new Map<number, number[]>();
  for (let i = 0; i < r.length; i++) {
    const k = ((r[i] >> 4) << 8) | ((g[i] >> 4) << 4) | (b[i] >> 4);
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
export function medirPlano(img: Imagen, leidos: ElementoLeido[], fijos: ReadonlySet<string> = new Set()): { elementos: ElementoMedido[]; fondo: Uint8ClampedArray; liso: boolean; avisos: string[]; fallan: string[]; todos: ElementoMedido[] } {
  const { w: W, h: H, rgba: d } = img;
  const at = (x: number, y: number) => (y * W + x) * 4;
  const dif = (i: number, f: RGB) => Math.max(Math.abs(d[i] - f[0]), Math.abs(d[i + 1] - f[1]), Math.abs(d[i + 2] - f[2]));
  const dentro = (c: ElementoLeido["caja"], x: number, y: number, m = 0) => x >= c.x0 - m && x < c.x1 + m && y >= c.y0 - m && y < c.y1 + m;
  const avisos: string[] = [];
  // La imagen en RGB y lo que ocupan las cajas leídas: con eso se calcula el fondo ESPERADO cerca de una figura (un
  // plano ajustado a su anillo), para saber qué es su sombra y qué es el fondo que ya oscurecía (un degradado).
  const rgb = new Uint8ClampedArray(W * H * 3);
  for (let k = 0, i = 0; k < W * H; k++, i += 4) { rgb[k * 3] = d[i]; rgb[k * 3 + 1] = d[i + 1]; rgb[k * 3 + 2] = d[i + 2]; }
  const ocupado = new Uint8Array(W * H);
  for (const o of leidos) for (let y = Math.max(0, o.caja.y0); y < Math.min(H, o.caja.y1); y++) ocupado.fill(1, y * W + Math.max(0, o.caja.x0), y * W + Math.min(W, o.caja.x1));

  /** El color de alrededor: el que más hay (`dominante`) en un anillo fuera de la caja, sin los demás elementos (salvo
   *  el que tiene debajo, que ES su fondo). */
  function alrededor(e: ElementoLeido): RGB {
    const r: number[] = [], g: number[] = [], b: number[] = [];
    // Lo que lo contiene entero tampoco se quita: es su fondo aunque no sea su «sobre» directo (la IA leyó la banda
    // naranja del precio de DiDi «sobre» la pastilla entera, y con la pastilla fuera no quedaba ni un píxel, 2026-10-28).
    const loTapa = (o: ElementoLeido) => o.caja.x0 <= e.caja.x0 && o.caja.y0 <= e.caja.y0 && o.caja.x1 >= e.caja.x1 && o.caja.y1 >= e.caja.y1;
    const otros = leidos.filter((o) => o.id !== e.id && o.id !== e.sobre && !loTapa(o));
    // Un texto: el anillo pegado a su caja (1-5 px), que es lo que tiene detrás; más lejos, en una pastilla de dos
    // colores ya entra el otro (2026-10-28). Una figura: 6-14 px, fuera de su sombra.
    const [dentroPx, fueraPx] = e.tipo === "texto" ? [1, 5] : [6, 14];
    for (let y = e.caja.y0 - fueraPx; y < e.caja.y1 + fueraPx; y++) for (let x = e.caja.x0 - fueraPx; x < e.caja.x1 + fueraPx; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H || dentro(e.caja, x, y, dentroPx) || otros.some((o) => dentro(o.caja, x, y))) continue;
      const i = at(x, y);
      r.push(d[i]); g.push(d[i + 1]); b.push(d[i + 2]);
    }
    const fuera = dominante(r, g, b);
    if (e.tipo !== "texto") return fuera;
    // Un texto: lo que más hay DENTRO de su caja (entre las letras) es lo que tiene detrás, aunque la caja de la IA se
    // salga de su pastilla y lo pegado afuera sea otro color (el precio de DiDi, 2026-10-28). Si ese color casi no está
    // afuera (letras que llenan la caja: ése es la tinta), manda el de afuera.
    const ri: number[] = [], gi: number[] = [], bi: number[] = [];
    for (let y = Math.max(0, e.caja.y0); y < Math.min(H, e.caja.y1); y++) for (let x = Math.max(0, e.caja.x0); x < Math.min(W, e.caja.x1); x++) {
      if (otros.some((o) => dentro(o.caja, x, y))) continue;
      const i = at(x, y);
      ri.push(d[i]); gi.push(d[i + 1]); bi.push(d[i + 2]);
    }
    if (!ri.length) return fuera;
    const adentro = dominante(ri, gi, bi);
    let cerca = 0;
    for (let k = 0; k < r.length; k++) if (Math.max(Math.abs(r[k] - adentro[0]), Math.abs(g[k] - adentro[1]), Math.abs(b[k] - adentro[2])) <= 48) cerca++;
    return r.length && cerca / r.length < 0.1 ? fuera : adentro;
  }

  const medidos: ElementoMedido[] = [];
  for (const e of leidos) {
    const B = alrededor(e);
    // Una figura más grande que se cruza con ésta va DETRÁS (la tarjeta sobre la caja de beneficios): no le quita
    // píxeles. Antes las dos se los quitaban y la franja donde se cruzan no era de nadie: la tarjeta dejaba esa franja
    // pintada en el fondo (batería 2026-10-29, 82947).
    const area = (o: ElementoLeido) => (o.caja.x1 - o.caja.x0) * (o.caja.y1 - o.caja.y0);
    const otros = leidos.filter((o) => o.id !== e.id && o.sobre !== e.id && o.id !== e.sobre && (e.tipo === "texto" || o.tipo === "texto" || area(o) <= area(e)));
    let m = e.tipo === "texto" ? medirTexto(e, B) : null;
    if (e.tipo === "texto" && !m) avisos.push(`${e.id}: no se encontró su tinta; va como imagen.`);
    m ??= medirFigura(e, B, otros);
    if (m) medidos.push(m);
    else avisos.push(`${e.id}: no se encontró en la imagen; se deja en el fondo.`);
  }

  /** Texto: el color de su tinta (lo más lejano del fondo) y cuánto de ese color tiene cada píxel. */
  function medirTexto(e: ElementoLeido, B: RGB): ElementoMedido | null {
    const P = 4, x0 = Math.max(0, e.caja.x0 - P), y0 = Math.max(0, e.caja.y0 - P), x1 = Math.min(W, e.caja.x1 + P), y1 = Math.min(H, e.caja.y1 + P);
    // Las letras van SOBRE su fondo: una fila o columna de la caja sin nada de ese color no es texto (la franja beige
    // que la caja de la IA traía arriba de la pastilla del precio de DiDi se medía como tinta: un rectángulo pálido).
    const cw = x1 - x0, ch = y1 - y0, enFila = new Uint32Array(ch), enCol = new Uint32Array(cw);
    // El fondo de CADA columna: lo de arriba y abajo de las letras (las 3 filas de cada orilla de la caja), suavizado. En
    // un degradado un solo color no sirve: del lado más oscuro las letras no se veían «sobre su fondo» y se quedaban
    // fuera (83ed: «¡Lleva tu DiDi Card y d|isfruta…», 82947: «crédit|o»; batería 2026-10-29). Lo que se aleja mucho
    // de B (otra cosa: la tinta misma, la orilla de una pastilla) no cuenta: ahí, B.
    const orillaCol: (RGB | null)[] = [];
    for (let x = x0; x < x1; x++) {
      const r: number[] = [], g: number[] = [], b: number[] = [];
      for (const y of [y0, y0 + 1, y0 + 2, y1 - 3, y1 - 2, y1 - 1]) if (y >= 0 && y < H) { const i = at(x, y); if (dif(i, B) <= 150) { r.push(d[i]); g.push(d[i + 1]); b.push(d[i + 2]); } }
      orillaCol.push(r.length >= 2 ? [mediana(r), mediana(g), mediana(b)] : null);
    }
    const BC: RGB[] = [];
    for (let x = 0; x < cw; x++) {
      const r: number[] = [], g: number[] = [], b: number[] = [];
      for (let k = Math.max(0, x - 8); k <= Math.min(cw - 1, x + 8); k++) { const o = orillaCol[k]; if (o) { r.push(o[0]); g.push(o[1]); b.push(o[2]); } }
      BC.push(r.length ? [mediana(r), mediana(g), mediana(b)] : B);
    }
    const Bx = (x: number) => BC[x - x0];
    const difB = (i: number, x: number) => { const c = Bx(x); return Math.max(Math.abs(d[i] - c[0]), Math.abs(d[i + 1] - c[1]), Math.abs(d[i + 2] - c[2])); };
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (difB(at(x, y), x) <= 24) { enFila[y - y0]++; enCol[x - x0]++; }
    const sobreFondo = (x: number, y: number) => enFila[y - y0] >= Math.max(2, 0.03 * cw) && enCol[x - x0] >= Math.max(2, 0.03 * ch);
    let max = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (sobreFondo(x, y)) max = Math.max(max, difB(at(x, y), x));
    if (max < 40) return null;
    const r: number[] = [], g: number[] = [], b: number[] = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = at(x, y); if (sobreFondo(x, y) && difB(i, x) > 0.85 * max) { r.push(d[i]); g.push(d[i + 1]); b.push(d[i + 2]); } }
    // La tinta: el color que más hay entre lo más lejano del fondo (la mediana por canal mezclaba la tinta blanca con
    // la franja beige que la caja de la IA traía arriba de la pastilla).
    const F: RGB = dominante(r, g, b);
    const w = x1 - x0, h = y1 - y0, a = new Float32Array(w * h), otra = new Uint8Array(w * h);
    let hayOtra = false;
    const otrosT = leidos.filter((o) => o.id !== e.id && o.id !== e.sobre && o.sobre !== e.id);
    const ajenaT = (X: number, Y: number) => otrosT.some((o) => dentro(o.caja, X, Y));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!sobreFondo(x0 + x, y0 + y)) continue;
      const Bl = BC[x], v = [F[0] - Bl[0], F[1] - Bl[1], F[2] - Bl[2]], vv = Math.max(1, v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
      const i = at(x0 + x, y0 + y), p = [d[i] - Bl[0], d[i + 1] - Bl[1], d[i + 2] - Bl[2]];
      const t = Math.min(1, Math.max(0, (p[0] * v[0] + p[1] * v[1] + p[2] * v[2]) / vv));
      // Un color que no está en la recta del fondo a la tinta es de otro elemento (otra tinta, otra forma)... o de
      // otro color del mismo texto: si no cae en otro elemento leído, se borra con él (`otraTinta`).
      const fuera = Math.hypot(p[0] - t * v[0], p[1] - t * v[1], p[2] - t * v[2]) > 60;
      a[y * w + x] = fuera ? 0 : t;
      if (fuera && difB(i, x0 + x) > 40 && !ajenaT(x0 + x, y0 + y)) { otra[y * w + x] = 1; hayOtra = true; }
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
    const leida = { x: e.caja.x0, y: e.caja.y0, w: e.caja.x1 - e.caja.x0, h: e.caja.y1 - e.caja.y0 };
    return { ...resto, pinta, solido, alfa, oscurece: null, debajo: B, color: F, renglones, leida, otraTinta: hayOtra ? { caja: { x: x0, y: y0, w, h }, m: otra } : null };
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
        // Fuera de su caja crece poco (FIGURA_FUERA_PX): una forma sobre otra (la banda naranja del precio sobre la
        // pastilla blanca) veía el beige de afuera «claramente distinto» de su fondo blanco y se lo tragaba entero
        // (un rectángulo claro que viajaba con la pieza, 2026-10-28).
        if (!mio[n] && !fondo[n] && !ajeno[n] && (enCaja(nx, ny) || (fuerte(nx, ny) && dentro(e.caja, x0 + nx, y0 + ny, FIGURA_FUERA_PX)))) { mio[n] = 1; pila.push(n); }
      }
    }
    /** Distancia de un punto a una caja leída (0 adentro). */
    const lejos = (c: ElementoLeido["caja"], X: number, Y: number) => Math.hypot(Math.max(c.x0 - X, 0, X - c.x1 + 1), Math.max(c.y0 - Y, 0, Y - c.y1 + 1));
    // El fondo esperado aquí: un plano ajustado al anillo de más allá de la zona de sombra (sin las cajas leídas).
    // Contra un solo color, un fondo que oscurece hacia una orilla (el beige del iPhone de DiDi, 2026-10-28) salía
    // entero como «sombra» y cada pieza se llevaba un rectángulo oscuro al moverse. Si ahí no hay un plano (foto,
    // textura), no se busca sombra: se queda en el fondo.
    const esperado = planoDelAnillo(rgb, W, H, ocupado, { x0, y0, x1: x1 - 1, y1: y1 - 1 });
    const lumEsperada = esperado && esperado.error <= LISO_MAX ? (X: number, Y: number) => (esperado.valor(X, Y, 0) + esperado.valor(X, Y, 1) + esperado.valor(X, Y, 2)) / 3 : null;
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
      } else if (lumEsperada) {
        // Sombra: lo que oscurece el fondo ESPERADO cerca, si este elemento es el más cercano.
        const X = x0 + x, Y = y0 + y, r = lum([d[i], d[i + 1], d[i + 2]]) / Math.max(1, lumEsperada(X, Y));
        if (r < SOMBRA_MIN && leidos.every((o) => o.id === e.id || lejos(o.caja, X, Y) > lejos(e.caja, X, Y))) { som[k] = Math.min(1, r); haySombra = true; }
      }
    }
    // Y sólo la sombra PEGADA a la figura (conectada a ella): una mancha oscura del fondo más allá no es suya.
    if (haySombra) {
      const llega = new Uint8Array(w * h), cola: number[] = [];
      for (let k = 0; k < w * h; k++) if (mio[k]) { llega[k] = 1; cola.push(k); }
      while (cola.length) {
        const k = cola.pop()!, x = k % w, y = (k / w) | 0;
        for (const n of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1]) if (n >= 0 && !llega[n] && som[n] < 1) { llega[n] = 1; cola.push(n); }
      }
      haySombra = false;
      for (let k = 0; k < w * h; k++) if (som[k] < 1) { if (llega[k]) haySombra = true; else som[k] = 1; }
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
    return { ...resto, tipo: e.tipo === "texto" ? "imagen" : e.tipo, texto: e.tipo === "texto" ? "" : e.texto, pinta, solido, alfa, oscurece, debajo: B, color: null, renglones: [], leida: { x: e.caja.x0, y: e.caja.y0, w: e.caja.x1 - e.caja.x0, h: e.caja.y1 - e.caja.y0 } };
  }

  // ── El fondo limpio: lo que pinta cada elemento (un texto, con su halo) se rellena con un plano inclinado ajustado
  // al anillo de fondo de alrededor, más su grano. Copiar la orilla arrastraba los halos de las letras vecinas
  // ("fantasmas"); una cuadrática hacía "tazones" en los huecos grandes (laboratorio B28).
  const quitar = new Uint8Array(W * H);
  // Los fijos se miden igual (ocupan su lugar: si no, sus píxeles parecerían la sombra de un vecino) pero no se sacan.
  for (const m of medidos) {
    if (fijos.has(m.id)) continue;
    const o = m.otraTinta;
    if (o) for (let y = 0; y < o.caja.h; y++) for (let x = 0; x < o.caja.w; x++) {
      if (!o.m[y * o.caja.w + x]) continue;
      const X = o.caja.x + x, Y = o.caja.y + y;
      for (let yy = Math.max(0, Y - 3); yy <= Math.min(H - 1, Y + 3); yy++) quitar.fill(1, yy * W + Math.max(0, X - 3), yy * W + Math.min(W - 1, X + 3) + 1);
    }
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
    // Sin plano no quiere decir foto: un degradado curvo o una luz suave no son un plano pero casi no cambian de golpe
    // (batería 2026-10-29: 10 de 11 anuncios con piezas pegadas por eso). Se rellenan igual: el plano más lo que la
    // orilla se aparta de él, llevado suave hacia adentro, sigue la curva.
    const aspera = ajuste && ajuste.error > LISO_MAX ? asperezaDelAnillo(fondo, W, H, quitar, { x0: cx0, y0: cy0, x1: cx1, y1: cy1 }) : null;
    const suave = !!aspera && aspera.ruido <= SUAVE_RUIDO_MAX && aspera.orillas <= SUAVE_ORILLAS_MAX;
    if (!ajuste || (ajuste.error > LISO_MAX && !suave)) {
      liso = false;
      for (const k of pix) malo[k] = 1;
      if (!ajuste) continue;
    }
    // El plano, más lo que la orilla real se aparta de él llevado suave hacia adentro (Laplace): sin eso, en un fondo
    // que oscurece hacia un lado cada hueco se veía como un rectángulo más claro o más oscuro (B30, 2026-10-28).
    const bx0 = Math.max(0, cx0 - ORILLA_PX), by0 = Math.max(0, cy0 - ORILLA_PX), bx1 = Math.min(W - 1, cx1 + ORILLA_PX), by1 = Math.min(H - 1, cy1 + ORILLA_PX);
    const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1, desc = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) desc[y * bw + x] = quitar[(by0 + y) * W + bx0 + x];
    const resto = [0, 1, 2].map((c) => {
      const v = new Float32Array(bw * bh);
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (!desc[y * bw + x]) v[y * bw + x] = fondo[((by0 + y) * W + bx0 + x) * 3 + c] - ajuste.valor(bx0 + x, by0 + y, c);
      rellenarSuave(v, desc, bw, bh);
      return v;
    });
    let semilla = (cx0 * 7919 + cy0 * 104729) >>> 0;
    const azar = () => { semilla = (semilla * 1664525 + 1013904223) >>> 0; return semilla / 4294967296 - 0.5; };
    const grano = Math.min(3, suave && aspera ? aspera.ruido : ajuste.error);
    for (const k of pix) {
      const x = k % W, y = (k / W) | 0, g = grano * (azar() + azar() + azar()) * 2, j = (y - by0) * bw + (x - bx0);
      for (let c = 0; c < 3; c++) fondo[k * 3 + c] = ajuste.valor(x, y, c) + resto[c][j] + g;
    }
  }
  if (!liso) avisos.push("El fondo no es liso (foto o textura): todavía no se puede limpiar sin IA.");
  const fallan = liso ? [] : medidos.filter((m) => !fijos.has(m.id)).filter((m) => {
    for (let y = 0; y < m.pinta.h; y++) for (let x = 0; x < m.pinta.w; x++)
      if ((m.alfa[y * m.pinta.w + x] > 0 || (m.oscurece && m.oscurece[(y * m.pinta.w + x) * 3] < 255)) && malo[(m.pinta.y + y) * W + m.pinta.x + x]) return true;
    return false;
  }).map((m) => m.id);
  return { elementos: fijos.size ? medidos.filter((m) => !fijos.has(m.id)) : medidos, fondo, liso, avisos, fallan, todos: medidos };
}

/** Cómo se nombra en los avisos de cada medida algo pegado al fondo: sus primeras letras, o su papel y qué es. */
const nombrePegado = (e: ElementoLeido): string => {
  const t = e.texto.replace(/\s+/g, " ").trim();
  return e.tipo === "texto" && t ? `«${t.length > 24 ? `${t.slice(0, 23)}…` : t}»` : `«${e.rol}» (${e.tipo})`;
};

/** Lo que se rellena de un texto en un fondo de foto: sus letras (todo lo que pinta) y esto alrededor (px). */
const LETRAS_MARGEN_PX = 3;
/** Las letras de un texto (lo que pinta, más LETRAS_MARGEN_PX) en una máscara W × H. */
function mascaraDeLetras(t: ElementoMedido, W: number, H: number): Uint8Array {
  const mk = new Uint8Array(W * H), r = LETRAS_MARGEN_PX;
  for (let y = 0; y < t.pinta.h; y++) for (let x = 0; x < t.pinta.w; x++) {
    if (!t.alfa[y * t.pinta.w + x]) continue;
    const X = t.pinta.x + x, Y = t.pinta.y + y;
    for (let yy = Math.max(0, Y - r); yy <= Math.min(H - 1, Y + r); yy++) mk.fill(1, yy * W + Math.max(0, X - r), yy * W + Math.min(W - 1, X + r) + 1);
  }
  const o = t.otraTinta;
  if (o) for (let y = 0; y < o.caja.h; y++) for (let x = 0; x < o.caja.w; x++) {
    if (!o.m[y * o.caja.w + x]) continue;
    const X = o.caja.x + x, Y = o.caja.y + y;
    for (let yy = Math.max(0, Y - r); yy <= Math.min(H - 1, Y + r); yy++) mk.fill(1, yy * W + Math.max(0, X - r), yy * W + Math.min(W - 1, X + r) + 1);
  }
  return mk;
}

/** El lado del parche que se compara al rellenar con muestras (px, impar) y hasta dónde se buscan muestras. */
const PARCHE = 7, BUSCA_PX = 30, BUSCA_PASO = 2;
/**
 * Rellena lo marcado en `hueco` (RGB, W × H) copiando de lo que tiene cerca: de la orilla hacia adentro, cada vez el
 * parche conocido de alrededor que más se parece a lo que ya se ve del parche por llenar (como el «relleno según el
 * contenido» de Photoshop, en chico). Sirve en fotos y texturas, donde un relleno suave dejaba una mancha lisa; pensado
 * para huecos delgados (las letras de un texto), no para quitar una figura grande.
 */
export function rellenarConMuestras(rgb: Uint8ClampedArray, W: number, H: number, hueco: Uint8Array, evitar?: Uint8Array): void {
  const falta = hueco.slice(), m = PARCHE >> 1;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let k = 0; k < W * H; k++) if (falta[k]) { const x = k % W, y = (k / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return;
  // Dónde hay un parche ENTERO conocido (de la imagen original, no de lo ya rellenado) y fuera de `evitar` (lo que se
  // queda pegado): sólo de ahí se copia.
  const suma = new Int32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) suma[(y + 1) * (W + 1) + x + 1] = (hueco[y * W + x] || (evitar?.[y * W + x] ?? 0) ? 1 : 0) + suma[y * (W + 1) + x + 1] + suma[(y + 1) * (W + 1) + x] - suma[y * (W + 1) + x];
  const limpio = (X: number, Y: number) => {
    const a = X - m, b = Y - m, c = a + PARCHE, d = b + PARCHE;
    return suma[d * (W + 1) + c] - suma[b * (W + 1) + c] - suma[d * (W + 1) + a] + suma[b * (W + 1) + a] === 0;
  };
  /** El parche limpio que más se parece a lo conocido alrededor de (px, py), a ≤ r px; -1 si no hay ninguno. */
  const buscar = (px: number, py: number, r: number) => {
    // Con un radio grande, menos puntos (las mismas ~30 × 30 pruebas).
    const paso = Math.max(BUSCA_PASO, Math.round((2 * r) / 30));
    let mejor = -1, peor = Infinity;
    const probar = (sx: number, sy: number) => {
        if (sx < m || sy < m || sx > W - 1 - m || sy > H - 1 - m || !limpio(sx, sy)) return;
        let d = 0, n = 0;
        for (let dy = -m; dy <= m; dy++) {
          const ty = py + dy;
          if (ty < 0 || ty >= H) continue;
          for (let dx = -m; dx <= m; dx++) {
            const tx = px + dx;
            if (tx < 0 || tx >= W || falta[ty * W + tx]) continue;
            const a = (ty * W + tx) * 3, b = ((sy + dy) * W + sx + dx) * 3;
            d += (rgb[a] - rgb[b]) ** 2 + (rgb[a + 1] - rgb[b + 1]) ** 2 + (rgb[a + 2] - rgb[b + 2]) ** 2;
            n++;
          }
        }
        if (n && d / n < peor) { peor = d / n; mejor = sy * W + sx; }
    };
    for (let sy = Math.max(m, py - r); sy <= Math.min(H - 1 - m, py + r); sy += paso)
      for (let sx = Math.max(m, px - r); sx <= Math.min(W - 1 - m, px + r); sx += paso) probar(sx, sy);
    // Y alrededor del mejor, de a un píxel (la rejilla gruesa se salta la fase de una textura fina).
    if (mejor >= 0) { const bx = mejor % W, by = (mejor / W) | 0; for (let dy = 1 - paso; dy < paso; dy++) for (let dx = 1 - paso; dx < paso; dx++) probar(bx + dx, by + dy); }
    return mejor;
  };
  for (;;) {
    // La orilla de lo que falta: lo que falta con algo conocido al lado.
    const orilla: number[] = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const k = y * W + x;
      if (falta[k] && ((x > 0 && !falta[k - 1]) || (x < W - 1 && !falta[k + 1]) || (y > 0 && !falta[k - W]) || (y < H - 1 && !falta[k + W]))) orilla.push(k);
    }
    if (!orilla.length) break;
    const llenos: [number, number][] = [];
    for (const k of orilla) {
      const px = k % W, py = (k / W) | 0;
      // Más lejos sólo si cerca no hay nada limpio (el centro de un titular grueso, 2026-10-29).
      let q = -1;
      for (let r = BUSCA_PX; q < 0 && r <= 2 * Math.max(W, H); r *= 2) q = buscar(px, py, r);
      if (q >= 0) llenos.push([k, q]);
    }
    if (!llenos.length) break;
    for (const [k, q] of llenos) { for (let c = 0; c < 3; c++) rgb[k * 3 + c] = rgb[q * 3 + c]; falta[k] = 0; }
  }
  // Sin ningún parche limpio en toda la imagen (no debería pasar), lo que quede se rellena suave: nunca queda la letra.
  let quedan = false;
  for (let k = 0; k < W * H && !quedan; k++) quedan = !!falta[k];
  if (!quedan) return;
  const bw = x1 - x0 + 3, bh = y1 - y0 + 3, bx = Math.max(0, x0 - 1), by = Math.max(0, y0 - 1);
  const desc = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const X = bx + x, Y = by + y; desc[y * bw + x] = X < W && Y < H ? falta[Y * W + X] : 0; }
  for (let c = 0; c < 3; c++) {
    const v = new Float32Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const X = Math.min(W - 1, bx + x), Y = Math.min(H - 1, by + y); v[y * bw + x] = rgb[(Y * W + X) * 3 + c]; }
    rellenarSuave(v, desc, bw, bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (desc[y * bw + x]) rgb[((by + y) * W + bx + x) * 3 + c] = v[y * bw + x];
  }
}

/** Lo más que se vuelve a medir quitando elementos: cada vuelta saca al menos uno. */
const VUELTAS_FIJO = 8;

/**
 * Como `medirPlano`, pero no rechaza la imagen si el fondo no es liso (Pedro, 2026-10-28: "even if it cant edit or move
 * the background shouldnt outwrite refuse the asset it should just say the bg is not editable"): los elementos de los
 * huecos que no se pueden rellenar se quedan pintados en el fondo (`fijos`, no se mueven ni se editan) y se vuelve a
 * medir con los demás (los fijos se siguen midiendo: ocupan su lugar). Con todo fijo, la imagen va entera de fondo.
 */
export function medirPlanoFijo(img: Imagen, leidos: ElementoLeido[]): ReturnType<typeof medirPlano> & { fijos: string[]; pegados: PegadoAlFondo[]; anclados: string[] } {
  const fijos = new Set<string>();
  for (let vuelta = 0; ; vuelta++) {
    const m = medirPlano(img, leidos, fijos);
    const nuevos = m.fallan.filter((id) => !fijos.has(id));
    if (m.liso || !nuevos.length || vuelta >= VUELTAS_FIJO) {
      // Sin liso al final (no debería: sin elementos no hay huecos), lo que falla también se queda fijo.
      if (!m.liso) for (const id of m.fallan) fijos.add(id);
      // Todo texto sale editable (Pedro, 2026-10-29: "the texts need to be guaranteed editable"): un texto en un fondo
      // que no se puede rellenar suave (foto, textura) se saca igual, sólo sus letras, rellenando con lo que tiene al
      // lado (`rellenarConMuestras`). Si va sobre algo que se queda pegado (el botón de una foto), se queda ANCLADO al
      // fondo: se mueve con él, para no dejar su botón vacío.
      const { w: W, h: H } = img, fondo = m.fondo.slice();
      const textos = m.todos.filter((e) => e.tipo === "texto" && fijos.has(e.id));
      for (const t of textos) fijos.delete(t.id);
      const quedan = m.todos.filter((e) => fijos.has(e.id));
      // Todas las letras a la vez: si no, un renglón copiaba las letras del de al lado. (Sí se copia de lo pegado: un
      // texto sobre una barra blanca pegada se rellena con la barra, no con la foto de afuera.)
      if (textos.length) {
        const hueco = new Uint8Array(W * H);
        for (const t of textos) { const mk = mascaraDeLetras(t, W, H); for (let k = 0; k < W * H; k++) if (mk[k]) hueco[k] = 1; }
        rellenarConMuestras(fondo, W, H, hueco);
      }
      const cruza = (a: Caja, b: Caja) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      const anclados = textos.filter((t) => quedan.some((q) => q.id === t.sobre || cruza(t.solido, q.solido))).map((t) => t.id);
      // Un texto sobre un elemento fijo ya no va en su pieza (ese se queda en el fondo): va suelto.
      const elementos = [...m.elementos.filter((e) => !fijos.has(e.id)), ...textos].map((e) => (e.sobre && fijos.has(e.sobre) ? { ...e, sobre: null } : e));
      const avisos = m.avisos.filter((a) => !a.startsWith("El fondo no es liso"));
      // Lo fijo que se encontró en la imagen, con su parte sólida: cada medida avisa si lo corta o le cae algo encima.
      const pegados = leidos.flatMap((e) => { const q = quedan.find((x) => x.id === e.id); return q ? [{ nombre: nombrePegado(e), caja: q.solido }] : []; });
      return { ...m, fondo, elementos, liso: true, avisos, fallan: [], fijos: [...fijos], pegados, anclados };
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

/**
 * Qué tan áspero es el anillo de 16 px alrededor de la caja (sin lo que se quita): por cada píxel, cuánto se aparta
 * del promedio de sus vecinos a 2 px (lo que cambia de golpe; un degradado o una luz suave, por curvos que sean, casi no
 * cambian así). `ruido`: el típico (niveles) de lo que no es orilla; `orillas`: qué parte del anillo cambia de golpe
 * (más de ORILLA_NIVELES: el canto de una tarjeta, una foto). null si no hay anillo con qué medir.
 */
export function asperezaDelAnillo(rgb: Uint8ClampedArray, W: number, H: number, quitar: Uint8Array, c: { x0: number; y0: number; x1: number; y1: number }): { ruido: number; orillas: number } | null {
  const libre = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && !quitar[y * W + x];
  const paso = Math.max(1, Math.round(Math.sqrt(((c.x1 - c.x0 + 33) * (c.y1 - c.y0 + 33)) / 40_000)));
  let n = 0, orillas = 0, sq = 0, lisos = 0;
  for (let y = Math.max(2, c.y0 - 16); y <= Math.min(H - 3, c.y1 + 16); y += paso) for (let x = Math.max(2, c.x0 - 16); x <= Math.min(W - 3, c.x1 + 16); x += paso) {
    if (!libre(x, y) || !libre(x - 2, y) || !libre(x + 2, y) || !libre(x, y - 2) || !libre(x, y + 2)) continue;
    let d = 0;
    for (let q = 0; q < 3; q++) {
      const v = (k: number) => rgb[k * 3 + q];
      d += Math.abs(v(y * W + x) - (v(y * W + x - 2) + v(y * W + x + 2) + v((y - 2) * W + x) + v((y + 2) * W + x)) / 4);
    }
    d /= 3;
    n++;
    if (d > ORILLA_NIVELES) orillas++;
    else { sq += d * d; lisos++; }
  }
  return n < 30 ? null : { ruido: lisos ? Math.sqrt(sq / lisos) : Infinity, orillas: orillas / n };
}
/** Lo que un píxel se aparta de sus vecinos a 2 px para contar como orilla (niveles de 255). */
const ORILLA_NIVELES = 8;
/** Un anillo sin plano todavía se rellena si su ruido típico (niveles) no pasa de esto... (batería 2026-10-29: los
 *  degradados de los anuncios, 0.5-1.3; las rocas, 1.7-3.4). */
export const SUAVE_RUIDO_MAX = 1.6;
/** ...y si no más de esta parte cambia de golpe (los degradados, 0-2.4 %; el estadio y las capturas, 3.4-14 %). */
export const SUAVE_ORILLAS_MAX = 0.03;

// ── Rehacer con IA el fondo detrás de lo pegado (Pedro, 2026-10-29: "Build AI background") ──────────────────────
// UNA llamada por anuncio, sólo si algo se quedó pegado: se le manda el fondo limpio (lo que sí se pudo sacar ya no
// está) y una máscara de lo pegado; de lo que devuelve se pega SÓLO lo de la máscara (y un borde que se desvanece):
// fuera de ahí el fondo queda igual, píxel por píxel. Lo pegado sale después de la diferencia entre la imagen y el
// fondo nuevo (`soltarConFondoIA`), así que se puede mover como cualquier pieza.

/** Lo que se agranda la máscara alrededor de lo pegado (px): su orilla suave y su sombra cercana. */
export const IA_MARGEN_PX = 10;
/** El borde (px) fuera de la máscara donde lo de la IA se desvanece hacia el fondo de antes. */
const IA_ANILLO_PX = 6;

/** Lo pegado de una medida (y los textos anclados sobre ello) como máscara W × H: 1 = lo que la IA tiene que borrar. */
export function mascaraPegados(medido: { todos: ElementoMedido[]; fijos: readonly string[]; anclados?: readonly string[] }, W: number, H: number, r = IA_MARGEN_PX, recortes?: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const ids = new Set([...medido.fijos, ...(medido.anclados ?? [])]), mk = new Uint8Array(W * H);
  for (const e of medido.todos) {
    if (!ids.has(e.id)) continue;
    // Con su recorte exacto, eso más r (la IA no repinta el fondo que la silueta medida, un rectángulo, se llevaba).
    const rc = recortes?.get(e.id);
    if (rc) { const g = dilatar(rc, W, H, r); for (let k = 0; k < W * H; k++) if (g[k]) mk[k] = 1; continue; }
    for (let y = 0; y < e.pinta.h; y++) for (let x = 0; x < e.pinta.w; x++) {
      const j = y * e.pinta.w + x;
      if (!e.alfa[j] && !(e.oscurece && e.oscurece[j * 3] < 255)) continue;
      const X = e.pinta.x + x, Y = e.pinta.y + y;
      // Cada fila del cuadrado de r alrededor, de una vez (`fill`): la máscara de un anuncio entero no tarda.
      for (let yy = Math.max(0, Y - r); yy <= Math.min(H - 1, Y + r); yy++) mk.fill(1, yy * W + Math.max(0, X - r), yy * W + Math.min(W - 1, X + r) + 1);
    }
  }
  return mk;
}

/**
 * El fondo (RGB, W × H) con lo que devolvió la IA (`ia`: RGBA del tamaño de `recorte`, ya reescalado; el recorte puede
 * salirse de la imagen): entero dentro de la máscara, desvaneciéndose en IA_ANILLO_PX afuera; el resto, igual.
 * `deriva`: el error medio (0-255) lejos de la máscara, donde la IA no debía cambiar nada (alto = movió el fondo).
 */
export function pegarFondoIA(fondo: Uint8ClampedArray, W: number, H: number, mascara: Uint8Array, recorte: Caja, ia: Uint8ClampedArray): { fondo: Uint8ClampedArray; deriva: number | null } | null {
  if (ia.length < recorte.w * recorte.h * 4 || fondo.length < W * H * 3) return null;
  // Distancia (aprox.) de cada píxel a la máscara, sólo hasta IA_ANILLO_PX + 1: dos pasadas.
  const d = new Float32Array(W * H).fill(Infinity);
  for (let k = 0; k < W * H; k++) if (mascara[k]) d[k] = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = y * W + x; if (x > 0) d[k] = Math.min(d[k], d[k - 1] + 1); if (y > 0) d[k] = Math.min(d[k], d[k - W] + 1); }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const k = y * W + x; if (x < W - 1) d[k] = Math.min(d[k], d[k + 1] + 1); if (y < H - 1) d[k] = Math.min(d[k], d[k + W] + 1); }
  const out = new Uint8ClampedArray(fondo);
  let suma = 0, n = 0;
  for (let y = 0; y < recorte.h; y++) for (let x = 0; x < recorte.w; x++) {
    const X = recorte.x + x, Y = recorte.y + y;
    if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
    const k = Y * W + X, j = (y * recorte.w + x) * 4, peso = Math.max(0, 1 - d[k] / IA_ANILLO_PX);
    if (peso <= 0) {
      if (d[k] > 3 * IA_ANILLO_PX) { for (let c = 0; c < 3; c++) suma += Math.abs(ia[j + c] - fondo[k * 3 + c]); n += 3; }
      continue;
    }
    for (let c = 0; c < 3; c++) out[k * 3 + c] = ia[j + c] * peso + fondo[k * 3 + c] * (1 - peso);
  }
  return { fondo: out, deriva: n ? Math.round((suma / n) * 10) / 10 : null };
}

/** Hasta dónde fuera de su silueta medida puede llegar una pieza soltada (px): en una foto, la textura que la IA
 *  rehízo distinto se colaba como un borde roto alrededor (la batería, 2026-10-29). */
const SOLTAR_FUERA_PX = 2;
/** Lo que se aparta una imagen de su fondo nuevo (máx. por canal) para ser de la pieza entera / media. */
const SOLTAR_LLENO = 30, SOLTAR_ORILLA = 15;

/**
 * Lo medido con lo pegado ya libre: con el fondo nuevo (`fondoIA`, sin lo pegado), cada elemento pegado es lo que la
 * imagen tiene de distinto de ese fondo, dentro de su silueta medida + SOLTAR_FUERA_PX (lo de otro elemento pegado al
 * lado, o la textura que la IA rehízo distinto, no entra). Los textos vuelven a ir sobre lo suyo (`sobre`) y nada queda anclado ni pegado.
 */
export function soltarConFondoIA<M extends { elementos: ElementoMedido[]; todos: ElementoMedido[]; fijos: string[]; pegados: PegadoAlFondo[]; anclados: string[]; fondo: Uint8ClampedArray }>(img: Imagen, medido: M, fondoIA: Uint8ClampedArray, recortes?: ReadonlyMap<string, Uint8Array>): M {
  const { w: W, h: H, rgba: d } = img, fijos = new Set(medido.fijos);
  const libres: ElementoMedido[] = [], avisos: string[] = [];
  for (const e of medido.todos) {
    if (!fijos.has(e.id)) continue;
    // Con su recorte exacto (recortes.ts: el modelo de segmentación), la pieza ES el recorte; sin él, la diferencia con
    // el fondo de la IA dentro de su silueta medida.
    const rc = recortes?.get(e.id);
    const solo = rc ?? mascaraPegados({ todos: [e], fijos: [e.id] }, W, H, SOLTAR_FUERA_PX);
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let k = 0; k < W * H; k++) if (solo[k]) { const x = k % W, y = (k / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) continue;
    // Con recorte, un margen alrededor: la orilla se afina con el fondo de la imagen que tiene justo afuera.
    if (rc) { x0 = Math.max(0, x0 - RECORTE_VENTANA_PX); y0 = Math.max(0, y0 - RECORTE_VENTANA_PX); x1 = Math.min(W - 1, x1 + RECORTE_VENTANA_PX); y1 = Math.min(H - 1, y1 + RECORTE_VENTANA_PX); }
    const w = x1 - x0 + 1, h = y1 - y0 + 1, a = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = (y0 + y) * W + x0 + x;
      if (!solo[k]) continue;
      if (rc) { a[y * w + x] = 1; continue; }
      const i = k * 4, dist = Math.max(Math.abs(d[i] - fondoIA[k * 3]), Math.abs(d[i + 1] - fondoIA[k * 3 + 1]), Math.abs(d[i + 2] - fondoIA[k * 3 + 2]));
      a[y * w + x] = dist >= SOLTAR_LLENO ? 1 : dist >= SOLTAR_ORILLA ? (dist - SOLTAR_ORILLA) / (SOLTAR_LLENO - SOLTAR_ORILLA) : 0;
    }
    // Un recorte trae a veces pedazos sueltos (el del tablero LED, rayas de su base que salían negras debajo: Pedro,
    // preview 2026-10-29): fuera ANTES de rellenar lo encerrado, que si no los une a la pieza.
    if (rc) soloLoMayor(a, w, h);
    // Lo encerrado por la pieza también es pieza: donde el objeto se parece al fondo que puso la IA (la pantalla oscura
    // del tablero LED sobre un estadio oscuro), la diferencia no lo ve y quedaba un hueco por donde se veía el estadio
    // (Pedro, preview 2026-10-29). Se cierran las rendijas de su contorno y se rellena todo lo que no llega desde afuera.
    const b = new Uint8Array(w * h);
    for (let k = 0; k < w * h; k++) b[k] = a[k] >= 0.5 ? 1 : 0;
    const cerrado = dilatar(b, w, h, SOLTAR_CIERRE_PX), fuera = new Uint8Array(w * h), cola: number[] = [];
    const entra = (k: number) => { if (!cerrado[k] && !fuera[k]) { fuera[k] = 1; cola.push(k); } };
    for (let x = 0; x < w; x++) { entra(x); entra((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { entra(y * w); entra(y * w + w - 1); }
    while (cola.length) { const k = cola.pop()!, x = k % w; if (x > 0) entra(k - 1); if (x < w - 1) entra(k + 1); if (k >= w) entra(k - w); if (k < w * (h - 1)) entra(k + w); }
    const lejos = dilatar(fuera, w, h, SOLTAR_CIERRE_PX);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = y * w + x; if (!lejos[k] && (rc || solo[(y0 + y) * W + x0 + x])) a[k] = 1; }
    // Ya llena, se le quitan las motas de la orilla: lo que no aguanta encogerse SOLTAR_MOTA_PX y volver a crecer
    // (salpicado de gente o pasto que la IA rehízo distinto) no es pieza; lo sólido, sí. (Con recorte no hace falta, y
    // le quitaría lo delgado de verdad: un poste, un borde.)
    if (!rc) {
      const lleno = new Uint8Array(w * h);
      for (let k = 0; k < w * h; k++) lleno[k] = a[k] >= 0.5 ? 0 : 1;
      const encogido = dilatar(lleno, w, h, SOLTAR_MOTA_PX);
      for (let k = 0; k < w * h; k++) encogido[k] = encogido[k] ? 0 : 1;
      const abierto = dilatar(encogido, w, h, SOLTAR_MOTA_PX);
      for (let k = 0; k < w * h; k++) if (!abierto[k] && !dilatar1(abierto, w, h, k)) a[k] = 0;
    }
    // Y sólo lo que está pegado a la parte más grande (lo suelto en la orilla es fondo).
    soloLoMayor(a, w, h);
    // La orilla del recorte, al final: ya sin pedazos sueltos (si no, el hueco entre la pieza y un pedazo contaba como
    // hueco abierto por afinar).
    if (rc) afinarOrilla(a, w, h, x0, y0, img);
    const pinta = cajaDe(a, w, h, 0, x0, y0), solido = cajaDe(a, w, h, 0.5, x0, y0);
    if (!pinta || !solido) continue;
    const alfa = new Uint8ClampedArray(pinta.w * pinta.h);
    for (let y = 0; y < pinta.h; y++) for (let x = 0; x < pinta.w; x++) alfa[y * pinta.w + x] = Math.round(a[(pinta.y - y0 + y) * w + (pinta.x - x0 + x)] * 255);
    // Y si aun así le queda un hueco (abierto hacia una orilla), se dice: es una falla, no algo que se vea bien.
    const hueco = huecosDe(alfa, pinta.w, pinta.h);
    if (hueco > SOLTAR_HUECOS_MAX) avisos.push(`${e.id}: con el fondo de la IA quedó con huecos (el ${Math.round(hueco * 100)} % de su forma deja ver el fondo). Revisa esa pieza; si se ve mal, «Deshacer el fondo con IA».`);
    libres.push({ ...e, pinta, solido, alfa, oscurece: null });
  }
  // `sobre` como lo leyó la IA: un texto que iba suelto porque su botón estaba pegado vuelve a su botón.
  const sobreDe = new Map(medido.todos.map((e) => [e.id, e.sobre]));
  const vivos = new Set([...medido.elementos.map((e) => e.id), ...libres.map((e) => e.id)]);
  const elementos = [...medido.elementos, ...libres].map((e) => { const s = sobreDe.get(e.id) ?? null; return { ...e, sobre: s && vivos.has(s) ? s : null }; });
  return { ...medido, fondo: fondoIA, elementos, fijos: [], pegados: [], anclados: [], avisos: [...((medido as { avisos?: string[] }).avisos ?? []), ...avisos] };
}

/** Deja en `a` (0-1, w × h) sólo la parte más grande y las que miden al menos el 10 % de ella. */
function soloLoMayor(a: Float32Array, w: number, h: number) {
  const comp = new Int32Array(w * h).fill(-1), tam: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (a[s] < 0.5 || comp[s] >= 0) continue;
    const id = tam.length, pila = [s];
    comp[s] = id;
    let n = 0;
    while (pila.length) { const k = pila.pop()!, x = k % w; n++; for (const v of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, k >= w ? k - w : -1, k < w * (h - 1) ? k + w : -1]) if (v >= 0 && a[v] >= 0.5 && comp[v] < 0) { comp[v] = id; pila.push(v); } }
    tam.push(n);
  }
  const mayor = tam.reduce((m, t, i) => (t > tam[m] ? i : m), 0);
  if (tam.length) for (let k = 0; k < w * h; k++) if (a[k] >= 0.5 && comp[k] !== mayor && tam[comp[k]] < tam[mayor] * 0.1) a[k] = 0;
}

/** El ancho de la orilla de un recorte que se revisa contra los colores de la imagen (px), y lo que se mira alrededor. */
const RECORTE_ORILLA_PX = 6, RECORTE_VENTANA_PX = 14;
/** Lo que tienen que distinguirse el color del objeto y el del fondo junto a él (distancia RGB) para afinar ahí. */
const ORILLA_CONTRASTE = 30;

/**
 * La orilla de un recorte (a: 0-1, w × h desde x0, y0 en la imagen), afinada sin IA: cada píxel de los RECORTE_ORILLA_PX de
 * adentro se compara con el color del objeto (lo de adentro) y el del fondo (lo de afuera) que tiene cerca, en la
 * imagen original; lo que se parece al fondo sale. El recorte del botón del estadio se llevaba en las puntas redondas
 * un pedazo del barandal oscuro, que se veía como una mancha al moverlo (Pedro, preview 2026-10-29). Donde objeto y
 * fondo se parecen (tablero oscuro sobre barandal oscuro), o el píxel es de un color que no es mezcla de los dos (un
 * filo delgado de otro color), no se toca.
 */
function afinarOrilla(a: Float32Array, w: number, h: number, x0: number, y0: number, img: Imagen) {
  const antes = Float32Array.from(a), huecos = (m: Float32Array) => huecosDe(Uint8ClampedArray.from(m, (v) => v * 255), w, h);
  afinar(a, w, h, x0, y0, img);
  // Afinar nunca abre huecos: en un contorno delgado y cortado (los botones de las tiendas de fcc6) el pelado se
  // metía por las rendijas y dejaba la foto de adentro a parches. Ahí la pieza se queda con el recorte tal cual.
  if (huecos(a) > huecos(antes) + 0.005) a.set(antes);
}
function afinar(a: Float32Array, w: number, h: number, x0: number, y0: number, img: Imagen) {
  const n = w * h, dentro = new Uint8Array(n), afuera = new Uint8Array(n);
  for (let k = 0; k < n; k++) { dentro[k] = a[k] >= 0.5 ? 0 : 1; afuera[k] = a[k] >= 0.5 ? 1 : 0; }
  // dentro = lo del objeto a más de RECORTE_ORILLA_PX de su orilla; afuera = lo de fuera a más de 2 px (la orilla suave no cuenta).
  const lejosDeFuera = dilatar(dentro, w, h, RECORTE_ORILLA_PX), lejosDeDentro = dilatar(afuera, w, h, 2);
  for (let k = 0; k < n; k++) { dentro[k] = lejosDeFuera[k] ? 0 : 1; afuera[k] = lejosDeDentro[k] ? 0 : 1; }
  // Sumas por área (imagen integral) del color de cada lado: el promedio de una ventana sale en 4 restas.
  const W1 = w + 1, sumas = (m: Uint8Array) => {
    const t = new Float64Array(W1 * (h + 1) * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y * w + x, i = ((y0 + y) * img.w + x0 + x) * 4, o = ((y + 1) * W1 + x + 1) * 4, iz = ((y + 1) * W1 + x) * 4, ar = (y * W1 + x + 1) * 4, d = (y * W1 + x) * 4;
      for (let c = 0; c < 4; c++) t[o + c] = (m[k] ? (c < 3 ? img.rgba[i + c] : 1) : 0) + t[iz + c] + t[ar + c] - t[d + c];
    }
    return t;
  };
  const sD = sumas(dentro), sF = sumas(afuera), r = RECORTE_VENTANA_PX;
  const promedio = (t: Float64Array, x: number, y: number) => {
    const xa = Math.max(0, x - r), ya = Math.max(0, y - r), xb = Math.min(w, x + r + 1), yb = Math.min(h, y + r + 1), v = [0, 0, 0, 0];
    for (let c = 0; c < 4; c++) v[c] = t[(yb * W1 + xb) * 4 + c] - t[(ya * W1 + xb) * 4 + c] - t[(yb * W1 + xa) * 4 + c] + t[(ya * W1 + xa) * 4 + c];
    return v[3] ? [v[0] / v[3], v[1] / v[3], v[2] / v[3]] : null;
  };
  // Lo que cada píxel de la orilla tiene de objeto (1 = nada que quitar).
  const nuevo = new Float32Array(n).fill(1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = y * w + x;
    if (a[k] < 0.5 || dentro[k]) continue;
    const fg = promedio(sD, x, y), bg = promedio(sF, x, y);
    if (!fg || !bg) continue;
    const i = ((y0 + y) * img.w + x0 + x) * 4;
    let num = 0, den = 0, lejos = 0;
    for (let c = 0; c < 3; c++) { const e = fg[c] - bg[c], v = img.rgba[i + c] - bg[c]; num += v * e; den += e * e; lejos += v * v; }
    if (den < ORILLA_CONTRASTE * ORILLA_CONTRASTE) continue;
    // Un color que no es mezcla de los dos (el filo naranja de un recuadro oscuro sobre una foto oscura) es del objeto.
    if (lejos - (num * num) / den > ORILLA_CONTRASTE * ORILLA_CONTRASTE) continue;
    nuevo[k] = Math.max(0, Math.min(1, num / den));
  }
  // Se pela desde afuera hacia adentro y se para en el primer píxel del objeto: lo de detrás de un filo (la foto dentro
  // del contorno blanco de los botones de las tiendas) no se toca, aunque se parezca al fondo (fcc6, 2026-10-29).
  const visto = new Uint8Array(n), cola: number[] = [];
  for (let k = 0; k < n; k++) if (a[k] < 0.5) { visto[k] = 1; cola.push(k); }
  const vecinos = (k: number) => { const x = k % w; return [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, k >= w ? k - w : -1, k < n - w ? k + w : -1]; };
  while (cola.length) {
    for (const v of vecinos(cola.pop()!)) {
      if (v < 0 || visto[v]) continue;
      if (nuevo[v] < 0.5) { visto[v] = 1; a[v] = nuevo[v]; cola.push(v); }
      // La orilla suave que queda (lo que toca lo pelado), con lo que tiene de objeto.
      else if (nuevo[v] < 1) a[v] = Math.min(a[v], nuevo[v]);
    }
  }
  // Las motas que el pelado dejó en lo que era fondo (un grano más claro de la foto): un píxel de la orilla con 5 o más
  // de sus 8 vecinos ya pelados también sale. Un filo delgado o el borde del objeto tienen menos vecinos pelados.
  for (let vuelta = 0; vuelta < RECORTE_ORILLA_PX; vuelta++) {
    const motas: number[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (visto[k] || dentro[k]) continue;
      let pelados = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if ((dx || dy) && (X < 0 || Y < 0 || X >= w || Y >= h || visto[Y * w + X])) pelados++; }
      if (pelados >= 5) motas.push(k);
    }
    if (!motas.length) break;
    for (const k of motas) { visto[k] = 1; a[k] = 0; }
  }
}

/** Lo que tiene que aguantar encogerse una parte de la orilla de una pieza soltada para seguir siendo pieza (px). */
const SOLTAR_MOTA_PX = 4;
/** ¿Algún vecino (8) de k en `m` (w × h) está prendido? (la orilla suave de lo abierto se queda). */
function dilatar1(m: Uint8Array, w: number, h: number, k: number): boolean {
  const x = k % w, y = (k / w) | 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h && m[Y * w + X]) return true; }
  return false;
}
/** Las rendijas del contorno de una pieza soltada que se cierran para rellenar lo de adentro (px). */
const SOLTAR_CIERRE_PX = 4;
/** La parte de la forma de una pieza soltada que puede dejar ver el fondo antes de avisar. */
export const SOLTAR_HUECOS_MAX = 0.02;

/** `b` (0/1, w × h) agrandado r px por lado (un cuadrado): primero por filas y luego por columnas. */
function dilatar(b: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const filas = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let ultimo = -Infinity;
    for (let x = 0; x < w + r; x++) { if (x < w && b[y * w + x]) ultimo = x; const c = x - r; if (c >= 0 && c < w && x - ultimo <= 2 * r) filas[y * w + c] = 1; }
    ultimo = Infinity;
    for (let x = w - 1; x >= -r; x--) { if (x >= 0 && b[y * w + x]) ultimo = x; const c = x + r; if (c >= 0 && c < w && ultimo - x <= 2 * r) filas[y * w + c] = 1; }
  }
  for (let x = 0; x < w; x++) {
    let ultimo = -Infinity;
    for (let y = 0; y < h + r; y++) { if (y < h && filas[y * w + x]) ultimo = y; const c = y - r; if (c >= 0 && c < h && y - ultimo <= 2 * r) out[c * w + x] = 1; }
    ultimo = Infinity;
    for (let y = h - 1; y >= -r; y--) { if (y >= 0 && filas[y * w + x]) ultimo = y; const c = y + r; if (c >= 0 && c < h && ultimo - y <= 2 * r) out[c * w + x] = 1; }
  }
  return out;
}

/** Qué parte de una forma (alfa ≥ 50 %) tiene huecos: píxeles transparentes que quedan entre píxeles de la forma a lo
 *  ancho Y a lo alto (una ventana, una muesca), sobre el área de la forma más sus huecos. */
export function huecosDe(alfa: Uint8ClampedArray, w: number, h: number): number {
  const lleno = (x: number, y: number) => alfa[y * w + x] >= 128;
  const fx0 = new Int32Array(h).fill(w), fx1 = new Int32Array(h).fill(-1), cy0 = new Int32Array(w).fill(h), cy1 = new Int32Array(w).fill(-1);
  let n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (lleno(x, y)) { n++; if (x < fx0[y]) fx0[y] = x; fx1[y] = x; if (y < cy0[x]) cy0[x] = y; cy1[x] = y; }
  let huecos = 0;
  for (let y = 0; y < h; y++) for (let x = fx0[y] + 1; x < fx1[y]; x++) if (!lleno(x, y) && y > cy0[x] && y < cy1[x]) huecos++;
  return n + huecos ? huecos / (n + huecos) : 0;
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
export function maestroDePlano(nombre: string, img: Imagen, medidos: ElementoMedido[], fondo: Uint8ClampedArray, textos: ReadonlyMap<string, TextoCapa>, avisos: string[], pegados: readonly PegadoAlFondo[] = [], aproximados: ReadonlySet<string> = new Set(), anclados: ReadonlySet<string> = new Set()):
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
  // El legal (la única capa de imagen plana con caja de párrafo, `capaDeLegal`) va sin prueba: un tamaño, a propósito.
  // Lo reescrito con la tipografía más parecida aunque no empate (`aproximados`, para que TODO texto se edite) tampoco.
  const tpDe = (m: ElementoMedido): TextoPieza => {
    const texto = textos.get(m.id)!;
    return { capa: m.id, texto, opacidad: 1, caja: m.pinta, alfa: m.alfa, motivo: null, ruta: [], difMax: TEXTO_DIF_MAX_PLANO, ...(texto.caja || aproximados.has(m.id) ? { sinPrueba: true } : {}) };
  };
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
  /** El papel de una parte. Una sin papel («OTRO») no se colocaba en las medidas con acomodo propio y se perdía con
   *  todo lo que llevaba encima (la caja de beneficios de 82947, batería 2026-10-29): toma el papel que más tienen sus
   *  textos y, si no lleva, el de la parte con papel más cercana. */
  const rolDeRaiz = (r: ElementoMedido, todos: ElementoMedido[]): Rol | null => {
    if (r.rol !== "OTRO") return r.rol;
    const cuenta = new Map<Rol, number>();
    for (const m of todos) if (m.rol !== "OTRO") cuenta.set(m.rol, (cuenta.get(m.rol) ?? 0) + 1);
    if (cuenta.size) return [...cuenta].sort((a, b) => b[1] - a[1])[0][0];
    const c = r.solido, dist = (o: ElementoMedido) => Math.hypot(Math.max(0, o.solido.x - (c.x + c.w), c.x - (o.solido.x + o.solido.w)), Math.max(0, o.solido.y - (c.y + c.h), c.y - (o.solido.y + o.solido.h)));
    // Un texto suelto va con el texto más cercano (el precio tachado de 83ed se iba con la tarjeta y salía enorme).
    const deTexto = (o: ElementoMedido) => o.rol !== "HERO" && o.rol !== "BRAND" && o.rol !== "FOOTER";
    const cerca = raices.filter((o) => o.rol !== "OTRO" && (r.tipo !== "texto" || deTexto(o))).sort((a, b) => dist(a) - dist(b))[0];
    return cerca ? (cerca.rol as Rol) : null;
  };
  const partePorRol = new Map<Rol | null, PartePsd[]>();
  const sueltasAncladas: PiezaPsd[] = [];
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
    const parte: PartePsd = { nombre: r.id, hijo: null, rellenoPct: 0, tapadaPor: [], caja: vista.caja, solido: union(todos.map((m) => m.solido)), rgba: vista.rgba, oscurece: vista.oscurece, letraMinPx: tamMin(ts), textos: ts, base: base.rgba };
    // Anclado al fondo: su propia pieza, sin papel (el acomodo no la mueve: va sobre su lugar del fondo).
    if (anclados.has(r.id)) {
      sueltasAncladas.push({ nombre: r.tipo === "texto" && r.texto ? `«${r.texto.replace(/\s+/g, " ").slice(0, 24)}»` : r.id, rol: null, anclada: true, caja: parte.caja, solido: parte.solido, rgba: parte.rgba, oscurece: parte.oscurece, tapadaPct: 0, letraMinPx: parte.letraMinPx, textos: ts, base: parte.base });
      continue;
    }
    const rol = rolDeRaiz(r, todos);
    const lista = partePorRol.get(rol) ?? [];
    lista.push(parte);
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
  piezas.push(...sueltasAncladas);
  return { nombre, w: W, h: H, fondo, piezas, fondoDistintoPct: 0, rearmadoDistintoPct: 0, textoGamma: 1, avisos, ...(pegados.length ? { pegados } : {}) };
}

// ── El texto contra una tipografía (la página mide con su canvas; aquí sólo la cuenta) ─────────────────────────────

/** Lo que la página mide de un texto con una tipografía, tamaño y track (milésimas de eme): su avance (lo que usa
 *  `maquetar`) y su tinta respecto al origen: `izq` a la izquierda, `der` a la derecha, `sube` y `baja` de la base. */
export type MedidaTinta = { avance: number; izq: number; der: number; sube: number; baja: number };
export type MedirTinta = (texto: string, fuente: string, tam: number, track: number) => MedidaTinta;

/** El track más estrecho y el más ancho que se aceptan: más allá, esa tipografía no es la del texto. */
const TRACK_MIN = -200, TRACK_MAX = 400;
/** Un track más allá de esto (milésimas de eme) en un texto que no empató dice que su medida está mal, no la letra. */
export const TRACK_RAZONABLE = 100;

/**
 * El texto como párrafo en su propia caja (la parte sólida que se midió), con track 0: el tamaño más grande con que,
 * partido por palabras al ancho de la caja, cabe a lo alto. El último recurso para que un texto se pueda editar cuando
 * sus renglones no se dejan medir (letras sobre una foto: la batería de 2026-10-29 daba tracks de -190 y -200, letras
 * encimadas). null sin color o sin caja.
 */
export function capaEnCaja(m: ElementoMedido, fuente: string, alineacion: Alineacion, medir: MedirTinta): TextoCapa | null {
  // Si su tinta medida es mucho menos que lo que leyó la IA (un texto de dos colores: sólo se midió uno), la caja de la IA.
  const c = m.leida && m.solido.w * m.solido.h < 0.6 * m.leida.w * m.leida.h ? m.leida : m.solido;
  if (!m.color || !(c.w > 0 && c.h > 0) || !m.texto.trim()) return null;
  const partir = (tam: number) => {
    const out: string[] = [];
    for (const parrafo of m.texto.split("\n")) {
      let linea = "";
      for (const p of parrafo.split(/\s+/).filter(Boolean)) {
        const prueba = linea ? `${linea} ${p}` : p;
        if (linea && medir(prueba, fuente, tam, 0).avance > c.w) { out.push(linea); linea = p; } else linea = prueba;
      }
      out.push(linea);
    }
    return out;
  };
  const cabe = (tam: number) => { const ls = partir(tam); return ls.length * tam * 1.2 <= c.h * 1.05 && ls.every((l) => medir(l, fuente, tam, 0).avance <= c.w * 1.02); };
  let lo = 1, hi = Math.max(2, c.h * 1.2);
  if (!cabe(lo)) return null;
  for (let n = 0; n < 24; n++) { const t = (lo + hi) / 2; if (cabe(t)) lo = t; else hi = t; }
  const tam = lo, lineas = partir(tam), d = medir("d", fuente, tam, 0);
  const y0 = c.y + Math.max(0, (c.h - lineas.length * tam * 1.2) / 2);
  return {
    texto: m.texto,
    tramos: [{ n: m.texto.length, fuente, tam, color: m.color, track: 0, interlineado: tam * 1.2, subir: 0, mayusculas: false }],
    alineacion,
    transform: [1, 0, 0, 1, 0, 0],
    caja: [c.x, y0 - Math.max(0, tam * 1.2 - d.sube - d.baja) / 2, c.x + c.w + 1, c.y + c.h + 1],
    motivo: null,
    saltosSuaves: true,
  };
}

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

/** La caja del legal, más ancha que su renglón más largo por esto: al escribirlo otra vez no parte un renglón de más. */
const LEGAL_HOLGURA = 1.03;

/**
 * El legal de una imagen plana como lo trae un PSD (B30; Pedro, 2026-10-28: "it gets rewritten as we have the font and
 * that way it can be further arranged to 1, 2 or 3 lines depending the size"): UN tamaño (aunque la imagen mezcle dos:
 * el de la mayoría de sus letras), en una caja de párrafo con sus saltos suaves, así se vuelve a partir en otros
 * renglones (`renglones.ts`) y crece sin pixelarse. Se escribe aunque no empate letra por letra con la imagen: el legal
 * es obligatorio, y su texto lo pone la Biblioteca o la persona.
 */
export function capaDeLegal(m0: ElementoMedido, fuente: string, alineacion: Alineacion, medir: MedirTinta): TextoCapa | null {
  const m = conRenglonesDeLaImagen(m0, fuente, medir);
  const lineas = m.texto.split("\n"), R = m.renglones;
  if (!m.color || !lineas.length || R.length !== lineas.length) return null;
  // El tamaño: el de la mayoría de sus letras (si se pudo medir por palabra); si no, el de su renglón más ancho.
  const cs = tramosPorTamano(m, fuente, medir)?.flat().filter((c) => c.tam > 0);
  let tam: number;
  if (cs?.length) {
    const orden = [...cs].sort((a, b) => a.tam - b.tam), total = cs.reduce((t, c) => t + c.texto.length, 0);
    let acum = 0;
    tam = orden.find((c) => (acum += c.texto.length) >= total / 2)!.tam;
  } else {
    const k = R.reduce((mx, c, i) => (c.w > R[mx].w ? i : mx), 0), ref = medir(lineas[k], fuente, 100, 0);
    if (!(ref.sube + ref.baja > 0)) return null;
    tam = (100 * R[k].h) / (ref.sube + ref.baja);
  }
  if (!(tam > 0)) return null;
  // El track del renglón más ancho, sin pasar de lo razonable (aquí no se rechaza: el legal va siempre).
  const k = R.reduce((mx, c, i) => (c.w > R[mx].w ? i : mx), 0), n = [...lineas[k]].length, sin = medir(lineas[k], fuente, tam, 0);
  const track = Math.min(TRACK_MAX, Math.max(TRACK_MIN, n > 1 ? ((R[k].w - (sin.izq + sin.der)) * 1000) / ((n - 1) * tam) : 0));
  const medidas = lineas.map((l) => medir(l, fuente, tam, track));
  const bases = R.map((c, i) => c.y + medidas[i].sube);
  const ancho = Math.max(...medidas.map((q) => q.avance)) * LEGAL_HOLGURA + 1;
  // Dónde empieza cada renglón (la pluma, como en `capaDeTexto`: la tinta + lo que se sale a la izquierda) y acaba.
  const izq = Math.min(...R.map((c, i) => c.x + medidas[i].izq)), der = Math.max(...R.map((c, i) => c.x + medidas[i].izq + medidas[i].avance));
  const x0 = alineacion === "center" ? (izq + der) / 2 - ancho / 2 : alineacion === "right" ? der - ancho : izq;
  const y0 = bases[0] - medir("d", fuente, tam, track).sube;
  return {
    texto: m.texto,
    tramos: [{ n: m.texto.length, fuente, tam, color: m.color, track, interlineado: lineas.length > 1 ? (bases.at(-1)! - bases[0]) / (lineas.length - 1) : null, subir: 0, mayusculas: false }],
    alineacion,
    transform: [1, 0, 0, 1, 0, 0],
    caja: [x0, y0, x0 + ancho, Math.ceil(bases.at(-1)! + tam * 0.3)],
    motivo: null,
    saltosSuaves: true,
  };
}

/** Dos palabras seguidas son del mismo tamaño si su tamaño difiere menos que esto. */
const MISMO_TAMANO = 0.15;
/** Un pedazo de un renglón escrito a un solo tamaño: sus palabras y la caja de su tinta (px de la imagen). */
type Corrida = { texto: string; tam: number; caja: Caja };

/**
 * Las palabras de cada renglón con su tamaño, juntadas en corridas del mismo tamaño. Las palabras se encuentran en la
 * tinta por sus huecos (los más anchos del renglón, tantos como espacios tiene). null si el texto es de un solo tamaño
 * o si no se puede saber (menos huecos que espacios): entonces va como siempre, un estilo.
 */
function tramosPorTamano(m: ElementoMedido, fuente: string, medir: MedirTinta): Corrida[][] | null {
  const lineas = m.texto.split("\n"), { pinta, alfa } = m;
  let varios = false;
  const out: Corrida[][] = [];
  for (const [i, linea] of lineas.entries()) {
    const palabras = linea.split(" ").filter(Boolean), R = m.renglones[i];
    if (palabras.length < 2) { out.push([{ texto: linea.trim(), tam: 0, caja: R }]); continue; }
    // Tinta por columna del renglón, y sus huecos.
    const tinta = (x: number, y: number) => alfa[(y - pinta.y) * pinta.w + (x - pinta.x)] > 127;
    const col = Array.from({ length: R.w }, (_, k) => { for (let y = R.y; y < R.y + R.h; y++) if (tinta(R.x + k, y)) return true; return false; });
    const huecos: { x0: number; x1: number }[] = [];
    for (let k = 0; k < R.w; k++) if (!col[k]) { const u = huecos.at(-1); if (u && u.x1 === k - 1) u.x1 = k; else huecos.push({ x0: k, x1: k }); }
    if (huecos.length < palabras.length - 1) return null;
    const cortes = [...huecos].sort((a, b) => b.x1 - b.x0 - (a.x1 - a.x0)).slice(0, palabras.length - 1).sort((a, b) => a.x0 - b.x0);
    const cajas = palabras.map((_, j) => {
      const x0 = j ? cortes[j - 1].x1 + 1 : 0, x1 = j < cortes.length ? cortes[j].x0 - 1 : R.w - 1;
      let y0 = R.y + R.h, y1 = R.y - 1;
      for (let y = R.y; y < R.y + R.h; y++) for (let x = x0; x <= x1; x++) if (tinta(R.x + x, y)) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); break; }
      return { x: R.x + x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    });
    const tams = palabras.map((p, j) => { const k = medir(p, fuente, 100, 0), alto = k.sube + k.baja; return alto > 0 && cajas[j].h > 0 ? (100 * cajas[j].h) / alto : 0; });
    if (tams.some((t) => !(t > 0))) return null;
    const corridas: { palabras: string[]; tams: number[]; cajas: Caja[] }[] = [];
    palabras.forEach((p, j) => {
      const u = corridas.at(-1), base = u && u.tams[0];
      if (u && base && Math.abs(tams[j] / base - 1) < MISMO_TAMANO) { u.palabras.push(p); u.tams.push(tams[j]); u.cajas.push(cajas[j]); }
      else corridas.push({ palabras: [p], tams: [tams[j]], cajas: [cajas[j]] });
    });
    if (corridas.length > 1) varios = true;
    out.push(corridas.map((c) => {
      const t = [...c.tams].sort((a, b) => a - b)[c.tams.length >> 1];
      const x0 = Math.min(...c.cajas.map((q) => q.x)), y0 = Math.min(...c.cajas.map((q) => q.y));
      const x1 = Math.max(...c.cajas.map((q) => q.x + q.w)), y1 = Math.max(...c.cajas.map((q) => q.y + q.h));
      return { texto: c.palabras.join(" "), tam: t, caja: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
    }));
  }
  return varios ? out : null;
}

/**
 * Un texto de varios tamaños como texto de punto con un estilo por corrida: cada una con su tamaño y su track (de su
 * ancho); todas sobre la base de su renglón (la de su corrida más grande). Los espacios entre corridas son de la de
 * antes, como al escribir en Photoshop. null si algún track se sale de lo razonable (no es esa tipografía).
 */
function capaDeTramos(m: ElementoMedido, lineas: Corrida[][], fuente: string, alineacion: Alineacion, medir: MedirTinta): TextoCapa | null {
  const tramos: TextoCapa["tramos"] = [], bases: number[] = [];
  let texto = "";
  for (const [i, cs] of lineas.entries()) {
    // Un renglón de una sola palabra (sin tamaño medido) toma el del renglón de antes o el de la primera corrida.
    const tamDe = (c: Corrida) => c.tam || lineas.flat().find((q) => q.tam)?.tam || 0;
    let baseLinea = 0, mayor = 0;
    for (const [j, c] of cs.entries()) {
      const tam = tamDe(c);
      if (!(tam > 0)) return null;
      const n = [...c.texto].length, sin = medir(c.texto, fuente, tam, 0);
      const track = n > 1 ? ((c.caja.w - (sin.izq + sin.der)) * 1000) / ((n - 1) * tam) : 0;
      if (!Number.isFinite(track) || track < TRACK_MIN || track > TRACK_MAX) return null;
      if (tam > mayor) { mayor = tam; baseLinea = c.caja.y + medir(c.texto, fuente, tam, track).sube; }
      const fin = j < cs.length - 1 ? " " : i < lineas.length - 1 ? "\n" : "";
      texto += c.texto + fin;
      tramos.push({ n: c.texto.length + fin.length, fuente, tam, color: m.color!, track, interlineado: null, subir: 0, mayusculas: false });
    }
    bases.push(baseLinea);
  }
  if (lineas.length > 1) {
    const inter = (bases.at(-1)! - bases[0]) / (lineas.length - 1);
    for (const t of tramos) t.interlineado = inter;
  }
  // El origen: donde empieza la tinta del primer renglón, y el avance de ese renglón para centrar o alinear a la derecha.
  const c0 = lineas[0][0], t0 = tramos[0], k0 = medir(c0.texto, fuente, t0.tam, t0.track);
  const pluma = c0.caja.x + k0.izq;
  let avance = 0, j = 0;
  for (const c of lineas[0]) { const r = tramos[j++]; avance += medir(c.texto + (j < lineas[0].length ? " " : ""), fuente, r.tam, r.track).avance; }
  const tx = alineacion === "center" ? pluma + avance / 2 : alineacion === "right" ? pluma + avance : pluma;
  return { texto, tramos, alineacion, transform: [1, 0, 0, 1, tx, bases[0]], caja: null, motivo: null };
}

/**
 * El texto partido en los renglones que SE VEN en la imagen. La IA a veces lee en un solo renglón un titular que va en
 * dos (83ed: «¡Lleva tu DiDi Card y disfruta tus compras!», batería 2026-10-29), o al revés, y con otro número de
 * renglones ninguna tipografía cuadraba y el texto se quedaba como imagen. Se reparten sus palabras en tantos renglones
 * como midió la imagen, con los cortes que dejan el ancho de cada uno más parecido al medido. Igual si ya cuadran, o
 * si no hay palabras suficientes.
 */
export function conRenglonesDeLaImagen(m: ElementoMedido, fuente: string, medir: MedirTinta): ElementoMedido {
  const R = m.renglones, n = R.length;
  if (!n || m.texto.split("\n").length === n) return m;
  const pal = m.texto.split(/\s+/).filter(Boolean);
  if (pal.length < n) return m;
  const ancho = (a: number, b: number) => medir(pal.slice(a, b).join(" "), fuente, 100, 0).avance;
  const total = ancho(0, pal.length), meta = R.reduce((t, c) => t + c.w, 0);
  if (!(total > 0) || !(meta > 0)) return m;
  // costo[i][j]: los primeros j renglones con las primeras i palabras.
  const costo = Array.from({ length: pal.length + 1 }, () => new Array<number>(n + 1).fill(Infinity));
  const corte = Array.from({ length: pal.length + 1 }, () => new Array<number>(n + 1).fill(-1));
  costo[0][0] = 0;
  for (let j = 1; j <= n; j++)
    for (let i = j; i <= pal.length - (n - j); i++)
      for (let a = j - 1; a < i; a++) {
        if (!Number.isFinite(costo[a][j - 1])) continue;
        const c = costo[a][j - 1] + (ancho(a, i) / total - R[j - 1].w / meta) ** 2;
        if (c < costo[i][j]) { costo[i][j] = c; corte[i][j] = a; }
      }
  const lineas: string[] = [];
  for (let i = pal.length, j = n; j > 0; j--) { const a = corte[i][j]; if (a < 0) return m; lineas.unshift(pal.slice(a, i).join(" ")); i = a; }
  return { ...m, texto: lineas.join("\n") };
}

/**
 * El `TextoCapa` de un texto medido escrito con `fuente`: el tamaño sale del alto de su renglón más ancho (la orilla
 * al 50 %, como su tinta), el track de su ancho, cada base de dónde empieza su tinta, y el origen de la alineación.
 * null si no se puede (sin renglones, o la tipografía pide un track fuera de lo razonable: no es ésa). La página lo
 * prueba después contra la tinta, igual que un texto de un PSD.
 */
export function capaDeTexto(m0: ElementoMedido, fuente: string, alineacion: Alineacion, medir: MedirTinta): TextoCapa | null {
  const m = conRenglonesDeLaImagen(m0, fuente, medir);
  const lineas = m.texto.split("\n"), R = m.renglones;
  if (!m.color || !lineas.length || R.length !== lineas.length) return null;
  // Un texto con palabras de dos tamaños («$28,499» y «m.n.» más chico): un estilo por tamaño (B30).
  const tramos = tramosPorTamano(m, fuente, medir);
  const varios = tramos && capaDeTramos(m, tramos, fuente, alineacion, medir);
  if (varios) return varios;
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
