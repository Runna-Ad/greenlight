import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
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
  const next = url.searchParams.get("next");

  const deny = (reason: string) =>
    NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(reason)}`, url.origin));

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
    return NextResponse.redirect(safeRedirect(next, url.origin));
  }

  // ── Client door: must already be an APPROVED client (provisioned at approval) ──
  const admin = supabaseAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, client_id, active")
    .eq("id", user.id)
    .maybeSingle();
  const p = profile as { role: string; client_id: string | null; active: boolean } | null;

  // Acceso revocado (Clientes → "Revocar", profiles.active=false) → no entra, aunque su
  // login de Google siga siendo válido. Se corta EN LA PUERTA para que reciba un mensaje
  // claro en vez de una pantalla de "denegado" más adentro. (reap I4)
  if (p && !p.active) {
    await supabase.auth.signOut();
    return deny("access-revoked");
  }

  if (p?.role === "client" && p.client_id) {
    const { data: client } = await admin
      .from("clients")
      .select("slug")
      .eq("id", p.client_id)
      .maybeSingle();
    const slug = (client as { slug: string } | null)?.slug;
    return NextResponse.redirect(new URL(slug ? `/${slug}/portal` : "/", url.origin));
  }

  // Not agency, not an approved client → no access. Don't leave a dangling session.
  await supabase.auth.signOut();
  return deny("not-allowed");
}
