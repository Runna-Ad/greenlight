"use server";

import { getCurrentUser } from "@/lib/identity";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isAgencyEmail } from "@/lib/auth/allowlist";
import { guardarContrasenaVerificada } from "@/lib/auth/acceso-cliente";
import { motivoClaveInvalida } from "@/lib/auth/clave-marca";

export type CambiarClaveResult = { ok: true; reentrar: boolean } | { ok: false; error: string };

// Freno por persona (en memoria, por instancia): cambiar la contraseña es raro.
const VENTANA_MS = 10 * 60_000;
const MAX_CAMBIOS = 5;
const cambiosPorUsuario = new Map<string, number[]>();

/**
 * «Cambiar contraseña» del menú de cuenta del CLIENTE (Pedro, 2026-11-12): el login que
 * le creó el Master Builder (DiDi@657) se puede cambiar por uno suyo, o quedarse con
 * ése. Sólo el rol Partner: el equipo entra con Google y una contraseña en su cuenta le
 * cambiaría S.P.A.M (proyecto de auth compartido).
 *
 * Se guarda con la llave del servidor (igual que al crearla con código) y luego se
 * vuelve a abrir la sesión con la contraseña nueva, por si el cambio cerró las sesiones.
 */
export async function cambiarMiContrasena(input: { nueva: string }): Promise<CambiarClaveResult> {
  if (typeof input?.nueva !== "string") return { ok: false, error: "Escribe la contraseña nueva." };
  const yo = await getCurrentUser();
  if (!yo) return { ok: false, error: "Tu sesión venció. Vuelve a entrar." };
  if (yo.role !== "client") return { ok: false, error: "El equipo entra con Google; no usa contraseña." };
  // El correo DE LA CUENTA de acceso (no el del perfil): un correo del equipo con rol de
  // cliente (Pedro prueba así) nunca recibe contraseña — le cambiaría S.P.A.M también.
  const { data: au } = await supabaseAdmin().auth.admin.getUserById(yo.userId);
  const emailAuth = au?.user?.email?.trim().toLowerCase();
  if (!emailAuth) return { ok: false, error: "No se pudo leer tu cuenta. Intenta de nuevo." };
  if (isAgencyEmail(emailAuth)) return { ok: false, error: "Las cuentas del equipo entran con Google; no usan contraseña." };

  const nueva = input.nueva;
  const motivo = motivoClaveInvalida(nueva);
  if (motivo) return { ok: false, error: motivo };

  const now = Date.now();
  const recientes = (cambiosPorUsuario.get(yo.userId) ?? []).filter((t) => now - t < VENTANA_MS);
  if (recientes.length >= MAX_CAMBIOS) {
    return { ok: false, error: "Ya cambiaste tu contraseña varias veces. Espera unos minutos." };
  }
  recientes.push(now);
  cambiosPorUsuario.set(yo.userId, recientes);

  const { error } = await guardarContrasenaVerificada(yo.userId, nueva);
  if (error) {
    console.error("[cuenta] no se pudo cambiar la contraseña —", error.message);
    return {
      ok: false,
      error:
        error.name === "AuthWeakPasswordError"
          ? "Esa contraseña no cumple los requisitos. Prueba una más larga, con letras y números."
          : "No se pudo cambiar la contraseña. Intenta de nuevo.",
    };
  }
  console.info("[cuenta] contraseña cambiada por el cliente", { clienteId: yo.userId });

  // Sesión fresca con la contraseña nueva (deja las cookies nuevas en esta respuesta), y
  // se cierran las demás sesiones: quien tuviera una abierta en otro aparato tiene que
  // volver a entrar.
  const supabase = await createClient();
  const { error: inErr } = await supabase.auth.signInWithPassword({ email: emailAuth, password: nueva });
  if (inErr) {
    console.error("[cuenta] contraseña cambiada; no se pudo reabrir la sesión —", inErr.message);
    return { ok: true, reentrar: true };
  }
  const { error: outErr } = await supabase.auth.signOut({ scope: "others" });
  if (outErr) console.error("[cuenta] no se pudieron cerrar las otras sesiones —", outErr.message);
  return { ok: true, reentrar: false };
}
