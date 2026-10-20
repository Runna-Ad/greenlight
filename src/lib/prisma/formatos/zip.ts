import { Zip, ZipPassThrough } from "fflate";

/** Las dos carpetas del ZIP de la puerta PSD (Pedro, 2026-10-20): lo que se entrega (PNG) y lo que se sigue editando
 *  en Photoshop (PSD). En español también con la pantalla en inglés: son los nombres del equipo. */
export const CARPETA_ENTREGABLES = "Entregables";
export const CARPETA_EDITABLES = "Editables";
/** Lo armado se junta en pedazos de este tamaño antes de pasarlo a un Blob: pocos pedazos grandes, no miles chicos. */
const PARTE_BYTES = 16 * 1024 * 1024;
/** Lo más que lleva un ZIP. fflate no escribe ZIP64: pasando de 4 GiB el ZIP saldría roto sin avisar. 2 GiB deja margen
 *  y no pide tanta memoria al navegador (s33, 12 medidas con PNG y PSD: 629 MB). */
export const ZIP_MAX_BYTES = 2 * 1024 ** 3;
/** Lo que agrega cada archivo además de sus bytes (encabezado, descriptor y su entrada en el índice), de sobra. */
const ENTRADA_BYTES = 1024;
/** Una ruta que se puede abrir sin salirse de la carpeta: «Carpeta/archivo.ext», sin «..», barras de más ni raros. */
const RUTA_SEGURA = /^[A-Za-z0-9_-]+\/(?!\.+$)[A-Za-z0-9_.-]+$/;

/**
 * La ruta de un archivo en su carpeta sin pisar otra ya usada: «a.png», «a-2.png», «a-3.png»… Sin distinguir
 * mayúsculas: en una Mac «A.png» y «a.png» son el mismo archivo y uno se perdería al abrir el ZIP.
 */
export function rutaLibre(usadas: Set<string>, carpeta: string, nombre: string): string {
  const punto = nombre.lastIndexOf(".");
  const base = punto > 0 ? nombre.slice(0, punto) : nombre;
  const ext = punto > 0 ? nombre.slice(punto) : "";
  let ruta = `${carpeta}/${nombre}`;
  for (let n = 2; usadas.has(ruta.toLowerCase()); n++) ruta = `${carpeta}/${base}-${n}${ext}`;
  usadas.add(ruta.toLowerCase());
  return ruta;
}

/**
 * Un ZIP que se arma de a un archivo: cada uno se lee por pedazos y lo armado se guarda en Blobs (que el navegador
 * puede llevar a disco), en vez de juntar todo en un solo arreglo y copiarlo otra vez al final como `zipSync`. Cuánta
 * memoria pide de verdad con doce PSD (s33: 629 MB): sin medir. Sin comprimir: PNG y PSD ya vienen comprimidos.
 * `agregar` de uno en uno (se espera cada uno); si uno falla, el ZIP ya no sirve. `terminar` lo cierra y lo entrega.
 */
export function zipPorPartes(max = ZIP_MAX_BYTES) {
  const partes: Blob[] = [];
  /** Lo que ya lleva el ZIP (con lo de cada entrada y el cierre), para el tope. */
  let usados = 22;
  let juntando: Uint8Array<ArrayBuffer>[] = [];
  let bytes = 0;
  let falla: Error | null = null;
  let cerrado = false;
  const soltar = () => {
    if (juntando.length) partes.push(new Blob(juntando));
    juntando = [];
    bytes = 0;
  };
  // Con archivos sin comprimir, fflate llama esto en el momento (no en otro hilo).
  const zip = new Zip((err, pedazo, final) => {
    if (err) {
      falla = err;
      return;
    }
    juntando.push(pedazo);
    bytes += pedazo.length;
    if (bytes >= PARTE_BYTES || final) soltar();
    if (final) cerrado = true;
  });
  /** Cabe un archivo de `n` bytes sin pasar del tope. */
  const cabe = (n: number) => usados + n + ENTRADA_BYTES <= max;
  return {
    cabe,
    /** Cada `ruta` va dentro de su carpeta (`rutaLibre`): una que se saldría de ella o que no cabe, no entra. */
    async agregar(ruta: string, datos: Blob) {
      if (falla) throw falla;
      if (!RUTA_SEGURA.test(ruta)) throw new Error(`ruta de ZIP no segura: ${JSON.stringify(ruta)}`);
      if (!cabe(datos.size)) throw new Error(`el ZIP pasaría de ${max} bytes`);
      usados += datos.size + ENTRADA_BYTES;
      const archivo = new ZipPassThrough(ruta);
      zip.add(archivo);
      const lector = datos.stream().getReader();
      try {
        for (;;) {
          const { done, value } = await lector.read();
          if (done) break;
          archivo.push(value);
          if (falla) throw falla;
        }
        archivo.push(new Uint8Array(0), true);
        if (falla) throw falla;
      } catch (err) {
        // Un archivo a medias deja el ZIP sin cerrar (fflate espera su final para seguir): ya no sirve, y se dice YA,
        // no después de armar los demás.
        falla ??= err instanceof Error ? err : new Error(String(err));
        void lector.cancel().catch(() => undefined);
        throw falla;
      }
    },
    terminar(): Blob {
      zip.end();
      if (falla) throw falla;
      if (!cerrado) throw new Error("el ZIP no se cerró");
      return new Blob(partes, { type: "application/zip" });
    },
  };
}
