import "server-only";
import { getCurrentUser } from "./identity";
import type { ViewRole } from "./roles";

// "What role am I" — now the AUTHENTICATED account's real role. Impersonation
// ("Ver como") is gone: this used to read the gl_view_as cookie and default to
// admin when unset, which meant no-identity silently became admin. That fallback
// is removed. The accessor name is kept so callers keep working unchanged.

/**
 * The signed-in account's role. No session → the LEAST-privileged internal role
 * ('creative'), never admin. In production the middleware redirects unauthenticated
 * requests to /login, so this floor is only a defensive value.
 */
export async function getViewAs(): Promise<ViewRole> {
  const u = await getCurrentUser();
  return u?.role ?? "creative";
}

/** Impersonation is gone — there is no "previewing as someone else" anymore. */
export async function isPreviewing(): Promise<boolean> {
  return false;
}
