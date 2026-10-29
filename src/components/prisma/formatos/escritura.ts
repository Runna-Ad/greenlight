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
import type { MaestroListo, PiezaLista } from "@/lib/prisma/formatos/listo";
import type { Lugar, TextoEscrito, TextosVivos } from "@/lib/prisma/formatos/nitido";
import type { TextoPieza } from "@/lib/prisma/formatos/psd";
import { legalDelPsd } from "@/lib/prisma/formatos/legal";
import { conRenglones, legalParaRenglones, type LegalRenglones, type SinRenglones } from "@/lib/prisma/formatos/renglones";
import type { Renglonero } from "@/lib/prisma/formatos/revisar";
import { TEXTO_ANCHO_TOL, TEXTO_CORRER_MAX, TEXTO_DIF_MAX, TEXTO_DIF_MAX_PLANO, compararAlfa, fuentesDe, maquetar, type LineaTexto, type Medidor, type TextoCapa, type TramoTexto } from "@/lib/prisma/formatos/textos";
import { alineacionDe, capaDeLegal, capaDeTexto, capaEnCaja, TRACK_RAZONABLE, type ElementoMedido, type MedirTinta } from "@/lib/prisma/formatos/plano";

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

/** Escribe el texto en negro con un margen alrededor de su tinta original y compara las dos (`compararAlfa`). */
function compararCon(x: CanvasRenderingContext2D, lienzo: HTMLCanvasElement, tp: TextoPieza, t: Tipografias, medir: Medidor) {
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
  return { lineas, c: compararAlfa(nuestro, ps, W, H) };
}
const pasa = (c: ReturnType<typeof compararAlfa>, difMax = TEXTO_DIF_MAX) =>
  c.dif <= difMax && Math.abs(c.anchoRazon - 1) <= TEXTO_ANCHO_TOL && Math.abs(c.dx) <= TEXTO_CORRER_MAX && Math.abs(c.dy) <= TEXTO_CORRER_MAX;

function probar(x: CanvasRenderingContext2D, lienzo: HTMLCanvasElement, tp: TextoPieza, t: Tipografias, medir: Medidor): Listo | string {
  const { lineas, c } = compararCon(x, lienzo, tp, t, medir);
  if (tp.sinPrueba) return { tp, lineas, dx: 0, dy: 0 };
  if (!pasa(c, tp.difMax)) return `no coincide con ${tp.difMax === undefined ? "Photoshop" : "la imagen"} (${Math.round(c.dif * 100)} % distinto)`;
  return { tp, lineas, dx: c.dx, dy: c.dy };
}

// ── Imagen plana (B28): qué tipografía del cliente es la de cada texto ────

/** Estilos que no se le ponen al legal de una imagen plana. */
const LEGAL_NO = /italic|oblique|thin|hairline|extralight|ultralight/i;
/** Tipografías que se prueban por texto, a lo más (cada una escribe el texto y lo compara). */
const FUENTES_PLANO_MAX = 80;
/** Las que mejor empataron se vuelven a probar corridas a cuartos de píxel (24 pruebas más cada una). */
const FUENTES_AFINAR = 3;
const CORRER_FINO = [-0.5, -0.25, 0, 0.25, 0.5];
/** Lo que se sabe de cada texto de una imagen plana: con qué tipografía empata mejor (`ok` = pasa la prueba) y cuánto
 *  difiere de su tinta; `fuente` null = no había tipografías del cliente con qué probar. */
/** `aproximado`: ninguna tipografía empató, pero se reescribe con la más parecida (todo texto se edita: Pedro,
 *  2026-10-29, "the texts need to be guaranteed editable"); la persona revisa que se vea bien. */
export type NotaTextoPlano = { id: string; fuente: string | null; dif: number | null; ok: boolean; legal?: boolean; aproximado?: boolean };

/**
 * Para cada texto de una imagen plana, la tipografía cargada que mejor empata con su tinta y su `TextoCapa`
 * (`capaDeTexto`), con la MISMA prueba que un texto de un PSD (`compararCon` + `pasa`) pero con su tope de imagen plana
 * (`TEXTO_DIF_MAX_PLANO`, el mismo que lleva su `TextoPieza`). Los que no empatan con ninguna van igual en `capas`,
 * con la más parecida (`aproximado`): la persona decide si se quedan como imagen.
 */
export function ajustarTextosPlano(medidos: readonly ElementoMedido[], W: number, t: Tipografias): { capas: Map<string, TextoCapa>; notas: NotaTextoPlano[] } {
  const capas = new Map<string, TextoCapa>(), notas: NotaTextoPlano[] = [];
  const fuentes = [...t.keys()].slice(0, FUENTES_PLANO_MAX);
  lienzoMedir ??= document.createElement("canvas").getContext("2d");
  const lm = lienzoMedir;
  const medirTinta: MedirTinta = (texto, fuente, tam, track) => {
    const tramo: TramoTexto = { n: texto.length, fuente, tam, color: [0, 0, 0], track, interlineado: null, subir: 0, mayusculas: false };
    const css = cssDe(t, tramo);
    if (!lm || !css) return { avance: 0, izq: 0, der: 0, sube: 0, baja: 0 };
    lm.font = css;
    lm.letterSpacing = espaciado(tramo);
    const k = lm.measureText(texto);
    return { avance: k.width, izq: k.actualBoundingBoxLeft, der: k.actualBoundingBoxRight, sube: k.actualBoundingBoxAscent, baja: k.actualBoundingBoxDescent };
  };
  const medir = medidorDe(t);
  const lienzo = document.createElement("canvas");
  const x = lienzo.getContext("2d", { willReadFrequently: true });
  /** El texto como párrafo en su caja (`capaEnCaja`) con la tipografía firme (ni cursiva ni delgada) que menos se aparta. */
  const enCaja = <P extends { dif: number }>(m: ElementoMedido, al: ReturnType<typeof alineacionDe>, probar: (capa: TextoCapa, fuente: string) => P): P | null => {
    let mejor: P | null = null;
    for (const fuente of fuentes.filter((f) => !LEGAL_NO.test(f))) {
      const capa = capaEnCaja(m, fuente, al, medirTinta);
      if (!capa) continue;
      const q = probar(capa, fuente);
      if (!mejor || q.dif < mejor.dif) mejor = q;
    }
    return mejor;
  };
  // El legal (B30): el texto del FOOTER con más letras. Va siempre reescrito, en una caja que se vuelve a partir
  // (`capaDeLegal`), con la tipografía que más se le parece aunque no empate letra por letra.
  const legalId = medidos.filter((m) => m.tipo === "texto" && m.rol === "FOOTER").sort((a, b) => b.texto.length - a.texto.length)[0]?.id ?? null;
  try {
    for (const m of medidos) {
      if (m.tipo !== "texto") continue;
      const al = alineacionDe(m, W, medidos);
      if (m.id === legalId) {
        let mejor: { capa: TextoCapa; fuente: string; dif: number } | null = null;
        if (x)
          try {
            // Ni cursivas ni las muy delgadas: en una letra chica y gris «empatan» por lo pálidas, pero el legal tiene
            // que leerse (la imagen del iPhone de DiDi elegía DiDiSans-Pro-Thin, 2026-10-28).
            for (const fuente of fuentes.filter((f) => !LEGAL_NO.test(f))) {
              const capa = capaDeLegal(m, fuente, al, medirTinta);
              if (!capa) continue;
              const { c } = compararCon(x, lienzo, { capa: m.id, texto: capa, opacidad: 1, caja: m.pinta, alfa: m.alfa, motivo: null, ruta: [] }, t, medir);
              if (!mejor || c.dif < mejor.dif) mejor = { capa, fuente, dif: c.dif };
            }
          } catch (err) {
            console.error("[formatos-psd] probar el legal de imagen plana", err);
            mejor = null;
          }
        if (x && (!mejor || mejor.capa.tramos.some((r) => Math.abs(r.track) > TRACK_RAZONABLE)))
          mejor = enCaja(m, al, (capa, fuente) => { const { c } = compararCon(x, lienzo, { capa: m.id, texto: capa, opacidad: 1, caja: m.pinta, alfa: m.alfa, motivo: null, ruta: [] }, t, medir); return { capa, fuente, dif: c.dif }; }) ?? mejor;
        if (mejor) capas.set(m.id, mejor.capa);
        notas.push({ id: m.id, fuente: mejor?.fuente ?? null, dif: mejor?.dif ?? null, ok: !!mejor, legal: true });
        continue;
      }
      type Prueba = { capa: TextoCapa; fuente: string; dif: number; ok: boolean };
      const probarCapa = (ctx: CanvasRenderingContext2D, capa: TextoCapa, fuente: string): Prueba => {
        const { c } = compararCon(ctx, lienzo, { capa: m.id, texto: capa, opacidad: 1, caja: m.pinta, alfa: m.alfa, motivo: null, ruta: [] }, t, medir);
        return { capa, fuente, dif: c.dif, ok: pasa(c, TEXTO_DIF_MAX_PLANO) };
      };
      const mejorQue = (a: Prueba, b: Prueba | null) => !b || (a.ok && !b.ok) || (a.ok === b.ok && a.dif < b.dif);
      const pruebas: Prueba[] = [];
      let mejor: Prueba | null = null;
      // Un texto que no se deja probar (sin memoria para el lienzo, una tipografía rota) va como imagen; los demás
      // siguen y la revisión no se queda «Probando…».
      if (x)
        try {
          for (const fuente of fuentes) {
            const capa = capaDeTexto(m, fuente, al, medirTinta);
            if (capa) pruebas.push(probarCapa(x, capa, fuente));
          }
          // La prueba corre el texto a píxeles enteros; en letra chica medio píxel pesa casi como un grosor de más (el
          // laboratorio probaba a cuartos de píxel). Las que mejor quedaron se prueban corridas un poco: primero a lo
          // ancho y luego a lo alto desde el mejor (8 pruebas, no 24).
          pruebas.sort((a, b) => a.dif - b.dif);
          for (const p of pruebas.slice(0, FUENTES_AFINAR)) {
            let suya = p;
            for (const eje of [4, 5] as const)
              for (const paso of CORRER_FINO) {
                if (!paso) continue;
                const tr = [...suya.capa.transform] as TextoCapa["transform"];
                tr[eje] = p.capa.transform[eje] + paso;
                const q = probarCapa(x, { ...suya.capa, transform: tr }, p.fuente);
                if (mejorQue(q, suya)) suya = q;
              }
            if (mejorQue(suya, mejor)) mejor = suya;
          }
        } catch (err) {
          console.error("[formatos-psd] probar texto de imagen plana", err);
          mejor = null;
        }
      // Si ninguna empata, la más parecida que no sea cursiva ni muy delgada: en letras que no empatan, ésas «se
      // parecen» por pálidas (como en el legal), y el texto tiene que leerse.
      if (mejor && !mejor.ok) {
        const firme = pruebas.filter((p) => !LEGAL_NO.test(p.fuente)).sort((a, b) => a.dif - b.dif)[0];
        if (firme && LEGAL_NO.test(mejor.fuente)) mejor = firme;
      }
      // Sin ninguna que se deje acomodar renglón por renglón, la del legal (un tamaño en una caja), que casi siempre sale.
      if (!mejor && x)
        try {
          for (const fuente of fuentes.filter((f) => !LEGAL_NO.test(f))) {
            const capa = capaDeLegal(m, fuente, al, medirTinta);
            if (!capa) continue;
            const q = probarCapa(x, capa, fuente);
            if (mejorQue(q, mejor)) mejor = q;
          }
        } catch (err) {
          console.error("[formatos-psd] texto de imagen plana en caja", err);
        }
      // Y si lo más parecido trae un track absurdo (renglones mal medidos), el texto como párrafo en su caja.
      if (x && (!mejor || (!mejor.ok && mejor.capa.tramos.some((r) => Math.abs(r.track) > TRACK_RAZONABLE))))
        mejor = enCaja(m, al, (capa, fuente) => probarCapa(x, capa, fuente)) ?? mejor;
      if (mejor) capas.set(m.id, mejor.capa);
      notas.push({ id: m.id, fuente: mejor?.fuente ?? null, dif: mejor?.dif ?? null, ok: !!mejor?.ok, ...(mejor && !mejor.ok ? { aproximado: true } : {}) });
    }
  } finally {
    lienzo.width = lienzo.height = 0;
  }
  return { capas, notas };
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
    const r = listosDelDibujo(e, maestro, ma, pieza, parte, sin);
    if (!r) return null;
    const w = l.x1 - l.x0, h = l.y1 - l.y0;
    try {
      return pintarEn(t, r.listos, w, h, (s) => matriz(s.tp.texto.transform, l.k, ...esquinaDe(s, r.caja, l)));
    } catch (err) {
      console.error("[formatos-psd] escribir texto", err);
      return null;
    }
  };
}

/** Los textos listos de un dibujo (la pieza, o una de sus partes) menos los quitados en esta medida; null = el dibujo
 *  no tiene textos que escribir (va con sus letras como imagen). */
function listosDelDibujo(e: Escritura, maestro: number, ma: MaestroListo, pieza: number, parte: number | null, sin?: readonly number[]) {
  const todos = e.piezas.get(clavePieza(maestro, pieza));
  // Una parte (pieza abierta en el editor) escribe sólo sus textos: son los mismos objetos que los de su pieza.
  const p = ma.piezas[pieza], d = parte === null ? p : p?.partes?.[parte];
  const suyos = d && todos && (parte === null ? todos : todos.filter((s) => d.textos.includes(s.tp)));
  if (!d || !suyos?.length) return null;
  const quitado = (s: Listo) => !!sin?.includes(p.textos.indexOf(s.tp));
  return { caja: d.caja, suyos, quitado, listos: sin?.length ? suyos.filter((s) => !quitado(s)) : suyos };
}
/** De la mesa al rectángulo de `Lugar`: la esquina de la caja del dibujo cae en (ox, oy); más el corrimiento de la
 *  prueba. Sin restar la esquina del rectángulo (`absoluto`) queda en px de la medida. */
const esquinaDe = (s: Listo, caja: { x: number; y: number }, l: Lugar, absoluto = false): [number, number] => [
  l.ox - (absoluto ? 0 : l.x0) + (s.dx - caja.x) * l.k,
  l.oy - (absoluto ? 0 : l.y0) + (s.dy - caja.y) * l.k,
];

/**
 * Para el PSD por medida de una imagen plana (B28): cada texto del dibujo por separado, con su tinta (lo que se ve
 * hasta que Photoshop lo vuelva a dibujar) y su `TextoCapa` puesto en la medida, para escribirlo como capa de texto
 * vivo. Mismo lugar que `textoEscrito`; null = va como imagen (también si el lienzo falla). Los quitados en esta
 * medida también van, marcados `oculto` (el PSD editable los deja apagados).
 */
export function textosVivos(e: Escritura | null, maestro: number, ma: MaestroListo, t: Tipografias): TextosVivos | undefined {
  if (!e?.piezas.size) return undefined;
  return (pieza: number, l: Lugar, parte: number | null, sin?: readonly number[]) => {
    const r = listosDelDibujo(e, maestro, ma, pieza, parte, sin);
    if (!r) return null;
    const w = l.x1 - l.x0, h = l.y1 - l.y0;
    try {
      return r.suyos.map((s) => {
        const [a, b, c, d, tx, ty] = s.tp.texto.transform, [ex, ey] = esquinaDe(s, r.caja, l, true);
        return {
          nombre: s.tp.capa,
          px: pintarEn(t, [s], w, h, (u) => matriz(u.tp.texto.transform, l.k, ...esquinaDe(u, r.caja, l))),
          texto: { ...s.tp.texto, transform: [a * l.k, b * l.k, c * l.k, d * l.k, tx * l.k + ex, ty * l.k + ey] },
          oculto: r.quitado(s),
        };
      });
    } catch (err) {
      console.error("[formatos-psd] texto vivo", err);
      return null;
    }
  };
}

// ── El legal en otros renglones (B27) ────────────────────────────────────

/** Los renglones del legal de cada maestro con esta escritura y estas tipografías: `de` para `revisarMedida`, por qué no
 *  se puede (null = sí) y la escritura de una versión del maestro (la de su maestro, con el legal nuevo). */
export type Renglones<M extends MaestroListo = MaestroListo> = {
  de: (mi: number) => Renglonero<M> | null;
  porQueNo: (mi: number) => SinRenglones | null;
  escrituraDe: (ma: MaestroListo) => Escritura | null;
  /** La pieza del legal de cada maestro, sin tipografías (`legalDelPsd`); null si no trae. */
  legal: (mi: number) => number | null;
};
type PieUsado = { pieza: PiezaLista; listos: Map<number, Listo[]> } | null;
/** El pie en otros renglones, por la pieza del legal, las tipografías y el legal tal como lo escribe la página (su
 *  `Listo`): el mismo objeto mientras ninguno cambie. Así no se vuelve a pintar cuando cambia OTRO texto (el editor
 *  deriva el maestro en cada pausa al teclear) ni cuando la escritura es otro objeto con lo mismo. Pintar cuesta. */
const pies = new WeakMap<PiezaLista, WeakMap<Tipografias, WeakMap<Listo, Map<number, PieUsado>>>>();
/** La versión de cada maestro con ese pie (el mismo objeto cada vez: lo de `revisarMedida` se guarda por él). Por el
 *  pie, no por `n`: con otras tipografías el pie es otro y la versión también. */
const versiones = new WeakMap<MaestroListo, WeakMap<NonNullable<PieUsado>, MaestroListo>>();
/** Cuántas veces falló cada versión (por el mismo mapa de `pies`): a la segunda ya no se intenta. */
const fallas = new WeakMap<Map<number, PieUsado>, Map<number, number>>();
const escriturasDe = new WeakMap<MaestroListo, Escritura>();

export function renglonesDe<M extends MaestroListo>(maestros: readonly M[], e: Escritura | null, t: Tipografias): Renglones<M> {
  // Qué legal y con qué `Listo`, una vez por maestro en cada `renglonesDe` (es poco trabajo).
  const hechos = new Map<number, { info: LegalRenglones | { no: SinRenglones }; listo: Listo | null }>();
  const legales = new Map<number, number | null>();
  const legal = (mi: number) => {
    if (!legales.has(mi)) {
      const ma = maestros[mi];
      legales.set(mi, ma ? (legalDelPsd([ma])[0]?.pieza ?? null) : null);
    }
    return legales.get(mi) ?? null;
  };
  const de = (mi: number) => {
    const ma = maestros[mi];
    if (!ma || !e) return null;
    const ya = hechos.get(mi);
    if (ya) return ya;
    let info: LegalRenglones | { no: SinRenglones };
    try {
      info = legalParaRenglones(ma, (p) => listosDe(e, mi, p));
    } catch (err) {
      // Algo raro del PSD: el legal se queda como viene (no se cae la medida).
      console.error("[formatos-psd] legal en otros renglones", err);
      info = { no: "partes" };
    }
    const listo = "no" in info ? null : (listosDe(e, mi, info.pieza)?.find((x) => x.tp === ma.piezas[info.pieza].textos[info.j]) ?? null);
    const v = { info, listo };
    hechos.set(mi, v);
    return v;
  };
  const version = (mi: number, legal: LegalRenglones, listo: Listo, n: number): M | null => {
    const ma = maestros[mi];
    const pieza = ma.piezas[legal.pieza];
    let porT = pies.get(pieza);
    if (!porT) pies.set(pieza, (porT = new WeakMap()));
    let porL = porT.get(t);
    if (!porL) porT.set(t, (porL = new WeakMap()));
    let porNP = porL.get(listo);
    if (!porNP) porL.set(listo, (porNP = new Map()));
    try {
      let pie = porNP.get(n), recien: MaestroListo | null = null;
      if (pie === undefined) {
        const r = e ? conRenglones(ma, legal, n, listo, maquetadorDe(t), pintorDe(t)) : null;
        pie = r && { pieza: r.maestro.piezas[legal.pieza], listos: r.listos };
        porNP.set(n, pie);
        recien = r?.maestro ?? null;
      }
      if (!pie) return null;
      let porPie = versiones.get(ma);
      if (!porPie) versiones.set(ma, (porPie = new WeakMap()));
      const ya = porPie.get(pie);
      if (ya) return ya as M;
      const usado = pie, hecha = recien ?? { ...ma, piezas: ma.piezas.map((q, i) => (i === legal.pieza ? usado.pieza : q)) };
      porPie.set(pie, hecha);
      if (e) escriturasDe.set(hecha, escrituraCon(e, mi, usado.listos));
      return hecha as M;
    } catch (err) {
      // Sin esa versión, la medida sale con el legal del PSD (no sin medida). No se recuerda: puede ser pasajero (el
      // navegador sin memoria para el lienzo) y la próxima vez saldría.
      console.error("[formatos-psd] legal en otros renglones", err);
      // Una vez puede ser pasajero; dos, ya no: se recuerda que no sale (si no, se volvería a pintar en cada medida).
      let f = fallas.get(porNP);
      if (!f) fallas.set(porNP, (f = new Map()));
      const veces = (f.get(n) ?? 0) + 1;
      f.set(n, veces);
      if (veces >= 2) porNP.set(n, null);
      else porNP.delete(n);
      return null;
    }
  };
  return {
    de: (mi) => {
      const v = de(mi);
      if (!v || "no" in v.info || !v.listo) return null;
      const legal = v.info, listo = v.listo;
      return { pieza: legal.pieza, psd: legal.psd, de: (n) => version(mi, legal, listo, n) };
    },
    porQueNo: (mi) => {
      const v = de(mi);
      // Sin escritura todavía: un PSD sin legal no espera ninguna tipografía.
      if (!v) return maestros[mi] && legal(mi) === null ? "sin-legal" : "tipografia";
      return !("no" in v.info) && !v.listo ? "tipografia" : "no" in v.info ? v.info.no : null;
    },
    escrituraDe: (ma) => escriturasDe.get(ma) ?? e,
    legal,
  };
}
