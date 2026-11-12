import "server-only";

import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";

/** Los 4 interruptores generales de Admin ▸ Notificaciones (0098). */
export type CanalesNotif = { equipo: { email: boolean; slack: boolean }; clientes: { email: boolean; slack: boolean } };

export const CANALES_TODO_ENCENDIDO: CanalesNotif = {
  equipo: { email: true, slack: true },
  clientes: { email: true, slack: true },
};

/**
 * Lee los interruptores. Si la tabla no se puede leer, quedan ENCENDIDOS (y se registra):
 * un tropiezo de lectura no debe callar todos los avisos de Greenlight.
 */
export async function leerCanales(): Promise<CanalesNotif> {
  if (!hasSupabase()) return CANALES_TODO_ENCENDIDO;
  const { data, error } = await supabaseAdmin().from("notif_canales").select("audiencia, canal, activo");
  if (error) {
    console.error("[notif] no se pudieron leer los interruptores generales; quedan encendidos:", error.message);
    return CANALES_TODO_ENCENDIDO;
  }
  const c: CanalesNotif = structuredClone(CANALES_TODO_ENCENDIDO);
  for (const r of (data ?? []) as { audiencia: "equipo" | "clientes"; canal: "email" | "slack"; activo: boolean }[]) {
    if (c[r.audiencia] && r.canal in c[r.audiencia]) c[r.audiencia][r.canal] = r.activo;
  }
  return c;
}
