/**
 * El trabajo a medias en el navegador (IndexedDB, la bodega de archivos del propio navegador), una entrada por persona.
 * El reparto evita reescribir lo pesado en cada clic:
 *   - `leidos`: el PSD y lo que se leyó de él. Se escribe una vez, al abrirlo.
 *   - `estados`: las decisiones. Se escribe con cada cambio; su hora es la que cuenta para caducar.
 *   - `pesados`: copias quitadas y fondos con IA, uno por registro. Sólo se escribe el que cambió.
 * Las escrituras van en fila: una tardía nunca pisa a la que le siguió. Nada aquí sube a ningún lado.
 */
import { BORRADOR_VERSION, caducado, clavePesado, prefijoBorrador } from "@/lib/prisma/formatos/borrador";

const BASE = "hue-prisma-borradores";
const LEIDOS = "leidos", ESTADOS = "estados", PESADOS = "pesados";

export type LeidoGuardado<L> = { id: string; v: number; leido: L };
export type EstadoGuardado<E> = { id: string; guardadoEn: number; estado: E | null };
export type Recuperado<L, E> = { id: string; leido: L; estado: E | null; pesados: Map<string, unknown> };

function abrirBase(): Promise<IDBDatabase> {
  return new Promise((ok, mal) => {
    const r = indexedDB.open(BASE, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore(LEIDOS);
      r.result.createObjectStore(ESTADOS);
      r.result.createObjectStore(PESADOS);
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
}

/** Una transacción: espera a que se GUARDE de verdad (o falle, p. ej. sin espacio) y cierra la conexión siempre. */
async function transaccion<T>(almacenes: string[], modo: IDBTransactionMode, fn: (tx: IDBTransaction) => T): Promise<T> {
  const db = await abrirBase();
  try {
    return await new Promise<T>((ok, mal) => {
      const tx = db.transaction(almacenes, modo);
      const salida = fn(tx);
      tx.oncomplete = () => ok(salida);
      tx.onerror = () => mal(tx.error);
      tx.onabort = () => mal(tx.error);
    });
  } finally {
    db.close();
  }
}

const rangoDe = (prefijo: string) => IDBKeyRange.bound(prefijo, `${prefijo}￿`);

/** Lo guardado de esta persona, o null. Lo caducado no se devuelve: se borra aquí mismo. */
export async function recuperarBorrador<L, E>(perfil: string, ahora = Date.now()): Promise<Recuperado<L, E> | null> {
  const r = await transaccion([LEIDOS, ESTADOS], "readonly", (tx) => {
    const salida: { l?: LeidoGuardado<L>; e?: EstadoGuardado<E> } = {};
    const a = tx.objectStore(LEIDOS).get(perfil), b = tx.objectStore(ESTADOS).get(perfil);
    a.onsuccess = () => (salida.l = a.result as LeidoGuardado<L> | undefined);
    b.onsuccess = () => (salida.e = b.result as EstadoGuardado<E> | undefined);
    return salida;
  });
  if (!r.l) return null;
  const estado = r.e?.id === r.l.id ? r.e : null;
  const id = r.l.id;
  if (r.l.v !== BORRADOR_VERSION || (estado && caducado(estado.guardadoEn, ahora))) {
    await borrarBorrador(perfil);
    return null;
  }
  const pesados = await transaccion([PESADOS], "readonly", (tx) => {
    const mapa = new Map<string, unknown>();
    const prefijo = prefijoBorrador(perfil, id);
    const c = tx.objectStore(PESADOS).openCursor(rangoDe(prefijo));
    c.onsuccess = () => {
      if (!c.result) return;
      mapa.set(String(c.result.key).slice(prefijo.length), c.result.value);
      c.result.continue();
    };
    return mapa;
  });
  return { id, leido: r.l.leido, estado: estado?.estado ?? null, pesados };
}

/**
 * Empieza un borrador nuevo. Lo anterior de esta persona se borra ANTES y aparte: si este PSD no cabe, recargar no debe
 * devolver el PSD de antes como si fuera el de ahora. Nace con su hora, para que caduque aunque no llegue otra escritura.
 */
export async function guardarLeido<L>(perfil: string, id: string, leido: L, ahora = Date.now()): Promise<void> {
  await borrarBorrador(perfil);
  await transaccion([LEIDOS, ESTADOS], "readwrite", (tx) => {
    tx.objectStore(LEIDOS).put({ id, v: BORRADOR_VERSION, leido } satisfies LeidoGuardado<L>, perfil);
    tx.objectStore(ESTADOS).put({ id, guardadoEn: ahora, estado: null } satisfies EstadoGuardado<never>, perfil);
  });
}

export const guardarEstado = <E,>(perfil: string, id: string, estado: E, ahora = Date.now()): Promise<void> =>
  transaccion([ESTADOS], "readwrite", (tx) => void tx.objectStore(ESTADOS).put({ id, guardadoEn: ahora, estado } satisfies EstadoGuardado<E>, perfil));

/** `valor` undefined = ya no está. */
export const guardarPesado = (perfil: string, id: string, nombre: string, valor: unknown): Promise<void> =>
  transaccion([PESADOS], "readwrite", (tx) => {
    const k = clavePesado(perfil, id, nombre);
    if (valor === undefined) tx.objectStore(PESADOS).delete(k);
    else tx.objectStore(PESADOS).put(valor, k);
  });

export const borrarBorrador = (perfil: string): Promise<void> =>
  transaccion([LEIDOS, ESTADOS, PESADOS], "readwrite", (tx) => {
    tx.objectStore(LEIDOS).delete(perfil);
    tx.objectStore(ESTADOS).delete(perfil);
    tx.objectStore(PESADOS).delete(rangoDe(`${perfil}|`));
  });

/**
 * Borra lo caducado de OTRAS personas de este navegador y dice de quién era, para soltar también sus ediciones. Lo de quien
 * tiene una pestaña abierta (su candado está tomado) no se toca, y una falla con una persona no detiene a las demás.
 */
export async function barrerCaducados(perfil: string, ahora = Date.now()): Promise<string[]> {
  const viejos = await transaccion([ESTADOS], "readonly", (tx) => {
    const lista: string[] = [];
    const c = tx.objectStore(ESTADOS).openCursor();
    c.onsuccess = () => {
      if (!c.result) return;
      if (caducado((c.result.value as EstadoGuardado<unknown>).guardadoEn, ahora)) lista.push(String(c.result.key));
      c.result.continue();
    };
    return lista;
  });
  const borrados: string[] = [];
  for (const p of viejos) {
    if (p === perfil) continue; // lo propio lo resuelve recuperarBorrador
    try {
      const c = await tomarCandado(p, 1);
      if (!c.tomado) continue;
      try {
        await borrarBorrador(p);
        borrados.push(p);
      } finally {
        c.soltar();
      }
    } catch (err) {
      console.error("[formatos-psd] borrar lo caducado", err);
    }
  }
  return borrados;
}

/** Mientras esta pestaña viva, es la dueña del borrador de esta persona. Otra pestaña no recupera ni guarda encima. Sin esta
 *  función en el navegador (muy viejo) se sigue sin el freno. `soltar` la libera. Al recargar, el candado tarda un instante
 *  en soltarse: por eso se reintenta antes de decir que hay otra pestaña. */
export async function tomarCandado(perfil: string, intentos = 12): Promise<{ tomado: boolean; soltar: () => void }> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) return { tomado: true, soltar: () => {} };
  for (let intento = 0; intento < intentos; intento++) {
    let soltar = () => {};
    const tomado = await new Promise<boolean>((responder) => {
      void locks.request(`${BASE}:${perfil}`, { ifAvailable: true }, (lock) => {
        responder(!!lock);
        return lock ? new Promise<void>((fin) => (soltar = fin)) : undefined;
      });
    });
    if (tomado) return { tomado, soltar: () => soltar() };
    if (intento + 1 < intentos) await new Promise((r) => setTimeout(r, 250));
  }
  return { tomado: false, soltar: () => {} };
}

/** Sin espacio en el navegador: se dice distinto que cualquier otra falla. */
export const sinEspacio = (err: unknown): boolean => err instanceof DOMException && err.name === "QuotaExceededError";
