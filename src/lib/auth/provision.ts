import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { agencyRoleForEmail } from "./allowlist";
import type { Track } from "@/lib/vocab";

// Track a newly-provisioned DOER (lead/creative) lands in — the admin can move
// them in Equipo. 'normal' is the safest default (the smaller specialist team).
// admin/master are global (track = null); see bindOrCreateMember.
const DEFAULT_TRACK: Track = "normal";

export type ProvisionResult =
  | { ok: true; role: "master" | "admin" | "lead" | "creative" | "delivery"; memberId: string | null }
  | { ok: false; reason: "not-allowed" };

/**
 * First-login (and every-login) provisioning for an AGENCY user.
 *
 * Idempotent and race-safe:
 *  - profiles is upserted on the primary key `id` (= auth.users.id), so re-login
 *    can't duplicate. An existing role is NEVER downgraded (an admin promoted later
 *    stays admin on re-login) — only the master exception force-sets master.
 *  - track_members is bound by profile_id (unique index from 0042) → `on conflict`
 *    is a no-op, so two concurrent logins can't create two rows.
 *
 * Returns not-allowed if the email isn't an agency address — the caller denies.
 * NEVER invents a profile uuid: the id passed in IS auth.users.id.
 */
export async function provisionAgencyLogin(params: {
  userId: string;
  email: string;
  fullName: string | null;
}): Promise<ProvisionResult> {
  const { userId, email, fullName } = params;
  const agency = agencyRoleForEmail(email);
  if (!agency) return { ok: false, reason: "not-allowed" };

  const admin = supabaseAdmin();
  const name = (fullName?.trim() || email.split("@")[0]) ?? "Sin nombre";

  // ── profiles: keep an existing (possibly promoted) role; force master for the
  //    master exception; default new agency accounts to 'creative' (Especialista).
  const { data: existing } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  // Un admin pudo PRE-DESIGNAR a esta persona en Equipo (p.ej. crearla como Lead)
  // antes de que entrara. Ese rol se hereda al profile en el primer login — si no,
  // "ascenderla en Equipo antes de que exista su cuenta" no le daría permisos.
  // Precedencia: master (allowlist) > rol ya en el profile (no degradar) > rol
  // designado en el track_member > 'creative'.
  const { data: designadoRow } = await admin
    .from("track_members")
    .select("role")
    .ilike("email", email)
    .is("profile_id", null)
    .limit(1)
    .maybeSingle();
  const designado = (designadoRow as { role: string } | null)?.role ?? null;

  const finalRole = (
    agency === "master" ? "master" : (existing?.role ?? designado ?? "creative")
  ) as "master" | "admin" | "lead" | "creative" | "delivery";

  await admin
    .from("profiles")
    .upsert(
      { id: userId, email, full_name: name, role: finalRole },
      { onConflict: "id" },
    );

  // ── track_members: 1) already bound? done. 2) match a roster row by email that
  //    has no account yet → bind it. 3) otherwise create a fresh member.
  const memberId = await bindOrCreateMember(admin, { userId, email, name, role: finalRole });

  return { ok: true, role: finalRole, memberId };
}

async function bindOrCreateMember(
  admin: ReturnType<typeof supabaseAdmin>,
  m: { userId: string; email: string; name: string; role: string },
): Promise<string | null> {
  // 1) already bound to this account?
  const { data: bound } = await admin
    .from("track_members")
    .select("id")
    .eq("profile_id", m.userId)
    .maybeSingle();
  if (bound?.id) return bound.id;

  // 2) an existing roster person with this email but no account yet → claim it.
  const { data: byEmail } = await admin
    .from("track_members")
    .select("id, profile_id")
    .ilike("email", m.email)
    .is("profile_id", null)
    .limit(1)
    .maybeSingle();
  if (byEmail?.id) {
    const { data: bound2 } = await admin
      .from("track_members")
      .update({ profile_id: m.userId })
      .eq("id", byEmail.id)
      .is("profile_id", null) // compare-and-set: don't steal a row someone else just claimed
      .select("id")
      .maybeSingle();
    if (bound2?.id) return bound2.id;
  }

  // 3) create a fresh member. Unique(track,name) can collide on a shared name —
  //    fall back to a disambiguated name rather than failing the login.
  const appRole = m.role === "client" ? "creative" : m.role; // clients never reach here
  // admin/master are GLOBAL roles → no track (they see every team). Only doers
  // (lead/creative) land in a track. (Pedro 2026-08-21.)
  const track: Track | null = appRole === "admin" || appRole === "master" ? null : DEFAULT_TRACK;
  const attempt = async (name: string) =>
    admin
      .from("track_members")
      .insert({ track, name, color: "#775cbf", role: appRole, email: m.email, profile_id: m.userId })
      .select("id")
      .maybeSingle();

  const first = await attempt(m.name);
  let created = first.data;
  if (first.error) {
    // name clash (or the profile_id unique index caught a concurrent create) —
    // re-check by profile_id first (the concurrent winner), then try a suffix.
    const { data: raced } = await admin
      .from("track_members")
      .select("id")
      .eq("profile_id", m.userId)
      .maybeSingle();
    if (raced?.id) return raced.id;
    ({ data: created } = await attempt(`${m.name} (${m.email.split("@")[0]})`));
  }
  return created?.id ?? null;
}
