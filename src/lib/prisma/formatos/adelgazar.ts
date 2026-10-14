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

/**
 * Los tramos [desde, hasta) del archivo que se conservan, y dónde va el largo nuevo de "capas y máscaras".
 * null = no se pudo seguir la estructura con seguridad: quien llama usa el archivo entero (y su tope de peso).
 */
async function tramos(a: Archivo): Promise<{ tramos: [number, number][]; posLargo: number; quitados: number } | null> {
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
    let desde = 0, quitados = 0;
    for (let vistos = 0; q + 12 <= fin && vistos < BLOQUES_MAX; vistos++) {
      const sig = await texto4(a, q);
      // Algo que no es un bloque (relleno raro, un archivo dañado): de ahí al final se conserva tal cual y que lo
      // resuelva ag-psd. Nunca se quita lo que no se entiende.
      if (sig !== "8BIM" && sig !== "8B64") break;
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
      // Después de este bloque no hay otro reconocible: se deja de recorrer y se conserva todo lo que sigue.
      if (hasta < 0) break;
      if (BLOQUES_QUE_SOBRAN.has(clave)) {
        out.push([desde, q]);
        quitados += hasta - q;
        desde = hasta;
      }
      q = hasta;
    }
    out.push([desde, a.size]);
    return { tramos: out.filter(([x, y]) => y > x), posLargo, quitados };
  } catch {
    return null;
  }
}

/**
 * El PSD sin los bloques que sobran, listo para `leerPsd`. Si la estructura no se deja seguir, devuelve el
 * archivo entero sin tocar: `leerPsd` decide si lo puede leer. `topeBytes` se revisa ANTES de reservar memoria.
 */
export async function adelgazarPsd(a: Archivo, topeBytes: number): Promise<Adelgazado> {
  const t = (await tramos(a)) ?? { tramos: [[0, a.size]] as [number, number][], posLargo: -1, quitados: 0 };
  const total = t.tramos.reduce((s, [x, y]) => s + (y - x), 0);
  if (total > topeBytes) throw new PsdPesado(total, t.quitados);
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
  return { datos: datos.buffer, quitados: t.quitados };
}
