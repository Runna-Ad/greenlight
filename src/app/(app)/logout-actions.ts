"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/identity";

/** Sign out and return to the login screen. Clears the Supabase session cookie.
 *  Un cliente vuelve a SU puerta (/portal/login), no al login de Google del equipo —
 *  ahí no tenía cómo volver a entrar. El rol se lee ANTES de cerrar la sesión. */
export async function cerrarSesion() {
  let destino = "/login";
  try {
    if ((await getCurrentUser())?.role === "client") destino = "/portal/login";
  } catch (e) {
    console.error("[logout] no se pudo leer el rol; se usa /login —", e);
  }
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(destino);
}
