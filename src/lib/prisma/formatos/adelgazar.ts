/**
 * HÜE Prisma › Formatos — antes de leer un PSD, quitarle lo que la herramienta nunca usa (puro: sólo la API de
 * Blob, corre igual en Node, en el navegador y en un Web Worker).
 *
 * En el PSD real del equipo (72 MB) el 70 % del peso es de dos cosas: los archivos ORIGINALES de los objetos
 * inteligentes (35 MB) y los datos de los filtros inteligentes (15 MB). Las capas ya traen sus píxeles tal como
 * se ven, así que esos bloques no hacen falta para despiezar. Se leen a pedazos con `slice` y sólo se junta en
 * memoria lo que se va a usar: un PSD de 1 GB hecho casi todo de objetos inteligentes cabe.
 *
 * Formato (PSD versión 1; el PSB lo rechaza el worker ANTES de llamar aquí): cabecera de 26 bytes · datos de color (largo de 4 bytes) ·
 * recursos (largo de 4) · capas y máscaras (largo de 4: dentro van la información de capas, la máscara global y
 * al final bloques etiquetados "8BIM"+clave+largo) · la copia aplanada hasta el final del archivo.
 */

/** El tope del formato PSD (más grande ya es un PSB). Se revisa ANTES de abrir el archivo. */
export const PSD_ARCHIVO_MAX = 2_147_483_648;
/** Bloques del final de "capas y máscaras" que se quitan: originales de objetos inteligentes y filtros inteligentes. */
export const BLOQUES_QUE_SOBRAN = new Set(["lnk2", "lnk3", "lnkD", "FEid", "FXid"]);
/** Lo que se lee de una vez al copiar (un archivo de 1 GB nunca entra entero a un solo búfer intermedio). */
const PEDAZO = 32 * 1024 * 1024;
/** Un PSD real trae una docena de bloques al final; un archivo con miles es basura y se deja de recorrer. */
const BLOQUES_MAX = 512;

type Archivo = Pick<Blob, "size" | "slice">;
/** Aun sin lo que sobra, el PSD pasa del tope: `mb` = lo que pesaría lo que sí se lee. */
export class PsdPesado extends Error {
  mb: number;
  /** Cuántos bloques se le quitaron (0 = no había qué quitar, o no se pudo recorrer). */
  quitados: number;
  constructor(bytes: number, quitados: number) {
    super(`pesa ${Math.round(bytes / 1e6)} MB${quitados ? " sin los originales de sus objetos inteligentes" : ""}`);
    this.mb = Math.round(bytes / 1e6);
    this.quitados = quitados;
  }
}
export type Adelgazado = { datos: ArrayBuffer; quitados: number };

const u32 = async (a: Archivo, pos: number): Promise<number> => {
  const b = new DataView(await a.slice(pos, pos + 4).arrayBuffer());
  if (b.byteLength < 4) throw new RangeError("PSD cortado");
  return b.getUint32(0);
};
const texto4 = async (a: Archivo, pos: number): Promise<string> => String.fromCharCode(...new Uint8Array(await a.slice(pos, pos + 4).arrayBuffer()));

/** El archivo trae algo que no se deja leer con seguridad para el PSD editable (la lectura normal no lo mira).
 *  `deEnlazados` = son los datos de sus objetos inteligentes; si no, es la estructura del archivo. */
export class PsdInseguro extends Error {
  deEnlazados: boolean;
  constructor(mensaje: string, deEnlazados = false) {
    super(mensaje);
    this.deEnlazados = deEnlazados;
  }
}

/** La primera posición desde `q` que no es un byte 0 (ag-psd se salta los ceros entre bloques), o `fin`. */
async function sinCeros(a: Archivo, q: number, fin: number): Promise<number> {
  while (q < fin) {
    const b = new Uint8Array(await a.slice(q, Math.min(fin, q + 4096)).arrayBuffer());
    if (!b.length) return fin;
    const i = b.findIndex((x) => x !== 0);
    if (i >= 0) return q + i;
    q += b.length;
  }
  return fin;
}

/**
 * Los tramos [desde, hasta) del archivo que se conservan, y dónde va el largo nuevo de "capas y máscaras".
 * null = no se pudo seguir la estructura con seguridad: quien llama usa el archivo entero (y su tope de peso).
 * `revisar`: se llama con cada bloque que se CONSERVA ([desde, hasta) de sus datos); si lanza PsdInseguro, se propaga.
 * Con `revisar` (el PSD editable) el recorrido es ESTRICTO: se salta los ceros como ag-psd, y lo que no se pueda seguir
 * hasta el final lanza PsdInseguro en vez de conservarse sin revisar (ag-psd sí lo leería).
 */
async function tramos(
  a: Archivo,
  sobran: ReadonlySet<string> = BLOQUES_QUE_SOBRAN,
  revisar?: (clave: string, desde: number, hasta: number) => Promise<void>,
): Promise<{ tramos: [number, number][]; posLargo: number; quitados: number } | null> {
  try {
    let p = 26;
    p += 4 + (await u32(a, p)); // datos de color
    p += 4 + (await u32(a, p)); // recursos
    const posLargo = p;
    const largo = await u32(a, p);
    const ini = p + 4, fin = ini + largo;
    if (fin > a.size) return null;
    if (!largo) return { tramos: [[0, a.size]], posLargo, quitados: 0 };
    const li = await u32(a, ini);
    let q = ini + 4 + li + (li % 2); // información de capas (redondeada a par, como la lee ag-psd)
    if (q + 4 <= fin) q += 4 + (await u32(a, q)); // máscara global
    if (q > fin) return null;
    const out: [number, number][] = [];
    const estricto = !!revisar;
    const inseguro = (porque: string) => {
      throw new PsdInseguro(`los bloques del final de las capas no se dejan seguir (${porque})`);
    };
    let desde = 0, quitados = 0;
    for (let vistos = 0; ; vistos++) {
      if (estricto) q = await sinCeros(a, q, fin);
      if (q + 12 > fin) break;
      if (vistos >= BLOQUES_MAX) {
        if (estricto) inseguro(`más de ${BLOQUES_MAX}`);
        break;
      }
      const sig = await texto4(a, q);
      // Algo que no es un bloque (relleno raro, un archivo dañado): de ahí al final se conserva tal cual y que lo
      // resuelva ag-psd. Nunca se quita lo que no se entiende.
      if (sig !== "8BIM" && sig !== "8B64") {
        if (estricto) inseguro("un bloque sin firma");
        break;
      }
      // 8B64 lleva el largo en 8 bytes (es de los PSB): en un PSD no se revisa, no se arma el editable.
      if (estricto && sig === "8B64") inseguro("un bloque de 64 bits");
      const clave = await texto4(a, q + 4);
      const n = await u32(a, q + 8);
      // Relleno tras los datos: la especificación dice "a par", pero Photoshop rellena a 4 (ag-psd lee a par y se
      // re-alinea buscando la firma). Aquí igual: el siguiente bloque empieza donde aparezca su firma, 0-3 bytes después.
      const datosFin = q + 12 + n;
      if (datosFin > fin) return null;
      let hasta = -1;
      for (let r = 0; r < 4 && hasta < 0; r++) {
        const p2 = datosFin + r;
        if (p2 >= fin) hasta = fin;
        else if (p2 + 4 <= fin && ["8BIM", "8B64"].includes(await texto4(a, p2))) hasta = p2;
      }
      // Como ag-psd: el byte de relleno a par y luego ceros. Lo que sobre al final (menos de un bloque) ag-psd lo salta.
      if (hasta < 0 && estricto) {
        const p2 = await sinCeros(a, datosFin + (n % 2), fin);
        if (p2 + 12 > fin || ["8BIM", "8B64"].includes(await texto4(a, p2))) hasta = Math.min(p2, fin);
      }
      // Después de este bloque no hay otro reconocible: se deja de recorrer y se conserva todo lo que sigue.
      if (hasta < 0) {
        if (estricto) inseguro("después de un bloque no sigue otro");
        break;
      }
      if (sobran.has(clave)) {
        out.push([desde, q]);
        quitados += hasta - q;
        desde = hasta;
      } else if (revisar) await revisar(clave, q + 12, datosFin);
      q = hasta;
    }
    out.push([desde, a.size]);
    return { tramos: out.filter(([x, y]) => y > x), posLargo, quitados };
  } catch (err) {
    if (err instanceof PsdInseguro) throw err;
    return null;
  }
}

/** Para el PSD editable sólo sobran los filtros inteligentes (la salida no los escribe); los originales de los objetos
 *  inteligentes SÍ se quedan, y por eso se revisan antes de que los lea ag-psd. */
const SOBRAN_EN_EDITABLE = new Set(["FEid", "FXid"]);
const ENLAZADOS = new Set(["lnk2", "lnk3", "lnkD", "lnkE"]);
/** Archivos de objetos inteligentes por bloque: los PSD reales traen una docena. */
const ENLAZADOS_MAX = 512;

/**
 * Cada registro de un bloque de objetos inteligentes cabe en su bloque, y lo que declara de datos cabe en su registro.
 * ag-psd, al leer más allá del final, reserva hasta 100 MB vacíos POR registro: un bloque chico con miles de registros
 * que mienten pediría gigas antes de cualquier tope nuestro. Mismo formato que lee ag-psd (additionalInfo.js, lnk2).
 */
async function revisarEnlazados(a: Archivo, desde: number, hasta: number): Promise<void> {
  const malo = (porque: string) => new PsdInseguro(porque, true);
  const leer = async (p: number, n: number) => {
    if (p + n > hasta) throw malo("un objeto inteligente declara más datos de los que trae");
    return new DataView(await a.slice(p, p + n).arrayBuffer());
  };
  let p = desde;
  for (let n = 0; hasta - p > 8; n++) {
    if (n >= ENLAZADOS_MAX) throw malo(`más de ${ENLAZADOS_MAX} archivos de objetos inteligentes en un bloque`);
    const largo = await leer(p, 8);
    if (largo.getUint32(0)) throw malo("un objeto inteligente declara más de 4 GB");
    const size = largo.getUint32(4), ini = p + 8;
    const fin = ini + size + ((4 - (size % 4)) % 4);
    if (ini + size > hasta) throw malo("un objeto inteligente se sale de su bloque");
    // tipo (4) · versión (4) · id (1 + n) · nombre (4 + 2n) · tipo de archivo (4) · creador (4) · datos (8)
    const cab = await leer(ini, 8);
    const tipo = String.fromCharCode(cab.getUint8(0), cab.getUint8(1), cab.getUint8(2), cab.getUint8(3)), version = cab.getInt32(4);
    let q = ini + 8;
    q += 1 + (await leer(q, 1)).getUint8(0);
    q += 4 + 2 * (await leer(q, 4)).getUint32(0);
    q += 8;
    const datos = await leer(q, 8);
    if (datos.getUint32(0) || datos.getUint32(4) > size) throw malo("un objeto inteligente declara más datos de los que trae");
    // liFE versión 2 trae su archivo con otro largo, más adelante, que no se revisa aquí: no se arma el editable.
    if (tipo === "liFE" ? version === 2 : tipo !== "liFD" && tipo !== "liFA") throw malo(`un objeto inteligente de un tipo que no se revisa (${tipo.replace(/[^\x20-\x7e]/g, "?")})`);
    p = fin;
  }
}

/**
 * El PSD para armar el editable de una medida: entero salvo los filtros inteligentes, con los bloques de objetos
 * inteligentes revisados ANTES de que los lea ag-psd. Lanza PsdInseguro si algo no cuadra (sale el de capas planas),
 * PsdPesado si pasa de `topeBytes`.
 */
export async function prepararParaEditable(a: Archivo, topeBytes: number): Promise<ArrayBuffer> {
  if (a.size > topeBytes) throw new PsdPesado(a.size, 0);
  const cab = new Uint8Array(await a.slice(0, 6).arrayBuffer());
  if (String.fromCharCode(...cab.slice(0, 4)) !== "8BPS" || cab[4] !== 0 || cab[5] !== 1) throw new PsdInseguro("no es un PSD de versión 1");
  const t = await tramos(a, SOBRAN_EN_EDITABLE, (clave, desde, hasta) => (ENLAZADOS.has(clave) ? revisarEnlazados(a, desde, hasta) : Promise.resolve()));
  if (!t) throw new PsdInseguro("la estructura del PSD no se deja seguir");
  return juntar(a, t);
}

/** Copia los tramos a un búfer y corrige el largo de "capas y máscaras" por lo que se quitó. */
async function juntar(a: Archivo, t: { tramos: [number, number][]; posLargo: number; quitados: number }): Promise<ArrayBuffer> {
  const total = t.tramos.reduce((s, [x, y]) => s + (y - x), 0);
  const datos = new Uint8Array(total);
  let o = 0;
  for (const [x, y] of t.tramos)
    for (let p = x; p < y; p += PEDAZO) {
      const pedazo = new Uint8Array(await a.slice(p, Math.min(y, p + PEDAZO)).arrayBuffer());
      datos.set(pedazo, o);
      o += pedazo.length;
    }
  if (o !== total) throw new RangeError("PSD cortado");
  // El largo de "capas y máscaras" baja exactamente lo que se quitó (todos los bloques quitados viven ahí dentro).
  if (t.quitados && t.posLargo >= 0) {
    const v = new DataView(datos.buffer);
    v.setUint32(t.posLargo, v.getUint32(t.posLargo) - t.quitados);
  }
  return datos.buffer;
}

/**
 * El PSD sin los bloques que sobran, listo para `leerPsd`. Si la estructura no se deja seguir, devuelve el
 * archivo entero sin tocar: `leerPsd` decide si lo puede leer. `topeBytes` se revisa ANTES de reservar memoria.
 */
export async function adelgazarPsd(a: Archivo, topeBytes: number): Promise<Adelgazado> {
  const t = (await tramos(a)) ?? { tramos: [[0, a.size]] as [number, number][], posLargo: -1, quitados: 0 };
  const total = t.tramos.reduce((s, [x, y]) => s + (y - x), 0);
  if (total > topeBytes) throw new PsdPesado(total, t.quitados);
  return { datos: await juntar(a, t), quitados: t.quitados };
}
