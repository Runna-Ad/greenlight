/**
 * HÜE Prisma › Formatos — lo que cruza del Web Worker (que lee el PSD) a la pantalla (que lo pinta). Módulo puro y
 * SIN la librería de PSD: la pantalla sólo importa de aquí, así `ag-psd` vive en el worker y no en la página.
 */
import type { ExtrasEditable, NotaCapa, PlanEditable } from "./psd-editable.ts";
import type { Caja, MaestroPsd, MotivoPsd, Origen, Rol, TextoPieza } from "./psd.ts";

/** Tope de lo que se LEE de un PSD: sus capas y su copia aplanada, ya sin los originales de los objetos inteligentes
 *  ni los filtros inteligentes (`adelgazar.ts`). El PSD real del equipo pesa 72 MB en disco y 22 MB así. */
export const PSD_BYTES_MAX = 250_000_000;
/** Si el worker no termina en este tiempo, se mata: un archivo hecho con mala intención puede colgar a la librería. */
export const LEER_MAX_MS = 120_000;
/** Mesas de trabajo que se leen de un PSD. Los topes de `psd.ts` son POR mesa: sin éste, un archivo con 200 mesas
 *  chicas en el disco y enormes en memoria tumbaría la pestaña. Los reales traen 2 o 3. */
export const MESAS_MAX = 24;
/** Hasta cuántas mesas se leen sin preguntar. Con más, la persona elige cuáles (leer menos es más rápido). */
export const MESAS_AUTO = 4;
/** Bytes de píxeles que el worker le puede pasar a la página en total (la página los vuelve a tener como lienzos).
 *  El PSD real del equipo (2 mesas) pasa ~70 MB. */
export const TRANSFERIR_MAX_BYTES = 600_000_000;
/** Tope del archivo para armar el PSD EDITABLE de una medida: se lee ENTERO (con los originales de sus objetos
 *  inteligentes, que la lectura normal quita) y el PSD que sale pesa casi lo mismo. s33 (61 MB) → 42-64 MB por medida;
 *  el worker llega a ~3-4 veces el archivo en memoria. Más grande: sale el PSD de capas planas (psd-salida.ts), con aviso. */
export const EDITABLE_MAX_BYTES = 200_000_000;
/** Topes de lo que se DECODIFICA para el PSD editable. Incluye las capas ocultas de la mesa, que la lectura normal ni
 *  mira: una capa oculta enorme tumbaría la pestaña. Por capa, el mismo tope que `psd.ts`; en total, holgado (s33:
 *  24 capas, 9 MP). */
export const EDITABLE_CAPA_MAX_PX = 48_000_000;
export const EDITABLE_PX_MAX = 150_000_000;
export const EDITABLE_CAPAS_MAX = 600;
/** Lo que pueden sumar las capas YA MOVIDAS a la medida (una capa se agranda con k²): s33 a 1080×1920 suma ~15 MP.
 *  Cada MP son 4 MB que se quedan hasta escribir el PSD, más lo que ag-psd copia al comprimir. */
export const EDITABLE_SALIDA_PX_MAX = 60_000_000;
/** Si el PSD editable no sale en este tiempo, se mata su worker y sale el de capas planas. */
export const EDITABLE_MAX_MS = 90_000;
/** Medidas por anuncio en la pantalla (cada una es un lienzo en memoria). */
export const MEDIDAS_MAX = 30;
/** Píxeles que pueden sumar todas las medidas de un anuncio. Cada una es un lienzo en memoria (4 bytes por píxel):
 *  30 medidas de 4096×4096 serían 2 GB y tumbarían la pestaña. Las 12 del equipo suman 9 MP. */
export const MEDIDAS_PX_MAX = 80_000_000;

export type PiezaLista = {
  nombre: string;
  rol: Rol | null;
  caja: Caja;
  solido: Caja;
  letraMinPx: number | null;
  /** RGBA, caja.w × caja.h: listo para `ImageData`. */
  rgba: Uint8ClampedArray;
  /** RGBA opaco, caja.w × caja.h: cuánto oscurece lo de abajo (blanco = nada). Se pinta en "multiplicar". */
  oscurece: Uint8ClampedArray | null;
  /** La pieza sin sus textos (RGBA, caja.w × caja.h), para cuando el texto se vuelve a escribir. */
  base: Uint8ClampedArray | null;
  textos: TextoPieza[];
};
export type MaestroListo = {
  nombre: string;
  w: number;
  h: number;
  /** De qué mesa del PSD salió (para el PSD editable de cada medida). Falta en maestros armados a mano (pruebas). */
  origen?: Origen;
  /** Fondo limpio, RGBA opaco, w × h. */
  fondo: Uint8ClampedArray;
  /** De abajo hacia arriba. */
  piezas: PiezaLista[];
  /** Con qué gamma mezcló Photoshop el texto (`MaestroPsd.textoGamma`). */
  textoGamma: number;
  avisos: string[];
};
/** Una mesa que no se pudo usar, con el porqué (texto para enseñar tal cual). */
export type MesaDescartada = { nombre: string; motivos: string[] };

/** Lo que la pantalla le pide al worker: leer un archivo (se manda el File, no sus bytes) o, si preguntó, las mesas elegidas. */
export type PedidoWorker = { tipo: "leer"; archivo: Blob } | { tipo: "mesas"; indices: number[] };
export type MesaElegible = { nombre: string; w: number; h: number };

export type MensajeWorker =
  | { tipo: "avance"; mesa: number; de: number }
  | { tipo: "elegir"; mesas: MesaElegible[]; sugeridas: number[] }
  | { tipo: "listo"; maestros: MaestroListo[]; descartadas: MesaDescartada[]; avisos: string[] }
  | { tipo: "error"; motivo: MotivoPsd | "desconocido"; detalle: string };

/** Lo que la tarjeta le pide al worker del PSD editable (psd-medida.worker.ts) y lo que le contesta. */
export type PedidoPsdMedida = { archivo: Blob; plan: PlanEditable; extras: ExtrasEditable };
/** `codigo`: "topes" = capas demasiado grandes para ESTA medida (otra puede salir); "archivo" = el archivo trae capas
 *  que el editable no arma en ninguna medida (en ZIP, demasiadas, muy grandes); "inseguro" = los datos de sus objetos
 *  inteligentes no se leen con seguridad; "formato" = el archivo no sigue el formato PSD exactamente; "otro" = cualquier
 *  otra falla. */
export type MensajePsdMedida = { tipo: "listo"; archivo: Blob; notas: NotaCapa[] } | { tipo: "error"; codigo: "topes" | "archivo" | "inseguro" | "formato" | "otro"; detalle: string };

/** RGB → RGBA opaco (lo que pide `ImageData`). */
function opaco(rgb: Uint8ClampedArray): Uint8ClampedArray {
  const n = Math.floor(rgb.length / 3), out = new Uint8ClampedArray(n * 4);
  for (let i = 0, j = 0; i < n * 3; i += 3, j += 4) {
    out[j] = rgb[i];
    out[j + 1] = rgb[i + 1];
    out[j + 2] = rgb[i + 2];
    out[j + 3] = 255;
  }
  return out;
}

/** Un maestro despiezado, en el formato que la pantalla pinta, los búferes que se pueden TRANSFERIR (sin copiar) y
 *  cuántos bytes de píxeles suma (para el tope de lo que cruza a la página). */
export function prepararMaestro(ma: MaestroPsd): { maestro: MaestroListo; transferibles: ArrayBufferLike[]; bytes: number } {
  const maestro: MaestroListo = {
    nombre: ma.nombre,
    w: ma.w,
    h: ma.h,
    origen: ma.origen,
    fondo: opaco(ma.fondo),
    piezas: ma.piezas.map((p) => ({ nombre: p.nombre, rol: p.rol, caja: p.caja, solido: p.solido, letraMinPx: p.letraMinPx, rgba: p.rgba, oscurece: p.oscurece ? opaco(p.oscurece) : null, base: p.base, textos: p.textos })),
    textoGamma: ma.textoGamma,
    avisos: ma.avisos,
  };
  // Un búfer repetido en la lista de transferencia tumba el postMessage: se manda cada uno una vez.
  const transferibles = [...new Set([maestro.fondo.buffer, ...maestro.piezas.flatMap((p) => [p.rgba.buffer, ...(p.oscurece ? [p.oscurece.buffer] : []), ...(p.base ? [p.base.buffer] : []), ...p.textos.map((t) => t.alfa.buffer)])])];
  const bytes = maestro.fondo.length + maestro.piezas.reduce((s, p) => s + p.rgba.length + (p.oscurece?.length ?? 0) + (p.base?.length ?? 0) + p.textos.reduce((t, x) => t + x.alfa.length, 0), 0);
  return { maestro, transferibles, bytes };
}

/** De una lista de medidas, las que caben en la pantalla (en su orden) y cuántas se quedan fuera por cantidad o por
 *  píxeles. Una medida que sola pasa del tope también se queda fuera: no se recorta ni se cambia por otra. */
export function medidasQueCaben<M extends { w: number; h: number }>(medidas: M[]): { caben: M[]; fuera: number } {
  const caben: M[] = [];
  let px = 0;
  for (const m of medidas) {
    if (caben.length >= MEDIDAS_MAX || px + m.w * m.h > MEDIDAS_PX_MAX) continue;
    caben.push(m);
    px += m.w * m.h;
  }
  return { caben, fuera: medidas.length - caben.length };
}

/** Las que se proponen marcadas cuando hay que elegir: la más grande de cada forma (una forma = misma proporción
 *  con 2 % de holgura), las de forma más común primero, hasta MESAS_AUTO. En el orden del archivo. */
export function sugerirMesas(mesas: { w: number; h: number }[]): number[] {
  const formas: { r: number; mejor: number; n: number }[] = [];
  mesas.forEach((m, i) => {
    if (!(m.w > 0 && m.h > 0)) return;
    const r = Math.log(m.w / m.h);
    const f = formas.find((x) => Math.abs(x.r - r) < 0.02);
    if (!f) return void formas.push({ r, mejor: i, n: 1 });
    f.n++;
    if (m.w * m.h > mesas[f.mejor].w * mesas[f.mejor].h) f.mejor = i;
  });
  return formas
    .sort((a, b) => b.n - a.n || a.mejor - b.mejor)
    .slice(0, MESAS_AUTO)
    .map((f) => f.mejor)
    .sort((a, b) => a - b);
}
