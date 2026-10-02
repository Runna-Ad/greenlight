/**
 * HÜE Prisma › Formatos — lo que el servidor le manda a la pantalla (módulo puro: tipos + una regla).
 */
import { DERIVA_REVISAR, type Modo } from "./geometria.ts";

/** El bucket privado de Formatos y los tipos que acepta (UNA definición para navegador y servidor). */
export const BUCKET_FORMATOS = "greenlight-formatos";
export const MIME_A_EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;
export type MimeFuente = keyof typeof MIME_A_EXT;

export type LoteVista = {
  id: string;
  nombre: string;
  w: number;
  h: number;
  /** URL firmada (1 h) del anuncio subido. */
  url: string;
  /** Color promedio del borde del anuncio: el relleno "color" por omisión. */
  colorBorde: string;
  resultadoId: string | null;
  /** Cliente del anuncio (para preseleccionar la marca y ofrecer sus colores). */
  clientId: string | null;
};

export type EstadoSalida = "pendiente" | "procesando" | "listo" | "error";

export type SalidaVista = {
  id: string;
  preset: string;
  ancho: number;
  alto: number;
  modo: Modo;
  color: string | null;
  estado: EstadoSalida;
  pngUrl: string | null;
  jpgUrl: string | null;
  pixelLockOk: boolean | null;
  deriva: number | null;
  /** La IA movió el centro lo suficiente como para que la unión del pegado se note: revisar a ojo. */
  revisarUnion: boolean;
  costoEstimadoUsd: number;
  costoRealUsd: number | null;
  error: string | null;
};

export const revisarUnion = (modo: Modo, deriva: number | null): boolean => modo === "ia" && deriva !== null && deriva > DERIVA_REVISAR;
