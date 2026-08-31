import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const DB_SCHEMA = process.env.NEXT_PUBLIC_DB_SCHEMA ?? "produccion";

// Routes reachable without a session.
const PUBLIC_PATHS = ["/login", "/auth", "/portal/login"];

// Refreshes the Supabase session cookie on every request and gates auth.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const authOn = process.env.AUTH_ENABLED === "true";

  // ── El perímetro NO puede apagarse en silencio ────────────────────────────────
  // Todo el muro de login cuelga de UNA variable de entorno. Si en PRODUCCIÓN llegara
  // mal (sin definir, "1", un typo), este bloque se saltaba entero y la app quedaba sin
  // muro — falla CERRADO en la capa de identidad (sin sesión, las páginas/actions niegan),
  // pero en silencio. Preferimos que RUJA: en producción (Vercel) un valor distinto de
  // "true" tumba la request con un error explícito, imposible de no ver. Preview y dev
  // quedan libres a propósito (ahí se prueba con el login apagado). (reap I2)
  if (process.env.VERCEL_ENV === "production" && !authOn) {
    throw new Error(
      "AUTH_ENABLED debe ser exactamente \"true\" en producción. " +
        `Valor recibido: ${JSON.stringify(process.env.AUTH_ENABLED ?? null)}. ` +
        "El muro de login está APAGADO — arregla la variable en Vercel antes de servir tráfico.",
    );
  }

  // Skip auth unless BOTH values exist AND auth is explicitly enabled.
  // Checking only the URL meant a half-configured environment threw on every
  // request and 500'd the app. Login stays off until pre-launch (Pedro's call);
  // flip AUTH_ENABLED=true to turn it on.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    !authOn
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
    // La IDENTIDAD se valida con el cliente de SESIÓN (getUser, arriba); los DATOS se
    // leen con SERVICE-ROLE — igual que /auth/callback e identity.ts. Antes estas dos
    // lecturas iban por el cliente de sesión (rol `authenticated`), lo que obligaba a
    // que `produccion` siguiera concedido a `authenticated`; el lockdown de RLS revoca
    // ese acceso (la anon key es pública, va en el bundle del navegador). Sin este
    // cambio, revocar rompería el amarre del cliente a su portal. (RLS lockdown 0056)
    // El amarre corre en CADA request: si esta lectura lanzara (config/BD caída), el
    // proxy tumbaría el sitio entero. Se aísla: ante un fallo se registra y se sigue —
    // el amarre es defensa EN PROFUNDIDAD, cada página interna conserva su propio guard
    // `canSee`/`canAdmin` y las server actions su `assertCanActOnTask`. Preferimos
    // degradar una capa a caer todas.
    let p: { role: string; client_id: string | null } | null = null;
    try {
      const admin = supabaseAdmin();
      const { data: prof, error } = await admin
        .from("profiles")
        .select("role, client_id")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      p = prof as { role: string; client_id: string | null } | null;
    } catch (e) {
      console.error("[proxy] amarre de cliente: no se pudo leer el perfil —", e);
    }
    if (p?.role === "client") {
      let dest = "/portal/login";
      if (p.client_id) {
        try {
          const { data: c } = await supabaseAdmin()
            .from("clients")
            .select("slug")
            .eq("id", p.client_id)
            .maybeSingle();
          const slug = (c as { slug: string } | null)?.slug;
          if (slug) dest = `/${slug}/portal`;
        } catch (e) {
          console.error("[proxy] amarre de cliente: no se pudo leer el slug —", e);
        }
      }
      const url = request.nextUrl.clone();
      url.pathname = dest;
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
