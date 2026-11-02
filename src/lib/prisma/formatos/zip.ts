/** Las dos carpetas del ZIP de la puerta PSD (Pedro, 2026-10-20): lo que se entrega (PNG) y lo que se sigue editando
 *  en Photoshop (PSD). En español también con la pantalla en inglés: son los nombres del equipo. */
export const CARPETA_ENTREGABLES = "Entregables";
export const CARPETA_EDITABLES = "Editables";
/** Lo más que lleva un ZIP: sin ZIP64, pasando de 4 GiB saldría roto. 2 GiB deja margen y no pide tanta memoria al
 *  navegador (s33, 12 medidas con PNG y PSD: 629 MB). Lo que pasa de aquí sale en otro ZIP (`zipsEnPartes`). */
export const ZIP_MAX_BYTES = 2 * 1024 ** 3;
/** Lo que agrega cada archivo además de sus bytes (su encabezado y su entrada en el índice), de sobra. */
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

/** La tabla del CRC-32 (el de ZIP, polinomio 0xEDB88320). */
const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
/** El CRC-32 de un archivo, leído por pedazos sin guardar nada (200 MB ≈ 0.5 s). */
async function crcDe(datos: Blob): Promise<number> {
  let c = 0xffffffff;
  const lector = datos.stream().getReader();
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      for (let i = 0; i < value.length; i++) c = TABLA_CRC[(c ^ value[i]) & 0xff] ^ (c >>> 8);
    }
  } catch (err) {
    void lector.cancel().catch(() => undefined);
    throw err;
  }
  return (c ^ 0xffffffff) >>> 0;
}
/** La hora y la fecha como las guarda un ZIP (MS-DOS: a 2 s, desde 1980). */
const enDos = (d: Date) => ({
  hora: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
  dia: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
});
/** Lo más que cuenta el índice de un ZIP sin ZIP64. */
const ENTRADAS_MAX = 0xffff;

/**
 * Un ZIP sin comprimir (PNG y PSD ya vienen comprimidos) que NO copia los archivos: el ZIP es un Blob hecho de sus
 * encabezados y de los mismos Blobs que se le dan (el navegador los referencia, no los duplica). Antes se copiaba cada
 * PSD en el ZIP y, con tres ZIP de s33 seguidos (629 MB cada uno), el navegador se quedó sin espacio a la tercera
 * ("network error"). Cada archivo se lee una vez, para su CRC: si esa lectura falla, el archivo no entra y el ZIP sigue
 * sirviendo con lo demás. `agregar` de uno en uno (se espera cada uno); `terminar` lo cierra y lo entrega.
 */
export function zipPorPartes(max = ZIP_MAX_BYTES) {
  const partes: BlobPart[] = [];
  const indice: Uint8Array<ArrayBuffer>[] = [];
  /** Lo que ya lleva el ZIP (con lo de cada entrada y el cierre), para el tope. */
  let usados = 22;
  /** Dónde empieza el siguiente archivo dentro del ZIP. */
  let desplazado = 0;
  const { hora, dia } = enDos(new Date());
  const utf8 = new TextEncoder();
  /** Cabe un archivo de `n` bytes sin pasar del tope. */
  const cabe = (n: number) => usados + n + ENTRADA_BYTES <= max;
  return {
    cabe,
    /** Cada `ruta` va dentro de su carpeta (`rutaLibre`): una que se saldría de ella o que no cabe, no entra. */
    async agregar(ruta: string, datos: Blob) {
      if (!RUTA_SEGURA.test(ruta)) throw new Error(`ruta de ZIP no segura: ${JSON.stringify(ruta)}`);
      if (!cabe(datos.size)) throw new Error(`el ZIP pasaría de ${max} bytes`);
      if (indice.length >= ENTRADAS_MAX) throw new Error("el ZIP ya lleva demasiados archivos");
      const crc = await crcDe(datos);
      const nombre = utf8.encode(ruta);
      // Encabezado local (30 bytes + nombre): versión 2.0, nombre en UTF-8 (bit 11), sin comprimir, ya con CRC y tamaños.
      const local = new Uint8Array(30 + nombre.length);
      const l = new DataView(local.buffer);
      l.setUint32(0, 0x04034b50, true);
      l.setUint16(4, 20, true);
      l.setUint16(6, 0x0800, true);
      l.setUint16(10, hora, true);
      l.setUint16(12, dia, true);
      l.setUint32(14, crc, true);
      l.setUint32(18, datos.size, true);
      l.setUint32(22, datos.size, true);
      l.setUint16(26, nombre.length, true);
      local.set(nombre, 30);
      // Su entrada en el índice del final (46 bytes + nombre), con dónde empieza.
      const central = new Uint8Array(46 + nombre.length);
      const c = new DataView(central.buffer);
      c.setUint32(0, 0x02014b50, true);
      c.setUint16(4, 20, true);
      c.setUint16(6, 20, true);
      c.setUint16(8, 0x0800, true);
      c.setUint16(12, hora, true);
      c.setUint16(14, dia, true);
      c.setUint32(16, crc, true);
      c.setUint32(20, datos.size, true);
      c.setUint32(24, datos.size, true);
      c.setUint16(28, nombre.length, true);
      c.setUint32(42, desplazado, true);
      central.set(nombre, 46);
      partes.push(local, datos);
      indice.push(central);
      desplazado += local.length + datos.size;
      usados += datos.size + ENTRADA_BYTES;
    },
    terminar(): Blob {
      const largoIndice = indice.reduce((t, x) => t + x.length, 0);
      // Fin del índice (22 bytes): cuántos archivos, cuánto mide el índice y dónde empieza.
      const fin = new Uint8Array(22);
      const f = new DataView(fin.buffer);
      f.setUint32(0, 0x06054b50, true);
      f.setUint16(8, indice.length, true);
      f.setUint16(10, indice.length, true);
      f.setUint32(12, largoIndice, true);
      f.setUint32(16, desplazado, true);
      return new Blob([...partes, ...indice, fin], { type: "application/zip" });
    },
  };
}

/**
 * Lo pedido en uno o varios ZIP (Pedro, 2026-10-20: "if the zip is too big dont drop psd just generate separate zips"):
 * cuando el siguiente archivo ya no cabe en el ZIP en curso, ése se cierra y se entrega (`alCerrar`, con su número) y
 * sigue uno nuevo. Las rutas las sigue dando `rutaLibre` con UN mismo `usadas` para todos: abiertos en la misma
 * carpeta, ningún archivo pisa a otro. Sólo un archivo que no cabe ni en un ZIP vacío se rechaza (`cabeSolo`).
 */
export function zipsEnPartes(alCerrar: (zip: Blob, numero: number) => void, max = ZIP_MAX_BYTES) {
  let actual = zipPorPartes(max);
  let numero = 1;
  let vacio = true;
  return {
    /** Cabe en un ZIP aunque sea solo. */
    cabeSolo: (n: number) => zipPorPartes(max).cabe(n),
    async agregar(ruta: string, datos: Blob) {
      if (!vacio && !actual.cabe(datos.size)) {
        alCerrar(actual.terminar(), numero++);
        actual = zipPorPartes(max);
        vacio = true;
      }
      await actual.agregar(ruta, datos);
      vacio = false;
    },
    /** Cuántos ZIP van (el en curso incluido). */
    get partes() {
      return numero;
    },
    /** Cierra el último; `numero` es también cuántos salieron en total. */
    terminar(): { zip: Blob; numero: number } {
      return { zip: actual.terminar(), numero };
    },
  };
}
