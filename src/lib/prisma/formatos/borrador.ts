/**
 * HÜE Prisma › Formatos, PSD — el trabajo a medias de cada persona (Pedro, 2026-11-04: "it doesnt reset on every refresh
 * ... someone else can be working on something else"). Vive en el navegador de esa persona; el PSD no se sube.
 *
 * Lo puro: cuándo caduca, cómo se llaman las claves y cómo se guarda un fondo con IA. Un fondo con IA dice de qué fondo
 * salió comparando el arreglo de píxeles (`Ampliacion.base`), y esa identidad no sobrevive a guardarlo: aquí se cambia
 * por «el fondo del maestro i» y al recuperar se vuelve a apuntar al arreglo de verdad. Corre igual en Node.
 */
import type { Ampliacion } from "./ampliar.ts";

/** Súbelo cuando cambie la forma de lo que se guarda (`MaestroListo`, `Quitada`, `Ampliacion`): un borrador viejo se descarta en vez de romper la pantalla. */
export const BORRADOR_VERSION = 1;

/** Un trabajo que nadie abrió en este tiempo se borra: son archivos de un cliente en una computadora, quizá compartida. */
export const BORRADOR_DIAS = 14;
const DIA_MS = 86_400_000;

export const caducado = (guardadoEn: number, ahora: number): boolean => !Number.isFinite(guardadoEn) || ahora - guardadoEn > BORRADOR_DIAS * DIA_MS;

/** El separador no puede salir en un id de persona; un nombre de medida o de archivo sí puede traer cualquier cosa, y va al final. */
const SEP = "|";
export const clavePesado = (perfil: string, borrador: string, nombre: string): string => [perfil, borrador, nombre].join(SEP);
/** Todas las claves de un borrador empiezan así (para borrarlo completo). */
export const prefijoBorrador = (perfil: string, borrador: string): string => [perfil, borrador, ""].join(SEP);
export const claveQuitada = (maestro: number): string => `q:${maestro}`;
export const claveAmpliacion = (medida: string): string => `a:${medida}`;

/** De qué fondo salió: el original del maestro `i`, o el mismo sin la copia que se le quitó. */
export type BaseGuardada = { i: number; sinCopia: boolean };
export type AmpliacionGuardada = Omit<Ampliacion, "base" | "hueco"> & {
  base: BaseGuardada;
  hueco?: { forma: AmpliacionGuardada | null; previa: AmpliacionGuardada | null };
};

/** Para guardar. null = el fondo del que salió ya no existe (ya no vale, y no se guarda). */
export function empacarAmpliacion(a: Ampliacion, baseDe: (fondo: Uint8ClampedArray) => BaseGuardada | null): AmpliacionGuardada | null {
  const base = baseDe(a.base);
  if (!base) return null;
  const { hueco, ...resto } = a;
  if (!hueco) return { ...resto, base };
  const forma = hueco.forma ? empacarAmpliacion(hueco.forma, baseDe) : null;
  const previa = hueco.previa ? empacarAmpliacion(hueco.previa, baseDe) : null;
  // Un relleno sin la ampliación sobre la que se pintó no se puede acomodar igual: mejor no recuperarlo que verlo movido.
  if ((hueco.forma && !forma) || (hueco.previa && !previa)) return null;
  return { ...resto, base, hueco: { forma, previa } };
}

/** Al recuperar. null = ese fondo ya no está (otro PSD, un dato viejo): se descarta y no se pinta sobre otro fondo. */
export function desempacarAmpliacion(g: AmpliacionGuardada, fondoDe: (b: BaseGuardada) => Uint8ClampedArray | null): Ampliacion | null {
  const base = fondoDe(g.base);
  if (!base) return null;
  const { hueco, ...resto } = g;
  if (!hueco) return { ...resto, base };
  const forma = hueco.forma ? desempacarAmpliacion(hueco.forma, fondoDe) : null;
  const previa = hueco.previa ? desempacarAmpliacion(hueco.previa, fondoDe) : null;
  if ((hueco.forma && !forma) || (hueco.previa && !previa)) return null;
  return { ...resto, base, hueco: { forma, previa } };
}
