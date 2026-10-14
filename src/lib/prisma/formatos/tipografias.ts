/**
 * HÜE Prisma › Formatos — la biblioteca de tipografías de Greenlight (puro: corre igual en el servidor, en Node y
 * en el navegador).
 *
 * Un admin las sube una vez en Admin › Marcas, en la tarjeta de un cliente; las gratuitas las trae Formatos solo de
 * Google Fonts (google-fonts.ts). Al leer un PSD se piden por NOMBRE las que le faltan: el PSD dice el nombre
 * PostScript exacto de cada tipografía ("DiDiSans-Pro-Medium") y cada archivo guardado sabe cuáles trae. Una
 * tipografía sirve a cualquier cliente, salvo la marcada EXCLUSIVA (DiDi Sans Pro es sólo de DiDi): ésa sólo se
 * entrega cuando en Formatos se eligió su cliente.
 */
import { fuentesDe } from "./textos.ts";

/** El bucket PRIVADO donde viven (se crea en scripts/setup-storage.mjs). */
export const TIPOGRAFIAS_BUCKET = "greenlight-tipografias";

/** ¿El error dice que la tabla todavía no existe (falta la migración 0079)? Otro error es un error de verdad. */
export const faltaTablaTipografias = (e: { code?: string; message?: string }) =>
  e.code === "42P01" || e.code === "PGRST205" || (/tipografias/.test(e.message ?? "") && /does not exist|schema cache/i.test(e.message ?? ""));

/** Por archivo subido. Las del equipo pesan 47-109 KB; una con miles de letras (chino, japonés) puede pasar de
 *  4 MB y no entra: cruzaría el tope de lo que Vercel deja subir de una vez (4.5 MB). */
export const TIPOGRAFIA_MAX_BYTES = 4_000_000;
/** Las de Google no pasan por esa subida (las baja el servidor): una variable con muchos ejes ronda 2-9 MB. El
 *  bucket y la base aceptan hasta aquí. */
export const TIPOGRAFIA_GOOGLE_MAX_BYTES = 10_000_000;
/** Archivos por cliente: una familia completa con cursivas ronda 20. */
export const TIPOGRAFIAS_POR_CLIENTE_MAX = 60;
/** Nombres que un PSD puede pedir de una vez, y archivos que se le mandan. */
export const NOMBRES_PEDIDOS_MAX = 64;
export const ARCHIVOS_ENTREGADOS_MAX = 30;
/** Nombres por archivo (una variable trae uno por estilo). */
const NOMBRES_POR_ARCHIVO_MAX = 256;
/** Lo que se enseña del nombre del archivo subido. */
export const ARCHIVO_NOMBRE_MAX = 120;

/** Un nombre PostScript: ASCII visible, sin espacios. Lo demás no se guarda ni se pide. */
const NOMBRE_PS = /^[\x21-\x7e]{1,127}$/;
export const esNombrePs = (s: unknown): s is string => typeof s === "string" && NOMBRE_PS.test(s);

export type TipografiaLeida = { ext: "otf" | "ttf"; nombres: string[] };

/**
 * ¿Es un .otf/.ttf que sirve, y qué nombres trae? Lee los bytes (nunca el nombre del archivo). null = no es una
 * tipografía, o no trae ningún nombre que un PSD pueda pedir.
 */
export function leerTipografia(buf: ArrayBuffer, maxBytes = TIPOGRAFIA_MAX_BYTES): TipografiaLeida | null {
  if (buf.byteLength < 12 || buf.byteLength > maxBytes) return null;
  let nombres: string[];
  try {
    nombres = [...new Set(fuentesDe(buf).map((f) => f.ps))].filter(esNombrePs).slice(0, NOMBRES_POR_ARCHIVO_MAX);
  } catch {
    return null;
  }
  if (!nombres.length) return null;
  return { ext: new DataView(buf).getUint32(0) === 0x4f54544f /* OTTO */ ? "otf" : "ttf", nombres };
}

/** Lo que pide el navegador, limpio: sólo nombres válidos, sin repetir, con tope. */
export function nombresPedidos(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(esNombrePs))].slice(0, NOMBRES_PEDIDOS_MAX);
}

/** El nombre del archivo para enseñar: sin caracteres de control ni rutas, con tope. */
export function archivoVisible(nombre: string): string {
  const limpio = nombre.replace(/[\p{Cc}\p{Cf}]/gu, "").split(/[\\/]/).pop()?.trim() ?? "";
  return (limpio || "tipografía").slice(0, ARCHIVO_NOMBRE_MAX);
}

/** Dónde vive en el bucket privado: por dueño (el cliente, o "google") y por su huella (el mismo archivo dos veces es uno). */
export const rutaTipografia = (duenio: string, sha256: string, ext: "otf" | "ttf") => `${duenio}/${sha256}.${ext}`;

/** Lo que importa de una fila para decidir si se entrega: qué trae, de qué cliente es y si es sólo suya. */
type Guardada = { nombres: string[]; client_id: string | null; exclusiva: boolean };

/**
 * Para un anuncio de `clienteId` (null = "Sin cliente"): primero las de SU cliente (aunque otro archivo cubra más
 * nombres, la del cliente gana), después las demás que sirven para todos. Las exclusivas de OTRO cliente, nunca.
 */
export function elegirParaCliente<T extends Guardada>(guardadas: T[], pedidos: string[], clienteId: string | null): { elegidas: T[]; faltan: string[] } {
  const suyas = clienteId ? guardadas.filter((g) => g.client_id === clienteId) : [];
  const a = elegirTipografias(suyas, pedidos);
  const b = elegirTipografias(guardadas.filter((g) => !g.exclusiva && !suyas.includes(g)), a.faltan, ARCHIVOS_ENTREGADOS_MAX - a.elegidas.length);
  return { elegidas: [...a.elegidas, ...b.elegidas], faltan: b.faltan };
}

/**
 * De lo que sigue faltando, lo que sí está guardado pero es exclusivo de OTRO cliente, agrupado por ese cliente
 * (para decir "es de DiDi: elige DiDi arriba"). `cliente` = el nombre que se enseña.
 */
export function exclusivasDeOtros<T extends Guardada & { cliente: string }>(guardadas: T[], faltan: string[], clienteId: string | null): { cliente: string; nombres: string[] }[] {
  const porCliente = new Map<string, Set<string>>();
  const quedan = new Set(faltan);
  for (const g of guardadas) {
    if (!g.exclusiva || g.client_id === clienteId) continue;
    for (const n of g.nombres) {
      if (!quedan.has(n)) continue;
      const s = porCliente.get(g.cliente) ?? new Set<string>();
      s.add(n);
      porCliente.set(g.cliente, s);
    }
  }
  return [...porCliente].map(([cliente, s]) => ({ cliente, nombres: [...s] }));
}

/**
 * De las guardadas, cuáles mandar para lo que pide un PSD: las que traen algún nombre pedido, primero las que
 * cubren más, sin mandar un archivo cuyo nombre ya cubre otro (la misma letra subida suelta y dentro de otra carpeta).
 * `faltan` = lo pedido que ninguna trae.
 */
export function elegirTipografias<T extends { nombres: string[] }>(guardadas: T[], pedidos: string[], max = ARCHIVOS_ENTREGADOS_MAX): { elegidas: T[]; faltan: string[] } {
  const quedan = new Set(pedidos);
  const elegidas: T[] = [];
  const candidatas = guardadas
    .map((g) => ({ g, cubre: g.nombres.filter((n) => quedan.has(n)).length }))
    .filter((x) => x.cubre > 0)
    .sort((a, b) => b.cubre - a.cubre);
  for (const { g } of candidatas) {
    if (elegidas.length >= max) break;
    const nuevos = g.nombres.filter((n) => quedan.has(n));
    if (!nuevos.length) continue;
    elegidas.push(g);
    for (const n of nuevos) quedan.delete(n);
  }
  return { elegidas, faltan: [...quedan] };
}
