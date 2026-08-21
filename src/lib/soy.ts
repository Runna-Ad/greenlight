import "server-only";
import { getCurrentUser } from "./identity";

// "Who am I" — now resolved from the AUTHENTICATED session, not a cookie.
//
// This file used to hold the gl_soy honor-system shim (pick your name from a
// dropdown). Login is real now: identity comes from the Supabase session via
// getCurrentUser(). The accessor names below are kept so every caller keeps
// working; only their guts changed. A client (Partner) has no roster identity, so
// getSoy() is null for them — exactly as before.

export type Soy = {
  id: string;
  name: string;
  color: string;
  track: "real" | "normal";
  /** El rol REAL de la identidad. Para saber si su trabajo cuenta como autoría
   *  (sólo el equipo creativo la deja). null = default 'creative'. */
  role: string | null;
  notify_email: boolean;
  notify_slack: boolean;
};

/** The signed-in team member, or null (not signed in, or a client with no roster row). */
export async function getSoy(): Promise<Soy | null> {
  const u = await getCurrentUser();
  return u?.member ?? null;
}

/** The signed-in member's track_members id, for cheap checks / authorship writes. */
export async function getSoyId(): Promise<string | null> {
  const u = await getCurrentUser();
  return u?.member?.id ?? null;
}
