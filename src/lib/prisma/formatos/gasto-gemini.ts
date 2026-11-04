import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { faltaMigracion } from "@/lib/prisma/migracion";
import { MENSAJE_TOPE, gastoParaTope, topeAlcanzado, usd } from "./tope-gemini";
import { faltaLa0091, gastoSin0091, insertarConCliente } from "./actividad";

/**
 * HÜE Prisma › Formatos — lo que cuesta cada llamada a Gemini y el tope diario (0088). TODA llamada a Gemini pasa por
 * aquí (tamaño, copia, fondo plano, lectura): un tope que una ruta se salta no es un tope.
 */
export type RutaGemini = "tamano" | "copia" | "fondo_plano" | "leer" | "fondo_ampliar" | "rellenar_hueco";
export type ResumenGemini = { hoyUsd: number; mesUsd: number; llamadasHoy: number; sinCostoHoy: number };

export async function resumenGemini(): Promise<ResumenGemini | { error: { code?: string; message?: string } }> {
  const { data, error } = await supabaseAdmin().rpc("prisma_gemini_resumen").maybeSingle<{ hoy_usd: number | string; mes_usd: number | string; llamadas_hoy: number; sin_costo_hoy: number }>();
  if (error) return { error };
  return { hoyUsd: Number(data?.hoy_usd ?? 0), mesUsd: Number(data?.mes_usd ?? 0), llamadasHoy: data?.llamadas_hoy ?? 0, sinCostoHoy: data?.sin_costo_hoy ?? 0 };
}

/** null = se puede llamar; texto = el porqué no. Sin la migración no existe ningún tope, así que no bloquea. Con
 *  cualquier otro error de la base no se sabe si hay tope: se detiene (el gasto no se arriesga a ciegas). */
export async function revisarTopeGemini(): Promise<string | null> {
  const NO_SE_PUDO = "No se pudo revisar el tope de gasto de IA. Inténtalo otra vez.";
  const { data, error } = await supabaseAdmin().from("hue_settings").select("gemini_tope_diario_usd").eq("id", 1).maybeSingle();
  if (error) {
    if (faltaMigracion(error, "0088")) return null;
    console.error("[formatos] tope de Gemini:", error.message);
    return NO_SE_PUDO;
  }
  const crudo = data?.gemini_tope_diario_usd;
  if (crudo === null || crudo === undefined) return null;
  const tope = Number(crudo);
  const r = await resumenGemini();
  if ("error" in r) {
    console.error("[formatos] gasto de Gemini:", r.error.message);
    return NO_SE_PUDO;
  }
  if (!topeAlcanzado(tope, gastoParaTope(r.hoyUsd, r.sinCostoHoy))) return null;
  console.warn(`[formatos] tope de Gemini alcanzado: ${usd(r.hoyUsd)} de ${usd(tope)}`);
  return MENSAJE_TOPE;
}

/** Anota una llamada ya cobrada. Un error se registra y no se propaga: la persona ya pagó su resultado. El gasto no se
 *  pierde por el origen: cliente que ya no existe → sin cliente; base sin la 0091 → como se anotaba antes. */
export async function anotarGastoGemini(fila: { ruta: RutaGemini; modelo: string; usd: number | null; member_id: string; archivo?: string | null; client_id?: string | null }): Promise<void> {
  try {
    const db = supabaseAdmin();
    const { archivo, client_id, ...base } = fila;
    let { error } = await insertarConCliente((f) => db.from("prisma_gemini_gastos").insert(f), { ...base, ...(archivo ? { archivo } : {}), ...(client_id ? { client_id } : {}) });
    if (error && faltaLa0091(error)) ({ error } = await db.from("prisma_gemini_gastos").insert(gastoSin0091(fila)));
    if (error) console.error("[formatos] anotar gasto de Gemini:", error.message);
  } catch (err) {
    console.error("[formatos] anotar gasto de Gemini:", err);
  }
}
