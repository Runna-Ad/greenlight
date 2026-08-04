"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { SOY_COOKIE } from "@/lib/soy";

/**
 * Decir quién eres.
 *
 * Se valida contra la base antes de escribir la cookie — el cliente nunca fija
 * una identidad por su cuenta. Sigue siendo honor system (nadie comprueba que
 * seas Flor), pero al menos sólo se puede ser alguien que existe y está activo.
 */
export async function setSoy(memberId: string | null): Promise<void> {
  const jar = await cookies();

  if (!memberId) {
    jar.delete(SOY_COOKIE);
    revalidatePath("/", "layout");
    return;
  }

  if (hasSupabase()) {
    const { data } = await supabaseAdmin()
      .from("track_members")
      .select("id")
      .eq("id", memberId)
      .eq("active", true)
      .maybeSingle();
    if (!data) return; // id inventado: no se escribe nada
  }

  jar.set(SOY_COOKIE, memberId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // dura: re-elegirte cada mañana mata la adopción
  });

  revalidatePath("/", "layout");
}
