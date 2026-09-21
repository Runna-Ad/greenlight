import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { leerPerfil, esClienteAprobado, destinoDentroDelPortal } from "@/lib/auth/acceso-cliente";
import { isAgencyEmail } from "@/lib/auth/allowlist";
import { provisionAgencyLogin } from "@/lib/auth/provision";

// OAuth / magic-link landing. Supabase redirects here with a `code`; we exchange it
// for a session, then decide who this is:
//   • agency email (@runna.com.mx + the master exception) → provision + into the app
//   • an already-approved CLIENT (profile provisioned at approval) → into their portal
//   • anyone else → denied (signed out, bounced to /login with a reason)
//
// This is the ONLY place a new session becomes a working identity. No session that
// lands here can self-issue access it wasn't granted.

/** Resolve a post-auth redirect target, rejecting anything OFF-ORIGIN. A bare
 *  startsWith("/") check is bypassable ("/\evil.com" resolves to https://evil.com),
 *  so we resolve against our origin and only accept a same-origin result. */
function safeRedirect(next: string | null, origin: string): URL {
  try {
    const u = new URL(next ?? "/", origin);
    if (u.origin === origin) return u;
  } catch {
    // malformed → fall through to the safe default
  }
  return new URL("/", origin);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error");
  // Desde /portal/login (puerta de clientes) los rechazos vuelven AHÍ con su mensaje,
  // no al login de Google del equipo (donde un cliente no tiene salida). La marca y el
  // `next` del cliente llegan en cookies cortas (ver GoogleSignIn), no en la URL.
  const puertaCliente = request.cookies.get("gl_puerta")?.value === "cliente";
  const next = puertaCliente
    ? (request.cookies.get("gl_next")?.value ?? null)
    : url.searchParams.get("next");

  /** Toda respuesta borra las cookies de la puerta: sirven para UN solo regreso. */
  const redirigir = (destino: URL) => {
    const res = NextResponse.redirect(destino);
    for (const nombre of ["gl_puerta", "gl_next"]) res.cookies.set(nombre, "", { path: "/auth", maxAge: 0 });
    return res;
  };

  const deny = (reason: string) =>
    redirigir(new URL(`${puertaCliente ? "/portal/login" : "/login"}?error=${encodeURIComponent(reason)}`, url.origin));

  if (oauthError) return deny(oauthError);
  if (!code) return deny("missing-code");

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) return deny("exchange-failed");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    await supabase.auth.signOut();
    return deny("no-user");
  }

  const email = user.email;
  const fullName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    null;

  // ── Agency door ────────────────────────────────────────────────────────────
  if (isAgencyEmail(email)) {
    const result = await provisionAgencyLogin({ userId: user.id, email, fullName });
    if (!result.ok) {
      await supabase.auth.signOut();
      return deny("not-allowed");
    }
    return redirigir(safeRedirect(next, url.origin));
  }

  // ── Client door: must already be an APPROVED client (provisioned at approval) ──
  // Los rechazos cierran SÓLO esta sesión (scope "local"): el default ("global") sacaba
  // también al cliente de su otra sesión abierta (p. ej. con contraseña en el teléfono).
  const rechazarCliente = async (reason: string) => {
    await supabase.auth.signOut({ scope: "local" });
    return redirigir(new URL(`/portal/login?error=${encodeURIComponent(reason)}`, url.origin));
  };
  const perfil = await leerPerfil({ id: user.id });

  // Una caída de la BD NO es "acceso revocado": se le pide volver a entrar.
  if (perfil === "error") return rechazarCliente("sesion");

  // Acceso revocado (Clientes → "Revocar", profiles.active=false) → no entra, aunque su
  // login de Google siga siendo válido. Se corta EN LA PUERTA para que reciba un mensaje
  // claro en vez de una pantalla de "denegado" más adentro. (reap I4)
  if (perfil && !perfil.active) return rechazarCliente("access-revoked");

  if (esClienteAprobado(perfil)) {
    return redirigir(new URL(destinoDentroDelPortal(next, `/${perfil.slug}/portal`), url.origin));
  }

  // Not agency, not an approved client → no access. Don't leave a dangling session.
  if (puertaCliente) return rechazarCliente("google-sin-acceso");
  await supabase.auth.signOut({ scope: "local" });
  return deny("not-allowed");
}
