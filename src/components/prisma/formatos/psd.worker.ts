/**
 * HÜE Prisma › Formatos — Web Worker que lee el PSD. Corre FUERA del hilo de la página: un Photoshop de 70 MB tarda
 * segundos y la pantalla no se congela; y si un archivo cuelga a la librería, la página lo mata con un reloj
 * (LEER_MAX_MS). El PSD nunca sale del navegador.
 */
import { ErrorPsd, despiezar, despieceUsable, leerPsd, type MotivoPsd } from "@/lib/prisma/formatos/psd";
import { MESAS_MAX, TRANSFERIR_MAX_BYTES, prepararMaestro, type MaestroListo, type MensajeWorker, type MesaDescartada } from "@/lib/prisma/formatos/listo";

// tsconfig compila con la librería del DOM, no la de workers: se tipa sólo lo que se usa.
const hilo = self as unknown as { onmessage: ((e: MessageEvent<ArrayBuffer>) => void) | null; postMessage(m: MensajeWorker, transferir?: Transferable[]): void };

hilo.onmessage = (e) => {
  try {
    const doc = leerPsd(e.data);
    const maestros: MaestroListo[] = [];
    const descartadas: MesaDescartada[] = [];
    const transferir: Transferable[] = [];
    const tropiezos: { motivo: MotivoPsd; detalle: string }[] = [];
    let bytes = 0;
    doc.mesas.forEach((mesa, i) => {
      // Topes del TOTAL (los de psd.ts son por mesa): ni más mesas ni más píxeles de los que la página aguanta.
      if (i >= MESAS_MAX) return void descartadas.push({ nombre: mesa.nombre, motivos: [`El PSD trae más de ${MESAS_MAX} mesas de trabajo: ésta no se leyó`] });
      hilo.postMessage({ tipo: "avance", mesa: i + 1, de: Math.min(doc.mesas.length, MESAS_MAX) });
      // Una mesa que no se deja separar no tumba a las demás: se anota con su porqué.
      try {
        const ma = despiezar(doc, i);
        const uso = despieceUsable(ma);
        if (!uso.ok) return void descartadas.push({ nombre: ma.nombre || mesa.nombre, motivos: uso.motivos });
        const listo = prepararMaestro(ma);
        if (bytes + listo.bytes > TRANSFERIR_MAX_BYTES) return void descartadas.push({ nombre: ma.nombre || mesa.nombre, motivos: ["Sus piezas pesan demasiado para armarlas en el navegador"] });
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
    hilo.postMessage({ tipo: "listo", maestros, descartadas, avisos: doc.avisos }, transferir);
  } catch (err) {
    hilo.postMessage({ tipo: "error", motivo: err instanceof ErrorPsd ? err.motivo : "desconocido", detalle: err instanceof Error ? err.message : String(err) });
  }
};
