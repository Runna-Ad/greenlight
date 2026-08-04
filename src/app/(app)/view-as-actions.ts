"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { DEFAULT_ROLE, VIEW_ROLES, type ViewRole } from "@/lib/roles";
import { VIEW_AS_COOKIE } from "@/lib/view-as";

/**
 * Cambiar con qué rol se mira la app.
 *
 * Es una VISTA PREVIA, no un cambio de identidad: la cuenta sigue siendo la
 * misma y con el mismo rol real. Por eso una cookie de sesión y no algo
 * guardado en el perfil — cerrar el navegador te devuelve a ti mismo, y nunca
 * queda nadie atrapado dentro de una vista ajena.
 *
 * Cuando se encienda AUTH_ENABLED, esta acción debe comprobar que quien llama
 * es admin de verdad antes de aceptar el cambio.
 */
export async function setViewAs(role: ViewRole) {
  const jar = await cookies();

  if (!VIEW_ROLES.includes(role) || role === DEFAULT_ROLE) {
    jar.delete(VIEW_AS_COOKIE);
  } else {
    jar.set(VIEW_AS_COOKIE, role, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      // Sin maxAge: muere con la sesión del navegador.
    });
  }

  revalidatePath("/", "layout");
}
