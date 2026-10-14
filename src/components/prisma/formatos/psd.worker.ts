/**
 * HÜE Prisma › Formatos — Web Worker que lee el PSD. Corre FUERA del hilo de la página: un Photoshop de 70 MB tarda
 * segundos y la pantalla no se congela; y si un archivo cuelga a la librería, la página lo mata con un reloj
 * (LEER_MAX_MS). El PSD nunca sale del navegador.
 *
 * 1. "leer": recibe el File (no sus bytes: el archivo puede pesar más que la memoria que conviene gastar), le quita
 *    lo que no se usa (`adelgazar.ts`) y lee su estructura.
 * 2. Con hasta MESAS_AUTO mesas, las despieza todas. Con más, le pregunta a la página cuáles ("elegir") y espera
 *    "mesas" con los índices.
 */
import { ErrorPsd, despiezar, despieceUsable, leerPsd, type DocPsd, type MotivoPsd } from "@/lib/prisma/formatos/psd";
import { MESAS_AUTO, MESAS_MAX, PSD_BYTES_MAX, TRANSFERIR_MAX_BYTES, prepararMaestro, sugerirMesas, type MaestroListo, type MensajeWorker, type MesaDescartada, type PedidoWorker } from "@/lib/prisma/formatos/listo";
import { PsdPesado, adelgazarPsd } from "@/lib/prisma/formatos/adelgazar";

// tsconfig compila con la librería del DOM, no la de workers: se tipa sólo lo que se usa.
const hilo = self as unknown as { onmessage: ((e: MessageEvent<PedidoWorker>) => void) | null; postMessage(m: MensajeWorker, transferir?: Transferable[]): void };

/** El documento leído, mientras la persona elige mesas. */
let doc: DocPsd | null = null;

function entregar(d: DocPsd, indices: number[]): void {
  const maestros: MaestroListo[] = [];
  const descartadas: MesaDescartada[] = [];
  const transferir: Transferable[] = [];
  const tropiezos: { motivo: MotivoPsd; detalle: string }[] = [];
  let bytes = 0;
  indices.forEach((i, n) => {
    const mesa = d.mesas[i];
    // Topes del TOTAL (los de psd.ts son por mesa): ni más mesas ni más píxeles de los que la página aguanta.
    if (n >= MESAS_MAX) return void descartadas.push({ nombre: mesa.nombre, motivos: [`Se eligieron más de ${MESAS_MAX} mesas: ésta no se leyó`] });
    hilo.postMessage({ tipo: "avance", mesa: n + 1, de: Math.min(indices.length, MESAS_MAX) });
    // Una mesa que no se deja separar no tumba a las demás: se anota con su porqué.
    try {
      const ma = despiezar(d, i);
      const uso = despieceUsable(ma);
      if (!uso.ok) return void descartadas.push({ nombre: ma.nombre || mesa.nombre, motivos: uso.motivos });
      const listo = prepararMaestro(ma);
      if (bytes + listo.bytes > TRANSFERIR_MAX_BYTES) return void descartadas.push({ nombre: ma.nombre || mesa.nombre, motivos: ["Sus piezas pesan demasiado para armarlas en el navegador. Qué hacer: elige menos mesas"] });
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
  let datos: ArrayBuffer;
  try {
    datos = (await adelgazarPsd(archivo, PSD_BYTES_MAX)).datos;
  } catch (err) {
    if (err instanceof PsdPesado) throw new ErrorPsd("demasiado-grande", `Sus capas pesan ${err.mb} MB (máximo ${Math.round(PSD_BYTES_MAX / 1e6)}), ya sin los originales de sus objetos inteligentes. Qué hacer: guarda una copia sólo con las mesas que necesitas y sin capas ocultas.`);
    throw new ErrorPsd("no-soportado", `No se pudo leer el archivo: ${err instanceof Error ? err.message : String(err)}`);
  }
  const d = leerPsd(datos);
  if (d.mesas.length <= MESAS_AUTO) return entregar(d, d.mesas.map((_, i) => i));
  doc = d;
  hilo.postMessage({ tipo: "elegir", mesas: d.mesas.map(({ nombre, w, h }) => ({ nombre, w, h })), sugeridas: sugerirMesas(d.mesas) });
}

hilo.onmessage = (e) => {
  const p = e.data;
  const fallar = (err: unknown) => hilo.postMessage({ tipo: "error", motivo: err instanceof ErrorPsd ? err.motivo : "desconocido", detalle: err instanceof Error ? err.message : String(err) });
  try {
    if (p.tipo === "leer") return void leer(p.archivo).catch(fallar);
    if (p.tipo === "mesas" && doc) {
      const d = doc;
      // Índices que vienen de la página: sólo enteros de mesas que existen, sin repetir, en el orden del archivo.
      const indices = [...new Set(p.indices)].filter((i) => Number.isInteger(i) && i >= 0 && i < d.mesas.length).sort((a, b) => a - b);
      if (!indices.length) return fallar(new ErrorPsd("no-soportado", "No se eligió ninguna mesa"));
      entregar(d, indices);
      doc = null;
    }
  } catch (err) {
    fallar(err);
  }
};
