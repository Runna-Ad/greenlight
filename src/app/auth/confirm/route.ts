import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

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

  return NextResponse.redirect(safeRedirect(next, url.origin));
}
