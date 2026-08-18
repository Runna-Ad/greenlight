import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { supabaseAdmin, hasSupabase } from "./supabase-admin";

export const SOY_COOKIE = "gl_soy";

export type Soy = {
  id: string;
  name: string;
  color: string;
  track: "real" | "normal";
  /** Preferencias de notificación (para "Mi perfil"). in-app siempre llega. */
  notify_email: boolean;
  notify_slack: boolean;
};

/**
 * Quién dice ser la persona que está usando la app.
 *
 * Mientras no haya login, el flujo necesita un "yo": sin él nadie puede tener
 * "sus" tareas ni pulsar "Empezar". Se elige el nombre del pool del sheet
 * (track_members) y se guarda en una cookie leída en el SERVIDOR, igual que
 * gl_view_as — con localStorage se vería un parpadeo antes de recortar.
 *
 * Es honor system: nadie verifica que seas quien dices. Aceptable con 14
 * personas de confianza y sin login, pero hay que decirlo en la UI.
 *
 * DIFERENCIA DELIBERADA con view-as: aquella cookie muere con la sesión para
 * que nadie quede atrapado en una vista ajena. Ésta dura, porque re-elegir tu
 * nombre cada mañana mata la adopción.
 *
 * La cookie guarda SÓLO el uuid: si se guardara el nombre, un cambio en admin
 * dejaría los chips mintiendo.
 *
 * Camino a auth: el día de AUTH_ENABLED esto resuelve
 * profiles.id → track_members.profile_id y la cookie queda de respaldo.
 * Ninguna llamada cambia.
 */
export const getSoy = cache(async (): Promise<Soy | null> => {
  const id = (await cookies()).get(SOY_COOKIE)?.value;
  if (!id || !hasSupabase()) return null;

  const { data } = await supabaseAdmin()
    .from("track_members")
    .select("id, name, color, track, notify_email, notify_slack")
    .eq("id", id)
    .eq("active", true)
    .maybeSingle();

  // Un id que ya no existe (o alguien inactivo) equivale a no haber elegido.
  return (data as Soy | null) ?? null;
});

/** El id sin resolver, para comprobaciones baratas. */
export async function getSoyId(): Promise<string | null> {
  return (await cookies()).get(SOY_COOKIE)?.value ?? null;
}
