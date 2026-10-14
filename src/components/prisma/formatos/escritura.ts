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
import type { MaestroListo } from "@/lib/prisma/formatos/listo";
import type { Lugar, TextoEscrito } from "@/lib/prisma/formatos/nitido";
import type { TextoPieza } from "@/lib/prisma/formatos/psd";
import { TEXTO_CORRER_MAX, TEXTO_DIF_MAX, compararAlfa, fuentesDe, maquetar, type LineaTexto, type Medidor, type TramoTexto } from "@/lib/prisma/formatos/textos";

/** Una tipografía cargada: con qué familia se pide en el canvas y, si es variable, su peso (eje wght). */
type Cargada = { familia: string; peso: number | null };
export type Tipografias = ReadonlyMap<string, Cargada>;

export const EXTENSIONES_FUENTE = /\.(otf|ttf)$/i;
const FUENTE_BYTES_MAX = 20_000_000;
const FUENTES_MAX = 200;
let familias = 0;

/** Carga archivos de tipografía; devuelve el mapa nuevo (lo que ya había + lo nuevo) y los archivos que no sirvieron. */
export async function cargarFuentes(archivos: { nombre: string; datos: ArrayBuffer }[], antes: Tipografias): Promise<{ mapa: Map<string, Cargada>; nuevas: string[]; malas: string[] }> {
  const mapa = new Map(antes);
  const nuevas: string[] = [], malas: string[] = [];
  for (const a of archivos.slice(0, FUENTES_MAX)) {
    try {
      if (a.datos.byteLength > FUENTE_BYTES_MAX) throw new Error("pesa demasiado");
      const nombres = fuentesDe(a.datos).filter((f) => !mapa.has(f.ps));
      if (!nombres.length) continue;
      const variable = nombres.some((f) => f.peso !== null);
      const familia = `psd-fuente-${++familias}`;
      // Una variable se carga una vez con todo el rango: el peso de cada estilo se pide con font-weight (va al eje wght).
      const cara = new FontFace(familia, a.datos, variable ? { weight: "1 1000" } : {});
      await cara.load();
      document.fonts.add(cara);
      for (const f of nombres) {
        mapa.set(f.ps, { familia, peso: f.peso });
        nuevas.push(f.ps);
      }
    } catch (err) {
      console.error("[formatos-psd] tipografía", a.nombre, err);
      malas.push(a.nombre);
    }
  }
  return { mapa, nuevas, malas };
}

const cssDe = (t: Tipografias, tramo: TramoTexto): string | null => {
  const f = t.get(tramo.fuente);
  if (!f) return null;
  const peso = f.peso === null ? 400 : Math.min(1000, Math.max(1, Math.round(f.peso)));
  return `${peso} ${tramo.tam}px "${f.familia}"`;
};

// ── Recordar las tipografías en este navegador ───────────────────────────
const BASE = "hue-prisma-formatos", ALMACEN = "tipografias";
function abrirBase(): Promise<IDBDatabase> {
  return new Promise((ok, mal) => {
    const r = indexedDB.open(BASE, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ALMACEN);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
}
/** Lo que se recordó antes (vacío si el navegador no deja guardar: ventana privada, almacenamiento bloqueado). */
export async function fuentesRecordadas(): Promise<{ nombre: string; datos: ArrayBuffer }[]> {
  try {
    const db = await abrirBase();
    return await new Promise((ok) => {
      const r = db.transaction(ALMACEN).objectStore(ALMACEN).getAll();
      r.onsuccess = () => ok((r.result as { nombre: string; datos: ArrayBuffer }[]).filter((x) => x && typeof x.nombre === "string" && x.datos instanceof ArrayBuffer));
      r.onerror = () => ok([]);
    });
  } catch {
    return [];
  }
}
export async function recordarFuentes(archivos: { nombre: string; datos: ArrayBuffer }[]): Promise<void> {
  try {
    const db = await abrirBase();
    const tx = db.transaction(ALMACEN, "readwrite");
    for (const a of archivos) tx.objectStore(ALMACEN).put(a, a.nombre);
  } catch {
    /* sin almacenamiento: se usan sólo en esta pestaña */
  }
}
export async function olvidarFuentes(): Promise<void> {
  try {
    const db = await abrirBase();
    db.transaction(ALMACEN, "readwrite").objectStore(ALMACEN).clear();
  } catch {
    /* nada que olvidar */
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
  x.letterSpacing = tramo.track ? `${(tramo.track / 1000) * tramo.tam}px` : "0px";
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
      x.letterSpacing = p.tramo.track ? `${(p.tramo.track / 1000) * p.tramo.tam}px` : "0px";
      x.fillStyle = color ? `rgb(${p.tramo.color.map((v) => Math.round(v)).join(",")})` : "#000";
      x.fillText(p.texto, p.x, l.base - p.tramo.subir);
    }
  x.setTransform(1, 0, 0, 1, 0, 0);
}
const matriz = (tr: TextoPieza["texto"]["transform"], k: number, ex: number, ey: number) => new DOMMatrix([tr[0] * k, tr[1] * k, tr[2] * k, tr[3] * k, tr[4] * k + ex, tr[5] * k + ey]);

// ── La prueba y lo que usa `armarMedida` ─────────────────────────────────

/** Un texto que pasó la prueba: sus líneas y cuánto se corrió para empatar con Photoshop (px del maestro). */
type Listo = { tp: TextoPieza; lineas: LineaTexto[]; dx: number; dy: number };
/** Resultado de la prueba de un texto, para enseñar. */
export type Revision = { maestro: number; pieza: number; capa: string; ok: boolean; motivo: string | null; faltan: string[] };
/** Por maestro y pieza: sus textos listos para escribir (sólo piezas donde TODOS pasaron). */
export type Escritura = { piezas: Map<string, Listo[]>; revisiones: Revision[] };

/**
 * Prueba cada texto de cada maestro con las tipografías cargadas. Sin tipografías no se prueba nada (y no se
 * escribe nada: todo va como imagen, como antes).
 */
export function revisarTextos(maestros: MaestroListo[], t: Tipografias): Escritura {
  const piezas = new Map<string, Listo[]>();
  const revisiones: Revision[] = [];
  const medir = medidorDe(t);
  const lienzo = document.createElement("canvas");
  const x = lienzo.getContext("2d", { willReadFrequently: true });
  maestros.forEach((ma, mi) =>
    ma.piezas.forEach((p, pi) => {
      if (!p.textos.length) return;
      const listos: Listo[] = [];
      for (const tp of p.textos) {
        const faltan = [...new Set(tp.texto.tramos.map((r) => r.fuente).filter((f) => !t.has(f)))];
        let motivo = tp.motivo ?? (faltan.length ? `falta la tipografía ${faltan.join(", ")}` : null);
        if (!motivo && !x) motivo = "el navegador no dejó crear el lienzo";
        if (!motivo && x) {
          const lineas = maquetar(tp.texto, medir);
          const { w, h } = tp.caja;
          lienzo.width = w;
          lienzo.height = h;
          x.clearRect(0, 0, w, h);
          escribir(x, t, lineas, matriz(tp.texto.transform, 1, -tp.caja.x, -tp.caja.y), false);
          const px = x.getImageData(0, 0, w, h).data;
          const nuestro = new Uint8ClampedArray(w * h);
          for (let i = 0; i < w * h; i++) nuestro[i] = px[i * 4 + 3];
          const c = compararAlfa(nuestro, tp.alfa, w, h);
          if (c.dif > TEXTO_DIF_MAX || Math.abs(c.anchoRazon - 1) > 0.03 || Math.abs(c.dx) > TEXTO_CORRER_MAX || Math.abs(c.dy) > TEXTO_CORRER_MAX)
            motivo = `no coincide con Photoshop (${Math.round(c.dif * 100)} % distinto)`;
          else listos.push({ tp, lineas, dx: c.dx, dy: c.dy });
        }
        revisiones.push({ maestro: mi, pieza: pi, capa: tp.capa, ok: !motivo, motivo, faltan });
      }
      if (p.base && listos.length === p.textos.length) piezas.set(`${mi}:${pi}`, listos);
    }),
  );
  return { piezas, revisiones };
}

/** Lo que `armarMedida` llama para una pieza: sus letras escritas a la escala de la medida, o null (va como imagen). */
export function textoEscrito(e: Escritura | null, maestro: number, ma: MaestroListo, t: Tipografias): TextoEscrito | undefined {
  if (!e?.piezas.size) return undefined;
  return (pieza: number, l: Lugar) => {
    const listos = e.piezas.get(`${maestro}:${pieza}`);
    if (!listos) return null;
    const w = l.x1 - l.x0, h = l.y1 - l.y0;
    const lienzo = document.createElement("canvas");
    lienzo.width = w;
    lienzo.height = h;
    const x = lienzo.getContext("2d", { willReadFrequently: true });
    if (!x) return null;
    const caja = ma.piezas[pieza].caja;
    for (const s of listos) {
      x.globalAlpha = s.tp.opacidad;
      // De la mesa a este rectángulo: la esquina de la caja de la pieza cae en (ox, oy); más el corrimiento de la prueba.
      escribir(x, t, s.lineas, matriz(s.tp.texto.transform, l.k, l.ox - l.x0 + (s.dx - caja.x) * l.k, l.oy - l.y0 + (s.dy - caja.y) * l.k), true);
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
    lienzo.width = lienzo.height = 0;
    return out;
  };
}
