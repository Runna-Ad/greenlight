import { createBrowserClient } from "@supabase/ssr";

// Browser Supabase client, scoped to the app's own Postgres schema.
// The `produccion` schema keeps this app's tables isolated from S.P.A.M's `public`.
const DB_SCHEMA = process.env.NEXT_PUBLIC_DB_SCHEMA ?? "produccion";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: DB_SCHEMA } },
  );
}
