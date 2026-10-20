/**
 * HÜE Prisma › Formatos — volver a escribir el texto del PSD en el navegador (nitidez C). Sólo navegador: usa
 * <canvas>, FontFace e IndexedDB.
 *
 *   · Tipografías: las suelta la persona (.otf / .ttf, o la carpeta). Se cargan en esta pestaña y se recuerdan en
 *     ESTE navegador (IndexedDB) para el siguiente PSD. No se suben a ningún lado.
 *   · Prueba: cada texto se escribe a la medida del maestro y se compara con sus píxeles de Photoshop
 *     (`compararAlfa`). Sólo si coincide se usa; si no, esa pieza va con su texto como imagen.
 *   · `textoEscrito`: lo que `armarMedida` pide para pintar una pieza con sus letras nuevas.
 */
import type { Listo, Maquetar, Pintar } from "@/lib/prisma/formatos/cambios-texto";
import type { MaestroListo } from "@/lib/prisma/formatos/listo";
import type { Lugar, TextoEscrito } from "@/lib/prisma/formatos/nitido";
import type { TextoPieza } from "@/lib/prisma/formatos/psd";
import { TEXTO_ANCHO_TOL, TEXTO_CORRER_MAX, TEXTO_DIF_MAX, compararAlfa, fuentesDe, maquetar, type LineaTexto, type Medidor, type TramoTexto } from "@/lib/prisma/formatos/textos";

/** Una tipografía cargada: con qué familia se pide en el canvas y, si es variable, su peso (eje wght). */
type Cargada = { familia: string; peso: number | null };
export type Tipografias = ReadonlyMap<string, Cargada>;
export type ArchivoFuente = { nombre: string; datos: ArrayBuffer };

export const EXTENSIONES_FUENTE = /\.(otf|ttf)$/i;
const FUENTE_BYTES_MAX = 20_000_000;
const FUENTES_MAX = 200;
/** Lo que se lee de una sola vez (una carpeta de fuentes del sistema pesa cientos de MB). */
const FUENTES_BYTES_TOTAL = 200_000_000;
/** Lo que se guarda en este navegador, en total: con más, lo nuevo ya no se recuerda (se usa sólo en esta pestaña). */
const RECORDAR_MAX = 60;
const RECORDAR_BYTES_MAX = 100_000_000;

// Lo cargado en esta pestaña vive mientras la pestaña: volver a la pantalla no mete otra copia de cada tipografía.
const registro = new Map<string, Cargada>();
const caras: FontFace[] = [];
let familias = 0;

/** Qué archivos se leen: sólo .otf/.ttf, hasta 20 MB cada uno, 200 y 200 MB en total. Los demás, por nombre. */
export function elegirFuentes<T extends { name: string; size: number }>(archivos: T[]): { usar: T[]; omitidas: string[] } {
  const usar: T[] = [], omitidas: string[] = [];
  let total = 0;
  for (const f of archivos) {
    if (!EXTENSIONES_FUENTE.test(f.name)) continue;
    if (f.size > FUENTE_BYTES_MAX || usar.length >= FUENTES_MAX || total + f.size > FUENTES_BYTES_TOTAL) {
      omitidas.push(f.name);
      continue;
    }
    usar.push(f);
    total += f.size;
  }
  return { usar, omitidas };
}

/**
 * Carga tipografías; devuelve el mapa nuevo (lo que ya había + lo nuevo), los nombres nuevos, los archivos que no
 * sirvieron y los que sí (sólo ésos se recuerdan).
 */
export async function cargarFuentes(archivos: ArchivoFuente[], antes: Tipografias): Promise<{ mapa: Map<string, Cargada>; nuevas: string[]; malas: string[]; buenas: ArchivoFuente[] }> {
  const mapa = new Map(antes);
  const nuevas: string[] = [], malas: string[] = [], buenas: ArchivoFuente[] = [];
  for (const a of archivos.slice(0, FUENTES_MAX)) {
    try {
      if (a.datos.byteLength > FUENTE_BYTES_MAX) throw new Error("pesa demasiado");
      const nombres = fuentesDe(a.datos);
      const sinCargar = nombres.filter((f) => !registro.has(f.ps));
      if (sinCargar.length) {
        const familia = `psd-fuente-${++familias}`;
        // Una variable se carga una vez con todo el rango: el peso de cada estilo se pide con font-weight (va al eje wght).
        const cara = new FontFace(familia, a.datos, sinCargar.some((f) => f.peso !== null) ? { weight: "1 1000" } : {});
        await cara.load();
        document.fonts.add(cara);
        caras.push(cara);
        for (const f of sinCargar) registro.set(f.ps, { familia, peso: f.peso });
      }
      for (const f of nombres) {
        const c = registro.get(f.ps);
        if (!c || mapa.has(f.ps)) continue;
        mapa.set(f.ps, c);
        nuevas.push(f.ps);
      }
      buenas.push(a);
    } catch (err) {
      console.error("[formatos-psd] tipografía", a.nombre, err);
      malas.push(a.nombre);
    }
  }
  return { mapa, nuevas, malas, buenas };
}

/** Saca de la pestaña todo lo cargado (al olvidar las tipografías). */
export function soltarFuentes(): void {
  for (const c of caras) document.fonts.delete(c);
  caras.length = 0;
  registro.clear();
}

const cssDe = (t: Tipografias, tramo: TramoTexto): string | null => {
  const f = t.get(tramo.fuente);
  if (!f) return null;
  const peso = f.peso === null ? 400 : Math.min(1000, Math.max(1, Math.round(f.peso)));
  return `${peso} ${tramo.tam}px "${f.familia}"`;
};
/** El espacio entre letras: lo mismo al medir que al escribir (si no, la maqueta y la letra no coinciden). */
const espaciado = (tramo: TramoTexto) => (tramo.track ? `${(tramo.track / 1000) * tramo.tam}px` : "0px");

// ── Recordar las tipografías en este navegador ───────────────────────────
const BASE = "hue-prisma-formatos", ALMACEN = "tipografias";
/** Dos archivos con el mismo nombre en carpetas distintas (Regular.otf de dos familias) no se pisan. */
const claveDe = (a: ArchivoFuente) => `${a.nombre}:${a.datos.byteLength}`;
const esArchivo = (x: unknown): x is ArchivoFuente => !!x && typeof (x as ArchivoFuente).nombre === "string" && (x as ArchivoFuente).datos instanceof ArrayBuffer;

function abrirBase(): Promise<IDBDatabase> {
  return new Promise((ok, mal) => {
    const r = indexedDB.open(BASE, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ALMACEN);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
}
/** Una transacción en el almacén: espera a que se GUARDE de verdad (o falle) y cierra la conexión siempre. */
async function enAlmacen(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => void): Promise<void> {
  const db = await abrirBase();
  try {
    await new Promise<void>((ok, mal) => {
      const tx = db.transaction(ALMACEN, modo);
      tx.oncomplete = () => ok();
      tx.onerror = () => mal(tx.error);
      tx.onabort = () => mal(tx.error);
      fn(tx.objectStore(ALMACEN));
    });
  } finally {
    db.close();
  }
}
/** Lo que se recordó antes (vacío si el navegador no deja guardar: ventana privada, almacenamiento bloqueado). */
export async function fuentesRecordadas(): Promise<ArchivoFuente[]> {
  let out: ArchivoFuente[] = [];
  try {
    await enAlmacen("readonly", (s) => {
      const r = s.getAll();
      r.onsuccess = () => (out = (r.result as unknown[]).filter(esArchivo).filter((x) => x.datos.byteLength <= FUENTE_BYTES_MAX).slice(0, RECORDAR_MAX));
    });
  } catch (err) {
    console.error("[formatos-psd] tipografías recordadas", err);
  }
  return out;
}
/** Guarda las que cargaron bien, sin pasar los topes del almacén. false = no se pudo guardar. */
export async function recordarFuentes(archivos: ArchivoFuente[]): Promise<boolean> {
  if (!archivos.length) return true;
  try {
    await enAlmacen("readwrite", (s) => {
      const r = s.getAll();
      r.onsuccess = () => {
        const hay = (r.result as unknown[]).filter(esArchivo);
        const ya = new Set(hay.map(claveDe));
        let n = hay.length, bytes = hay.reduce((t, x) => t + x.datos.byteLength, 0);
        for (const a of archivos) {
          if (ya.has(claveDe(a))) continue;
          if (n + 1 > RECORDAR_MAX || bytes + a.datos.byteLength > RECORDAR_BYTES_MAX) break;
          s.put(a, claveDe(a));
          n++;
          bytes += a.datos.byteLength;
        }
      };
    });
    return true;
  } catch (err) {
    console.error("[formatos-psd] recordar tipografías", err);
    return false;
  }
}
/** Borra las recordadas y las saca de la pestaña. false = no se pudieron borrar del navegador. */
export async function olvidarFuentes(): Promise<boolean> {
  soltarFuentes();
  try {
    await enAlmacen("readwrite", (s) => void s.clear());
    return true;
  } catch (err) {
    console.error("[formatos-psd] olvidar tipografías", err);
    return false;
  }
}

// ── Escribir un texto en un canvas ───────────────────────────────────────

let lienzoMedir: CanvasRenderingContext2D | null = null;
const medidorDe = (t: Tipografias): Medidor => (texto, tramo) => {
  lienzoMedir ??= document.createElement("canvas").getContext("2d");
  const x = lienzoMedir;
  const css = cssDe(t, tramo);
  if (!x || !css) return { ancho: 0, sube: 0 };
  x.font = css;
  x.letterSpacing = espaciado(tramo);
  const m = x.measureText(texto);
  return { ancho: m.width, sube: m.actualBoundingBoxAscent };
};

/** Escribe las líneas con `transform` = de unidades de la capa a px del canvas (ya con la escala y el corrimiento). */
function escribir(x: CanvasRenderingContext2D, t: Tipografias, lineas: LineaTexto[], m: DOMMatrix, color: boolean): void {
  x.setTransform(m);
  x.textBaseline = "alphabetic";
  for (const l of lineas)
    for (const p of l.pedazos) {
      x.font = cssDe(t, p.tramo) ?? "";
      x.letterSpacing = espaciado(p.tramo);
      x.fillStyle = color ? `rgb(${p.tramo.color.map((v) => Math.round(v)).join(",")})` : "#000";
      x.fillText(p.texto, p.x, l.base - p.tramo.subir);
    }
  x.setTransform(1, 0, 0, 1, 0, 0);
}
const matriz = (tr: TextoPieza["texto"]["transform"], k: number, ex: number, ey: number) => new DOMMatrix([tr[0] * k, tr[1] * k, tr[2] * k, tr[3] * k, tr[4] * k + ex, tr[5] * k + ey]);

// ── La prueba y lo que usa `armarMedida` ─────────────────────────────────

/** Resultado de la prueba de un texto, para enseñar. */
export type Revision = { maestro: number; pieza: number; capa: string; ok: boolean; motivo: string | null; faltan: string[] };
/** Por maestro y pieza: sus textos listos para escribir (sólo piezas donde TODOS pasaron). */
export type Escritura = { piezas: Map<string, Listo[]>; revisiones: Revision[] };
const clavePieza = (maestro: number, pieza: number) => `${maestro}:${pieza}`;
const OTRO_COMO_IMAGEN = "otro texto de la misma pieza va como imagen, así que ésta también";

/**
 * Se escribe el texto con un margen alrededor de la tinta de Photoshop: lo nuestro que caiga FUERA (una palabra
 * que saltó a otra línea) también cuenta como diferencia. Medio alto de la tinta, entre 8 y 256 px.
 */
const margenDe = (h: number) => Math.min(256, Math.max(8, Math.round(h / 2)));

function probar(x: CanvasRenderingContext2D, lienzo: HTMLCanvasElement, tp: TextoPieza, t: Tipografias, medir: Medidor): Listo | string {
  const lineas = maquetar(tp.texto, medir);
  const { w, h } = tp.caja, M = margenDe(h);
  const W = w + 2 * M, H = h + 2 * M;
  lienzo.width = W; // cambiar el tamaño también lo borra
  lienzo.height = H;
  escribir(x, t, lineas, matriz(tp.texto.transform, 1, M - tp.caja.x, M - tp.caja.y), false);
  const px = x.getImageData(0, 0, W, H).data;
  const nuestro = new Uint8ClampedArray(W * H), ps = new Uint8ClampedArray(W * H);
  for (let i = 0; i < W * H; i++) nuestro[i] = px[i * 4 + 3];
  for (let y = 0; y < h; y++) ps.set(tp.alfa.subarray(y * w, y * w + w), (y + M) * W + M);
  const c = compararAlfa(nuestro, ps, W, H);
  if (c.dif > TEXTO_DIF_MAX || Math.abs(c.anchoRazon - 1) > TEXTO_ANCHO_TOL || Math.abs(c.dx) > TEXTO_CORRER_MAX || Math.abs(c.dy) > TEXTO_CORRER_MAX)
    return `no coincide con Photoshop (${Math.round(c.dif * 100)} % distinto)`;
  return { tp, lineas, dx: c.dx, dy: c.dy };
}

/**
 * Prueba cada texto de cada maestro con las tipografías cargadas. Sin tipografías no se prueba nada (y no se
 * escribe nada: todo va como imagen, como antes). Un texto que no se deja probar va como imagen; nunca tumba la
 * pantalla.
 */
export function revisarTextos(maestros: MaestroListo[], t: Tipografias): Escritura {
  const piezas = new Map<string, Listo[]>();
  const revisiones: Revision[] = [];
  const medir = medidorDe(t);
  const lienzo = document.createElement("canvas");
  const x = lienzo.getContext("2d", { willReadFrequently: true });
  try {
    maestros.forEach((ma, mi) =>
      ma.piezas.forEach((p, pi) => {
        if (!p.textos.length) return;
        const listos: Listo[] = [];
        const propias: Revision[] = [];
        for (const tp of p.textos) {
          const faltan = [...new Set(tp.texto.tramos.map((r) => r.fuente).filter((f) => !t.has(f)))];
          let motivo = tp.motivo ?? (faltan.length ? `falta la tipografía ${faltan.join(", ")}` : null);
          // Sin base, otro texto de la pieza no se puede redibujar: la pieza va entera como imagen (ni se prueba).
          if (!motivo && !p.base) motivo = OTRO_COMO_IMAGEN;
          if (!motivo && !x) motivo = "el navegador no dejó crear el lienzo";
          if (!motivo && x) {
            try {
              const r = probar(x, lienzo, tp, t, medir);
              if (typeof r === "string") motivo = r;
              else listos.push(r);
            } catch (err) {
              console.error("[formatos-psd] probar texto", tp.capa, err);
              motivo = "no se pudo probar en este navegador";
            }
          }
          propias.push({ maestro: mi, pieza: pi, capa: tp.capa, ok: !motivo, motivo, faltan });
        }
        if (listos.length === p.textos.length) piezas.set(clavePieza(mi, pi), listos);
        // Si uno no pasa, la pieza entera va como imagen: los que sí pasaron tampoco se escriben, y así se dice.
        else for (const r of propias) if (r.ok) Object.assign(r, { ok: false, motivo: OTRO_COMO_IMAGEN });
        revisiones.push(...propias);
      }),
    );
  } finally {
    lienzo.width = lienzo.height = 0;
  }
  return { piezas, revisiones };
}

/**
 * Escribe textos en un lienzo de w × h; `mover(s)` = de unidades de su capa a px del lienzo. RGBA premultiplicado
 * (0-255). Lanza si el navegador no da el lienzo.
 */
function pintarEn(t: Tipografias, listos: readonly Listo[], w: number, h: number, mover: (s: Listo) => DOMMatrix): Float32Array {
  const lienzo = document.createElement("canvas");
  try {
    lienzo.width = w;
    lienzo.height = h;
    const x = lienzo.getContext("2d", { willReadFrequently: true });
    if (!x) throw new Error("sin lienzo 2d");
    for (const s of listos) {
      x.globalAlpha = s.tp.opacidad;
      escribir(x, t, s.lineas, mover(s), true);
    }
    const px = x.getImageData(0, 0, w, h).data;
    const out = new Float32Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const a = px[i * 4 + 3];
      out[i * 4] = (px[i * 4] * a) / 255;
      out[i * 4 + 1] = (px[i * 4 + 1] * a) / 255;
      out[i * 4 + 2] = (px[i * 4 + 2] * a) / 255;
      out[i * 4 + 3] = a;
    }
    return out;
  } finally {
    lienzo.width = lienzo.height = 0;
  }
}

/** Para `cambiarTextos`: escribir a la escala del maestro (un rectángulo de la mesa) y maquetar con estas tipografías. */
export const pintorDe = (t: Tipografias): Pintar => (listos, x0, y0, w, h) => pintarEn(t, listos, w, h, (s) => matriz(s.tp.texto.transform, 1, s.dx - x0, s.dy - y0));
export const maquetadorDe = (t: Tipografias): Maquetar => (capa) => maquetar(capa, medidorDe(t));

/** La escritura con lo que `cambiarTextos` volvió a escribir en el maestro `maestro` (sus piezas cambiadas). */
export function escrituraCon(e: Escritura, maestro: number, listos: ReadonlyMap<number, Listo[]>): Escritura {
  if (!listos.size) return e;
  const piezas = new Map(e.piezas);
  for (const [pi, l] of listos) piezas.set(clavePieza(maestro, pi), l);
  return { ...e, piezas };
}
/** Los textos que la página escribe de una pieza (undefined = va como imagen). */
export const listosDe = (e: Escritura | null, maestro: number, pieza: number): readonly Listo[] | undefined => e?.piezas.get(clavePieza(maestro, pieza));

/**
 * Lo que `armarMedida` llama para una pieza: sus letras escritas a la escala de la medida, o null (va como imagen:
 * también si el lienzo falla, así la medida sale con el texto de Photoshop en vez de perderse). Los quitados en esta
 * medida (`sin`) no se escriben.
 */
export function textoEscrito(e: Escritura | null, maestro: number, ma: MaestroListo, t: Tipografias): TextoEscrito | undefined {
  if (!e?.piezas.size) return undefined;
  return (pieza: number, l: Lugar, parte: number | null, sin?: readonly number[]) => {
    const todos = e.piezas.get(clavePieza(maestro, pieza));
    // Una parte (pieza abierta en el editor) escribe sólo sus textos: son los mismos objetos que los de su pieza.
    const p = ma.piezas[pieza], d = parte === null ? p : p?.partes?.[parte];
    const suyos = d && todos && (parte === null ? todos : todos.filter((s) => d.textos.includes(s.tp)));
    if (!d || !suyos?.length) return null;
    const listos = sin?.length ? suyos.filter((s) => !sin.includes(p.textos.indexOf(s.tp))) : suyos;
    const w = l.x1 - l.x0, h = l.y1 - l.y0;
    try {
      // De la mesa a este rectángulo: la esquina de la caja del dibujo cae en (ox, oy); más el corrimiento de la prueba.
      return pintarEn(t, listos, w, h, (s) => matriz(s.tp.texto.transform, l.k, l.ox - l.x0 + (s.dx - d.caja.x) * l.k, l.oy - l.y0 + (s.dy - d.caja.y) * l.k));
    } catch (err) {
      console.error("[formatos-psd] escribir texto", err);
      return null;
    }
  };
}
