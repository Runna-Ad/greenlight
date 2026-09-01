import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import type { ViewRole } from "@/lib/roles";
import type { Track } from "@/lib/vocab";

// ─────────────────────────────────────────────────────────────────────────────
// The ONE place identity is resolved, now that login is real.
//
// Everything used to come from two spoofable cookies (gl_soy = "who am I",
// gl_view_as = "what role"). Those are gone. Identity now flows from the verified
// Supabase session: auth.getUser() → profiles row → the bound track_members row
// (via track_members.profile_id). getSoy()/getViewAs() are kept as the stable
// accessor API and simply delegate here, so every existing caller reads REAL
// identity without changing a line.
//
// Why service-role for the profile/member read: the id comes from getUser(), which
// validates the token with the auth server — so it's already trusted. Reading the
// profile via the anon client would hit a chicken-and-egg with RLS on first login;
// keying by the verified id and reading as admin is safe and simpler.
// ─────────────────────────────────────────────────────────────────────────────

export type CurrentMember = {
  id: string; // track_members.id — what assignment/authorship columns store
  name: string;
  color: string;
  track: "real" | "normal" | null; // null = rol global (admin/master), sin track. HOME track.
  /** Alcance EFECTIVO de tracks (la fuente para todo scoping por track):
   *  lead → tracks otorgados (grant multi-track) | [track home];
   *  creative → [track]; admin/master → [] (globales, ver `tracksVisibles`). */
  tracks: Track[];
  role: string | null; // the profile's REAL role (authorship counts for creatives)
  notify_email: boolean;
  notify_slack: boolean;
};

/**
 * El alcance efectivo de tracks de un miembro. Una sola fuente para que identity y soy
 * coincidan. El grant (`tracks`, 0059) vale para CUALQUIER doer — lead o creative: un
 * especialista que trabaja Real y Normal ya no queda atado a uno solo (Pedro
 * 2026-09-01). Sin grant se cae al track HOME. Admin/master (track null) = [] (globales,
 * ver `tracksVisibles`). Antes esto exigía `role === "lead"`, que era lo único que dejaba
 * fuera a los creativos.
 */
function tracksEfectivos(
  role: string | null,
  track: "real" | "normal" | null,
  grant: ("real" | "normal")[] | null,
): Track[] {
  if (grant && grant.length) return [...new Set(grant)];
  return track ? [track] : [];
}

export type CurrentUser = {
  userId: string; // auth.users.id === profiles.id
  email: string;
  role: ViewRole; // mapped app_role
  clientId: string | null; // set only for client (Partner) accounts
  member: CurrentMember | null; // null for clients (no roster identity)
};

/** app_role (DB enum) → ViewRole (app's nav/permission role). Unknown/dead roles
 *  (specialist_lead, delivery) collapse to the least-privileged internal role. */
export function appRoleToViewRole(role: string | null | undefined): ViewRole {
  switch (role) {
    case "master":
      return "master";
    case "admin":
      return "admin";
    case "lead":
      return "lead";
    case "client":
      return "client";
    // creative, specialist_lead (dead), delivery, and anything unexpected:
    default:
      return "creative";
  }
}

/**
 * The authenticated user for this request, or null if nobody is signed in.
 * Cached per-request so the several callers (layout, pages, actions) share one
 * resolution. Returns null gracefully when Supabase isn't configured.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  if (!hasSupabase()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = supabaseAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, role, client_id, active")
    .eq("id", user.id)
    .maybeSingle();

  // Authenticated but not provisioned yet (should not happen after /auth/callback).
  if (!profile) return null;
  const p = profile as {
    id: string; email: string; role: string; client_id: string | null; active: boolean;
  };

  // ACCESO REVOCADO = SIN identidad. `cambiarAccesoCliente` ("Revocar" en Clientes) pone
  // profiles.active=false, pero NADIE leía esa bandera para autorizar: un cliente revocado
  // seguía entrando con su sesión viva Y podía volver a entrar con un magic link válido —
  // el botón "Revocar" no revocaba nada. Como éste es el ÚNICO resolutor de identidad de la
  // app, negar aquí cierra TODA superficie de golpe (páginas y server actions caen a "sin
  // identidad" = denegado), en vez de parchear cada pantalla. (reap I4 — alcance real)
  if (!p.active) return null;

  let member: CurrentMember | null = null;
  if (appRoleToViewRole(p.role) !== "client") {
    const { data: m } = await admin
      .from("track_members")
      .select("id, name, color, track, tracks, notify_email, notify_slack")
      .eq("profile_id", user.id)
      .eq("active", true)
      .maybeSingle();
    if (m) {
      const mm = m as {
        id: string;
        name: string;
        color: string;
        track: "real" | "normal" | null;
        tracks: ("real" | "normal")[] | null;
        notify_email: boolean;
        notify_slack: boolean;
      };
      member = {
        id: mm.id,
        name: mm.name,
        color: mm.color,
        track: mm.track,
        tracks: tracksEfectivos(p.role, mm.track, mm.tracks),
        role: p.role, // authorship role = the profile's real role
        notify_email: mm.notify_email,
        notify_slack: mm.notify_slack,
      };
    }
  }

  return {
    userId: p.id,
    email: p.email ?? user.email ?? "",
    role: appRoleToViewRole(p.role),
    clientId: p.client_id,
    member,
  };
});
