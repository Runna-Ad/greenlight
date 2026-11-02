/**
 * HÜE Prisma › Formatos — Web Worker que arma el PSD EDITABLE de una medida (psd-editable.ts). Vuelve a leer el
 * archivo ENTERO, con los originales de sus objetos inteligentes (la lectura de la pantalla los quita para ahorrar
 * memoria), mueve cada capa con su pieza y escribe el PSD. Corre fuera de la página: un PSD de 60 MB tarda un
 * segundo o dos y la pantalla no se congela. El archivo nunca sale del navegador.
 */
import { getLayerImageData, getLayerMaskImageData, getLayerRealMaskImageData, initializeCanvas, readPsd, writePsdUint8Array } from "ag-psd";
import { TopeEditable, psdEditable } from "@/lib/prisma/formatos/psd-editable";
import { PsdInseguro, PsdPesado, prepararParaEditable } from "@/lib/prisma/formatos/adelgazar";
import { EDITABLE_MAX_BYTES, MAL_FORMADO, type MensajePsdMedida, type PedidoPsdMedida } from "@/lib/prisma/formatos/listo";

// tsconfig compila con la librería del DOM, no la de workers: se tipa sólo lo que se usa.
const hilo = self as unknown as { onmessage: ((e: MessageEvent<PedidoPsdMedida>) => void) | null; postMessage(m: MensajePsdMedida, transferir?: Transferable[]): void };

// En un worker no hay canvas: la librería sólo necesita sacar búferes de píxeles (se lee con `useRawData`).
initializeCanvas(
  () => {
    throw new Error("psd: sin canvas (se lee con useRawData)");
  },
  (width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }) as unknown as ImageData,
);

/** "topes" = de esta medida (otra puede salir; también si se acabó la memoria armándola); "archivo" = topes que trae el
 *  archivo; "inseguro" = los datos de sus objetos inteligentes no se dejan leer con seguridad; "formato" = el archivo no
 *  sigue el formato al pie de la letra (su estructura, o lo que ag-psd rechaza en modo estricto); "otro" = lo demás. */
function codigoDe(err: unknown, detalle: string): Extract<MensajePsdMedida, { tipo: "error" }>["codigo"] {
  if (err instanceof TopeEditable) return err.deArchivo ? "archivo" : "topes";
  if (err instanceof PsdPesado) return "archivo";
  if (err instanceof PsdInseguro) return err.deEnlazados ? "inseguro" : "formato";
  if (MAL_FORMADO.test(detalle)) return "formato";
  // Se acabó la memoria al armar ESTA medida (no un archivo cortado, que también es RangeError).
  if (err instanceof RangeError && /alloca|length/i.test(detalle)) return "topes";
  return "otro";
}

hilo.onmessage = async (e) => {
  try {
    const { archivo, plan, extras } = e.data;
    // Sin los filtros inteligentes y con los objetos inteligentes revisados ANTES de que ag-psd los lea (adelgazar.ts);
    // totalMemoryLimit como la lectura de la pantalla: con useRawData sólo se decodifican los patrones al leer.
    // `strict`: un dato que dice medir más de lo que queda del archivo (en cualquier bloque, también los de cada capa)
    // no reserva hasta 100 MB vacíos por cada uno: ag-psd lanza antes. Si fue dentro de un bloque extra de una capa,
    // ag-psd se salta ese bloque y sigue; si no, el archivo no se lee y sale el de capas planas. Los PSD reales del
    // equipo (5 en la Mac) se leen igual.
    const datos = await prepararParaEditable(archivo, EDITABLE_MAX_BYTES);
    const fuente = readPsd(datos, { useRawData: true, useRawThumbnail: true, skipCompositeImageData: true, totalMemoryLimit: 64 * 1024 * 1024, strict: true });
    const { psd, notas } = psdEditable(fuente, plan, extras, { capa: (l) => getLayerImageData(l), mascara: (l) => getLayerMaskImageData(l), mascaraReal: (l) => getLayerRealMaskImageData(l) });
    // invalidateTextLayers: los textos se movieron; Photoshop los vuelve a dibujar al abrir (pide «Actualizar»).
    // Se manda un Blob: el búfer de ag-psd es el doble de lo escrito, y así la página no lo recibe ni lo vuelve a copiar.
    const archivoPsd = new Blob([writePsdUint8Array(psd, { invalidateTextLayers: true, noBackground: true }) as BlobPart], { type: "image/vnd.adobe.photoshop" });
    hilo.postMessage({ tipo: "listo", archivo: archivoPsd, notas });
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    hilo.postMessage({ tipo: "error", codigo: codigoDe(err, detalle), detalle });
  }
};
