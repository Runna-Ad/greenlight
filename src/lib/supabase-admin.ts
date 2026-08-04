import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client, scoped to the `produccion` schema.
 *
 * SERVER ONLY. The `server-only` import above makes the build FAIL if this file
 * is ever pulled into a client component — the service key bypasses RLS, so a
 * leak would expose everything. (We already shipped one secret to the browser
 * via a client prop; this makes that class of mistake a build error.)
 *
 * While the app has no login, server actions act as a trusted server: RLS is
 * defined and active in the database, but this client is above it. When auth is
 * added, user-facing reads move to an anon client and RLS starts doing its job.
 */
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.",
    );
  }
  return createClient(url, key, {
    db: { schema: "produccion" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** True when the database is reachable — lets pages degrade instead of crashing. */
export function hasSupabase(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
