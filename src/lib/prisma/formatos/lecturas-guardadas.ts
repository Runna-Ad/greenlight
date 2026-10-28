import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * HÜE Prisma › Formatos, imagen plana — la lectura con IA de cada imagen, guardada (0087). La misma imagen (la huella
 * sha256 de su archivo original) con el mismo modelo reusa su lectura: mismas piezas y mismos ids, así los textos
 * cambiados a mano siguen sirviendo al volver a subirla (B30), y no se vuelve a cobrar. Se guarda cruda: la limpieza
 * corre al usarla. Si la base falla, se lee con IA como antes (lo guardado es un ahorro, no un requisito).
 */

export const HUELLA = /^[0-9a-f]{64}$/;

/** La lectura guardada de esta imagen, si se leyó a esta misma medida reducida (otra medida = otras cajas). */
export async function lecturaGuardada(sha256: string, modelo: string, w: number, h: number): Promise<unknown[] | null> {
  const { data, error } = await supabaseAdmin()
    .from("prisma_formatos_lecturas")
    .select("elementos, w, h")
    .eq("sha256", sha256)
    .eq("modelo", modelo)
    .maybeSingle();
  if (error) {
    console.error("[formatos] lectura guardada:", error.message);
    return null;
  }
  return data && data.w === w && data.h === h && Array.isArray(data.elementos) ? data.elementos : null;
}

/** Guarda (o reemplaza, con «Leer otra vez») la lectura de esta imagen. Un error se registra y no se propaga. */
export async function guardarLectura(fila: { sha256: string; modelo: string; w: number; h: number; elementos: unknown; created_by: string }): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("prisma_formatos_lecturas")
    .upsert({ ...fila, created_at: new Date().toISOString() }, { onConflict: "sha256,modelo" });
  if (error) console.error("[formatos] guardar lectura:", error.message);
}
