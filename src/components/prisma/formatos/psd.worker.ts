/**
 * HÜE Prisma › Formatos — Web Worker que lee el PSD. Corre FUERA del hilo de la página: un Photoshop de 70 MB tarda
 * segundos y la pantalla no se congela; y si un archivo cuelga a la librería, la página lo mata con un reloj
 * (LEER_MAX_MS). El PSD nunca sale del navegador.
 *
 * 1. "leer": recibe el File (no sus bytes: el archivo puede pesar más que la memoria que conviene gastar), le quita
 *    lo que no se usa (`adelgazar.ts`) y lee su estructura.
 * 2. Con hasta MESAS_AUTO mesas, las despieza todas. Con más, le pregunta a la página cuáles ("elegir") y espera
 *    "mesas" con los índices.
 * 3. Si alguna mesa elegida no trae carpeta de fondo (ni dentro de otras carpetas), le pregunta a la página cuál de
 *    sus piezas es ("fondo") y espera "fondos" (Pedro, 2026-10-30: que no se trabe, que pregunte). Sin volver a leer.
 */
import { ES_PSB, ErrorPsd, despiezar, despieceUsable, esVersionPsd, leerPsd, pesaDemasiado, piezasDeMesa, tieneFondo, type DocPsd, type MotivoPsd } from "@/lib/prisma/formatos/psd";
import { MESAS_AUTO, MESAS_MAX, PSD_BYTES_MAX, TRANSFERIR_MAX_BYTES, prepararMaestro, sugerirMesas, type MaestroListo, type MensajeWorker, type MesaDescartada, type MesaSinFondo, type PedidoWorker } from "@/lib/prisma/formatos/listo";
import { PsdPesado, adelgazarPsd } from "@/lib/prisma/formatos/adelgazar";

// tsconfig compila con la librería del DOM, no la de workers: se tipa sólo lo que se usa.
const hilo = self as unknown as { onmessage: ((e: MessageEvent<PedidoWorker>) => void) | null; postMessage(m: MensajeWorker, transferir?: Transferable[]): void };

/** El documento leído, mientras la persona elige mesas o el fondo de las que no lo traen. */
let doc: DocPsd | null = null;
/** Las mesas elegidas, mientras la persona elige el fondo. */
let pendientes: number[] | null = null;

/** Antes de despiezar: si a alguna mesa le falta el fondo, se pregunta cuál de sus piezas es. */
function seguir(d: DocPsd, indices: number[]): void {
  const sinFondo = indices
    .slice(0, MESAS_MAX)
    .filter((i) => !tieneFondo(d, i))
    .map((i): MesaSinFondo => ({ indice: i, nombre: d.mesas[i].nombre, piezas: piezasDeMesa(d, i).reverse() }))
    .filter((m) => m.piezas.length);
  if (!sinFondo.length) return entregar(d, indices, {});
  doc = d;
  pendientes = indices;
  hilo.postMessage({ tipo: "fondo", mesas: sinFondo });
}

function entregar(d: DocPsd, indices: number[], fondos: Record<number, string[]>): void {
  const maestros: MaestroListo[] = [];
  const descartadas: MesaDescartada[] = [];
  const transferir: Transferable[] = [];
  const tropiezos: { motivo: MotivoPsd; detalle: string }[] = [];
  let bytes = 0;
  indices.forEach((i, n) => {
    const mesa = d.mesas[i];
    // Topes del TOTAL (los de psd.ts son por mesa): ni más mesas ni más píxeles de los que la página aguanta.
    if (n >= MESAS_MAX) return void descartadas.push({ nombre: mesa.nombre, motivos: [`Se eligieron más de ${MESAS_MAX} artboards: éste no se leyó.`] });
    hilo.postMessage({ tipo: "avance", mesa: n + 1, de: Math.min(indices.length, MESAS_MAX) });
    // Una mesa que no se deja separar no tumba a las demás: se anota con su porqué.
    try {
      const ma = despiezar(d, i, { fondo: fondos[i] });
      const uso = despieceUsable(ma);
      if (!uso.ok) return void descartadas.push({ nombre: ma.nombre || mesa.nombre, motivos: uso.motivos });
      let listo = prepararMaestro(ma);
      // Lo primero que se suelta son las partes (las piezas se mueven enteras): pesan casi lo mismo que sus piezas.
      if (bytes + listo.bytes > TRANSFERIR_MAX_BYTES && ma.piezas.some((p) => p.partes)) {
        listo = prepararMaestro({ ...ma, piezas: ma.piezas.map((p) => ({ ...p, partes: undefined, carpeta: undefined })), avisos: [...ma.avisos, "Las piezas con subcarpetas se mueven enteras: abrirlas en partes pesaba demasiado para el navegador."] });
      }
      if (bytes + listo.bytes > TRANSFERIR_MAX_BYTES) return void descartadas.push({ nombre: ma.nombre || mesa.nombre, motivos: ["Sus piezas pesan demasiado para armarlas en el navegador. Qué hacer: elige menos artboards."] });
      bytes += listo.bytes;
      maestros.push(listo.maestro);
      transferir.push(...(listo.transferibles as ArrayBuffer[]));
    } catch (err) {
      if (!(err instanceof ErrorPsd)) throw err;
      descartadas.push({ nombre: mesa.nombre, motivos: [err.message] });
      tropiezos.push({ motivo: err.motivo, detalle: err.message });
    }
  });
  // Si TODAS las mesas tropezaron con lo mismo (típico: el PSD se guardó sin «Maximizar compatibilidad»), ese es
  // el mensaje: dice qué hacer. "Ninguna mesa se pudo separar" queda para los casos mezclados.
  if (!maestros.length && tropiezos.length === descartadas.length && new Set(tropiezos.map((t) => t.motivo)).size === 1) {
    return hilo.postMessage({ tipo: "error", motivo: tropiezos[0].motivo, detalle: tropiezos[0].detalle });
  }
  hilo.postMessage({ tipo: "listo", maestros, descartadas, avisos: d.avisos }, transferir);
}

async function leer(archivo: Blob): Promise<void> {
  // Un PSB tiene otra estructura (largos de 8 bytes): se rechaza ANTES de recorrerlo como PSD.
  if (!esVersionPsd(new Uint8Array(await archivo.slice(0, 6).arrayBuffer()))) throw new ErrorPsd("no-soportado", ES_PSB);
  let datos: ArrayBuffer;
  try {
    datos = (await adelgazarPsd(archivo, PSD_BYTES_MAX)).datos;
  } catch (err) {
    if (err instanceof PsdPesado) throw new ErrorPsd("demasiado-grande", pesaDemasiado(err.mb, err.quitados ? ", ya sin los originales de sus objetos inteligentes" : ""));
    throw new ErrorPsd("no-soportado", `No se pudo leer el archivo: ${err instanceof Error ? err.message : String(err)}.`);
  }
  const d = leerPsd(datos);
  if (d.mesas.length <= MESAS_AUTO) return seguir(d, d.mesas.map((_, i) => i));
  doc = d;
  hilo.postMessage({ tipo: "elegir", mesas: d.mesas.map(({ nombre, w, h }) => ({ nombre, w, h })), sugeridas: sugerirMesas(d.mesas) });
}

hilo.onmessage = (e) => {
  const p = e.data;
  const fallar = (err: unknown) => hilo.postMessage({ tipo: "error", motivo: err instanceof ErrorPsd ? err.motivo : "desconocido", detalle: err instanceof Error ? err.message : String(err) });
  try {
    if (p.tipo === "leer") return void leer(p.archivo).catch(fallar);
    if (p.tipo === "mesas" && doc && !pendientes) {
      const d = doc;
      // Índices que vienen de la página: sólo enteros de mesas que existen, sin repetir, en el orden del archivo.
      const indices = [...new Set(p.indices)].filter((i) => Number.isInteger(i) && i >= 0 && i < d.mesas.length).sort((a, b) => a - b);
      if (!indices.length) return fallar(new ErrorPsd("no-soportado", "No se eligió ningún artboard"));
      doc = null;
      seguir(d, indices);
    } else if (p.tipo === "fondos" && doc && pendientes) {
      const d = doc, indices = pendientes;
      doc = null;
      pendientes = null;
      // De la página: sólo mesas que se preguntaron y nombres que son piezas de esa mesa.
      const fondos: Record<number, string[]> = {};
      for (const i of indices) {
        const elegidos = p.elegidos[i];
        if (!Array.isArray(elegidos)) continue;
        const suyas = new Set(piezasDeMesa(d, i).map((x) => x.nombre));
        const validos = elegidos.filter((n) => typeof n === "string" && suyas.has(n));
        if (validos.length) fondos[i] = validos;
      }
      entregar(d, indices, fondos);
    }
  } catch (err) {
    fallar(err);
  }
};
