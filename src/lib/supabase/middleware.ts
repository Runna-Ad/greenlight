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

  // ── Client tether ──────────────────────────────────────────────────────────
  // Un cliente (Partner) SÓLO puede estar en SU portal (`/{slug}/portal`). Cualquier
  // otra ruta interna lo regresa a su portal — así queda amarrado a su marca aunque
  // una página interna futura olvide su guard `canSee` (defensa por encima de las
  // páginas). El portal en sí valida la MARCA (no puede ver la de otro). No consulta
  // el rol en rutas públicas ni de portal, para no pegarle a la mayoría de requests.
  const esRutaPortal = /^\/[^/]+\/portal(\/|$)/.test(path);
  if (user && !isPublic && !esRutaPortal) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("role, client_id")
      .eq("id", user.id)
      .maybeSingle();
    const p = prof as { role: string; client_id: string | null } | null;
    if (p?.role === "client") {
      let dest = "/portal/login";
      if (p.client_id) {
        const { data: c } = await supabase
          .from("clients")
          .select("slug")
          .eq("id", p.client_id)
          .maybeSingle();
        const slug = (c as { slug: string } | null)?.slug;
        if (slug) dest = `/${slug}/portal`;
      }
      const url = request.nextUrl.clone();
      url.pathname = dest;
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
