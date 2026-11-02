"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { faltaMigracion } from "@/lib/prisma/migracion";
import { resumenGemini, type ResumenGemini } from "@/lib/prisma/formatos/gasto-gemini";
import { TOPE_MAX_USD, TOPE_MIN_USD } from "@/lib/prisma/formatos/tope-gemini";
import { noMaster } from "./gate";

/** Hub › Prisma › Gasto IA: lo gastado en Gemini y el tope diario. Master-only (noMaster, la puerta del Hub). */

type Fail = { ok: false; error: string };
const NO_SE_PUDO: Fail = { ok: false, error: "No se pudo completar. Inténtalo de nuevo." };

export async function hubGastoGemini(): Promise<({ ok: true; tope: number | null } & ResumenGemini) | Fail> {
  const no = await noMaster();
  if (no) return no;
  const { data, error } = await supabaseAdmin().from("hue_settings").select("gemini_tope_diario_usd").eq("id", 1).maybeSingle();
  if (error) {
    const falta = faltaMigracion(error, "0088");
    if (falta) return falta;
    console.error("[hub/gasto] tope:", error.message);
    return NO_SE_PUDO;
  }
  const r = await resumenGemini();
  if ("error" in r) {
    const falta = faltaMigracion(r.error, "0088");
    if (falta) return falta;
    console.error("[hub/gasto] resumen:", r.error.message);
    return NO_SE_PUDO;
  }
  const crudo = data?.gemini_tope_diario_usd;
  return { ok: true, tope: crudo === null || crudo === undefined ? null : Number(crudo), ...r };
}

/** Pone, mueve o quita (null) el tope. Vale desde la siguiente llamada, sin redeploy. */
export async function guardarTopeGemini(tope: number | null): Promise<{ ok: true } | Fail> {
  const no = await noMaster();
  if (no) return no;
  if (tope !== null && (!Number.isFinite(tope) || tope < TOPE_MIN_USD || tope > TOPE_MAX_USD)) return { ok: false, error: "Escribe un monto válido en dólares." };
  const { data, error } = await supabaseAdmin().from("hue_settings").update({ gemini_tope_diario_usd: tope === null ? null : Math.round(tope * 100) / 100 }).eq("id", 1).select("id");
  if (error) {
    const falta = faltaMigracion(error, "0088");
    if (falta) return falta;
    console.error("[hub/gasto] guardar:", error.message);
    return NO_SE_PUDO;
  }
  return data?.length ? { ok: true } : NO_SE_PUDO;
}
