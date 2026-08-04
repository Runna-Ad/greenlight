import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const DB_SCHEMA = process.env.NEXT_PUBLIC_DB_SCHEMA ?? "produccion";

// Server Supabase client (RSC / route handlers / server actions).
// Reads & refreshes the session from cookies; scoped to the `produccion` schema.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: DB_SCHEMA },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore when middleware
            // is refreshing the session on every request.
          }
        },
      },
    },
  );
}
