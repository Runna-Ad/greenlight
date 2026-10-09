import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { firmar } from "@/lib/prisma/data";
import { sniffImageMime } from "@/lib/referencia";
import type { PrismaFormatosLoteRow, PrismaFormatosSalidaRow } from "@/lib/database.types";
import { FUENTE_MAX_BYTES, type Modo } from "@/lib/prisma/formatos/geometria";
import { analizarBordes, colorBorde, leerFuente, type Fuente } from "@/lib/prisma/formatos/componer";
import { BUCKET_FORMATOS, MIME_A_EXT, revisarUnion, type LoteVista, type MimeFuente, type SalidaVista } from "@/lib/prisma/formatos/vista";
import { fallo, puedeTocar, UUID, faltaMigracion, type Fail, type Sesion } from "./comun";

/**
 * HÜE Prisma › Formatos — lo que COMPARTEN las server actions (formatos-actions.ts) y la ruta que procesa
 * cada tamaño (api/prisma/formatos/tamano). UNA implementación de "¿puedo tocar este lote?", "leer el
 * anuncio" y "firmar URLs": si cada lado tuviera la suya terminarían distintas (lección de paridad).
 */

export { BUCKET_FORMATOS, MIME_A_EXT, type MimeFuente };
export const MIGRACION_FORMATOS = "0078";
/** Un tamaño "procesando" sin noticias en este tiempo se da por muerto (la función se cayó) y se puede retomar.
 *  Va un poco arriba del maxDuration de la ruta (210 s): una corrida viva nunca se pisa. */
export const PROCESANDO_MUERTO_MS = 4 * 60_000;

type Db = ReturnType<typeof supabaseAdmin>;

/** El lote, si existe y esta sesión lo puede tocar (lo suyo; lead/admin/master, todo — la regla de Prisma). */
export async function loteConPermiso(db: Db, loteId: unknown, g: Sesion): Promise<PrismaFormatosLoteRow | Fail> {
  if (typeof loteId !== "string" || !UUID.test(loteId)) return { ok: false, error: "Ese anuncio ya no existe." };
  const { data, error } = await db.from("prisma_formatos_lotes").select("*").eq("id", loteId).maybeSingle<PrismaFormatosLoteRow>();
  if (error) return faltaMigracion(error, MIGRACION_FORMATOS) ?? fallo("prisma_formatos_lotes.select", error.message);
  if (!data) return { ok: false, error: "Ese anuncio ya no existe." };
  if (!puedeTocar(data, g)) return { ok: false, error: "Ese anuncio lo subió otra persona." };
  return data;
}

/** Un fallo al bajar la fuente: `invalida` = el ARCHIVO no sirve (tipo, peso, decodificación); si no, fue la
 *  red o el storage (pasajero: nunca se borra nada por eso). */
export type FalloFuente = Fail & { invalida: boolean };

/** Baja el anuncio del bucket y lo valida por BYTES (nunca por nombre): tipo, peso y que decodifique. */
export async function bajarFuente(db: Db, path: string): Promise<{ fuente: Fuente; mime: MimeFuente } | FalloFuente> {
  const { data, error } = await db.storage.from(BUCKET_FORMATOS).download(path);
  if (error || !data) return { ...fallo("formatos.download", error?.message), invalida: false };
  if (data.size > FUENTE_MAX_BYTES) return { ok: false, error: "El anuncio pesa más de 25 MB.", invalida: true };
  const bytes = new Uint8Array(await data.arrayBuffer());
  const mime = sniffImageMime(bytes);
  if (!mime || !(mime in MIME_A_EXT)) return { ok: false, error: "Sólo PNG, JPG o WebP.", invalida: true };
  try {
    return { fuente: await leerFuente(bytes), mime: mime as MimeFuente };
  } catch (e) {
    console.error("[formatos] leerFuente:", e instanceof Error ? e.message : e);
    return { ok: false, error: "No pudimos leer esa imagen (¿está dañada o pasa de 40 megapíxeles?).", invalida: true };
  }
}

/** URLs firmadas del bucket de Formatos: la MISMA función que firma las referencias de Prisma (misma duración). */
export const firmarFormatos = (db: Db, paths: (string | null)[]): Promise<Map<string, string>> =>
  firmar(db, paths.filter((p): p is string => !!p), BUCKET_FORMATOS);

export async function loteVista(l: PrismaFormatosLoteRow, url: string, fuente: Fuente): Promise<LoteVista> {
  const [color, bordes] = await Promise.all([colorBorde(fuente), analizarBordes(fuente)]);
  return { id: l.id, nombre: l.nombre, w: fuente.w, h: fuente.h, url, colorBorde: color, bordes, resultadoId: l.resultado_id, clientId: l.client_id };
}

export function salidaVista(s: PrismaFormatosSalidaRow, urls: Map<string, string>): SalidaVista {
  const modo = s.modo as Modo;
  const deriva = s.deriva === null ? null : Number(s.deriva);
  return {
    id: s.id,
    preset: s.preset,
    ancho: s.ancho,
    alto: s.alto,
    modo,
    color: s.color,
    estado: s.estado,
    pngUrl: s.png_path ? (urls.get(s.png_path) ?? null) : null,
    jpgUrl: s.jpg_path ? (urls.get(s.jpg_path) ?? null) : null,
    pixelLockOk: s.pixel_lock_ok,
    deriva,
    revisarUnion: revisarUnion(modo, deriva),
    costoEstimadoUsd: Number(s.costo_estimado_usd),
    costoRealUsd: s.costo_real_usd === null ? null : Number(s.costo_real_usd),
    error: s.error,
  };
}
