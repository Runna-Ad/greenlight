import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const DB_SCHEMA = process.env.NEXT_PUBLIC_DB_SCHEMA ?? "produccion";

// Routes reachable without a session.
const PUBLIC_PATHS = ["/login", "/auth", "/portal/login"];

// Refreshes the Supabase session cookie on every request and gates auth.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Skip auth unless BOTH values exist AND auth is explicitly enabled.
  // Checking only the URL meant a half-configured environment threw on every
  // request and 500'd the app. Login stays off until pre-launch (Pedro's call);
  // flip AUTH_ENABLED=true to turn it on.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.AUTH_ENABLED !== "true"
  ) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: DB_SCHEMA },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() (not getSession) — validates the token with the server.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some(
    (p) => path === p || path.startsWith(`${p}/`),
  );

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    // Client portal has its own login; internal app uses /login.
    url.pathname = path.startsWith("/portal") ? "/portal/login" : "/login";
    return NextResponse.redirect(url);
  }

  return response;
}
