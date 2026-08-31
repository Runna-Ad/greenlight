import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";

// Magic-link landing for CLIENTS (Partners). The approval email carries a
// token_hash; verifyOtp exchanges it for a session (sets the cookie), then we
// send them to their portal. Separate from /auth/callback, which handles the
// OAuth `code` flow for the agency's Google login.

/** Resolve the redirect target, rejecting anything OFF-ORIGIN (open-redirect guard —
 *  "/\evil.com" would pass a startsWith("/") check but resolve off-origin). */
function safeRedirect(next: string | null, origin: string): URL {
  try {
    const u = new URL(next ?? "/", origin);
    if (u.origin === origin) return u;
  } catch {
    // malformed → safe default
  }
  return new URL("/", origin);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next");

  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/portal/login?error=${encodeURIComponent(reason)}`, url.origin));

  if (!token_hash || !type) return fail("link-invalid");

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });
  if (error) return fail("link-expired");

  // Un link VÁLIDO no basta: hay que seguir teniendo acceso. El token_hash se emite al
  // aprobar y sigue siendo válido un rato, así que un cliente REVOCADO en ese intervalo
  // podía canjearlo y entrar. Se comprueba que el perfil siga ACTIVO antes de dejarlo
  // pasar — verificar el link y verificar la cuenta son dos cosas distintas. Sólo se
  // niega cuando SABEMOS que está revocado (perfil existe && !active); sin perfil se deja
  // seguir y la identidad (getCurrentUser) decide. (reap I4)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && hasSupabase()) {
    const { data: prof } = await supabaseAdmin()
      .from("profiles")
      .select("active")
      .eq("id", user.id)
      .maybeSingle();
    const p = prof as { active: boolean } | null;
    if (p && !p.active) {
      await supabase.auth.signOut();
      return fail("access-revoked");
    }
  }

  return NextResponse.redirect(safeRedirect(next, url.origin));
}
